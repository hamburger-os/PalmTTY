# Acceptance gates

A coding agent should not declare a repository-wide task complete before the relevant gates pass.

## Static/documentation

~~~text
pnpm docs:check
pnpm typecheck
pnpm scripts:check
~~~

## Tests

~~~text
pnpm test
~~~

Security, session and reconnect changes should include or update tests for:

- exact Origin rejection for every exposure profile, including `lan` auto-detected private Origins and generated development-LAN Origins remaining exact rather than wildcarded
- authentication failure
- required WebSocket subprotocol
- resume-before-input/resize ordering
- input/size bounds
- browser disconnect without PTY termination
- reconnect sequence replay
- stale-history snapshot fallback
- reconnect with a changed viewport resizes canonical Worker state before recovery and uses a snapshot instead of replaying bytes produced for the old geometry
- recovery `hello` is emitted only after recovery frames and browser input remains blocked until those frames are rendered
- Agent restart without PTY termination
- Worker rediscovery using authenticated local IPC
- wrong Worker secret rejection
- preservation of potentially-live recovery state when Worker death cannot be proven
- Worker self-healing of missing recovery artifacts and fail-closed handling of conflicting recovery authority
- unadopted Worker creation-lease cleanup, idempotent adoption across controller reconnects, and lost-adoption-result recovery
- detached Worker survival after the creator Agent process exits
- auth-session expiry closing established sockets
- backpressure / slow-client cutoff
- explicit terminate action transitions an active Session through `stopping` to `exited`, repeated terminate is idempotent, and `stopping` still counts as active
- explicit restart reserves replacement capacity, validates/resolves the replacement before terminating the current PTY, then waits for exit, retires the previous retained Session, creates a new Session ID with the previous geometry, and does not accept ad-hoc launch overrides
- active/stopping Sessions reject clear/delete, while exited/failed Sessions can be cleared immediately and disappear from the registry
- exit delivery and retention-expiry cleanup
- concurrent maxSessions enforcement
- workspace CRUD requires authentication + exact Origin
- workspace persistence round-trip and duplicate-ID rejection
- workspace deletion blocked while a Session is active, but allowed after exit even during retention
- Host runtime executable/cwd validation, Windows fresh Machine/User environment rebuilding, workspace-environment override/exclusion behavior, and removal/reservation of PalmTTY control variables before Worker bootstrap
- bounded unified terminal-profile discovery with exact-Origin authentication, known Host-shell detection, WSL distribution enumeration without distro startup, and a manual Custom fallback in the Web editor
- WSL argv construction without shell-string interpolation, preservation of colon-delimited `WSLENV` entries/flags while forwarding workspace variables, and non-Windows rejection
- Web workspace editor activation remains idempotent under repeated/StrictMode-style effect setup and does not depend on runtime capability probing to open
- workspace directory browsing requires authentication + exact Origin, returns directories only, and remains bounded
- workspace environment editing accepts bounded `NAME=value` input, rejects duplicate/reserved/unbalanced-quote input, normalizes balanced outer quotes, and persists only through workspace CRUD
- Host directory picker navigation returns absolute selectable paths without exposing files
- Session workbench tab changes keep the terminal/xterm/WebSocket mounted, do not reset `lastSeq`, and do not emit hidden-pane geometry changes; returning to Terminal performs a safe refit
- workspace file list/read APIs require authentication + exact Origin, use canonical relative paths, reject traversal/symlink escape, cap listings at 512 entries, cap text preview at 512 KiB, and report binary/truncated previews explicitly
- workspace Git APIs require authentication + exact Origin, handle non-repositories without failing the Agent, use porcelain-v2 structured status, make containing-repository scope explicit, bound status/diff/history/branch output, reject path traversal, disable external diff/textconv/fsmonitor execution for reads, and do not inherit the reserved `PALMTTY_*` control namespace or any separately configured PalmTTY auth-token environment key; typed writes must reject stale or incomplete/truncated status, serialize concurrent writes by resolved repository even when multiple Workspaces share it, preserve both old/new paths for rename-aware single-file staging, use explicit repository-wide stage-all/unstage-all operations, destructive restore must verify the loaded diff snapshot and stay unavailable for rename/untracked/conflict entries, hooks/interactive prompts stay disabled, repository filter execution requires explicit Web acknowledgement, and remote operations stay non-interactive
- exposure tests reject removed low-level switches, derive `local`/`lan` bind+Origin behavior, verify `lan` rejects public client source addresses, require explicit HTTPS Origins for `reverseProxy`/`https`, and development Origin parsing remains runtime-only
- autostart tests cover Windows command-line/PowerShell literal quoting, `InteractiveToken`/least-privilege Task Scheduler XML that directly launches the GUI-subsystem host, kill-on-close + silent-breakaway Job Object supervision, Agent exit-code propagation, a real Windows GUI-host smoke proving a detached child survives Agent Job close, PE subsystem validation, locale-independent UTF-8 scheduled-task status including `LastTaskResult`, a real Windows PowerShell status probe in Windows CI, and Linux systemd `KillMode=process`; Agent environment-file tests cover comments/quotes/duplicates, literal no-shell-expansion behavior and environment application

The Agent suite includes:

- end-to-end Fastify HTTP/WebSocket + Worker IPC coverage with deterministic PTYs;
- a real detached-process integration test where one Agent process creates a Worker and exits, and another Agent later rediscovers the same live terminal;
- Windows CI coverage using real node-pty + PowerShell 7 / ConPTY and Unicode, including PalmTTY's bundled-ConPTY-DLL path used to avoid node-pty's explicit-kill console-list helper; local Windows checks may use Windows PowerShell for generic ConPTY/process coverage;
- workspace-runtime coverage for absolute host-shell resolution, current-user WindowsApps alias preference, fresh environment composition/exclusion, executable-as-cwd diagnostics, structured WSL argv, and platform gating;
- workspace-store coverage for versioned persistent CRUD;
- Worker storage coverage asserting the runtime recovery generation stays aligned with the private Worker IPC protocol generation.

## Build

~~~text
pnpm build
~~~

For broad changes:

~~~text
pnpm check
~~~

## Release qualification

A release PR additionally runs:

~~~text
pnpm license:check
pnpm release:check -- X.Y.Z
~~~

The real-device/deployment checks below remain recommended release evidence for behavior that CI cannot observe, but they are not represented by a checkbox and do not block the Release workflow. The Release workflow derives publication authority from protected `main`: it locks the selected `main` SHA, re-runs Windows/Ubuntu `pnpm check`, dependency vulnerability + license policy checks and CodeQL against that exact SHA, rejects existing tags/releases, and aborts if `main` moves before promotion.

## Host runtime preflight

On a configured PalmTTY host, before `dev`/`start` or release validation:

~~~text
pnpm run preflight
~~~

This requires the intended PalmTTY config and authentication environment. For service-style startup, the Agent may also be invoked with `--env-file <path>` so auth values are loaded before config/preflight without placing the secret value in argv. The preflight reports auth/security/server-bind failures. Workspace launch validation is intentionally performed when a workspace is created/updated and again when a Session starts, so a stale project path cannot prevent the Agent control plane from starting. It is not a generic CI/contributor prerequisite. The explicit `run` form is required because pnpm 10 has its own built-in `doctor` command; PalmTTY deliberately names its host check `preflight` to avoid command dispatch ambiguity.

## Web visual validation

For theme or broad Web UI changes, `pnpm lint` includes `pnpm theme:check`; then run the `.agents/skills/palmtty-theme-review/SKILL.md` procedure and manually cover:

- Spectrum / Obsidian / Frosted;
- Quality / Performance;
- system reduced motion;
- login/loading/home/workspace dialog/directory picker/confirmation;
- a long workspace form, confirming header/footer actions remain reachable while only the body owns primary dialog scrolling;
- terminal connected/reconnecting/closed, confirming the host gutter and xterm canvas use one terminal surface;
- portrait and short landscape layouts;
- a live terminal while changing appearance, confirming there is no xterm/WebSocket recreation or recovery reset;
- static theme contract checks confirming locale/presentation state is not a terminal transport-lifecycle dependency.

## Manual Windows validation before a release

- run `pnpm run preflight` with the intended config/token and confirm the Agent TCP endpoint is bindable;
- run `pnpm dev`, confirm Vite reports the workstation's private-LAN URL on port 5173, and open that exact URL from another LAN device while the Agent itself remains on the configured loopback endpoint;
- on Windows, if LAN access times out after Vite reports a LAN URL, confirm the OS firewall permits Node.js/PalmTTY TCP 5173 on the Private network profile rather than weakening PalmTTY Origin checks;
- create a Host workspace in the Web UI and confirm Store/MSIX PowerShell resolves through the current-user WindowsApps App Execution Alias where applicable;
- when WSL is installed, create a WSL workspace and confirm distribution/cwd/shell validation succeeds;
- switch the UI between 中文 and English and reload to confirm the preference persists;
- start pwsh through PalmTTY;
- run a Unicode/CJK command;
- start Codex CLI;
- Ctrl+C a foreground command;
- create/restart and terminate a running Session while watching the development `windows spawn trace`; if a console window still flashes, record whether it occurs between `runtime.resolve.begin`, `runtime.resolve.ready`, `worker.spawn.begin`, `pty.spawn.begin`, `pty.spawn.ready`, `worker.ipc.ready`, and `worker.spawn.ready` rather than claiming the flash is fixed without desktop evidence;
- clear the exited Session and confirm the retained card/history disappears immediately;
- resize the browser;
- close/reopen the browser view without losing PTY;
- restart only the PalmTTY Agent, sign in again and return to the same live Session;
- switch phone network or background/foreground and reconnect;
- verify stale/new browser state recovers via snapshot;
- verify legacy `host` / `trustedOrigins` / `secureCookies` / `unsafeAllowInsecureLan` config is rejected; verify `lan` requires auth, rejects public client source addresses, and derives only private/overlay HTTP Origins; verify `reverseProxy`/`https` accept only explicit HTTPS Origins;
- verify HTTPS reverse-proxy login with Secure Cookie;
- inspect the per-user Worker runtime directory and confirm secret/record files are not exposed through the browser or logs;
- Windows CI must compile the real autostart host as `WindowsApplication`, assert PE subsystem=GUI, execute it against a fixture Agent, verify Agent exit-code propagation and detached Worker breakaway, and run the locale-independent scheduled-task status query. On a real owner host, install autostart, verify `pnpm autostart status` reports `launcher: native-gui`, `lastTaskResult`, and the expected exposure/listen/browser/LAN diagnostics, sign out/in or restart the task, confirm the Agent starts as the same user without elevation and no empty console remains; then verify Agent restart still rediscovers an already-running Worker.

## Manual Linux validation before raising Linux support confidence

- run the source quick-start on a real supported Linux host and create a native Host-shell Workspace;
- create a `0600` autostart env file, install with `pnpm autostart install`, and verify `status` reports enabled + active;
- confirm a group/world-readable env file is rejected by the installer;
- create a live Session, run `pnpm autostart restart`, sign in again and confirm the existing Worker/PTY can be rediscovered rather than being killed by systemd;
- if headless boot startup is desired, enable user lingering explicitly according to host policy and verify the user service starts after reboot; do not claim the pre-reboot PTY survived.

## Review evidence

The task summary should identify:

- code areas changed;
- documentation layers changed;
- tests/build run;
- whether Windows and Ubuntu CI passed;
- any acceptance step not executed;
- any newly introduced gap or deferred item.
