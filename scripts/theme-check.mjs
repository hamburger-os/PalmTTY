import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const webSource = path.join(root, "apps", "web", "src");
const failures = [];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(fullPath));
      continue;
    }
    if (/\.(?:css|ts|tsx)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function report(file, lineNumber, rule, line) {
  failures.push(`${relative(file)}:${lineNumber} [${rule}] ${line.trim()}`);
}

for (const file of await sourceFiles(webSource)) {
  const rel = relative(file);
  const themeOwned = rel === "apps/web/src/theme.css" || rel === "apps/web/src/theme.tsx";
  const cssThemeOwner = rel === "apps/web/src/theme.css";
  const lines = (await readFile(file, "utf8")).replaceAll("\r\n", "\n").split("\n");

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (/window\.(?:alert|confirm|prompt)\s*\(/.test(line)) {
      report(file, lineNumber, "native-dialog", line);
    }
    if (/(^|[;{]\s*)filter:\s*blur\s*\(/.test(line)) {
      report(file, lineNumber, "filter-blur", line);
    }
    if (/mix-blend-mode\s*:/.test(line)) {
      report(file, lineNumber, "mix-blend-mode", line);
    }
    if (/will-change\s*:/.test(line)) {
      report(file, lineNumber, "will-change", line);
    }
    if (/transition\s*:\s*all(?:\s|;|$)/.test(line)) {
      report(file, lineNumber, "transition-all", line);
    }
    if (/backdrop-filter\s*:/.test(line) && !cssThemeOwner) {
      report(file, lineNumber, "backdrop-owner", line);
    }
    if (!themeOwned && /#[0-9a-fA-F]{3,8}\b|rgba?\s*\(/.test(line)) {
      report(file, lineNumber, "hard-coded-color", line);
    }
  });
}

const themeCssPath = path.join(webSource, "theme.css");
const themeTsPath = path.join(webSource, "theme.tsx");
const themeCss = await readFile(themeCssPath, "utf8");
const themeTs = await readFile(themeTsPath, "utf8");
const terminalViewPath = path.join(webSource, "TerminalView.tsx");
const terminalKeyBarPath = path.join(webSource, "TerminalKeyBar.tsx");
const terminalImeInputPath = path.join(webSource, "terminal-ime-input.ts");
const terminalKeyInputPath = path.join(webSource, "terminal-key-input.ts");
const terminalPreferencesPath = path.join(webSource, "terminal-preferences.ts");
const visualViewportPath = path.join(webSource, "visual-viewport.ts");
const viewportDebugPath = path.join(webSource, "ViewportDebug.tsx");
const mainPath = path.join(webSource, "main.tsx");
const indexHtmlPath = path.join(root, "apps", "web", "index.html");
const stylesPath = path.join(webSource, "styles.css");
const sessionWorkbenchPath = path.join(webSource, "SessionWorkbench.tsx");
const workspaceDialogPath = path.join(webSource, "WorkspaceDialog.tsx");
const gitPanePath = path.join(webSource, "GitPane.tsx");
const filesPanePath = path.join(webSource, "FilesPane.tsx");
const terminalView = await readFile(terminalViewPath, "utf8");
const terminalKeyBar = await readFile(terminalKeyBarPath, "utf8");
const terminalImeInput = await readFile(terminalImeInputPath, "utf8");
const terminalKeyInput = await readFile(terminalKeyInputPath, "utf8");
const terminalPreferences = await readFile(terminalPreferencesPath, "utf8");
const visualViewport = await readFile(visualViewportPath, "utf8");
const viewportDebug = await readFile(viewportDebugPath, "utf8");
const mainSource = await readFile(mainPath, "utf8");
const indexHtml = await readFile(indexHtmlPath, "utf8");
const styles = (await readFile(stylesPath, "utf8")).replaceAll("\r\n", "\n");
const sessionWorkbench = await readFile(sessionWorkbenchPath, "utf8");
const workspaceDialog = await readFile(workspaceDialogPath, "utf8");
const gitPane = await readFile(gitPanePath, "utf8");
const filesPane = await readFile(filesPanePath, "utf8");

for (const marker of [
  '<TerminalView',
  'active={pane === "terminal"}',
  'workbench-pane',
  'pane === "git"',
  'pane === "files"',
  'pane === "artifacts"',
  '<ArtifactsPane'
]) {
  if (!sessionWorkbench.includes(marker)) {
    failures.push(`apps/web/src/SessionWorkbench.tsx [workbench-lifecycle-contract] missing ${marker}`);
  }
}

for (const forbidden of [
  'pane === "terminal" && (',
  'pane === "terminal" ? <TerminalView'
]) {
  if (sessionWorkbench.includes(forbidden)) {
    failures.push(`apps/web/src/SessionWorkbench.tsx [workbench-lifecycle-contract] forbidden ${forbidden}`);
  }
}

for (const marker of [
  'className="terminal-frame terminal-surface"',
  'className="terminal-mount"',
  '"--terminal-background"',
  'terminalThemeRef.current',
  'terminal.open(mount)',
  'mount.addEventListener("click", focusTerminal);',
  'mount.removeEventListener("click", focusTerminal);',
  '}, [sessionId]);'
]) {
  if (!terminalView.includes(marker)) {
    failures.push(`apps/web/src/TerminalView.tsx [terminal-surface-contract] missing ${marker}`);
  }
}

for (const marker of [
  "<TerminalKeyBar",
  "new Ime229InputTransaction()",
  "recoverIme229ControlKey(event)",
  "terminal.attachCustomKeyEventHandler",
  "terminal.paste(data)",
  "applicationCursorKeysMode:"
]) {
  if (!terminalView.includes(marker)) {
    failures.push(`apps/web/src/TerminalView.tsx [terminal-keybar-contract] missing ${marker}`);
  }
}

for (const marker of [
  'keyButton("Enter", "enter"',
  'shortcutButton("Ctrl+J"',
  'keyButton("Shift+Tab", "backTab")',
  'shortcutButton("Ctrl+D"',
  'shortcutButton("/", "/")',
  'aria-pressed={ctrl}',
  'aria-pressed={alt}',
  'aria-expanded={moreOpen}'
]) {
  if (!terminalKeyBar.includes(marker)) {
    failures.push(`apps/web/src/TerminalKeyBar.tsx [terminal-keybar-contract] missing ${marker}`);
  }
}

for (const marker of [
  'enter: "\\r"',
  'backTab: `\${ESC}[Z`',
  "APPLICATION_CURSOR_SEQUENCES",
  "modifiedNavigationSequence(",
  "applyTerminalModifiers("
]) {
  if (!terminalKeyInput.includes(marker)) {
    failures.push(`apps/web/src/terminal-key-input.ts [terminal-keybar-contract] missing ${marker}`);
  }
}

for (const marker of [
  "class Ime229InputTransaction",
  "textareaInputDelta(",
  "recoverIme229ControlKey("
]) {
  if (!terminalImeInput.includes(marker)) {
    failures.push(`apps/web/src/terminal-ime-input.ts [terminal-ime-contract] missing ${marker}`);
  }
}

for (const marker of [
  "MIN_TERMINAL_FONT_SIZE",
  "MAX_TERMINAL_FONT_SIZE",
  "readTerminalFontSize(",
  "writeTerminalFontSize("
]) {
  if (!terminalPreferences.includes(marker)) {
    failures.push(`apps/web/src/terminal-preferences.ts [terminal-density-contract] missing ${marker}`);
  }
}

for (const [selector, marker] of [
  [".terminal-frame", "padding: 7px 5px 8px;"],
  [".terminal-mount .xterm-screen", "touch-action: none;"],
  [".workbench-page", "overscroll-behavior: none;"]
]) {
  const start = styles.indexOf(`${selector} {`);
  const end = start === -1 ? -1 : styles.indexOf("\n}", start);
  const block = start === -1 || end === -1 ? "" : styles.slice(start, end + 2);
  if (!block.includes(marker)) {
    failures.push(
      `apps/web/src/styles.css [mobile-terminal-scroll-contract] ${selector} missing ${marker}`
    );
  }
}

for (const forbidden of [
  'terminal-frame glass-content',
  'terminal-touch-scroll',
  'attachTerminalTouchScroll',
  'terminal.scrollLines(',
  'touchstart',
  'touchmove',
  'window.visualViewport',
  '}, [sessionId, t]);'
]) {
  if (terminalView.includes(forbidden)) {
    failures.push(`apps/web/src/TerminalView.tsx [terminal-lifecycle-contract] forbidden ${forbidden}`);
  }
}

for (const marker of [
  'ref={workbenchRef}',
  'window.visualViewport',
  'visualViewport.addEventListener("resize", scheduleVisualViewportSync);',
  'visualViewport.addEventListener("scroll", scheduleVisualViewportSync);',
  'workbenchVisualViewportFrame(visualViewport)'
]) {
  if (!sessionWorkbench.includes(marker)) {
    failures.push(
      `apps/web/src/SessionWorkbench.tsx [mobile-viewport-contract] missing ${marker}`
    );
  }
}

if (
  visualViewport.includes("ZOOM_EPSILON") ||
  visualViewport.includes("Math.abs(scale - 1)") ||
  visualViewport.includes("scale !== 1")
) {
  failures.push(
    "apps/web/src/visual-viewport.ts [mobile-viewport-contract] zoom level must not disable visible-viewport framing"
  );
}

if (!visualViewport.includes("return null;")) {
  failures.push(
    "apps/web/src/visual-viewport.ts [mobile-viewport-contract] invalid geometry must still fail closed"
  );
}

for (const marker of [
  'get("viewportDebug") === "1"',
  'window.visualViewport',
  'document.documentElement.clientWidth',
  'viewport.scale',
  'document.activeElement'
]) {
  if (!viewportDebug.includes(marker)) {
    failures.push(
      `apps/web/src/ViewportDebug.tsx [mobile-viewport-debug] missing ${marker}`
    );
  }
}

if (!mainSource.includes("<ViewportDebug />")) {
  failures.push(
    "apps/web/src/main.tsx [mobile-viewport-debug] viewport diagnostics must stay globally available behind the query flag"
  );
}

if (!indexHtml.includes("interactive-widget=resizes-content")) {
  failures.push(
    "apps/web/index.html [mobile-viewport-contract] viewport meta must opt into resizes-content when supported"
  );
}

const terminalMountStart = styles.indexOf(".terminal-mount {");
const terminalMountEnd = terminalMountStart === -1 ? -1 : styles.indexOf("\n}", terminalMountStart);
const terminalMountBlock = terminalMountStart === -1 || terminalMountEnd === -1
  ? ""
  : styles.slice(terminalMountStart, terminalMountEnd + 2);
for (const forbidden of ["padding:", "border:", "overflow: hidden"]) {
  if (terminalMountBlock.includes(forbidden)) {
    failures.push(
      `apps/web/src/styles.css [terminal-fit-contract] .terminal-mount must stay geometry-only; found ${forbidden}`
    );
  }
}

if (
  !styles.includes(".terminal-mount .xterm-helper-textarea {\n  font-size: 16px;\n}") ||
  !styles.includes("@media (max-width: 760px), (hover: none) and (pointer: coarse) {") ||
  !styles.includes(".appearance-controls.compact .glass-select,\n  .language-select {\n    font-size: 16px;") ||
  !styles.includes(".workbench-page.has-visual-viewport-frame {") ||
  !styles.includes("height: var(--workbench-visual-height);")
) {
  failures.push(
    "apps/web/src/styles.css [mobile-viewport-contract] workbench frame and mobile-safe 16px editable controls must remain explicit"
  );
}

if (
  !styles.includes(".terminal-mount .xterm:not(.allow-transparency) .xterm-viewport,") ||
  !styles.includes("background-color: var(--terminal-background);")
) {
  failures.push(
    "apps/web/src/styles.css [terminal-surface-contract] xterm viewport remainder must inherit --terminal-background"
  );
}

const gitSidebarStart = styles.lastIndexOf("\n.git-sidebar {");
const gitSidebarEnd = gitSidebarStart === -1 ? -1 : styles.indexOf("\n}", gitSidebarStart);
const gitSidebarBlock = gitSidebarStart === -1 || gitSidebarEnd === -1
  ? ""
  : styles.slice(gitSidebarStart, gitSidebarEnd + 2);
for (const marker of [
  "overflow-x: hidden;",
  "overflow-y: auto;",
  "overscroll-behavior-y: contain;"
]) {
  if (!gitSidebarBlock.includes(marker)) {
    failures.push(
      `apps/web/src/styles.css [git-scroll-contract] .git-sidebar missing ${marker}`
    );
  }
}

if (
  styles.includes(".file-list,\n.git-groups,\n.git-change-list {") ||
  !styles.includes(".git-groups,\n.git-change-list {\n  overflow: visible;\n}") ||
  !styles.includes(".git-groups {\n  display: block;\n  flex: 0 0 auto;\n}")
) {
  failures.push(
    "apps/web/src/styles.css [git-scroll-contract] Git groups/change lists must not be nested scroll owners"
  );
}

for (const marker of [
  'type GitView = "changes" | "history"',
  'className="git-view-tabs"',
  'workspaceGitHistory(workspaceId',
  'workspaceGitCommit(workspaceId',
  'workspaceGitCommitDiff(',
  'repositoryFileHistoryPath('
]) {
  if (!gitPane.includes(marker)) {
    failures.push(`apps/web/src/GitPane.tsx [mobile-git-history-contract] missing ${marker}`);
  }
}

for (const marker of [
  'readWorkspaceFileContent(',
  'copySelectedFile',
  'shareSelectedFile',
  'onShowHistory',
  'file-preview-actions'
]) {
  if (!filesPane.includes(marker)) {
    failures.push(`apps/web/src/FilesPane.tsx [mobile-file-export-contract] missing ${marker}`);
  }
}

if (
  !styles.includes(".git-view-tabs {") ||
  !styles.includes(".git-history-list {") ||
  !styles.includes(".file-preview-actions {")
) {
  failures.push(
    "apps/web/src/styles.css [mobile-workbench-contract] Git history and file actions must retain explicit themed mobile layout"
  );
}

for (const marker of [
  'className="workspace-dialog glass-modal"',
  'className="workspace-form-body"',
  'workspace-dialog-footer'
]) {
  if (!workspaceDialog.includes(marker)) {
    failures.push(`apps/web/src/WorkspaceDialog.tsx [workspace-modal-contract] missing ${marker}`);
  }
}

for (const marker of [
  'html[data-theme="spectrum"]',
  'html[data-theme="obsidian"]',
  'html[data-theme="frosted"]',
  'html[data-performance="performance"]',
  '.glass-shell',
  '.glass-modal',
  '.glass-panel',
  '.terminal-surface',
  '.glass-content',
  '.glass-control',
  '.glass-card'
]) {
  if (!themeCss.includes(marker)) {
    failures.push(`apps/web/src/theme.css [required-marker] missing ${marker}`);
  }
}

for (const marker of [
  '"spectrum"',
  '"obsidian"',
  '"frosted"',
  '"quality"',
  '"performance"',
  'palmtty.theme',
  'palmtty.visual-performance'
]) {
  if (!themeTs.includes(marker)) {
    failures.push(`apps/web/src/theme.tsx [required-marker] missing ${marker}`);
  }
}

if (failures.length) {
  console.error("Theme contract check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Theme contract check passed.");
