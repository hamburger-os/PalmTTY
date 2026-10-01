import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  knownAppCandidates,
  parseInstalledAppDiscovery
} from "./remote-app-discovery.js";

describe("Remote App executable discovery", () => {
  it("includes per-user and machine GUI installation roots without PATH", () => {
    const candidates = knownAppCandidates({
      LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local",
      ProgramFiles: "C:\\Program Files",
      "ProgramFiles(x86)": "C:\\Program Files (x86)"
    });
    const vscode = candidates.find((item) => item.name === "Visual Studio Code");
    expect(vscode?.paths).toContain(
      path.win32.join("C:\\Users\\dev\\AppData\\Local", "Programs", "Microsoft VS Code", "Code.exe")
    );
    expect(vscode?.paths).toContain(
      path.win32.join("C:\\Program Files", "Microsoft VS Code", "Code.exe")
    );
    const chatgpt = candidates.find((item) => item.name === "ChatGPT");
    expect(chatgpt?.paths.some((item) => item.endsWith("WindowsApps\\ChatGPT.exe"))).toBe(true);
  });

  it("accepts bounded installed exe candidates and deduplicates paths", () => {
    expect(parseInstalledAppDiscovery([
      { name: "DeepSeek Harness", executable: "C:\\Tools\\Harness.exe", source: "detected" },
      { name: "Duplicate", executable: "c:\\tools\\HARNESS.EXE", source: "detected" },
      { name: "Unsupported script", executable: "C:\\Tools\\tool.cmd", source: "detected" },
      { name: "UNC", executable: "\\\\server\\share\\tool.exe", source: "detected" },
      { name: "Empty", executable: "", source: "detected" },
      { name: "", executable: "C:\\Tools\\empty.exe", source: "detected" }
    ])).toEqual([
      { name: "DeepSeek Harness", executable: "C:\\Tools\\Harness.exe", source: "detected" }
    ]);
  });

  it("rejects oversized data instead of widening the public discovery schema", () => {
    const entries = Array.from({ length: 100 }, (_, index) => ({
      name: "App " + index,
      executable: "C:\\Apps\\app-" + index + ".exe",
      source: "detected"
    }));
    expect(parseInstalledAppDiscovery(entries)).toHaveLength(64);
    expect(parseInstalledAppDiscovery(null)).toEqual([]);
    expect(parseInstalledAppDiscovery(entries[0])).toHaveLength(1);
  });
});
