# Current implementation state

Status: **alpha foundation implemented; CI and real-device hardening are required before a stable release.**

## Implemented

### Repository

- pnpm/TypeScript monorepo
- Agent/Web/protocol/config packages
- Windows + Linux CI definition
- Apache-2.0
- four documentation layers
- `.agents/skills/docs-sync/SKILL.md`
- automated documentation contract check

### Agent and security

- Fastify HTTP/WebSocket service
- PowerShell 7 / custom-shell workspace configuration
- node-pty PTY ownership
- built-in single-user bootstrap-token login
- random in-memory login session cookie
- exact Origin allowlist
- non-loopback startup safety gate
- login and session-create fixed-window limits
- workspace ID allowlist
- bounded client message size and terminal dimensions
- no intentional terminal I/O logging

### Session/reconnect

- browser disconnect does not kill PTY
- headless xterm state mirror
- serialize snapshot
- monotonically increasing output sequence
- bounded byte replay buffer
- replay when `lastSeq` is still retained
- snapshot fallback when state is new/stale
- per-WebSocket `bufferedAmount` backpressure cutoff
- ordered server pipeline around mirror update, sequence assignment and broadcast

### Web/mobile

- token login
- workspace launcher
- running-session list
- xterm.js terminal
- reconnect loop with retained `lastSeq`
- gap detection forces snapshot recovery
- Esc/Tab/arrows/Ctrl+C/Ctrl+L
- one-shot Ctrl/Alt modifier
- multiline composer
- responsive/safe-area layout
- PWA manifest and non-caching service worker

## Known gaps

- No independent session worker: Agent restart still ends PTYs.
- No Windows reboot persistence.
- Authentication is a bootstrap token, not passkey/WebAuthn.
- Login sessions are memory-only and disappear on Agent restart.
- No per-device session administration.
- No multi-user ACL.
- Reverse-proxy/Tailscale examples are documentation/configuration, not automated setup.
- Real Windows 11 + mobile Safari validation is still required after CI confirms compile/test.
- No Git/file preview subsystem yet.
- Linux/macOS/WSL are not first-class supported hosts yet.

## Required honesty rule

Do not move a known gap into "Implemented" until code and tests exist. If a test or CI run demonstrates that current implementation is broken, update this file in the same task as the fix or status change.
