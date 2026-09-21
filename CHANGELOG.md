# Changelog

All notable PalmTTY changes are recorded here.

The project follows a Keep-a-Changelog-style structure and intends to use Semantic Versioning once tagged releases begin.

## [Unreleased]

### Added

- Independent detached Session Worker per terminal, with Agent-restart persistence and authenticated local IPC.
- Worker recovery metadata, per-session 256-bit secrets, startup READY handshake, heartbeat/reconnect and orphan-state cleanup.
- Cross-process integration tests proving a Worker survives creator-Agent exit and can be rediscovered with replay intact.

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

- Renamed the host runtime check from `doctor` to `preflight` so pnpm 10's built-in `pnpm doctor` can no longer bypass PalmTTY startup validation; `pnpm dev` now explicitly runs the project preflight first.
- Made generic Windows ConPTY and detached-Worker integration tests portable to hosts without PowerShell 7 while keeping official Windows CI pinned to real PowerShell 7 coverage.

### Security

- Worker secrets never reach the browser and are excluded from argv/URL/default logs; the login-token environment variable is stripped from Worker/PTTY environments.
- Stale Worker records are cleaned without PID-based process killing, avoiding PID-reuse hazards.
- Worker IPC terminal input and frames/backpressure are bounded.

- Application heartbeat detects half-open mobile WebSocket connections.
- Established terminal WebSockets expire with the login session.
- Exited sessions and rate-limiter/login-session state are bounded.

## Release history

No tagged PalmTTY release has been published yet.
