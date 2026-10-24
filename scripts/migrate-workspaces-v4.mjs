import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const args = process.argv.slice(2);
const from = args[args.indexOf("--from") + 1];
const to = args[args.indexOf("--to") + 1];
if (!from || !to || from.startsWith("--") || to.startsWith("--") ||
    path.resolve(from) === path.resolve(to)) throw new Error("Provide separate --from and --to paths");
const input = JSON.parse(await readFile(from, "utf8"));
if (input?.version !== 3 || !Array.isArray(input.workspaces) ||
    input.workspaces.length > 256) throw new Error("Expected Workspace store version 3");
const workspaces = input.workspaces.map(({ id, name, cwd, environment, terminal }) => ({
  id, name, cwd,
  ...(environment === undefined ? {} : { environment }),
  terminal
}));
await writeFile(to, JSON.stringify({ version: 4, workspaces }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log("Converted Workspace store to v4; source retained");
