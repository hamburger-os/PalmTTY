# Changelog

All notable PalmTTY changes are recorded here.

The project follows a Keep-a-Changelog-style structure and intends to use Semantic Versioning once tagged releases begin.

## [Unreleased]

### Added

- Independent detached Session Worker per terminal, with Agent-restart persistence and authenticated local IPC.
- Worker recovery metadata, per-session 256-bit secrets, startup READY handshake, heartbeat/reconnect and orphan-state cleanup.
- Cross-process integration tests proving a Worker survives creator-Agent exit and can be rediscovered with replay intact.
- Persistent Web-managed workspace catalog with authenticated create/edit/delete, separate from operator YAML configuration.
- Host runtime adapter for Windows/Linux/macOS design, plus a structured Windows WSL adapter; Ubuntu CI exercises the Linux host path.
- English and Simplified Chinese Web UI with persisted language preference.
- PalmTTY-owned Spectrum / Obsidian / Frosted visual themes, Quality / Performance rendering modes, reduced-motion handling, semantic liquid-glass surfaces, and matching theme/review Agent Skills.
- Runtime-aware remote directory picker for Host/WSL workspaces, plus shell-argument examples and one-click startup presets for common terminal coding agents.
- Explicit Session lifecycle actions: terminate active Sessions through `stopping → exited`, retain exited terminal state for review, and clear retained Sessions independently.

- Windows-first PowerShell 7 terminal sessions through node-pty / ConPTY.
- Mobile React + xterm.js PWA with special-key controls and multiline composer.
- Server-side headless terminal snapshot plus bounded sequenced replay.
- Single-user bootstrap-token authentication with HttpOnly session cookies.
- Exact Origin checks, non-loopback safety gates, bounded rate-limit/session state and socket backpressure.
- Windows and Ubuntu CI, including deterministic end-to-end HTTP/WebSocket/SessionManager lifecycle coverage and a separate Windows node-pty + PowerShell/ConPTY Unicode smoke test.
- Frozen pnpm lockfile and production dependency-license audit.
- Four-layer project documentation and docs-sync Agent Skill.
- Apache-2.0 licensing.
- Community governance files, contribution templates and security automation.

### Fixed

- Refined Web surface ownership: Workspace/confirmation dialogs now use a dedicated readability-first modal material, long Workspace forms keep fixed header/footer actions around one scrolling body, and mobile touch targets use shared sizing tokens.
- Removed the terminal's double-surface visual seam by making the host gutter and xterm canvas share the active theme background, softened the Spectrum terminal field, and isolated locale/theme presentation updates from the terminal transport lifecycle.
- Replaced the workspace browser-native delete confirmation with the shared themed confirmation flow and kept theme changes isolated from xterm/WebSocket recovery state.
- Made terminal recovery geometry-aware: the browser now sends its fitted rows/columns in the resume handshake, the Worker resizes canonical PTY/xterm state before recovery, and geometry changes force a fresh snapshot so refresh/reconnect cannot restore a snapshot into a mismatched viewport.
- Treat the terminal recovery `hello` as a completion boundary, serialize browser xterm writes, freeze fitting while recovery is in flight, and prevent disconnected/recovering input from being silently dropped.
- Removed the duplicate workspace-dialog scrollbar by making the form the single vertical scroll owner.
- Fixed the workspace editor so it opens immediately even while runtime capability detection is still pending; modal activation is idempotent under React StrictMode, and capability probing is reused for the lifetime of the Agent process.
- Increased xterm line height and terminal bottom spacing so the final rendered row is not visually clipped against the mobile controls.
- Added Agent TCP endpoint bind probing to host preflight, with actionable Windows `EACCES/WSAEACCES` diagnostics; the root development launcher now derives and injects Vite's proxy target from the same PalmTTY config, while Vite uses strict port 5173 and stays host-config independent during test/build.
- Isolated Worker recovery state into `runtime-v4`, matching private Worker IPC protocol generation 4 so new Agents do not rediscover previous-generation Worker state.
- Recognize current-user Windows App Execution Aliases during shell resolution so Store/MSIX-installed PowerShell 7 is not misreported as missing; prefer the user activation alias over protected package PATH entries and report executable paths mistakenly used as workspace `cwd` as not-a-directory configuration errors.
- Renamed the host runtime check from `doctor` to `preflight` so pnpm 10's built-in `pnpm doctor` can no longer bypass PalmTTY startup validation; `pnpm dev` now explicitly runs the project preflight first, and preflight reports all detected host configuration failures together.
- Made generic Windows ConPTY and detached-Worker integration tests portable to hosts without PowerShell 7 while keeping official Windows CI pinned to real PowerShell 7 coverage.
- Replaced the ambiguous red Session × with explicit “Terminate” and “Clear” actions, added a real `stopping` state, and made retained-session deletion immediate instead of waiting for the retention timer.
- Switched PalmTTY's Windows PTY path to node-pty's bundled ConPTY DLL backend so explicit termination avoids node-pty 1.1.0's console-list helper, reducing the observed teardown console-window flash and avoiding that helper's upstream race path.

### Security

- Directory browsing is an authenticated + exact-Origin read-only API that returns directories only, with rate, entry-count, process-output, and timeout bounds.
- Workspace mutation is now an explicit authenticated + exact-Origin-protected API; Session creation still accepts only workspace IDs, and the Web workspace model does not expose environment-variable injection.
- Worker secrets never reach the browser and are excluded from argv/URL/default logs; the login-token environment variable is stripped from Worker/PTTY environments.
- Stale Worker records are cleaned without PID-based process killing, avoiding PID-reuse hazards.
- Worker IPC terminal input and frames/backpressure are bounded.
- Session lifecycle mutations have a dedicated rate limit; retained-session retirement is authenticated Worker IPC and is rejected while the Session is active/stopping.

- Application heartbeat detects half-open mobile WebSocket connections.
- Established terminal WebSockets expire with the login session.
- Exited sessions and rate-limiter/login-session state are bounded.

## Release history

No tagged PalmTTY release has been published yet.
