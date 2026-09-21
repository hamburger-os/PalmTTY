import { parseConfig } from "@palmtty/config";
import { SessionManager } from "./session-manager.js";

function configForProcessWorker() {
  const shellPath = process.argv[3];
  const workspace = process.platform === "win32"
    ? {
        id: "process",
        name: "Process worker",
        cwd: process.cwd(),
        shell: "custom" as const,
        shellPath: shellPath ?? (() => { throw new Error("Windows shell path argument is required"); })(),
        args: ["-NoLogo", "-NoProfile"]
      }
    : {
        id: "process",
        name: "Process worker",
        cwd: process.cwd(),
        shell: "custom" as const,
        shellPath: "/bin/sh",
        args: ["-i"]
      };

  const config = parseConfig({
    server: { host: "127.0.0.1", port: 7688 },
    auth: { enabled: false },
    workspaces: [workspace]
  });
  config.sessions.exitedRetentionMinutes = 0.01;
  return config;
}

async function main() {
  const runtimeDir = process.argv[2];
  if (!runtimeDir) throw new Error("runtime directory argument is required");

  const manager = new SessionManager(configForProcessWorker(), { runtimeDir });
  await manager.initialize();
  const session = await manager.create("process", 80, 24);
  process.stdout.write(`${JSON.stringify(session)}\n`);
  await manager.close();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
