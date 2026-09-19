import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import type { PalmTTYConfig, WorkspaceConfig } from "@palmtty/config";
import {
  PROTOCOL_VERSION,
  type ServerMessage,
  type SessionPublic,
  type SessionState,
  encodeServerMessage
} from "@palmtty/protocol";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal as HeadlessTerminal } from "@xterm/headless";
import * as pty from "node-pty";
import type WebSocket from "ws";
import { canReplayFrom } from "./reconnect-policy.js";

type OutputFrame = {
  seq: number;
  data: string;
  bytes: number;
};

type ManagedSession = {
  id: string;
  workspace: WorkspaceConfig;
  state: SessionState;
  createdAt: string;
  cols: number;
  rows: number;
  pid: number;
  exitCode?: number;
  pty: pty.IPty;
  mirror: HeadlessTerminal;
  serializer: SerializeAddon;
  seq: number;
  history: OutputFrame[];
  historyBytes: number;
  clients: Set<WebSocket>;
  pipeline: Promise<void>;
};

function sessionId(): string {
  return randomBytes(18).toString("base64url");
}

function writeMirror(terminal: HeadlessTerminal, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve));
}

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();

  constructor(private readonly config: PalmTTYConfig) {}

  list(): SessionPublic[] {
    return [...this.sessions.values()].map((session) => this.toPublic(session));
  }

  get(id: string): SessionPublic | undefined {
    const session = this.sessions.get(id);
    return session ? this.toPublic(session) : undefined;
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  create(workspaceId: string, cols: number, rows: number): SessionPublic {
    const active = [...this.sessions.values()].filter((session) => session.state === "running" || session.state === "starting");
    if (active.length >= this.config.sessions.maxSessions) {
      throw new Error("Maximum session count reached");
    }

    const workspace = this.config.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) throw new Error("Unknown workspace");
    if (!existsSync(workspace.cwd)) throw new Error("Workspace directory is unavailable");

    const shell = workspace.shellPath ?? (process.platform === "win32" ? "pwsh.exe" : "pwsh");
    const environment: Record<string, string | undefined> = {
      ...process.env,
      ...workspace.env,
      TERM: "xterm-256color"
    };

    const child = pty.spawn(shell, workspace.args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: workspace.cwd,
      env: environment
    });

    const mirror = new HeadlessTerminal({
      cols,
      rows,
      scrollback: this.config.sessions.scrollbackLines
    });
    const serializer = new SerializeAddon();
    mirror.loadAddon(serializer);

    const session: ManagedSession = {
      id: sessionId(),
      workspace,
      state: "running",
      createdAt: new Date().toISOString(),
      cols,
      rows,
      pid: child.pid,
      pty: child,
      mirror,
      serializer,
      seq: 0,
      history: [],
      historyBytes: 0,
      clients: new Set(),
      pipeline: Promise.resolve()
    };

    this.sessions.set(session.id, session);

    child.onData((data) => {
      void this.enqueue(session, async () => {
        await writeMirror(session.mirror, data);
        session.seq += 1;
        const frame: OutputFrame = {
          seq: session.seq,
          data,
          bytes: Buffer.byteLength(data, "utf8")
        };
        session.history.push(frame);
        session.historyBytes += frame.bytes;
        this.trimHistory(session);
        this.broadcast(session, { type: "output", seq: frame.seq, data: frame.data });
      });
    });

    child.onExit(({ exitCode }) => {
      void this.enqueue(session, () => {
        session.state = "exited";
        session.exitCode = exitCode;
        this.broadcast(session, { type: "exit", exitCode });
      });
    });

    if (workspace.command) {
      const timer = setTimeout(() => {
        if (session.state === "running") child.write(`${workspace.command}\r`);
      }, 75);
      timer.unref();
    }

    return this.toPublic(session);
  }

  async attach(id: string, socket: WebSocket, lastSeq: number): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) throw new Error("Unknown session");

    await this.enqueue(session, () => {
      this.send(session, socket, {
        type: "hello",
        protocol: PROTOCOL_VERSION,
        sessionId: session.id,
        state: session.state,
        cols: session.cols,
        rows: session.rows,
        latestSeq: session.seq
      });

      const firstSeq = session.history[0]?.seq;
      const canReplay = canReplayFrom(lastSeq, session.seq, firstSeq);

      if (canReplay) {
        for (const frame of session.history) {
          if (frame.seq > lastSeq) {
            this.send(session, socket, { type: "output", seq: frame.seq, data: frame.data });
          }
        }
      } else {
        this.send(session, socket, {
          type: "snapshot",
          seq: session.seq,
          data: session.serializer.serialize()
        });
      }

      session.clients.add(socket);
      if (session.state === "exited") {
        this.send(session, socket, {
          type: "exit",
          ...(session.exitCode !== undefined ? { exitCode: session.exitCode } : {})
        });
      }
    });
  }

  detach(id: string, socket: WebSocket): void {
    this.sessions.get(id)?.clients.delete(socket);
  }

  write(id: string, data: string): void {
    const session = this.requireRunning(id);
    session.pty.write(data);
  }

  async resize(id: string, cols: number, rows: number): Promise<void> {
    const session = this.requireRunning(id);
    await this.enqueue(session, () => {
      session.pty.resize(cols, rows);
      session.mirror.resize(cols, rows);
      session.cols = cols;
      session.rows = rows;
    });
  }

  terminate(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    if (session.state === "running" || session.state === "starting") {
      session.pty.kill();
    }
    return true;
  }

  close(): void {
    for (const session of this.sessions.values()) {
      if (session.state === "running" || session.state === "starting") {
        try { session.pty.kill(); } catch { /* best effort on shutdown */ }
      }
      for (const client of session.clients) {
        try { client.close(1001, "PalmTTY Agent shutting down"); } catch { /* best effort */ }
      }
      session.mirror.dispose();
    }
    this.sessions.clear();
  }

  private requireRunning(id: string): ManagedSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error("Unknown session");
    if (session.state !== "running") throw new Error("Session is not running");
    return session;
  }

  private enqueue(session: ManagedSession, operation: () => void | Promise<void>): Promise<void> {
    const run = session.pipeline.then(operation, operation);
    session.pipeline = run.then(() => undefined, () => undefined);
    return run;
  }

  private trimHistory(session: ManagedSession): void {
    while (
      session.history.length > 1 &&
      session.historyBytes > this.config.sessions.replayBytes
    ) {
      const removed = session.history.shift();
      if (removed) session.historyBytes -= removed.bytes;
    }
  }

  private broadcast(session: ManagedSession, message: ServerMessage): void {
    for (const socket of [...session.clients]) {
      this.send(session, socket, message);
    }
  }

  private send(session: ManagedSession, socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState !== 1) {
      session.clients.delete(socket);
      return;
    }
    if (socket.bufferedAmount > this.config.sessions.maxSocketBufferedBytes) {
      session.clients.delete(socket);
      socket.close(1013, "Client is too slow; reconnect to resume");
      return;
    }
    socket.send(encodeServerMessage(message));
  }

  private toPublic(session: ManagedSession): SessionPublic {
    return {
      id: session.id,
      workspaceId: session.workspace.id,
      state: session.state,
      createdAt: session.createdAt,
      cols: session.cols,
      rows: session.rows,
      connections: session.clients.size,
      pid: session.pid,
      ...(session.exitCode !== undefined ? { exitCode: session.exitCode } : {})
    };
  }
}
