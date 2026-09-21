# Current implementation state

Status: **alpha foundation implemented with durable per-session workers and passing Windows/Ubuntu CI; real mobile/Codex deployment hardening remains before a stable release.**

## Implemented

### Repository and governance

- pnpm/TypeScript monorepo
- Agent/Web/protocol/config packages
- committed pnpm lockfile with frozen-lockfile CI installs
- Windows + Ubuntu CI passing
- Windows ConPTY smoke coverage that prefers PowerShell 7 locally, falls back to Windows PowerShell for generic host checks, and is forced to PowerShell 7 in repository Windows CI
- end-to-end Fastify HTTP/WebSocket/Worker IPC lifecycle coverage with deterministic PTY adapters
- detached-process integration coverage proving a Worker survives the creator Agent process exit and can be rediscovered with replay intact
- production dependency vulnerability audit and CodeQL
- CODEOWNERS, PR/Issue templates, contribution/security/governance/release documentation
- Apache-2.0 licensing
- four documentation layers and docs-sync Agent Skill

### Agent and security

- Fastify HTTP/WebSocket service
- versioned per-user persistent workspace store managed through authenticated + exact-Origin CRUD API
- built-in single-user bootstrap-token login
- random in-memory login session cookie with bounded active-session count
- exact Origin allowlist and non-loopback startup safety gate
- bounded login/session-create rate limiting
- Session creation remains workspace-ID-only; Web workspace mutation does not expose environment-variable injection
- runtime preflight for auth/security exposure and configured Agent TCP bindability, exposed as the unambiguous `pnpm run preflight` package script
- workspace create/update plus Session creation both validate runtime launch targets
- authenticated + exact-Origin runtime-aware directory browsing for workspace selection; responses expose directories only and are bounded by request rate, 512 returned entries, subprocess output, and timeout
- host runtime adapter with absolute executable normalization, including current-user Windows App Execution Aliases for Store/MSIX PowerShell
- Windows WSL runtime adapter using structured `wsl.exe` argv for distribution/cwd/shell rather than shell-string interpolation
- Linux host runtime exercised by Ubuntu CI; macOS shares the host adapter but is not covered by repository CI
- root development launcher derives the Agent target from the validated PalmTTY config, injects it into host-independent Vite tooling, and Vite refuses silent dev-port fallback
- bounded client message size and terminal dimensions
- no intentional terminal I/O logging
- Agent is a replaceable control plane and no longer owns PTYs or canonical terminal state

### Durable Session Workers

- one independent detached Worker process per Session
- Worker owns node-pty/ConPTY, headless xterm, sequence number, replay history and exited-session retention
- Windows Named Pipe IPC; Unix-domain-socket IPC on current non-Windows CI hosts
- Windows PTY creation uses node-pty's bundled ConPTY DLL path; this avoids node-pty 1.1.0's separate console-list helper on explicit kill, which can surface a transient console window and has upstream teardown races
- length-prefixed bounded JSON frames
- per-session 256-bit Worker secret
- bootstrap delivered over anonymous stdin, never argv/URL
- startup READY handshake: Session creation succeeds only after the Worker has published recovery state and is listening
- Worker secret and minimal record persisted in a per-user runtime directory isolated by private Worker IPC generation; protocol v4 uses `runtime-v4`
- Agent startup rediscovers Workers in parallel and authenticates them
- Agent normal shutdown/restart disconnects control only and does not kill PTYs
- Worker creation uses an authenticated idempotent adoption transaction: READY is not yet durable; adoption responses can be retried across a fresh IPC connection, while an unadopted Worker has a short creation lease and self-cleans its PTY/recovery state if the creator disappears
- Worker control heartbeat and bounded-delay ongoing reconnect attempts after an adopted control connection drops
- failed rediscovery alone does not delete potentially-live recovery state; definitely-dead recorded processes can be reclaimed without PID-based killing
- Worker-owned recovery metadata is republished when missing; conflicting record/secret ownership fails closed
- stale/dangling artifacts are cleaned without treating persisted PIDs as kill authority
- login-token environment variable is removed before Worker spawn and from PTY environment
- terminal input is bounded to the same 64 KiB limit at browser and Worker IPC boundaries
- concurrent Session creation is counted against maxSessions

### Session/reconnect

- browser disconnect does not kill PTY
- Agent restart does not kill PTY
- headless xterm state mirror lives in the Worker
- serialize snapshot plus bounded sequenced replay lives in the Worker
- replay when lastSeq is retained
- snapshot fallback when browser state is new/stale
- resume handshake carries the browser's fitted terminal geometry; the Worker applies geometry to the canonical PTY/headless mirror before recovery and forces a snapshot when geometry changed
- recovery frames precede `hello`, which is the browser-visible recovery-complete boundary
- no recovery gap between replay/snapshot generation and live subscription
- per-WebSocket backpressure cutoff
- Agent↔Worker IPC backlog cutoff
- ordered Worker runtime pipeline
- ordered browser client message handling
- browser application ping/pong heartbeat
- terminal WebSocket closure at login-session expiry
- explicit Session lifecycle: `running → stopping → exited` for termination, with idempotent terminate requests
- retained-session removal is separate from termination; only exited/failed Sessions can be cleared immediately, and the Worker owns final terminal/recovery-state disposal
- bounded exited-session retention with Worker self-disposal

### Test coverage

- authentication, exact Origin and WebSocket subprotocol
- resume-before-input/resize
- ordered resize/input
- browser disconnect + replay
- stale replay -> snapshot fallback
- Agent restart rediscovery
- slow-client cutoff
- auth expiry
- explicit terminate/stopping/exit transition, idempotent termination, active-session clear rejection, and immediate retained-session removal
- exited-session retention/cleanup
- maxSessions under concurrent creation
- wrong Worker secret rejection
- unadopted Worker creation-lease cleanup, idempotent adoption across reconnects, and recovery when an adoption success result is lost after commit
- preservation of potentially-live recovery metadata when rediscovery cannot prove the Worker is dead
- Worker self-healing of missing recovery record/secret without weakening conflict detection
- oversized Worker terminal input rejection
- detached Worker survival across complete creator Agent process exit
- real Windows node-pty + ConPTY Unicode smoke test with local PowerShell fallback; repository Windows CI explicitly requires PowerShell 7; owner-host MSIX/App Execution Alias PTY launch remains part of real-host validation

### Web/mobile

- workspace editor opens independently of runtime capability probing; Host creation remains available while optional WSL capability detection is pending or unavailable
- native workspace dialog activation is idempotent under React StrictMode, with React state remaining the owner of open/close lifecycle
- token login
- English / Simplified Chinese UI with persisted browser language preference
- client-side Spectrum / Obsidian / Frosted visual themes with persisted browser preference, plus Quality / Performance rendering modes and reduced-motion-aware decorative animation
- PalmTTY-owned semantic glass surface system and four-color ambient field; visual rules live in `.agents/skills/palmtty-theme/SKILL.md` rather than component-local palettes, with dedicated modal and terminal surface ownership instead of stacking generic glass under those regions
- workspace create/edit/delete UI plus Host/WSL runtime form
- Host/WSL remote directory picker that selects directories on the Agent runtime rather than the browser device
- workspace dialog uses a dedicated readability-first modal surface with a fixed header/footer and one scrollable form body; the bounded directory list may scroll independently; shell-argument example chips and startup-command presets cover Codex, Claude Code, Antigravity, Gemini CLI, OpenCode, and Aider
- workspace launcher
- Session list with explicit text actions: active Sessions use “Terminate”, retained exited/failed Sessions use “Clear”; the ambiguous red × control is removed
- stopping Sessions remain non-interactive in the terminal view
- xterm.js terminal uses one theme-owned opaque viewport surface: the host gutter receives the active xterm background from the same theme value, while theme updates apply in place without recreating the terminal or reconnecting the Session; locale/presentation updates are isolated from the transport lifecycle
- reconnect loop with retained lastSeq
- gap detection forces snapshot recovery
- browser terminal writes are serialized during recovery, fitting is frozen until recovery completes, and terminal/composer input is blocked rather than discarded while disconnected or recovering
- Esc/Tab/arrows/Ctrl+C/Ctrl+L
- one-shot Ctrl/Alt modifier
- multiline composer
- responsive/safe-area layout
- terminal line-height and bottom spacing tuned so the last rendered row is not clipped by the lower controls
- PWA manifest and non-caching service worker

## Known gaps

- No Windows/OS reboot persistence.
- Login sessions are memory-only; after Agent restart the terminal survives but the browser must sign in again before reattaching.
- Authentication is a bootstrap token, not passkey/WebAuthn.
- No per-device session administration.
- No multi-user ACL.
- Reverse-proxy/Tailscale examples are documentation/configuration, not automated setup.
- Real owner workstation + mobile Safari/Chrome + long-running Codex validation remains required.
- Windows explicit-termination “no visible console flash” remains a real-host visual acceptance check; CI exercises the bundled ConPTY DLL path but cannot assert desktop window visibility.
- Potentially-live but unreachable recovery records are deliberately preserved when process death cannot be proven; this favors terminal survival over aggressive metadata reclamation.
- No Git/file preview subsystem yet.
- WSL support is implemented but still needs real owner-host/long-running validation; repository CI does not provide a real WSL environment.
- Linux host runtime is exercised on Ubuntu CI. macOS uses the same host adapter but remains unverified because there is no macOS CI job.
- Windows Worker runtime file ACL behavior relies on the current-user application-data boundary and still merits dedicated real-host review.
- The current xterm 6 package is loaded through an isolated CommonJS boundary in the Node Worker because the published headless package is not reliably consumable through native Node ESM named exports; re-review this when upgrading xterm.
- GitHub Dependency Review remains unavailable while Dependency graph is disabled; pnpm audit --prod is enforced instead.

## Required honesty rule

Do not claim persistence beyond what is tested: browser disconnect and Agent restart are covered; OS reboot/logoff and Worker-process loss are not. If CI demonstrates a regression, update this file in the same task as the fix.
