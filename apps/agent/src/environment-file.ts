import { readFile } from "node:fs/promises";

const ENVIRONMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

export function parseEnvironmentFile(source: string): Map<string, string> {
  const entries = new Map<string, string>();
  const lines = source.replace(/^\uFEFF/u, "").split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = rawLine.indexOf("=");
    if (separator < 1) {
      throw new Error(`Invalid environment file entry on line ${index + 1}: expected NAME=value`);
    }

    const name = rawLine.slice(0, separator).trim();
    if (!ENVIRONMENT_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid environment variable name on line ${index + 1}: ${name}`);
    }
    if (entries.has(name)) {
      throw new Error(`Duplicate environment variable on line ${index + 1}: ${name}`);
    }

    let value = rawLine.slice(separator + 1).trim();
    const startsSingle = value.startsWith("'");
    const endsSingle = value.endsWith("'");
    const startsDouble = value.startsWith('"');
    const endsDouble = value.endsWith('"');
    if (startsSingle || endsSingle || startsDouble || endsDouble) {
      const singleQuoted = startsSingle && endsSingle && value.length >= 2;
      const doubleQuoted = startsDouble && endsDouble && value.length >= 2;
      if (!singleQuoted && !doubleQuoted) {
        throw new Error(`Unbalanced environment value quotes on line ${index + 1}`);
      }
      value = value.slice(1, -1);
    }
    if (value.includes("\0") || /[\r\n]/u.test(value)) {
      throw new Error(`Environment value on line ${index + 1} contains an unsupported control character`);
    }
    entries.set(name, value);
  }

  return entries;
}

export function applyEnvironmentFileEntries(
  entries: ReadonlyMap<string, string>,
  environment: NodeJS.ProcessEnv = process.env
): void {
  for (const [name, value] of entries) {
    environment[name] = value;
  }
}

export async function loadEnvironmentFile(
  filePath: string,
  environment: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const source = await readFile(filePath, "utf8");
  applyEnvironmentFileEntries(parseEnvironmentFile(source), environment);
}
