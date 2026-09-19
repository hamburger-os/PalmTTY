# Current implementation state

Status: **alpha foundation implemented and passing Windows/Ubuntu CI; open-source governance and automated security review are in place, while real mobile/Codex deployment hardening remains before a stable release.**

## Implemented

### Repository and governance

- pnpm/TypeScript monorepo
- Agent/Web/protocol/config packages
- committed pnpm lockfile with frozen-lockfile CI installs
- Windows + Ubuntu CI passing
- Windows-only ConPTY smoke test that spawns PowerShell 7, resizes the PTY and round-trips Unicode
- production dependency vulnerability audit on pull requests, main and weekly schedule
- CodeQL JavaScript/TypeScript analysis on pull requests, main and weekly schedule
- CODEOWNERS, PR template and structured Issue Forms
- CONTRIBUTING, Code of Conduct, Support, Governance, Changelog and Release process
- Dependabot groups minor/patch npm updates while leaving major upgrades for deliberate individual review
- Apache-2.0; production dependency audit currently contains MIT, ISC and BSD-3-Clause licenses
- four documentation layers
- `.agents/skills/docs-sync/SKILL.md`
- automated documentation contract check

### Agent and security

- Fastify HTTP/WebSocket service
- PowerShell 7 / custom-shell workspace configuration
- node-pty PTY ownership
- built-in single-user bootstrap-token login
- random in-memory login session cookie with bounded active-session count
- exact Origin allowlist
- non-loopback startup safety gate
- login and session-create fixed-window limits with bounded limiter state
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
- per-connection serialized client message handling to remove resume/input/resize races
- application ping/pong heartbeat for half-open mobile connection detection
- terminal WebSocket closure at login-session expiry
- bounded exited-session retention with automatic disposal

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
- Windows CI validates ConPTY/PowerShell, but real owner workstation + mobile Safari/Chrome + Codex validation is still required.
- No Git/file preview subsystem yet.
- Linux/macOS/WSL are not first-class supported hosts yet.
- Active `main` Ruleset requires pull requests, squash-only merge, linear history, conversation resolution, no force-push/deletion, and four green automated checks; human/code-owner approval is intentionally not required for the AI-maintained workflow.
- GitHub Dependency Review is not enabled because the repository Dependency graph setting was off when tested; the portable `pnpm audit --prod` gate is enforced instead. Ruleset strict-up-to-date and an admin-only emergency recovery bypass are documented recommendations still requiring GitHub Settings changes.

## Required honesty rule

Do not move a known gap into "Implemented" until code and tests exist. If a test or CI run demonstrates that current implementation is broken, update this file in the same task as the fix or status change.
