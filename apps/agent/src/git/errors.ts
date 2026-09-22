export class GitStateChangedError extends Error {
  constructor(message = "Git repository changed since the page was refreshed") {
    super(message);
    this.name = "GitStateChangedError";
  }
}
