import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const layers = ["community", "standards", "owner", "ai"];
const failures = [];

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

const docsIndexPath = path.join(root, "docs", "README.md");
if (!(await exists(docsIndexPath))) {
  failures.push("docs/README.md is missing");
} else {
  const docsIndex = await readFile(docsIndexPath, "utf8");
  for (const layer of layers) {
    if (!docsIndex.includes(`${layer}/README.md`)) {
      failures.push(`docs/README.md does not index ${layer}/README.md`);
    }
  }
}

for (const layer of layers) {
  const dir = path.join(root, "docs", layer);
  const indexPath = path.join(dir, "README.md");
  if (!(await exists(indexPath))) {
    failures.push(`docs/${layer}/README.md is missing`);
    continue;
  }
  const index = await readFile(indexPath, "utf8");
  const entries = (await readdir(dir))
    .filter((name) => name.endsWith(".md") && name !== "README.md");
  for (const entry of entries) {
    if (!index.includes(entry)) {
      failures.push(`docs/${layer}/README.md does not index ${entry}`);
    }
    const content = await readFile(path.join(dir, entry), "utf8");
    if (layer === "owner" && !/[\u3400-\u9fff]/u.test(content)) {
      failures.push(`docs/owner/${entry} should be written in Chinese`);
    }
    if (layer === "community" && !content.includes("<!-- bilingual -->")) {
      failures.push(`docs/community/${entry} is missing the bilingual marker`);
    }
  }
}

const requiredSkills = [
  ["docs-sync", "docs-sync"],
  ["palmtty-theme", "palmtty-theme"],
  ["palmtty-theme-review", "palmtty-theme-review"]
];

for (const [directory, name] of requiredSkills) {
  const skillPath = path.join(root, ".agents", "skills", directory, "SKILL.md");
  if (!(await exists(skillPath))) {
    failures.push(`.agents/skills/${directory}/SKILL.md is missing`);
    continue;
  }

  const skill = await readFile(skillPath, "utf8");
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
  const hasName = frontmatter?.[1]
    .split("\n")
    .some((line) => line.trim() === `name: ${name}`);
  const hasDescription = frontmatter?.[1]
    .split("\n")
    .some((line) => line.trim().startsWith("description:"));

  if (!frontmatter || !hasName || !hasDescription) {
    failures.push(
      `.agents/skills/${directory}/SKILL.md is missing required Agent Skills frontmatter`
    );
  }
}

if (failures.length) {
  console.error("Documentation contract check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Documentation contract check passed.");
