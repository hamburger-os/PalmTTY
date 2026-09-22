import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = process.cwd();
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies"
];

function packageXtermDependencies(packageJson, failures) {
  const entries = new Map();

  for (const sectionName of dependencySections) {
    for (const [name, version] of Object.entries(packageJson[sectionName] ?? {})) {
      if (!name.startsWith("@xterm/")) continue;
      if (entries.has(name)) {
        failures.push(
          `${packageJson.name} declares ${name} in more than one dependency section`
        );
        continue;
      }
      entries.set(name, version);
    }
  }

  return Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));
}

function major(version) {
  const match = /^(\d+)\./.exec(version);
  return match ? Number(match[1]) : undefined;
}

export function validateTerminalStack(stack, { webPackage, agentPackage }) {
  const failures = [];

  if (stack?.schemaVersion !== 1) {
    failures.push("terminal-stack.json must use schemaVersion 1");
  }

  const sections = [
    ["browser", webPackage],
    ["worker", agentPackage]
  ];

  for (const [sectionName, packageJson] of sections) {
    const expected = stack?.[sectionName];
    if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
      failures.push(`terminal-stack.json is missing object section ${sectionName}`);
      continue;
    }

    const actual = packageXtermDependencies(packageJson, failures);
    const expectedNames = Object.keys(expected).sort();
    const actualNames = Object.keys(actual).sort();

    if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
      failures.push(
        `${packageJson.name} @xterm dependency set must exactly match terminal-stack.json ${sectionName}`
      );
    }

    for (const [name, version] of Object.entries(expected)) {
      if (typeof version !== "string" || !exactVersion.test(version)) {
        failures.push(`${sectionName} ${name} must use an exact version, got ${String(version)}`);
        continue;
      }
      if (actual[name] !== version) {
        failures.push(
          `${packageJson.name} ${name} must be pinned to ${version}, got ${actual[name] ?? "missing"}`
        );
      }
    }
  }

  const browserXterm = stack?.browser?.["@xterm/xterm"];
  if (browserXterm === "6.0.0") {
    failures.push(
      "browser @xterm/xterm 6.0.0 is forbidden because upstream touch scroll is broken in that release"
    );
  }

  const workerHeadless = stack?.worker?.["@xterm/headless"];
  if (
    typeof browserXterm === "string" &&
    typeof workerHeadless === "string" &&
    major(browserXterm) !== major(workerHeadless)
  ) {
    failures.push("browser xterm and Worker headless must stay on the same major version");
  }

  return failures;
}

async function main() {
  const [stack, webPackage, agentPackage] = await Promise.all([
    readFile(path.join(root, "terminal-stack.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "apps", "web", "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "apps", "agent", "package.json"), "utf8").then(JSON.parse)
  ]);

  const failures = validateTerminalStack(stack, { webPackage, agentPackage });
  if (failures.length) {
    console.error("Terminal stack contract check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log("Terminal stack contract check passed.");
}

const invokedDirectly =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href ===
    pathToFileURL(fileURLToPath(import.meta.url)).href;

if (invokedDirectly) {
  await main();
}
