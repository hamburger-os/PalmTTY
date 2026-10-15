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
import { ReplayHistory } from "./replay-history.js";
import { TerminalMouseEncoding } from "./terminal-mouse-encoding.js";
import { buildPtyEnvironment, type RuntimeWorkspace } from "./workspace-runtime.js";

const require = createRequire(import.meta.url);
// One recovery frame must fit in the local IPC budget and the mobile renderer.
export const MAX_TERMINAL_SNAPSHOT_BYTES = 4 * 1024 * 1024;
export const HIGH_WATER_OUTPUT_BYTES = 512 * 1024;
export const LOW_WATER_OUTPUT_BYTES = 128 * 1024;
const { Terminal: HeadlessTerminal } = require("@xterm/headless") as typeof import("@xterm/headless");
const { SerializeAddon } = require("@xterm/addon-serialize") as typeof import("@xterm/addon-serialize");

export type PtyHandle = {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  pause?(): void;
  resume?(): void;
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

export const defaultPtyFactory: PtyFactory = (file, args, options) => pty.spawn(
  file,
  args,
  process.platform === "win32"
    ? { ...options, useConptyDll: true }
    : options
);

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
  private readonly mouseEncoding: TerminalMouseEncoding;
  private seq = 0;
  private readonly history: ReplayHistory;
  private pipeline: Promise<void> = Promise.resolve();
  private pendingOutput: string[] = [];
  private pendingOutputBytes = 0;
  private outputDrainScheduled = false;
  private outputPaused = false;
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
    this.history = new ReplayHistory(options.config.replayBytes);

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
    this.mouseEncoding = new TerminalMouseEncoding(this.mirror);

    this.child.onData((data) => {
      if (this.disposed) return;
      this.pendingOutput.push(data);
      this.pendingOutputBytes += Buffer.byteLength(data, "utf8");
      if (!this.outputPaused && this.pendingOutputBytes >= HIGH_WATER_OUTPUT_BYTES) {
        // node-pty's pause() stops reading its underlying PTY socket.
        // Unlike dropping output, this preserves canonical screen state.
        this.child.pause?.();
        this.outputPaused = true;
      }
      this.scheduleOutputDrain();
    });

    this.child.onExit(({ exitCode }) => {
      void this.enqueue(async () => {
        if (this.disposed || this.state === "exited") return;
        // The exit event may race with PTY chunks received during a prior
        // headless write. Drain all accepted output before the exit marker.
        while (this.pendingOutput.length) await this.drainPendingOutput();
        this.state = "exited";
        this.exitCode = exitCode;
        this.emitMessage({ type: "exit", exitCode });
        this.scheduleRetirement();
      });
    });

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
    cols: number,
    rows: number,
    commit: (messages: ServerMessage[]) => void
  ): Promise<void> {
    await this.enqueue(() => {
      const geometryChanged = cols !== this.cols || rows !== this.rows;
      if (geometryChanged) {
        if (this.state === "running" || this.state === "starting") {
          this.child.resize(cols, rows);
        }
        this.mirror.resize(cols, rows);
        this.cols = cols;
        this.rows = rows;
      }

      const messages: ServerMessage[] = [];
      const firstSeq = this.history.firstSeq;
      const pending = this.history.after(lastSeq);
      const pendingBytes = pending.reduce((sum, frame) => sum + frame.bytes, 0);
      if (!geometryChanged && canReplayFrom(
        lastSeq, this.seq, firstSeq, pending.length, pendingBytes
      )) {
        for (const frame of pending) {
          messages.push({ type: "output", seq: frame.seq, data: frame.data });
        }
      } else {
        // Serialized terminal state is geometry-sensitive. When the attaching
        // viewport changed size, resize the canonical PTY/mirror first and
        // recover from that state instead of replaying bytes produced for the
        // previous geometry.
        messages.push({
          type: "snapshot",
          seq: this.seq,
          cols: this.cols,
          rows: this.rows,
          data: this.seq === 0 ? "" : this.boundedSnapshot()
        });
      }

      // hello is the recovery-complete boundary. The browser may accept input
      // only after every snapshot/replay frame before it has been rendered.
      messages.push({
        type: "hello",
        protocol: PROTOCOL_VERSION,
        sessionId: this.id,
        state: this.state,
        cols: this.cols,
        rows: this.rows,
        latestSeq: this.seq
      });

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
      if (this.state === "stopping" || this.state === "exited" || this.state === "failed") {
        return;
      }
      if (this.state !== "running" && this.state !== "starting") return;

      const previousState = this.state;
      this.state = "stopping";
      try {
        this.child.kill();
      } catch (error) {
        this.state = previousState;
        throw error;
      }
    });
  }

  async dispose(killPty: boolean): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    if (
      killPty &&
      (this.state === "running" || this.state === "starting" || this.state === "stopping")
    ) {
      try {
        this.child.kill();
      } catch {
        // Best effort during explicit worker shutdown.
      }
    }
    await this.pipeline.catch(() => undefined);
    this.messageListeners.clear();
    this.retireListeners.clear();
    this.history.clear();
    this.pendingOutput = [];
    this.pendingOutputBytes = 0;
    this.mirror.dispose();
  }

  private scheduleOutputDrain(): void {
    if (this.disposed || this.outputDrainScheduled || this.pendingOutput.length === 0) return;
    this.outputDrainScheduled = true;
    void this.enqueue(async () => {
      try {
        await this.drainPendingOutput();
      } finally {
        this.outputDrainScheduled = false;
        if (this.pendingOutput.length) this.scheduleOutputDrain();
      }
    });
  }

  private async drainPendingOutput(): Promise<void> {
    if (this.disposed || this.pendingOutput.length === 0) return;
    const chunks = this.pendingOutput;
    this.pendingOutput = [];
    // Process as one xterm parse operation, but keep original output
    // sequence semantics so short replay/overflow policy stays stable.
    await writeMirror(this.mirror, chunks.join(""));
    for (const data of chunks) {
      this.seq += 1;
      this.history.push(this.seq, data);
      this.emitMessage({ type: "output", seq: this.seq, data });
    }
    this.pendingOutputBytes -= chunks.reduce(
      (total, part) => total + Buffer.byteLength(part, "utf8"), 0
    );
    if (this.outputPaused && this.pendingOutputBytes <= LOW_WATER_OUTPUT_BYTES) {
      this.outputPaused = false;
      this.child.resume?.();
    }
  }

  private requireRunning(): void {
    if (this.state !== "running") throw new Error("Session is not running");
  }

  private enqueue(operation: () => void | Promise<void>): Promise<void> {
    const run = this.pipeline.then(operation, operation);
    this.pipeline = run.then(() => undefined, () => undefined);
    return run;
  }

  private boundedSnapshot(): string {
    // Preserve the visible screen and active terminal modes. Reduce old
    // scrollback first rather than sending an unbounded serialized history.
    let scrollback = this.options.config.scrollbackLines;
    while (true) {
      const snapshot = this.serializer.serialize({ scrollback }) +
        this.mouseEncoding.snapshotSuffix();
      if (Buffer.byteLength(snapshot, "utf8") <= MAX_TERMINAL_SNAPSHOT_BYTES) {
        return snapshot;
      }
      if (scrollback === 0) {
        throw new Error("Visible terminal state exceeds snapshot budget");
      }
      scrollback = Math.floor(scrollback / 2);
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
