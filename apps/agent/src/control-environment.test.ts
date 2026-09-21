import { describe, expect, it } from "vitest";
import {
  controlEnvironmentKeys,
  isReservedControlEnvironmentKey
} from "./control-environment.js";

describe("PalmTTY control environment", () => {
  it("includes the configured token and internal development controls", () => {
    expect(controlEnvironmentKeys("CUSTOM_TOKEN")).toEqual(expect.arrayContaining([
      "CUSTOM_TOKEN",
      "PALMTTY_ACCESS_TOKEN",
      "PALMTTY_CONFIG",
      "PALMTTY_AGENT_URL",
      "PALMTTY_WEB_HOST",
      "PALMTTY_DEV_TRUSTED_ORIGINS",
      "PALMTTY_WINDOWS_SPAWN_TRACE"
    ]));
  });

  it("uses Windows case-insensitive environment-key semantics", () => {
    expect(isReservedControlEnvironmentKey(
      "palmtty_dev_trusted_origins",
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
});
