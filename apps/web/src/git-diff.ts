export type DiffLineKind =
  | "meta"
  | "hunk"
  | "add"
  | "delete"
  | "context";

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
  oldLine?: number;
  newLine?: number;
};

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseUnifiedDiff(source: string): DiffLine[] {
  if (!source) return [];

  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const result: DiffLine[] = [];
  let oldLine: number | undefined;
  let newLine: number | undefined;

  for (const text of lines) {
    const hunk = HUNK_HEADER.exec(text);
    if (hunk) {
      oldLine = Number.parseInt(hunk[1] ?? "0", 10);
      newLine = Number.parseInt(hunk[2] ?? "0", 10);
      result.push({ kind: "hunk", text });
      continue;
    }

    if (oldLine === undefined || newLine === undefined) {
      result.push({ kind: "meta", text });
      continue;
    }

    if (text.startsWith("+") && !text.startsWith("+++")) {
      result.push({ kind: "add", text, newLine });
      newLine += 1;
    } else if (text.startsWith("-") && !text.startsWith("---")) {
      result.push({ kind: "delete", text, oldLine });
      oldLine += 1;
    } else if (text.startsWith(" ")) {
      result.push({ kind: "context", text, oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    } else {
      result.push({ kind: "meta", text });
    }
  }

  return result;
}
