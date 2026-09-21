import { describe, expect, it } from "vitest";
import {
  addWslEnvironmentForwarding,
  applyEnvironmentOverrides,
  mergeWindowsEnvironment,
  withoutEnvironmentKeys
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

  it("expands a user PATH that explicitly references the machine PATH once", () => {
    const result = mergeWindowsEnvironment(
      { USERPROFILE: "C:\\Users\\dev", PATH: "C:\\stale" },
      { Path: "C:\\Windows\\System32" },
      { Path: "%PATH%;%USERPROFILE%\\bin" }
    );

    expect(result.Path).toBe(
      "C:\\Windows\\System32;C:\\Users\\dev\\bin"
    );
  });

  it("does not recursively expand a variable that references itself", () => {
    const result = mergeWindowsEnvironment(
      { LOOP: "baseline" },
      { LOOP: "%LOOP%;machine" },
      {}
    );

    expect(result.LOOP).toBe("%LOOP%;machine");
  });

  it("adds WSLENV entries without duplicating existing names or flags", () => {
    const result = addWslEnvironmentForwarding(
      { WSLENV: "EXISTING/u:SECRET" },
      ["HTTPS_PROXY", "EXISTING", "HTTP_PROXY"]
    );

    expect(result.WSLENV).toBe(
      "EXISTING/u:SECRET:HTTPS_PROXY:HTTP_PROXY"
    );
  });

  it("removes excluded environment keys without mutating the source", () => {
    const source = {
      PALMTTY_TEST_ACCESS_TOKEN: "secret",
      PALMTTY_VISIBLE: "yes"
    };
    const result = withoutEnvironmentKeys(
      source,
      ["PALMTTY_TEST_ACCESS_TOKEN"]
    );

    expect(result).toEqual({ PALMTTY_VISIBLE: "yes" });
    expect(source.PALMTTY_TEST_ACCESS_TOKEN).toBe("secret");
  });
});
