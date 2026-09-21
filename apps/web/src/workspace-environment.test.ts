import { describe, expect, it } from "vitest";
import {
  formatWorkspaceEnvironment,
  parseWorkspaceEnvironment,
  WorkspaceEnvironmentParseError
} from "./workspace-environment.js";

describe("workspace environment", () => {
  it("parses NAME=value lines and preserves values after the first equals sign", () => {
    expect(parseWorkspaceEnvironment(
      "HTTPS_PROXY=http://127.0.0.1:10808\nTOKEN=a=b=c\n"
    )).toEqual({
      HTTPS_PROXY: "http://127.0.0.1:10808",
      TOKEN: "a=b=c"
    });
  });

  it("normalizes balanced outer quotes from copied proxy assignments", () => {
    expect(parseWorkspaceEnvironment(
      'HTTP_PROXY="http://127.0.0.1:10808"\n' +
      "HTTPS_PROXY='http://127.0.0.1:10808'\n"
    )).toEqual({
      HTTP_PROXY: "http://127.0.0.1:10808",
      HTTPS_PROXY: "http://127.0.0.1:10808"
    });
  });

  it("rejects unbalanced outer quotes instead of persisting a broken proxy URL", () => {
    expect(() => parseWorkspaceEnvironment(
      'HTTP_PROXY="http://127.0.0.1:10808'
    )).toThrow(WorkspaceEnvironmentParseError);
  });

  it("formats persisted values without shell syntax", () => {
    expect(formatWorkspaceEnvironment({
      HTTPS_PROXY: "http://127.0.0.1:10808",
      HTTP_PROXY: "http://127.0.0.1:10808"
    })).toBe(
      "HTTPS_PROXY=http://127.0.0.1:10808\n" +
      "HTTP_PROXY=http://127.0.0.1:10808"
    );
  });

  it("rejects duplicate and reserved variable names", () => {
    expect(() => parseWorkspaceEnvironment("Path=one\nPATH=two"))
      .toThrow(WorkspaceEnvironmentParseError);
    expect(() => parseWorkspaceEnvironment("TERM=xterm"))
      .toThrow(WorkspaceEnvironmentParseError);
  });
});
