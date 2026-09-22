import type { GitChange } from "@palmtty/protocol";

export function gitMutationPaths(entry: GitChange): string[] {
  return entry.originalPath
    ? [entry.originalPath, entry.path]
    : [entry.path];
}

export function canRestoreWorkingTreeChange(
  entry: GitChange | undefined
): boolean {
  return Boolean(
    entry &&
    !entry.untracked &&
    !entry.conflict &&
    !entry.originalPath
  );
}
