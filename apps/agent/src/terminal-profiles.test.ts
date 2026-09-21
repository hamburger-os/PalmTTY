import { describe, expect, it } from "vitest";
import {
  decodeWindowsCommandOutput,
  parseWslDistributionList
} from "./terminal-profiles.js";

describe("terminal profile discovery", () => {
  it("decodes UTF-16LE WSL output without requiring a BOM", () => {
    const output = Buffer.from(
      "Ubuntu-22.04\r\nUbuntu-24.04\r\n",
      "utf16le"
    );

    expect(decodeWindowsCommandOutput(output)).toContain("Ubuntu-22.04");
  });

  it("decodes ordinary UTF-8 output", () => {
    const output = Buffer.from("Ubuntu\nDebian\n", "utf8");
    expect(decodeWindowsCommandOutput(output)).toBe("Ubuntu\nDebian\n");
  });

  it("parses WSL distribution names without starting a distro", () => {
    expect(parseWslDistributionList(
      "\uFEFFUbuntu-22.04\r\nUbuntu-24.04\r\nDebian\r\n"
    )).toEqual([
      "Ubuntu-22.04",
      "Ubuntu-24.04",
      "Debian"
    ]);
  });

  it("deduplicates distribution names and tolerates a default marker", () => {
    expect(parseWslDistributionList(
      "* Ubuntu\nubuntu\nDocker-Desktop\n"
    )).toEqual([
      "Ubuntu",
      "Docker-Desktop"
    ]);
  });
});
