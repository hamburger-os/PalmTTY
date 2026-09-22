import { parseConfig } from "@palmtty/config";
import type { WorkspaceDefinition } from "@palmtty/protocol";
import { SessionManager } from "./session-manager.js";
import { MemoryWorkspaceStore } from "./workspace-store.js";

function requiredWindowsShellPath(): string {
  const shellPath = process.argv[3];
  if (!shellPath) throw new Error("Windows shell path argument is required");
  return shellPath;
}

function workspaceForProcessWorker(): WorkspaceDefinition {
  return process.platform === "win32"
    ? {
        id: "process",
        name: "Process worker",
        cwd: process.cwd(),
        runtime: {
          kind: "host",
          shell: requiredWindowsShellPath(),
          args: ["-NoLogo", "-NoProfile"]
        }
      }
    : {
        id: "process",
        name: "Process worker",
        cwd: process.cwd(),
        runtime: {
          kind: "host",
          shell: "/bin/sh",
          args: ["-i"]
        }
      };
}

async function main() {
  const runtimeDir = process.argv[2];
  if (!runtimeDir) throw new Error("runtime directory argument is required");

  const config = parseConfig({ server: { port: 7688, exposure: { mode: "local" } }, auth: { enabled: false } });
  config.sessions.exitedRetentionMinutes = 0.01;
  const manager = new SessionManager(config, {
    runtimeDir,
    workspaceStore: new MemoryWorkspaceStore([workspaceForProcessWorker()])
  });
  await manager.initialize();
  const session = await manager.create("process", 80, 24);
  process.stdout.write(`${JSON.stringify(session)}\n`);
  await manager.close();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
