import { describe, expect, it } from "vitest";
import { profileMatches, runtimeFromState, runtimeKey, workspaceRuntimeSummary } from "./workspace-runtime-helpers.js";

describe("workspace runtime view helpers", () => {
  it("keys Host and WSL directory drafts independently", () => {
    expect(runtimeKey("host", "")).toBe("host");
    expect(runtimeKey("wsl", " Ubuntu-24.04 ")).toBe("wsl:ubuntu-24.04");
    expect(runtimeKey("wsl", "")).toBe("wsl:<default>");
  });
  it("resolves profiles only when argv and shell identity match", () => {
    const profile = { id: "wsl", label: "Ubuntu", recommended: false, runtime: {
      kind: "wsl" as const, distribution: "Ubuntu", shell: "/bin/bash", args: ["-l"]
    } };
    expect(profileMatches(profile, "wsl", "ubuntu", "/bin/bash", ["-l"])).toBe(true);
    expect(profileMatches(profile, "wsl", "ubuntu", "/bin/bash", [])).toBe(false);
    expect(profileMatches(profile, "host", "", "/bin/bash", ["-l"])).toBe(false);
  });
  it("creates typed runtime settings and summarized display labels", () => {
    const runtime = runtimeFromState("wsl", "Ubuntu", "/bin/bash", []);
    expect(runtime).toEqual({ kind: "wsl", distribution: "Ubuntu", shell: "/bin/bash", args: [] });
    expect(workspaceRuntimeSummary({
      id: "one", name: "one", cwd: "/home/dev", terminal: { runtime }, remoteApps: []
    }, { host: "Host", wsl: "WSL", defaultShell: "Default" }))
      .toBe("Ubuntu · /bin/bash");
  });
});
