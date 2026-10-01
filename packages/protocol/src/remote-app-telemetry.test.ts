import { describe, expect, it } from "vitest";
import {
  parseRemoteAppCursorMessage,
  parseRemoteAppTelemetryMessage
} from "./remote-app.js";

describe("bounded server-only remote pointer telemetry", () => {
  it("accepts an owned-window position, hidden state and native input status", () => {
    expect(parseRemoteAppCursorMessage('{"type":"cursor","visible":true,"x":0.5,"y":1}'))
      .toEqual({ type: "cursor", visible: true, x: .5, y: 1 });
    expect(parseRemoteAppTelemetryMessage('{"type":"cursor","visible":false}'))
      .toEqual({ type: "cursor", visible: false });
    expect(parseRemoteAppTelemetryMessage('{"type":"inputState","state":"blocked"}'))
      .toEqual({ type: "inputState", state: "blocked" });
  });
  it("rejects global position, extra authority and oversized messages", () => {
    for (const raw of [
      '{"type":"cursor","visible":true,"x":2,"y":0}',
      '{"type":"cursor","visible":true,"x":0,"y":0,"pid":42}',
      '{"type":"cursor","visible":false,"x":0}',
      '{"type":"inputState","state":"elevated"}',
      "{".padEnd(300, "x")
    ]) expect(() => parseRemoteAppTelemetryMessage(raw)).toThrow();
  });
});
