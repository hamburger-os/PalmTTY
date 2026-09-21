import { describe, expect, it } from "vitest";
import {
  addWslEnvironmentForwarding,
  applyEnvironmentOverrides,
  mergeWindowsEnvironment
} from "./host-environment.js";

describe("host environment", () => {
  it("rebuilds Windows PATH from fresh machine and user values", () => {
    const result = mergeWindowsEnvironment(
      {
        PATH: "C:\\stale",
        USERPROFILE: "C:\\Users\\dev",
        PALMTTY_TRANSIENT: "keep"
      },
      {
        Path: "C:\\Windows\\System32;%USERPROFILE%\\machine-bin",
        ProgramData: "C:\\ProgramData"
      },
      {
        PATH: "%USERPROFILE%\\AppData\\Local\\Programs\\agy",
        PALMTTY_USER_SETTING: "fresh"
      }
    );

    expect(result.Path).toBe(
      "C:\\Windows\\System32;C:\\Users\\dev\\machine-bin;" +
      "C:\\Users\\dev\\AppData\\Local\\Programs\\agy"
    );
    expect(result.PALMTTY_TRANSIENT).toBe("keep");
    expect(result.PALMTTY_USER_SETTING).toBe("fresh");
    expect("PATH" in result).toBe(false);
  });

  it("applies environment overrides case-insensitively on Windows semantics", () => {
    const result = applyEnvironmentOverrides(
      { Path: "base", HOME: "/home/dev" },
      { PATH: "override", HTTPS_PROXY: "http://127.0.0.1:10808" }
    );

    if (process.platform === "win32") {
      expect(result.PATH).toBe("override");
      expect("Path" in result).toBe(false);
    } else {
      expect(result.Path).toBe("base");
      expect(result.PATH).toBe("override");
    }
    expect(result.HTTPS_PROXY).toBe("http://127.0.0.1:10808");
  });

  it("adds WSLENV entries without duplicating existing names", () => {
    const result = addWslEnvironmentForwarding(
      { WSLENV: "EXISTING/u:SECRET" },
      ["HTTPS_PROXY", "EXISTING", "HTTP_PROXY"]
    );

    expect(result.WSLENV).toBe(
      "EXISTING/u:SECRET/HTTPS_PROXY/HTTP_PROXY"
    );
  });
});
