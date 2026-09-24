export function repositoryFileHistoryPath(
  workspaceRepositoryPath: string,
  workspaceFilePath: string
): string {
  return workspaceRepositoryPath
    ? `${workspaceRepositoryPath}/${workspaceFilePath}`
    : workspaceFilePath;
}
