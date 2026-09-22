# Changelog

All notable PalmTTY changes are recorded here.

The project follows a Keep-a-Changelog-style structure and uses Semantic Versioning for tagged releases.

## [Unreleased]

### Added

- Independent detached Session Worker per terminal, with Agent-restart persistence and authenticated local IPC.
- Worker recovery metadata, per-session 256-bit secrets, startup READY handshake, heartbeat/reconnect and orphan-state cleanup.
- Cross-process integration tests proving a Worker survives creator-Agent exit and can be rediscovered with replay intact.
- Persistent Web-managed workspace catalog with authenticated create/edit/delete, separate from operator YAML configuration.
- Host runtime adapter for Windows/Linux/macOS design, plus a structured Windows WSL adapter; Ubuntu CI exercises the Linux host path.
- English and Simplified Chinese Web UI with persisted language preference.
- PalmTTY-owned Spectrum / Obsidian / Frosted visual themes, Quality / Performance rendering modes, reduced-motion handling, semantic liquid-glass surfaces, and matching theme/review Agent Skills.
- Runtime-aware remote directory picker for Host/WSL workspaces, unified terminal profiles that expose known Host shells and registered WSL distributions directly, a Custom advanced fallback, bounded Workspace environment variables, and one-click startup presets for common terminal coding agents.
- Explicit Session lifecycle actions: terminate active Sessions through `stopping → exited`, restart a terminal by replacing its PTY/Session from the latest validated Workspace, retain exited terminal state for review, and clear retained Sessions independently.
- Lightweight Session workbench with Terminal / Git / Files tabs. Terminal transport remains mounted while switching panes; Git now exposes explicit repository scope, porcelain-v2 status, structured diff/history/branches, typed rename-aware stage/unstage, explicit repository-wide stage-all/unstage-all, restore/commit/branch/stash and non-interactive fetch/pull/push with stale/incomplete-state protection, repository-level write serialization and trust acknowledgement; Files remains Workspace-root-scoped read-only browsing/UTF-8 preview.
- Default private-LAN development access: Vite listens on `0.0.0.0:5173`, the root launcher discovers current private/overlay IPv4 addresses, and only those exact development Origins are injected into the development Agent while the Agent itself stays on its configured endpoint.
- Windows development Worker/PTTY spawn-phase tracing that records lifecycle stage names only, so transient console-window flashes can be localized without logging command arguments, environment values, startup input, or terminal I/O.

- Windows-first PowerShell 7 terminal sessions through node-pty / ConPTY.
- Mobile React + xterm.js PWA with touch special-key controls and an on-demand long-text input dialog.
- Server-side headless terminal snapshot plus bounded sequenced replay.
- Single-user bootstrap-token authentication with HttpOnly session cookies.
- Exact Origin checks, non-loopback safety gates, bounded rate-limit/session state and socket backpressure.
- Windows and Ubuntu CI, including deterministic end-to-end HTTP/WebSocket/SessionManager lifecycle coverage and a separate Windows node-pty + PowerShell/ConPTY Unicode smoke test.
- Frozen pnpm lockfile, production dependency vulnerability audit, and automated production dependency license-policy review.
- Four-layer project documentation and docs-sync Agent Skill.
- Apache-2.0 licensing.
- Community governance files, contribution templates and security automation.\n- Guarded manual Release workflow that locks an immutable `main` SHA, re-runs Windows/Ubuntu CI, dependency security/license review and CodeQL, then creates an annotated tag and verified GitHub Release with rollback on failure.\n- Root `package.json` as the single release/runtime version source; private workspace packages no longer carry duplicate version fields and `/api/v1/health` reports that root version.

### Fixed

- Normalize balanced outer single/double quotes in Web Workspace environment values, so proxy entries copied as `HTTP_PROXY="http://127.0.0.1:10808"` reach child processes as `http://127.0.0.1:10808` instead of a URL containing literal quote characters; reject unmatched outer quotes.
- Enumerate WSL distributions with `wsl.exe --list --quiet` for terminal profiles instead of starting a distro and probing its shells, removing the cold-start-dependent first-scan failure mode; hide Docker Desktop and Rancher Desktop utility distributions from the user-facing profile list.
- Keep Host and WSL working-directory drafts separate in the Workspace editor so a Windows path is not silently reused as a WSL cwd.
- Refresh Windows Machine/User environment values for every new/restarted Host terminal so CLIs installed into the user PATH after Agent startup become available without restarting PalmTTY.
- Preserve existing `WSLENV` entries/flags while forwarding Workspace variables with the documented colon-delimited syntax.
- Preflight terminal restart before terminating the current PTY, so an invalid/deleted Workspace does not destroy an otherwise usable Session.
- Refined Web surface ownership: Workspace/confirmation dialogs now use a dedicated readability-first modal material, long Workspace forms keep fixed header/footer actions around one scrolling body, and mobile touch targets use shared sizing tokens.
- Removed the terminal's double-surface visual seam by making the host gutter and xterm canvas share the active theme background, softened the Spectrum terminal field, and isolated locale/theme presentation updates from the terminal transport lifecycle.
- Replaced the workspace browser-native delete confirmation with the shared themed confirmation flow and kept theme changes isolated from xterm/WebSocket recovery state.
- Made terminal recovery geometry-aware: the browser now sends its fitted rows/columns in the resume handshake, the Worker resizes canonical PTY/xterm state before recovery, and geometry changes force a fresh snapshot so refresh/reconnect cannot restore a snapshot into a mismatched viewport.
- Treat the terminal recovery `hello` as a completion boundary, serialize browser xterm writes, freeze fitting while recovery is in flight, and prevent disconnected/recovering input from being silently dropped.
- Removed the duplicate workspace-dialog scrollbar by making the form the single vertical scroll owner.
- Fixed the workspace editor so it opens immediately even while runtime capability detection is still pending; modal activation is idempotent under React StrictMode, and capability probing is reused for the lifetime of the Agent process.
- Increased xterm line height and terminal bottom spacing so the final rendered row is not visually clipped against the mobile controls.
- Added Agent TCP endpoint bind probing to host preflight, with actionable Windows `EACCES/WSAEACCES` diagnostics; the root development launcher now derives and injects Vite's proxy target from the same PalmTTY config, while Vite uses strict port 5173 and stays host-config independent during test/build.
- Removed the manual LAN-development Origin step: `pnpm dev` now generates exact RFC1918/link-local/100.64/10 Origins for the current workstation at startup, leaves production Origin policy unchanged, and prints a Windows Private-network firewall hint when LAN URLs are available.
- Isolated Worker recovery state into `runtime-v4`, matching private Worker IPC protocol generation 4 so new Agents do not rediscover previous-generation Worker state.
- Recognize current-user Windows App Execution Aliases during shell resolution so Store/MSIX-installed PowerShell 7 is not misreported as missing; prefer the user activation alias over protected package PATH entries and report executable paths mistakenly used as workspace `cwd` as not-a-directory configuration errors.
- Renamed the host runtime check from `doctor` to `preflight` so pnpm 10's built-in `pnpm doctor` can no longer bypass PalmTTY startup validation; `pnpm dev` now explicitly runs the project preflight first, and preflight reports all detected host configuration failures together.
- Made generic Windows ConPTY and detached-Worker integration tests portable to hosts without PowerShell 7 while keeping official Windows CI pinned to real PowerShell 7 coverage.
- Replaced the ambiguous red Session × with explicit “Terminate” and “Clear” actions, added a real `stopping` state, and made retained-session deletion immediate instead of waiting for the retention timer.
- Switched PalmTTY's Windows PTY path to node-pty's bundled ConPTY DLL backend so explicit termination avoids node-pty 1.1.0's console-list helper, reducing the observed teardown console-window flash and avoiding that helper's upstream race path.

### Security

- Directory browsing is an authenticated + exact-Origin read-only API that returns directories only, with rate, entry-count, process-output, and timeout bounds.
- Workspace mutation is an explicit authenticated + exact-Origin-protected API; bounded Workspace environment variables are persistent configuration, while Session creation/restart do not accept ad-hoc cwd/shell/env overrides.
- Directory and terminal-profile inspection APIs require authentication + exact Origin and remain bounded; terminal-profile discovery is limited to known Host shells and registered WSL distributions and does not expose arbitrary command execution.
- Workspace Files/Git APIs require authentication + exact Origin and independent read/write/remote rate limits. File paths are canonical Workspace-relative paths with Host/WSL symlink containment and 512 KiB text-preview limits. Git reads disable external diff/textconv/fsmonitor and stay bounded; typed writes require a complete current state token, reject truncated status, serialize by resolved repository, and destructive restore verifies the viewed diff snapshot, hooks/interactive prompts are disabled, repository filters require explicit trust acknowledgement, and helper subprocesses strip the reserved `PALMTTY_*` control namespace, any separately configured login-token variable and askpass entry points.
- LAN development keeps authentication + exact-Origin enforcement: generated development Origins are concrete in-memory values, never wildcards, are accepted only by the development Agent, and do not alter the configured Agent bind address or production startup policy.
- Worker secrets never reach the browser and are excluded from argv/URL/default logs; the `PALMTTY_*` control namespace plus any separately configured login-token variable is reserved from Workspace mutation and stripped before Worker bootstrap/from Worker/PTTY environments.
- Stale Worker records are cleaned without PID-based process killing, avoiding PID-reuse hazards.
- Worker IPC terminal input and frames/backpressure are bounded.
- Session lifecycle mutations have a dedicated rate limit; retained-session retirement is authenticated Worker IPC and is rejected while the Session is active/stopping.

- Application heartbeat detects half-open mobile WebSocket connections.
- Established terminal WebSockets expire with the login session.
- Exited sessions and rate-limiter/login-session state are bounded.

## Release history

No tagged PalmTTY release has been published yet.
