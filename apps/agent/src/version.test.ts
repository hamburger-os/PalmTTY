import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALMTTY_VERSION } from "./version.js";

describe("PalmTTY version", () => {
  it("uses the root package version as the single runtime version source", () => {
    const metadata = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8")
    ) as { version: string };

    expect(PALMTTY_VERSION).toBe(metadata.version);
  });
});
