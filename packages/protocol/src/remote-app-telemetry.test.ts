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
    for (const state of [
      "ready", "session-disconnected", "desktop-unavailable",
      "display-unavailable", "window-unavailable", "focus-denied",
      "window-occluded", "input-rejected"
    ]) {
      expect(parseRemoteAppTelemetryMessage(JSON.stringify({ type: "inputState", state })))
        .toEqual({ type: "inputState", state });
    }
  });
  it("rejects global position, extra authority and oversized messages", () => {
    for (const raw of [
      '{"type":"cursor","visible":true,"x":2,"y":0}',
      '{"type":"cursor","visible":true,"x":0,"y":0,"pid":42}',
      '{"type":"cursor","visible":false,"x":0}',
      '{"type":"inputState","state":"elevated"}',
      '{"type":"inputState","state":"ready","pid":1337}',
      '{"type":"inputState","state":"blocked"}',
      "{".padEnd(300, "x")
    ]) expect(() => parseRemoteAppTelemetryMessage(raw)).toThrow();
  });
});
