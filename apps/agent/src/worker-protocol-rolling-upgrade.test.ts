import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, ServerMessageSchema } from "@palmtty/protocol";
import {
  normalizeWorkerDelivery,
  WorkerEventSchema
} from "./worker-protocol.js";

const oldHello = {
  type: "hello",
  protocol: 3,
  sessionId: "session-across-upgrade",
  state: "running",
  cols: 80,
  rows: 24,
  latestSeq: 42
} as const;

describe("retained Session Worker hello upgrade", () => {
  it("accepts an existing Worker on authenticated IPC and exposes only current browser protocol", () => {
    const event = WorkerEventSchema.parse({
      type: "deliver", clientId: "client", message: oldHello
    });
    expect(event.type).toBe("deliver");
    if (event.type !== "deliver") throw new Error("Expected Worker delivery");
    const message = normalizeWorkerDelivery(event.message);
    expect(message).toEqual({ ...oldHello, protocol: PROTOCOL_VERSION });
    expect(ServerMessageSchema.parse(message)).toEqual(message);
    expect(ServerMessageSchema.safeParse(oldHello).success).toBe(false);
  });

  it("preserves v4 hello and all output/snapshot events verbatim", () => {
    const newHello = { ...oldHello, protocol: PROTOCOL_VERSION, role: "owner" };
    for (const message of [
      newHello,
      { type: "output", seq: 43, data: "running\\r\\n" },
      { type: "snapshot", seq: 43, cols: 80, rows: 24, data: "state" }
    ]) {
      const event = WorkerEventSchema.parse({
        type: "deliver", clientId: "client", message
      });
      if (event.type !== "deliver") throw new Error("Expected delivery");
      expect(normalizeWorkerDelivery(event.message)).toEqual(message);
    }
  });

  it("rejects unknown Worker hello revisions and malformed payloads", () => {
    expect(WorkerEventSchema.safeParse({
      type: "deliver", clientId: "client",
      message: { ...oldHello, protocol: 2 }
    }).success).toBe(false);
    expect(WorkerEventSchema.safeParse({
      type: "deliver", clientId: "client",
      message: { ...oldHello, cols: -1 }
    }).success).toBe(false);
  });
});
