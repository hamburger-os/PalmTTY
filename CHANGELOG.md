# Changelog

All notable PalmTTY changes are recorded here.

The project follows a Keep-a-Changelog-style structure and intends to use Semantic Versioning once tagged releases begin.

## [Unreleased]

### Added

- Windows-first PowerShell 7 terminal sessions through node-pty / ConPTY.
- Mobile React + xterm.js PWA with special-key controls and multiline composer.
- Server-side headless terminal snapshot plus bounded sequenced replay.
- Single-user bootstrap-token authentication with HttpOnly session cookies.
- Exact Origin checks, non-loopback safety gates, bounded rate-limit/session state and socket backpressure.
- Windows and Ubuntu CI, including a Windows PowerShell/ConPTY Unicode smoke test.
- Frozen pnpm lockfile and production dependency-license audit.
- Four-layer project documentation and docs-sync Agent Skill.
- Apache-2.0 licensing.
- Community governance files, contribution templates and security automation.

### Security

- Application heartbeat detects half-open mobile WebSocket connections.
- Established terminal WebSockets expire with the login session.
- Exited sessions and rate-limiter/login-session state are bounded.

## Release history

No tagged PalmTTY release has been published yet.
