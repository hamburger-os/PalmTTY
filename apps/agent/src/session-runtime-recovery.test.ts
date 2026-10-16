import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@palmtty/protocol";
import { SessionRuntime, type PtyHandle } from "./session-runtime.js";

class FakePty implements PtyHandle {
  readonly pid = 1234;
  resizeCalls: Array<[number, number]> = [];
  private readonly data = new Set<(data: string) => void>();
  private readonly exits = new Set<(event: { exitCode: number }) => void>();

  write(): void {}
  resize(cols: number, rows: number): void { this.resizeCalls.push([cols, rows]); }
  kill(): void {}
  onData(listener: (data: string) => void) {
    this.data.add(listener);
    return { dispose: () => { this.data.delete(listener); } };
  }
  onExit(listener: (event: { exitCode: number }) => void) {
    this.exits.add(listener);
    return { dispose: () => { this.exits.delete(listener); } };
  }
  emitData(value: string): void {
    for (const listener of this.data) listener(value);
  }
  emitExit(): void {
    for (const listener of this.exits) listener({ exitCode: 0 });
  }
}

function fixture() {
  const pty = new FakePty();
  const runtime = new SessionRuntime({
    id: "retained-test",
    workspace: { id: "workspace", cwd: process.cwd(),
      executable: process.execPath, args: [], env: {} },
    createdAt: new Date(0).toISOString(),
    cols: 80,
    rows: 24,
    config: { exitedRetentionMinutes: 30, scrollbackLines: 100, replayBytes: 65536 },
    ptyFactory: () => pty
  });
  return { pty, runtime };
}

describe("terminal recovery geometry", () => {
  it("keeps exited terminal history immutable across narrow-screen reattachments", async () => {
    const { pty, runtime } = fixture();
    try {
      pty.emitData("retained history\r\n");
      pty.emitExit();
      const messages: ServerMessage[] = [];
      await runtime.recover(0, 36, 12, (batch) => messages.push(...batch));
      const snapshot = messages.find((m) => m.type === "snapshot");
      expect(snapshot).toMatchObject({ cols: 80, rows: 24 });
      expect(snapshot?.type === "snapshot" && snapshot.data).toContain("retained history");
      expect(messages.find((m) => m.type === "hello")).toMatchObject({
        state: "exited", cols: 80, rows: 24
      });
      expect(runtime.toPublic().cols).toBe(80);
      expect(runtime.toPublic().rows).toBe(24);
      expect(pty.resizeCalls).toEqual([]);
      const again: ServerMessage[] = [];
      await runtime.recover(1, 25, 9, (batch) => again.push(...batch));
      expect(again[0]).toMatchObject({ type: "snapshot", cols: 80, rows: 24 });
    } finally {
      await runtime.dispose(false);
    }
  });

  it("still resizes a live PTY and snapshots the new geometry", async () => {
    const { pty, runtime } = fixture();
    try {
      const messages: ServerMessage[] = [];
      await runtime.recover(0, 45, 18, (batch) => messages.push(...batch));
      expect(pty.resizeCalls).toEqual([[45, 18]]);
      expect(runtime.toPublic()).toMatchObject({ cols: 45, rows: 18 });
      expect(messages[0]).toMatchObject({ type: "snapshot", cols: 45, rows: 18 });
    } finally {
      await runtime.dispose(false);
    }
  });
});
