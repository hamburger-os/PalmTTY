import { describe, expect, it } from "vitest";
import { sourceRemoteAppHostFilename } from "./remote-app-host.js";

describe("source Windows Remote App helper cache", () => {
  it("uses a deterministic content and compiler-options fingerprint", () => {
    const first = Buffer.from("class Host { static void Main() {} }");
    const name = sourceRemoteAppHostFilename(first);
    expect(name).toMatch(/^palmtty-remote-app-host-[a-f0-9]{16}\.exe$/);
    expect(sourceRemoteAppHostFilename(Buffer.from(first))).toBe(name);
  });

  it("never reuses the previous compiled host when C# source changes", () => {
    const old = sourceRemoteAppHostFilename(Buffer.from("class Host { }"));
    const next = sourceRemoteAppHostFilename(Buffer.from("class Host { static int V = 2; }"));
    expect(next).not.toBe(old);
  });
});
