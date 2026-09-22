import { describe, expect, it } from "vitest";
import { applyEnvironmentFileEntries, parseEnvironmentFile } from "./environment-file.js";

describe("environment file", () => {
  it("parses comments, whitespace, empty values and balanced quotes", () => {
    expect(Object.fromEntries(parseEnvironmentFile(`\uFEFF# PalmTTY autostart
PALMTTY_ACCESS_TOKEN = "long random token"
EMPTY=
RAW=a=b=c
`))).toEqual({
      PALMTTY_ACCESS_TOKEN: "long random token",
      EMPTY: "",
      RAW: "a=b=c"
    });
  });

  it("rejects malformed, duplicate and unbalanced entries", () => {
    expect(() => parseEnvironmentFile("NO_SEPARATOR")).toThrow(/NAME=value/u);
    expect(() => parseEnvironmentFile("1BAD=value")).toThrow(/variable name/u);
    expect(() => parseEnvironmentFile("A=1\nA=2")).toThrow(/Duplicate/u);
    expect(() => parseEnvironmentFile('A="broken')).toThrow(/Unbalanced/u);
  });

  it("applies values without logging or shell expansion", () => {
    const environment: NodeJS.ProcessEnv = { KEEP: "existing" };
    applyEnvironmentFileEntries(parseEnvironmentFile("TOKEN=$HOME literal\nKEEP=override"), environment);
    expect(environment).toEqual({ KEEP: "override", TOKEN: "$HOME literal" });
  });
});
