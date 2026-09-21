export type WorkspaceEnvironmentParseErrorCode =
  | "missing_equals"
  | "invalid_name"
  | "duplicate_name"
  | "reserved_name"
  | "unbalanced_quotes"
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

function normalizeEnvironmentValue(
  value: string,
  line: number
): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const startsQuoted = trimmed.startsWith('"') || trimmed.startsWith("'");
  const endsQuoted = trimmed.endsWith('"') || trimmed.endsWith("'");
  if (!startsQuoted && !endsQuoted) return value;

  const quote = trimmed[0];
  if (
    (quote !== '"' && quote !== "'") ||
    trimmed.length < 2 ||
    trimmed[trimmed.length - 1] !== quote
  ) {
    throw new WorkspaceEnvironmentParseError("unbalanced_quotes", line);
  }

  return trimmed.slice(1, -1);
}

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
    const value = normalizeEnvironmentValue(
      rawLine.slice(separator + 1),
      line
    );
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
