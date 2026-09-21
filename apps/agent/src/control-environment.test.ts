import { describe, expect, it } from "vitest";
import {
  controlEnvironmentKeys,
  isReservedControlEnvironmentKey
} from "./control-environment.js";

describe("PalmTTY control environment", () => {
  it("reserves the PalmTTY namespace plus a custom token variable", () => {
    expect(controlEnvironmentKeys(
      "CUSTOM_TOKEN",
      {
        PALMTTY_ACCESS_TOKEN: "secret",
        PALMTTY_FUTURE_CONTROL: "value",
        ORDINARY_VALUE: "keep"
      },
      "linux"
    )).toEqual([
      "CUSTOM_TOKEN",
      "PALMTTY_ACCESS_TOKEN",
      "PALMTTY_FUTURE_CONTROL"
    ]);
  });

  it("uses Windows case-insensitive environment-key semantics", () => {
    expect(isReservedControlEnvironmentKey(
      "palmtty_future_control",
      "CUSTOM_TOKEN",
      "win32"
    )).toBe(true);
    expect(isReservedControlEnvironmentKey(
      "custom_token",
      "CUSTOM_TOKEN",
      "win32"
    )).toBe(true);
    expect(isReservedControlEnvironmentKey(
      "custom_token",
      "CUSTOM_TOKEN",
      "linux"
    )).toBe(false);
  });

  it("does not reserve unrelated environment names", () => {
    expect(isReservedControlEnvironmentKey(
      "HTTP_PROXY",
      "CUSTOM_TOKEN",
      "win32"
    )).toBe(false);
  });
});
