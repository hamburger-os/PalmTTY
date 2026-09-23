import { spawn, spawnSync } from "node:child_process";
import {
  chmod,
  cp,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to allocate test port");
  }
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status}: ${(result.stderr || result.stdout).trim()}`
    );
  }
  return result;
}

async function waitForHealth(url, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged Agent exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${url}/api/v1/health`);
      if (response.ok) return response.json();
    } catch {
      // Startup race.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Timed out waiting for packaged Agent health endpoint");
}

async function main() {
  const rootArg = option(process.argv.slice(2), "--root");
  if (!rootArg) {
    throw new Error("Usage: node scripts/package-smoke.mjs --root <runtime-root>");
  }

  const sourceRoot = path.resolve(rootArg);
  const temp = await mkdtemp(path.join(os.tmpdir(), "palmtty-installed-smoke-"));
  const root = path.join(temp, "PalmTTY");
  let child;
  let stderr = "";
  try {
    // Execute from a detached temporary directory so no source-repository
    // relative path can accidentally satisfy runtime lookups.
    await cp(sourceRoot, root, { recursive: true });
    const node = path.join(
      root,
      "runtime",
      process.platform === "win32" ? "node.exe" : "node"
    );
    const cli = path.join(root, "tools", "installed-cli.mjs");
    const agent = path.join(root, "app", "dist", "index.js");
    if (process.platform !== "win32") {
      await chmod(node, 0o755);
      await chmod(path.join(root, "bin", "palmtty"), 0o755);
    }

    const manifest = JSON.parse(
      await readFile(path.join(root, "release-manifest.json"), "utf8")
    );
    const env = { ...process.env };
    delete env.PALMTTY_INSTALL_ROOT;
    const version = run(node, [cli, "version"], { cwd: root, env }).stdout.trim();
    if (version !== manifest.version) {
      throw new Error(
        `Installed CLI reported version ${version}, expected ${manifest.version}`
      );
    }

    const port = await freePort();
    const configPath = path.join(temp, "config.yaml");
    const envPath = path.join(temp, "credentials.env");
    await writeFile(
      configPath,
      `server:
  port: ${port}
  exposure:
    mode: local
auth:
  enabled: true
  tokenEnv: PALMTTY_ACCESS_TOKEN
  maxLoginSessions: 4
  sessionTtlMinutes: 60
sessions:
  maxSessions: 2
  exitedRetentionMinutes: 1
  scrollbackLines: 1000
  replayBytes: 262144
  maxSocketBufferedBytes: 262144
`,
      "utf8"
    );
    await writeFile(
      envPath,
      "PALMTTY_ACCESS_TOKEN=package-smoke-token-1234567890\n",
      { encoding: "utf8", mode: 0o600 }
    );
    if (process.platform !== "win32") await chmod(envPath, 0o600);

    run(
      node,
      [agent, "--config", configPath, "--env-file", envPath, "--preflight"],
      { cwd: root, env }
    );

    child = spawn(
      node,
      [agent, "--config", configPath, "--env-file", envPath],
      {
        cwd: root,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      }
    );
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 8192) stderr += chunk;
    });

    const url = `http://127.0.0.1:${port}`;
    const health = await waitForHealth(url, child);
    if (
      health?.status !== "ok" ||
      health?.version !== manifest.version ||
      health?.platform !== process.platform
    ) {
      throw new Error(
        `Packaged Agent health mismatch: ${JSON.stringify(health)}`
      );
    }
    const web = await fetch(`${url}/`);
    if (!web.ok || !(await web.text()).includes("<!doctype html>")) {
      throw new Error("Packaged Agent did not serve the compiled Web UI");
    }

    console.log(
      `[PalmTTY] installed-runtime smoke passed: ${manifest.version} ${manifest.platform}-${manifest.arch}`
    );
  } catch (error) {
    if (child && child.exitCode !== null) {
      throw new Error(
        `${error instanceof Error ? error.message : error}; packaged Agent stderr: ${stderr ?? ""}`
      );
    }
    throw error;
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(
    `[PalmTTY] package smoke failed: ${error instanceof Error ? error.message : error}`
  );
  process.exitCode = 1;
});
