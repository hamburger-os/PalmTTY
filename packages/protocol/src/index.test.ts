import { describe, expect, it } from "vitest";
import {
  CreateSessionSchema,
  MAX_INPUT_BYTES,
  parseClientMessage
} from "./index.js";

describe("protocol", () => {
  it("accepts a valid session request", () => {
    expect(CreateSessionSchema.parse({ workspaceId: "palmtty" })).toEqual({
      workspaceId: "palmtty",
      cols: 80,
      rows: 24
    });
  });

  it("rejects oversized terminal dimensions", () => {
    expect(() => CreateSessionSchema.parse({ workspaceId: "x", cols: 501, rows: 24 })).toThrow();
  });

  it("rejects oversized terminal input", () => {
    const data = "x".repeat(MAX_INPUT_BYTES + 1);
    expect(() => parseClientMessage(JSON.stringify({ type: "input", data }))).toThrow();
  });

  it("parses resume messages", () => {
    expect(parseClientMessage('{"type":"resume","lastSeq":9}')).toEqual({
      type: "resume",
      lastSeq: 9
    });
  });
});
