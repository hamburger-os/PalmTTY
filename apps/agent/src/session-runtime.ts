import { createRequire } from "node:module";
import {
  PROTOCOL_VERSION,
  type ServerMessage,
  type SessionPublic,
  type SessionState
} from "@palmtty/protocol";
import type { SerializeAddon as SerializeAddonType } from "@xterm/addon-serialize";
import type { Terminal as HeadlessTerminalType } from "@xterm/headless";
import * as pty from "node-pty";
import { canReplayFrom } from "./reconnect-policy.js";
import { buildPtyEnvironment, type RuntimeWorkspace } from "./workspace-runtime.js";

const require = createRequire(import.meta.url);
const { Terminal: HeadlessTerminal } = require("@xterm/headless") as typeof import("@xterm/headless");
const { SerializeAddon } = require("@xterm/addon-serialize") as typeof import("@xterm/addon-serialize");

export type PtyHandle = {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): { dispose(): void };
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void };
};

export type PtySpawnOptions = {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string | undefined>;
};

export type PtyFactory = (
  file: string,
  args: string[],
  options: PtySpawnOptions
) => PtyHandle;

export const defaultPtyFactory: PtyFactory = (file, args, options) => pty.spawn(file, args, options);

type OutputFrame = {
  seq: number;
  data: string;
  bytes: number;
};

export type SessionRuntimeConfig = {
  exitedRetentionMinutes: number;
  scrollbackLines: number;
  replayBytes: number;
};

export type SessionRuntimeOptions = {
  id: string;
  workspace: RuntimeWorkspace;
  createdAt: string;
  cols: number;
  rows: number;
  config: SessionRuntimeConfig;
  ptyFactory?: PtyFactory;
  excludedEnvKeys?: string[];
};

type MessageListener = (message: ServerMessage) => void;
type RetireListener = () => void;

function writeMirror(terminal: HeadlessTerminalType, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve));
}

export class SessionRuntime {
  readonly id: string;
  readonly workspace: RuntimeWorkspace;
  readonly createdAt: string;
  readonly pid: number;

  private state: SessionState = "running";
  private cols: number;
  private rows: number;
  private exitCode: number | undefined;
  private readonly child: PtyHandle;
  private readonly mirror: HeadlessTerminalType;
  private readonly serializer: SerializeAddonType;
  private seq = 0;
  private history: OutputFrame[] = [];
  private historyBytes = 0;
  private pipeline: Promise<void> = Promise.resolve();
  private cleanupTimer: NodeJS.Timeout | undefined;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly retireListeners = new Set<RetireListener>();
  private disposed = false;

  constructor(private readonly options: SessionRuntimeOptions) {
    this.id = options.id;
    this.workspace = options.workspace;
    this.createdAt = options.createdAt;
    this.cols = options.cols;
    this.rows = options.rows;

    const environment = buildPtyEnvironment(
      options.workspace,
      options.excludedEnvKeys
    );

    const ptyFactory = options.ptyFactory ?? defaultPtyFactory;
    this.child = ptyFactory(options.workspace.executable, options.workspace.args, {
      name: "xterm-256color",
      cols: options.cols,
      rows: options.rows,
      cwd: options.workspace.cwd,
      env: environment
    });
    this.pid = this.child.pid;

    this.mirror = new HeadlessTerminal({
      cols: options.cols,
      rows: options.rows,
      scrollback: options.config.scrollbackLines,
      allowProposedApi: true
    });
    this.serializer = new SerializeAddon();
    this.mirror.loadAddon(this.serializer);

    this.child.onData((data) => {
      void this.enqueue(async () => {
        if (this.disposed) return;
        await writeMirror(this.mirror, data);
        this.seq += 1;
        const frame: OutputFrame = {
          seq: this.seq,
          data,
          bytes: Buffer.byteLength(data, "utf8")
        };
        this.history.push(frame);
        this.historyBytes += frame.bytes;
        this.trimHistory();
        this.emitMessage({ type: "output", seq: frame.seq, data: frame.data });
      });
    });

    this.child.onExit(({ exitCode }) => {
      void this.enqueue(() => {
        if (this.disposed || this.state === "exited") return;
        this.state = "exited";
        this.exitCode = exitCode;
        this.emitMessage({ type: "exit", exitCode });
        this.scheduleRetirement();
      });
    });

    if (options.workspace.command) {
      const timer = setTimeout(() => {
        if (!this.disposed && this.state === "running") {
          void this.write(`${options.workspace.command}\r`);
        }
      }, 75);
      timer.unref();
    }
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onRetire(listener: RetireListener): () => void {
    this.retireListeners.add(listener);
    return () => this.retireListeners.delete(listener);
  }

  toPublic(connections = 0): SessionPublic {
    return {
      id: this.id,
      workspaceId: this.workspace.id,
      state: this.state,
      createdAt: this.createdAt,
      cols: this.cols,
      rows: this.rows,
      connections,
      pid: this.pid,
      ...(this.exitCode !== undefined ? { exitCode: this.exitCode } : {})
    };
  }

  async recover(
    lastSeq: number,
    commit: (messages: ServerMessage[]) => void
  ): Promise<void> {
    await this.enqueue(() => {
      const messages: ServerMessage[] = [{
        type: "hello",
        protocol: PROTOCOL_VERSION,
        sessionId: this.id,
        state: this.state,
        cols: this.cols,
        rows: this.rows,
        latestSeq: this.seq
      }];

      const firstSeq = this.history[0]?.seq;
      if (canReplayFrom(lastSeq, this.seq, firstSeq)) {
        for (const frame of this.history) {
          if (frame.seq > lastSeq) {
            messages.push({ type: "output", seq: frame.seq, data: frame.data });
          }
        }
      } else {
        messages.push({
          type: "snapshot",
          seq: this.seq,
          data: this.seq === 0 ? "" : this.serializer.serialize()
        });
      }

      if (this.state === "exited") {
        messages.push({
          type: "exit",
          ...(this.exitCode !== undefined ? { exitCode: this.exitCode } : {})
        });
      }

      // The caller establishes its live subscription synchronously inside this
      // ordered runtime operation, so output cannot fall into a recovery gap.
      commit(messages);
    });
  }

  async write(data: string): Promise<void> {
    await this.enqueue(() => {
      this.requireRunning();
      this.child.write(data);
    });
  }

  async resize(cols: number, rows: number): Promise<void> {
    await this.enqueue(() => {
      this.requireRunning();
      this.child.resize(cols, rows);
      this.mirror.resize(cols, rows);
      this.cols = cols;
      this.rows = rows;
    });
  }

  async terminate(): Promise<void> {
    await this.enqueue(() => {
      if (this.state === "running" || this.state === "starting") {
        this.child.kill();
      }
    });
  }

  async dispose(killPty: boolean): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    if (killPty && (this.state === "running" || this.state === "starting")) {
      try {
        this.child.kill();
      } catch {
        // Best effort during explicit worker shutdown.
      }
    }
    await this.pipeline.catch(() => undefined);
    this.messageListeners.clear();
    this.retireListeners.clear();
    this.history = [];
    this.historyBytes = 0;
    this.mirror.dispose();
  }

  private requireRunning(): void {
    if (this.state !== "running") throw new Error("Session is not running");
  }

  private enqueue(operation: () => void | Promise<void>): Promise<void> {
    const run = this.pipeline.then(operation, operation);
    this.pipeline = run.then(() => undefined, () => undefined);
    return run;
  }

  private trimHistory(): void {
    while (
      this.history.length > 0 &&
      this.historyBytes > this.options.config.replayBytes
    ) {
      const removed = this.history.shift();
      if (removed) this.historyBytes -= removed.bytes;
    }
  }

  private emitMessage(message: ServerMessage): void {
    for (const listener of [...this.messageListeners]) listener(message);
  }

  private scheduleRetirement(): void {
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = setTimeout(() => {
      for (const listener of [...this.retireListeners]) listener();
    }, this.options.config.exitedRetentionMinutes * 60_000);
    this.cleanupTimer.unref();
  }
}
