# Acceptance gates

A coding agent should not declare a repository-wide task complete before the relevant gates pass.

## External integration acceptance

- No leftover Remote App/RDP endpoints, AppWorker, WebRTC, native capture, ICE configuration or release smoke dependencies.
- V4 Workspaces contain only core and Terminal settings. The optional one-shot v3 converter validates every projected record with the canonical WorkspaceDefinitionSchema, rejects duplicate IDs and malformed records without writing output, and never overwrites an existing v4 file. Integration URLs require HTTPS or loopback HTTP, reject username/password/query/fragment, and are returned only after authentication with no-store.
- VS Code Web and Harness own authentication, sessions and processes; PalmTTY provides only optional independent links. No automatic workspace-folder switching is claimed.
- Preserve all terminal reconnect, Session Worker, Git/Files/Artifacts, speech and mobile presentation tests.
- Phone remote HTTPS, Codex extension behavior and Windows Ctrl+C server shutdown need real-host acceptance.

## Static/documentation

~~~text
pnpm docs:check
pnpm typecheck
pnpm scripts:check
pnpm terminal:check
~~~

## Dependency update and Windows test hygiene

- Dependency PRs must include a lockfile synchronized with their manifests and must rerun frozen-lockfile Windows/Ubuntu CI, Windows/Linux installed distribution smoke, Security Audit and CodeQL after merging current main. Do not infer compatibility from stale green checks. Keep @types/node on major 22 while the runtime/release workflows target Node 22.
- The Windows autostart lifecycle smoke must prove the detached Worker survives the native host and finishes before temp cleanup. Installed-runtime smoke must await Agent stdio close before removing its copy; Windows-only EBUSY/EPERM/ENOTEMPTY after bounded cleanup retries is reported as deferred cleanup, never misclassified as a failed application smoke.

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
- mobile Wi-Fi/cellular handoff: a new socket presenting the same ephemeral per-tab resume identity replaces a half-open owner, while a distinct observer remains read-only; a failed replacement attachment retains a healthy former owner, a viewer takeover emits a new canonical snapshot/hello boundary before input, concurrent lease changes are serialized, Agent-driven ping/pong eventually expires dead owners and the Web visibly explains rejected takeovers
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
- explicit restart reserves replacement capacity, validates/resolves the replacement before terminating the current PTY, waits for exit, creates/authenticates/adopts a new Worker before retiring the previous retained Session, and creates a new Session ID with the previous geometry; injected replacement-startup failure must retain exited history for retry, and concurrent restart must not race with terminate/clear or spawn duplicate PTYs. No ad-hoc launch overrides are accepted
- a transient IPC close for an exited-but-retained Worker must not erase its Session record; initial Agent discovery that fails for a potentially-live Worker must keep retrying while that Agent runs instead of waiting for another restart
- browser must stop reconnecting to a known-retired Session ID (1000 Session removed), surface bounded server restart errors and refresh the Session catalog after a restart outcome
- active/stopping Sessions reject clear/delete, while exited/failed Sessions can be cleared immediately and disappear from the registry
- exit delivery and retention-expiry cleanup
- concurrent maxSessions enforcement
- workspace CRUD requires authentication + exact Origin
- workspace v3 persistence round-trip, v1/v2 rejection and duplicate-ID rejection
- workspace deletion blocked while a Session is active, but allowed after exit even during retention
- Host runtime executable/cwd validation, Windows fresh Machine/User environment rebuilding, workspace-environment override/exclusion behavior, and removal/reservation of PalmTTY control variables before Worker bootstrap
- bounded unified terminal-profile discovery with exact-Origin authentication, known Host-shell detection, WSL distribution enumeration without distro startup, and a manual Custom fallback in the Web editor
- WSL argv construction without shell-string interpolation, preservation of colon-delimited `WSLENV` entries/flags while forwarding workspace variables, and non-Windows rejection
- Web workspace editor activation remains idempotent under repeated/StrictMode-style effect setup and does not depend on runtime capability probing to open
- workspace directory browsing requires authentication + exact Origin, returns directories only, and remains bounded
- workspace environment editing accepts bounded `NAME=value` input, rejects duplicate/reserved/unbalanced-quote input, normalizes balanced outer quotes, and persists only through workspace CRUD
- Host directory picker navigation returns absolute selectable paths without exposing files
- Session workbench tab changes (Terminal/Git/Files/Artifacts) keep the terminal/xterm/WebSocket mounted, do not reset `lastSeq`, and do not emit hidden-pane geometry changes; returning to Terminal performs a safe refit. Artifact path insertion must write text only, never synthesize Enter or execute a command


- xterm mobile Pi/TUI scrolling: Browse permits only validated SGR wheel reports while rejecting clicks/moves/drags; Interact forwards validated SGR mouse input; both reject malformed/NaN reports, X10/onBinary and unsupported protocols. Confirm input is rejected when mouseTrackingMode is none, normal text/IME/keyboard data still passes, and xterm alone owns touch gestures (no app-level touchmove/scrollLines shim). Test iOS Safari/Android Chrome: initial Pi fullscreen swipe, alternate-screen history, background >1.5 s, repeated swipes after return, and subsequent AI output without renegotiation. Real-device behavior cannot be certified by CI.
- terminal input transport: valid SGR mouse reports bypass Ctrl/Alt rewriting and keyCode-229 IME transaction; 8-bit legacy/onBinary reports remain unsupported rather than corrupting Unicode. Preserve scalar-safe <=12 KiB input frames, bounded 8 MiB queue, ordered paste markers/content/Enter, and unsent-input cancellation on reconnect. The Worker headless parser must track only xterm-supported DECSET/DECRST mouse encodings 1006/1016 (not unsupported urxvt 1015), including chunk-split CSI and RIS, and append the current encoding to the existing <=4 MiB canonical snapshot so a new alternate-screen renderer retains SGR after further ordinary output. Coverage must not depend on CLI vendors or duplicate terminal transcript buffers.
- terminal stack policy rejects ranged/drifted `@xterm/*` dependencies and the known browser `@xterm/xterm 6.0.0` touch-scroll regression; frozen-lock installation must resolve the exact browser/Worker set from `terminal-stack.json`; theme/static checks require a decorative `terminal-frame` around a padding-free `terminal-mount`, xterm opened directly into that mount, screen-local `touch-action: none`, mobile/coarse-pointer editable controls at 16px or larger, WorkspaceWorkbench-only VisualViewport ownership that stays active at non-1 scale, opt-in viewport diagnostics, and no PalmTTY touch listener or `terminal.scrollLines` gesture shim; the mobile input contract additionally requires the isolated keyCode-229 transaction to deduplicate textarea/xterm delivery and cancel on genuine composition, keydown-only physical Ctrl+letter/Ctrl+Space/Escape recovery, a shared terminal-key encoder with first-class Enter/Ctrl+J/Shift+Tab/Ctrl+D and literal `/` fallback, accessible Ctrl/Alt state, application-cursor-mode-aware arrows, expandable symbol/navigation keys, explicit bracketed-paste-preserving paste versus paste+Enter actions, browser-local font-size bounds/refit, and unit coverage for IME deltas/control recovery plus normal/application/modified key sequences
- workspace file list/read/export APIs require authentication + exact Origin, use canonical relative paths, reject traversal/symlink escape, cap listings at 512 entries, cap text preview at 512 KiB, and report binary/truncated previews explicitly; complete-file export must be a separate read-only path capped at 8 MiB, reuse the same Host/WSL containment plus stable length-checked reads, return private no-store/no-sniff bytes, and prove that a truncated preview still exports the exact complete file; the Web copy/share/download path must not silently substitute preview bytes for complete content; the image-preview endpoint must reuse the same Host/WSL containment, accept only server-validated PNG/JPEG/WebP/GIF bytes, enforce dimension/pixel bounds, return no-sniff image responses, and stay bounded
- Session artifact APIs require authentication + exact Origin, reject inactive upload targets, validate bytes rather than trusting filename/Content-Type, enforce per-file/count/aggregate/dimension/pixel bounds, keep random private storage outside the Workspace, expose a runtime-appropriate Host/WSL local path from immutable Session launch-runtime metadata, use stable bounded file-handle reads, survive Agent restart only while the Session recovery record is live, and clean up on clear/restart/retention expiry/startup orphan reconciliation
- workspace Git APIs require authentication + exact Origin, handle non-repositories without failing the Agent, use porcelain-v2 structured status, make containing-repository scope explicit, bound status/diff/branch/history/commit-detail/commit-diff output, reject path traversal, disable external diff/textconv/fsmonitor execution for reads, and do not inherit the reserved `PALMTTY_*` control namespace or any separately configured PalmTTY auth-token environment key; history tests must prove first-page HEAD snapshot freezing, opaque bounded cursor continuation after the branch advances, optional file-scoped `--follow` history, nested-Workspace path translation, commit changed-file inspection and textual per-commit file diff, including deterministic first-parent changed-file/diff semantics for merge commits; History is read-only and must remain usable without the Web write-trust acknowledgement; typed writes must reject stale or incomplete/truncated status, serialize concurrent writes by resolved repository even when multiple Workspaces share it, preserve both old/new paths for rename-aware single-file staging, use explicit repository-wide stage-all/unstage-all operations, destructive restore must verify the loaded diff snapshot and stay unavailable for rename/untracked/conflict entries, hooks/interactive prompts stay disabled, repository filter execution requires explicit Web acknowledgement, and remote operations stay non-interactive
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

## Distribution qualification

A publishable release additionally requires native Windows x64 and Linux x64 package jobs from the same locked source SHA. Each job must:

- build the monorepo from the frozen lockfile;
- create a self-contained runtime with bundled Node, production-only deployed Agent dependencies, compiled Web assets and `release-manifest.json`;
- ensure workspace `src` trees are not copied into the production deployment;
- copy the runtime into an unrelated temporary directory and use the bundled Node runtime to verify installed CLI version, Agent preflight, `/api/v1/health`, and compiled Web serving;
- build Windows installer + portable zip or Linux deb + portable tar as appropriate;
- emit a platform CycloneDX SBOM.

The publish job must accept only the exact expected asset set, generate `SHA256SUMS`, create GitHub build-provenance attestations, upload all assets while the Release is still draft, compare each remote asset size with the local file, and only then promote the Release. Missing, extra, empty, or size-mismatched assets fail the release and keep the existing rollback semantics.

## Release qualification

A release PR additionally runs:

~~~text
pnpm license:check
pnpm release:check -- X.Y.Z
~~~

The real-device/deployment checks below remain recommended release evidence for behavior that CI cannot observe, but they are not represented by a checkbox and do not block the Release workflow. The Release workflow derives publication authority from protected `main`: it locks the selected `main` SHA, re-runs Windows/Ubuntu `pnpm check`, dependency vulnerability + license policy checks and CodeQL, requires native Windows/Linux package + detached installed-runtime smoke against that same SHA, rejects existing tags/releases, and aborts if `main` moves before promotion.

## Host runtime preflight

On a configured PalmTTY host, before `dev`/`start` or release validation:

~~~text
pnpm run preflight
~~~

This requires the intended PalmTTY config and authentication environment. For service-style startup, the Agent may also be invoked with `--env-file <path>` so auth values are loaded before config/preflight without placing the secret value in argv. The preflight reports auth/security/server-bind failures. Workspace launch validation is intentionally performed when a workspace is created/updated and again when a Session starts, so a stale project path cannot prevent the Agent control plane from starting. It is not a generic CI/contributor prerequisite. The explicit `run` form is required because pnpm 10 has its own built-in `doctor` command; PalmTTY deliberately names its host check `preflight` to avoid command dispatch ambiguity.

### Complete Markdown acceptance (2026-10-17)

- Verify table-cell br/br-slash, HTML comments hidden, sup/sub/u/mark/kbd/small/details/summary rendered without attributes, and script/iframe/img/onerror/URL payloads never interpreted as author HTML.
- Verify GFM footnotes and alerts, duplicate heading anchor navigation, same-file and Workspace-confined cross-file fragments, local images via the validated image endpoint, no external fetches, and object URL cleanup after switching files.
- Verify highlighter and unrecognized language fallback, inline/block KaTeX math from bundled fonts, Mermaid valid diagram/injected directive/error paths with lazy import and scriptless iframe CSP; confirm source remains visible on failure.
- Check all themes and reduced-motion modes on desktop/iOS Safari/Android Chrome, one Markdown vertical scroll owner, independent bounded table/math horizontal scroll, no terminal/Session remount, and existing copy/share/reader/history workflows.

## Web visual validation

For theme or broad Web UI changes, `pnpm lint` includes `pnpm theme:check`; then run the `.agents/skills/palmtty-theme-review/SKILL.md` procedure and manually cover:

- Spectrum / Obsidian / Frosted;
- Quality / Performance;
- system reduced motion;
- login/loading/home/workspace dialog/directory picker/confirmation;
- a long workspace form, confirming header/footer actions remain reachable while only the body owns primary dialog scrolling;
- terminal connected/reconnecting/closed, confirming the outer frame gutter and xterm canvas use one terminal surface while the nested FitAddon mount remains geometry-only;
- scrollbar/fit regression: the browser terminal must use a 4 CSS px `scrollbar.width` on coarse-pointer devices and 8 CSS px with a precise pointer; do not reintroduce `scrollbar-gutter: stable` or put padding/border on the FitAddon mount. On real iPhone Safari and Android Chrome verify the right gutter is visually compact, no terminal column or last row is clipped, swipes and inertial scrolling remain xterm-owned, alternate-screen mouse tracking still works, and keyboard/rotation/refit do not restart a Session. Pure policy tests and CI do not certify real-device behavior.
- on mobile Safari/Chrome (real device preferred), generate more than one viewport of normal-buffer output, swipe in both directions across the terminal content and confirm xterm-owned movement is continuous and retains natural release inertia while the page remains fixed; return to the live bottom and verify the final text row is fully visible with no lower-half clipping; separately drag the xterm scrollbar thumb in both directions; let new output arrive while scrolled back and confirm it does not force the viewport to the bottom; verify all editable controls compute to at least 16px; verify tap-to-focus/explicit keyboard control opens the soft keyboard, the header/terminal/key bar all remain inside the visible area above it, typed input is visible, keyboard dismissal restores the workbench, initial page load is correctly sized, and pinch zoom remains available; while still pinch-zoomed, reopen/focus the keyboard and confirm viewport framing remains active instead of falling back to 100dvh; use `?viewportDebug=1` to record inner/client/visual viewport size, offsets, scale, DPR and focus if behavior differs; enter an alternate-buffer or mouse-tracking TUI and confirm xterm keeps its mode-aware touch semantics; rotate the device and trigger browser/soft-keyboard viewport changes, confirming mount-driven refit does not reconnect the Session or emit redundant geometry when rows/cols are unchanged; verify Enter submits an interactive prompt, Ctrl then an arrow emits the modified navigation action, Ctrl/Alt armed states clear after a successful action and after disconnect, Shift+Tab/Ctrl+J/Ctrl+D work from the core row, and opening the secondary key row keeps PgUp/PgDn/Home/End/editing shortcuts reachable without causing page-level vertical scrolling;
- on mobile Files, verify `.md`/`.markdown` defaults to rendered GFM (headings, lists, tables, fenced code, task items) with a source toggle and a single vertical preview scroll owner; wide 5–8-column tables must keep Chinese and Latin words readable at meaningful column widths, scroll horizontally inside a bounded table-only viewport with an overflow-only swipe hint and keyboard arrow scrolling, and preserve natural wrapping of long paragraphs/URLs. Short 1–2-column tables should fit without an unnecessary horizontal hint. Test portrait/short landscape, the three themes and both performance modes, browser zoom/rotation, sideways gestures that do not drag the page and vertical swipes over a table that still scroll the article; internal relative links open workspace files without path escape, external links use a new noopener/noreferrer tab, Markdown HTML/event handlers/javascript/data URL probes cannot execute, and remote Markdown images cause no network requests. Confirm the 512 KiB truncation warning, full-file copy/share/read-aloud, theme contrast and terminal connection stability across switches;
- on mobile Files, open a deeply nested text file and confirm the toolbar prioritizes the basename, exposes the parent path secondarily, copies the complete text, uses the system file Share sheet when available and downloads otherwise; repeat with a text file larger than 512 KiB and confirm preview truncation is disclosed while Copy still returns the complete file; use “History” and confirm it opens Git file history even when the Workspace cwd is a subdirectory of a larger repository;
- on mobile Git, confirm “更改 / 历史” remains reachable with a clean worktree, History paginates without requiring write enablement, commit selection shows metadata + changed files, file selection shows that commit diff, and back navigation remains reachable on both narrow and wide layouts;
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

## Terminal control and novel reader regressions (October 2026)

- A brief socket interruption preserves the xterm renderer and seq for bounded replay; extended mobile suspension or renderer overload requests a canonical snapshot without restarting the Worker/PTY.
- E2E: two authenticated WebSocket connections have exactly one input/resize owner. The observer receives canonical dimensions and can take control after owner disconnect; unauthorized input and resize do not reach PTY.
- Unit: replay history honors independent frame/byte limits; IPC receives fragmented and coalesced frames without quadratic reallocation; snapshots decrease scrollback within a 4 MiB size budget.
- Unit: reader chapter extraction stays bounded at 256 headings; local progress validation rejects stale/invalid data, never persisting plaintext paths or prose.
- Real-device iOS/Android background, high-output and geometry transitions remain acceptance gaps; CI alone cannot close them.

- Burst-output flow control: inject >512 KiB before headless can drain; verify node-pty pause() is triggered, buffered output is parsed in order, resume() follows below 128 KiB, and output congestion never terminates PTY.

- Workspace Files must deny symlink paths escaping the workspace for both preview and whole-file export. Host file handles are checked post-open; WSL read scripts use the same validated file descriptor for stat and content. Race-sensitive directory enumeration and non-Linux paths still need platform-targeted adversarial tests.

## Browser/Agent versus independent Worker rolling upgrade

- Existing v3-hello Workers must reconnect through authenticated Worker IPC v5 and deliver the current v4 browser hello; never terminate a running PTY merely due to a browser/Agent deployment.
- Worker deliver-schema unit regression accepts exactly retained v3 hello and current v4 hello, converts only legacy hello, rejects unknown versions/malformed messages; browser wire v4 schema still rejects v3.
- A v4 browser connecting to an old Agent that closes WS 1002 must show a version-specific error and stop retrying; operators restart Agent and hard-refresh the PWA. Network 1012/1013 interruptions still use bounded backoff.

## Optional speech reader acceptance (2026-10-20)

- Web voices: display Chinese languages only (zh, zh-Hans/Hant, cmn, yue and supported regional varieties), exclude English/Japanese even when their names contain Chinese, reject stale saved non-Chinese preferences, and show a clear no-Chinese-voice state. Keep local/remote/unknown privacy labels, local-Chinese-only default, explicit consent and revoke for remote/unknown, dynamic voiceschanged, preview privacy, error/cancel races, pause/resume and segment UTF-16 positions.
- Reader: paragraph/chapter navigation, full-text signature invalidation, 20,000 paragraph/120 visible row bounds, 8 MiB complete-file cap, no text storage/logging, shared playback state across browser/Qwen and cancellation on file switch.
- Qwen: configuration strict validation, disabled-by-default behavior, status authentication, POST authenticated exact Origin, token absent, invalid and oversized text, speaker/style allowlist, fixed 127.0.0.1 upstream, 8 MiB audio cap and WAV header validation, model unavailable/timeout, single inflight inference and cache bounds; fake service tests cannot prove actual Qwen output quality or GPU load.
- Deployment: packaged optional Python sidecar script, no model bundled, pinned operator-downloaded model, private PALMTTY_QWEN_TOKEN env, ordinary Windows/Linux Agent packaging unchanged; native iOS Safari/Android Chrome voice availability, media activation, lock screen and background playback require real-device checks.
