export type WorkspaceEnvironmentParseErrorCode =
  | "missing_equals"
  | "invalid_name"
  | "duplicate_name"
  | "reserved_name"
  | "too_many"
  | "value_too_long";

export class WorkspaceEnvironmentParseError extends Error {
  constructor(
    readonly code: WorkspaceEnvironmentParseErrorCode,
    readonly line: number
  ) {
    super(code);
    this.name = "WorkspaceEnvironmentParseError";
  }
}

const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function formatWorkspaceEnvironment(
  environment: Record<string, string> | undefined
): string {
  if (!environment) return "";
  return Object.entries(environment)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n");
}

export function parseWorkspaceEnvironment(
  source: string
): Record<string, string> {
  const environment: Record<string, string> = {};
  const names = new Set<string>();
  let count = 0;

  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    if (!rawLine.trim()) continue;
    const line = index + 1;
    const separator = rawLine.indexOf("=");
    if (separator <= 0) {
      throw new WorkspaceEnvironmentParseError("missing_equals", line);
    }

    const name = rawLine.slice(0, separator).trim();
    const value = rawLine.slice(separator + 1);
    if (!ENVIRONMENT_NAME.test(name)) {
      throw new WorkspaceEnvironmentParseError("invalid_name", line);
    }
    if (name.toLowerCase() === "term") {
      throw new WorkspaceEnvironmentParseError("reserved_name", line);
    }
    if (value.length > 8192) {
      throw new WorkspaceEnvironmentParseError("value_too_long", line);
    }

    const canonical = name.toLowerCase();
    if (names.has(canonical)) {
      throw new WorkspaceEnvironmentParseError("duplicate_name", line);
    }
    names.add(canonical);

    count += 1;
    if (count > 64) {
      throw new WorkspaceEnvironmentParseError("too_many", line);
    }
    environment[name] = value;
  }

  return environment;
}
