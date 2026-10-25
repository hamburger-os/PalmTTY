import { randomBytes } from "node:crypto";
import { link, open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { WorkspaceDefinitionSchema } from "../packages/protocol/dist/index.js";

// Offline, one-way migration: reuse the canonical Workspace schema and never
// overwrite either store. The running Agent does not load v3 files.
const args = process.argv.slice(2);
if (args.length !== 4 || args.filter((arg) => arg === "--from").length !== 1 ||
    args.filter((arg) => arg === "--to").length !== 1) {
  throw new Error("Usage: node scripts/migrate-workspaces-v4.mjs --from <v3> --to <v4>");
}
const from = args[args.indexOf("--from") + 1];
const to = args[args.indexOf("--to") + 1];
if (!from || !to || from.startsWith("--") || to.startsWith("--") ||
    path.resolve(from) === path.resolve(to)) {
  throw new Error("Source and destination must be different paths");
}

const input = JSON.parse(await readFile(from, "utf8"));
if (input?.version !== 3 || !Array.isArray(input.workspaces) ||
    input.workspaces.length > 256) {
  throw new Error("Expected bounded Workspace store version 3");
}
const ids = new Set();
const workspaces = input.workspaces.map((entry) => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("Invalid v3 Workspace entry");
  }
  const { id, name, cwd, environment, terminal } = entry;
  // Removed App profiles are deliberately excluded, without a compatibility
  // union in the production schema.
  const workspace = WorkspaceDefinitionSchema.parse({
    id, name, cwd,
    ...(environment === undefined ? {} : { environment }),
    terminal
  });
  if (ids.has(workspace.id)) throw new Error("Duplicate Workspace ID in v3 store");
  ids.add(workspace.id);
  return workspace;
});
// Publish a fully written file atomically. Hard-link creation is exclusive:
// unlike rename(), link() never silently replaces an existing destination.
// Keep the temporary file in the destination directory (same filesystem).
const temporary = path.join(
  path.dirname(to),
  `.${path.basename(to)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`
);
try {
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify({ version: 4, workspaces }, null, 2) + "\n");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await link(temporary, to);
} finally {
  await rm(temporary, { force: true }).catch(() => undefined);
}
console.log("Converted Workspace store to v4; original v3 retained");
