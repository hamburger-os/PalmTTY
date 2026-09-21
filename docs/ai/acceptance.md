# Acceptance gates

A coding agent should not declare a repository-wide task complete before the relevant gates pass.

## Static/documentation

~~~text
pnpm docs:check
pnpm typecheck
~~~

## Tests

~~~text
pnpm test
~~~

Security, session and reconnect changes should include or update tests for:

- exact Origin rejection
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
- explicit restart waits for terminal exit, retires the previous retained Session, creates a new Session ID with the previous geometry, and does not accept ad-hoc launch overrides
- active/stopping Sessions reject clear/delete, while exited/failed Sessions can be cleared immediately and disappear from the registry
- exit delivery and retention-expiry cleanup
- concurrent maxSessions enforcement
- workspace CRUD requires authentication + exact Origin
- workspace persistence round-trip and duplicate-ID rejection
- workspace deletion blocked while a Session is active, but allowed after exit even during retention
- Host runtime executable/cwd validation, Windows fresh Machine/User environment rebuilding, and workspace-environment override/exclusion behavior
- bounded Host/WSL shell-profile detection with exact-Origin authentication and a manual Custom fallback in the Web editor
- WSL argv construction without shell-string interpolation, workspace variable forwarding through `WSLENV`, and non-Windows rejection
- Web workspace editor activation remains idempotent under repeated/StrictMode-style effect setup and does not depend on runtime capability probing to open
- workspace directory browsing requires authentication + exact Origin, returns directories only, and remains bounded
- workspace environment editing accepts bounded `NAME=value` input, rejects duplicate/reserved names, and persists only through workspace CRUD
- Host directory picker navigation returns absolute selectable paths without exposing files

The Agent suite includes:

- end-to-end Fastify HTTP/WebSocket + Worker IPC coverage with deterministic PTYs;
- a real detached-process integration test where one Agent process creates a Worker and exits, and another Agent later rediscovers the same live terminal;
- Windows CI coverage using real node-pty + PowerShell 7 / ConPTY and Unicode, including PalmTTY's bundled-ConPTY-DLL path used to avoid node-pty's explicit-kill console-list helper; local Windows checks may use Windows PowerShell for generic ConPTY/process coverage;
- workspace-runtime coverage for absolute host-shell resolution, current-user WindowsApps alias preference, executable-as-cwd diagnostics, structured WSL argv, and platform gating;
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

## Host runtime preflight

On a configured PalmTTY host, before `dev`/`start` or release validation:

~~~text
pnpm run preflight
~~~

This requires the intended PalmTTY config and authentication environment. The preflight reports auth/security/server-bind failures. Workspace launch validation is intentionally performed when a workspace is created/updated and again when a Session starts, so a stale project path cannot prevent the Agent control plane from starting. It is not a generic CI/contributor prerequisite. The explicit `run` form is required because pnpm 10 has its own built-in `doctor` command; PalmTTY deliberately names its host check `preflight` to avoid command dispatch ambiguity.

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
- create a Host workspace in the Web UI and confirm Store/MSIX PowerShell resolves through the current-user WindowsApps App Execution Alias where applicable;
- when WSL is installed, create a WSL workspace and confirm distribution/cwd/shell validation succeeds;
- switch the UI between 中文 and English and reload to confirm the preference persists;
- start pwsh through PalmTTY;
- run a Unicode/CJK command;
- start Codex CLI;
- Ctrl+C a foreground command;
- terminate a running Session from the list and confirm it visibly transitions/finishes without a console-window flash on the Windows desktop;
- clear the exited Session and confirm the retained card/history disappears immediately;
- resize the browser;
- close/reopen the browser view without losing PTY;
- restart only the PalmTTY Agent, sign in again and return to the same live Session;
- switch phone network or background/foreground and reconnect;
- verify stale/new browser state recovers via snapshot;
- verify non-loopback unsafe configuration is rejected;
- verify HTTPS reverse-proxy login with Secure Cookie;
- inspect the per-user Worker runtime directory and confirm secret/record files are not exposed through the browser or logs.

## Review evidence

The task summary should identify:

- code areas changed;
- documentation layers changed;
- tests/build run;
- whether Windows and Ubuntu CI passed;
- any acceptance step not executed;
- any newly introduced gap or deferred item.
