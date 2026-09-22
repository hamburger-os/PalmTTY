# Current implementation state

Status: **alpha foundation implemented with durable per-session workers, Windows/Ubuntu CI and current-user Windows/Linux Agent autostart; guarded v0.1.0 release automation is implemented. Real mobile/Codex/deployment checks remain recommended release evidence rather than a workflow gate.**

## Implemented

### Repository and governance

- pnpm/TypeScript monorepo
- Agent/Web/protocol/config packages
- committed pnpm lockfile with frozen-lockfile CI installs
- Windows + Ubuntu CI passing
- root-script syntax checks plus Node built-in tests for private-LAN address/origin discovery
- Windows ConPTY smoke coverage that prefers PowerShell 7 locally, falls back to Windows PowerShell for generic host checks, and is forced to PowerShell 7 in repository Windows CI
- end-to-end Fastify HTTP/WebSocket/Worker IPC lifecycle coverage with deterministic PTY adapters
- detached-process integration coverage proving a Worker survives the creator Agent process exit and can be rediscovered with replay intact
- production dependency vulnerability audit, fail-closed production dependency license-policy review, and CodeQL
- CODEOWNERS, PR/Issue templates, contribution/security/governance/release documentation
- root `package.json` is the single release/runtime version source; private workspace manifests intentionally omit duplicate versions and the Agent health endpoint reads the root version
- guarded manual Release workflow locks an exact `main` SHA, reuses the Windows/Ubuntu CI + Security Audit + CodeQL workflows against that SHA, rejects tag/release reuse, aborts if `main` advances, and publishes an annotated tag plus verified GitHub Release with rollback before finalization; reusable gates consume `inputs.ref` directly and use separate CI/Security/CodeQL concurrency namespaces so sibling release gates cannot cancel one another; publication binds source authority through the remote peeled annotated tag, creates the draft through the Release REST API and retains its returned ID directly, and does not treat either list-enumeration visibility or Release `target_commitish` as source proof once the tag exists; it intentionally has no manual acceptance checkbox
- Apache-2.0 licensing
- four documentation layers and docs-sync Agent Skill

### Agent and security

- Fastify HTTP/WebSocket service
- versioned per-user persistent workspace store managed through authenticated + exact-Origin CRUD API
- built-in single-user bootstrap-token login
- random in-memory login session cookie with bounded active-session count
- exact Origin allowlist and non-loopback startup safety gate
- bounded login/session-create rate limiting
- Session creation/restart remain workspace-authority operations; Web workspace mutation may persist a bounded environment map except the reserved `PALMTTY_*` control namespace and any separately configured login-token variable, while Session requests cannot inject ad-hoc cwd/shell/environment overrides
- runtime preflight for auth/security exposure and configured Agent TCP bindability, exposed as the unambiguous `pnpm run preflight` package script
- workspace create/update plus Session creation both validate runtime launch targets
- authenticated + exact-Origin runtime-aware directory browsing for workspace selection plus unified terminal-profile discovery; directory responses expose directories only, while terminal profiles enumerate known Host shells and registered WSL distributions without starting the distributions; both surfaces are bounded and rate-limited
- authenticated + exact-Origin Session-workbench file APIs scoped to the persisted Workspace root: bounded directory/file enumeration, symlink containment checks, UTF-8 text preview capped at 512 KiB, binary detection, and structured Host/WSL implementations
- authenticated + exact-Origin Git workbench integration for the repository containing the Workspace cwd: explicit repository scope, porcelain-v2 branch/upstream/ahead-behind/status, bounded textual diff including untracked previews, recent history and local branches; reads disable external diff/textconv/fsmonitor and log signature-helper execution, working-tree diff first resolves the selected path's `filter` attribute and neutralizes that driver's clean/process commands plus `required` before comparing content, and all helper subprocesses remove the reserved `PALMTTY_*` control namespace plus any separately configured login-token variable
- typed Git write APIs cover stage/unstage, stale-safe destructive restore, commit, branch create/switch, stash push/pop, and non-interactive fetch/pull/push; no browser-supplied arbitrary Git argv exists. Mutations/remote operations are serialized per resolved repository (including across multiple Workspaces that point into the same repository), require the current status token plus an explicit repository-code-execution acknowledgement, and destructive restore additionally verifies the loaded diff snapshot. An incomplete/truncated status snapshot is never accepted as mutation authority, so all Git write/remote operations fail closed until status fits the safe bounds. Git hooks and interactive prompts are disabled; Git execution/config/SSH/askpass override environment variables are removed; remote transport is restricted to http/https/ssh/git while ext/file/unknown protocols are denied; normal Git filters and trusted host/repository Git configuration remain possible for acknowledged repositories
- host runtime adapter with absolute executable normalization, including current-user Windows App Execution Aliases for Store/MSIX PowerShell; each new/restarted Windows terminal refreshes Machine/User environment variables from Windows before resolving the shell and PATH
- Windows WSL runtime adapter using structured `wsl.exe` argv for distribution/cwd/shell rather than shell-string interpolation; configured workspace environment variables are forwarded by preserving existing colon-delimited `WSLENV` entries/flags and appending bounded names
- current-user Agent autostart management: Windows Task Scheduler `InteractiveToken` logon task and Linux `systemd --user`, with install/status/restart/uninstall; Windows uses the system Windows PowerShell host with `-WindowStyle Hidden`; the wrapper creates the Node Agent suspended/no-window, assigns it to a `KILL_ON_JOB_CLOSE | SILENT_BREAKAWAY_OK` Job Object before resume, then waits and propagates its exit code. This makes scheduled-task stop/restart terminate the Agent without a persistent console while allowing independent Session Worker children to break away; status is queried through `Get-ScheduledTask`/`Get-ScheduledTaskInfo` as explicit UTF-8 JSON instead of localized `schtasks` output; optional strict `--env-file` keeps secret values out of task/unit argv, Linux rejects group/world-readable env files, and systemd uses `KillMode=process` so Agent service restart does not redefine Worker lifetime
- Linux host runtime exercised by Ubuntu CI; macOS shares the host adapter but is not covered by repository CI
- root development launcher derives the Agent target from the validated PalmTTY config, keeps the Agent on its configured endpoint (the example remains loopback), and exposes Vite on `0.0.0.0:5173` by default for private-LAN development; it enumerates current RFC1918/link-local/100.64/10 IPv4 addresses and adds only those exact `http://<address>:5173` Origins to the development Agent in memory, while Vite still refuses silent dev-port fallback; `PALMTTY_WEB_HOST` can override the development listener
- bounded client message size and terminal dimensions
- no intentional terminal I/O logging
- Agent is a replaceable control plane and no longer owns PTYs or canonical terminal state

### Durable Session Workers

- one independent detached Worker process per Session
- Worker owns node-pty/ConPTY, headless xterm, sequence number, replay history and exited-session retention
- Windows Named Pipe IPC; Unix-domain-socket IPC on current non-Windows CI hosts
- Windows PTY creation uses node-pty's bundled ConPTY DLL path; this avoids node-pty 1.1.0's separate console-list helper on explicit kill, which can surface a transient console window and has upstream teardown races; root `pnpm dev` also enables content-free runtime/Worker/PTTY phase tracing (`runtime.resolve.begin`, `runtime.resolve.ready`, `worker.spawn.begin`, `pty.spawn.begin`, `pty.spawn.ready`, `worker.ipc.ready`, `worker.spawn.ready`) so real-host flash reports can be localized without logging argv, environment values or terminal I/O
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
- the reserved `PALMTTY_*` environment namespace plus any separately configured login-token variable is removed from the normalized Workspace before Worker bootstrap and from the Worker process environment, preventing development-control state or auth material from leaking into the user shell
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
- explicit terminal restart reserves replacement capacity, resolves and validates the latest persisted workspace before touching the current PTY, then terminates, retires and replaces the Session while preserving terminal geometry; restart intentionally creates a new Session ID/history
- bounded exited-session retention with Worker self-disposal

### Test coverage

- authentication, exact Origin and WebSocket subprotocol, including exact dynamically generated private-LAN development Origins and rejection of neighboring/unlisted LAN Origins
- resume-before-input/resize
- ordered resize/input
- browser disconnect + replay
- stale replay -> snapshot fallback
- Agent restart rediscovery
- slow-client cutoff
- auth expiry
- explicit terminate/stopping/exit transition, idempotent termination, active-session clear rejection, immediate retained-session removal, and restart-as-replacement lifecycle
- exited-session retention/cleanup
- maxSessions under concurrent creation
- wrong Worker secret rejection
- unadopted Worker creation-lease cleanup, idempotent adoption across reconnects, and recovery when an adoption success result is lost after commit
- preservation of potentially-live recovery metadata when rediscovery cannot prove the Worker is dead
- Worker self-healing of missing recovery record/secret without weakening conflict detection
- oversized Worker terminal input rejection
- detached Worker survival across complete creator Agent process exit
- real Windows node-pty + ConPTY Unicode smoke test with local PowerShell fallback; repository Windows CI explicitly requires PowerShell 7; owner-host MSIX/App Execution Alias PTY launch remains part of real-host validation
- Git porcelain-v2 repository scope/status/diff parsing plus typed stage/unstage/restore/commit/branch/history behavior, including stale-state rejection and path traversal rejection; remote Git remains a manual/host-credential integration path rather than a networked CI dependency

### Web/mobile

- workspace editor opens independently of runtime capability probing; Host creation remains available while optional WSL capability detection is pending or unavailable
- native workspace dialog activation is idempotent under React StrictMode, with React state remaining the owner of open/close lifecycle
- token login
- English / Simplified Chinese UI with persisted browser language preference
- client-side Spectrum / Obsidian / Frosted visual themes with persisted browser preference, plus Quality / Performance rendering modes and reduced-motion-aware decorative animation
- PalmTTY-owned semantic glass surface system and four-color ambient field; visual rules live in `.agents/skills/palmtty-theme/SKILL.md` rather than component-local palettes, with dedicated modal and terminal surface ownership instead of stacking generic glass under those regions
- workspace create/edit/delete UI with terminal profiles as the primary choice; Host/WSL runtime details are hidden behind the Custom advanced path
- Host/WSL remote directory picker that selects directories on the Agent runtime rather than the browser device
- workspace dialog uses a dedicated readability-first modal surface with a fixed header/footer and one scrollable form body; the bounded directory list may scroll independently; installed Host shells and registered WSL distributions appear in one terminal-profile selector with an explicit Custom fallback; Host/WSL working-directory drafts are kept separate; workspace environment variables use structured `NAME=value` editing with balanced outer quote normalization; startup commands are multiline and retain presets for Codex, Claude Code, Antigravity, Gemini CLI, OpenCode, and Aider
- workspace launcher
- Session list with explicit text actions: active Sessions use “Terminate”, retained exited/failed Sessions use “Clear”; the Session workbench exposes an explicit confirmed “Restart terminal” replacement action; the ambiguous red × control is removed
- Session view is now a lightweight workbench with Terminal / Git / Files tabs; the terminal component stays mounted while switching views so xterm/WebSocket/replay state is not recreated by presentation navigation
- Git pane is a source-control workbench: repository scope/branch/tracking state, conflict/staged/unstaged/untracked groups, structured unified diff with line numbers, untracked previews, clean-state recent history, stage/unstage plus explicit repository-wide stage-all/unstage-all actions, rename-aware single-file pathsets, stale-safe discard, commit, branch create/switch, stash, and fetch/pull/push. Write controls stay disabled until the user acknowledges the trusted-repository filter boundary for the current Session workbench; that acknowledgement survives Terminal/Git/Files pane switching but not leaving the Session page; status refreshes on entry, focus/visibility and a low-frequency visible-tab poll
- Files pane provides workspace-root-scoped directory navigation plus bounded read-only UTF-8 preview with binary/truncation states; it is a viewer, not a browser IDE/editor
- stopping Sessions remain non-interactive in the terminal view
- xterm.js terminal uses one theme-owned opaque viewport surface: the host gutter receives the active xterm background from the same theme value, while theme updates apply in place without recreating the terminal or reconnecting the Session; locale/presentation updates are isolated from the transport lifecycle
- reconnect loop with retained lastSeq
- gap detection forces snapshot recovery
- browser terminal writes are serialized during recovery, fitting is frozen until recovery completes, and terminal input is blocked rather than discarded while disconnected or recovering; switching to Git/Files suppresses resize propagation and switching back performs a safe refit without recreating transport state
- Esc/Tab/arrows/Ctrl+C/Ctrl+L
- one-shot Ctrl/Alt modifier
- on-demand long-text dialog for pasted blocks, voice input and AI prompts; the always-visible chat-like composer has been removed
- responsive/safe-area layout
- terminal line-height and bottom spacing tuned so the last rendered row is not clipped by the lower controls
- PWA manifest and non-caching service worker

## Known gaps

- Windows/Linux current-user Agent autostart is implemented, but there is still no OS-reboot persistence for the pre-reboot PTY/Worker. Autostart creates a fresh Agent control plane after sign-in/user-manager startup.
- Login sessions are memory-only; after Agent restart the terminal survives but the browser must sign in again before reattaching.
- Authentication is a bootstrap token, not passkey/WebAuthn.
- No per-device session administration.
- No multi-user ACL.
- Reverse-proxy/Tailscale examples are documentation/configuration, not automated setup.
- Real owner workstation + mobile Safari/Chrome + long-running Codex validation remains required.
- Windows desktop visibility still requires real-host acceptance because CI cannot assert window rendering. Autostart no longer launches `node.exe` directly and now uses a hidden PowerShell supervisor, which removes the persistent startup console by design, but sign-in/task restart should still be checked for a transient flash; PTY creation/explicit termination keep the separate ConPTY visual check. Development spawn-phase tracing narrows PTY-stage flashes without claiming to remove an upstream ConPTY/node-pty window if one is still shown.
- Potentially-live but unreachable recovery records are deliberately preserved when process death cannot be proven; this favors terminal survival over aggressive metadata reclamation.
- Files remains a read-only viewer; Git now supports a bounded typed local/remote write set, but deliberately does not expose arbitrary Git commands, force push, interactive rebase/cherry-pick/reflog recovery, submodule/LFS administration, or a general browser file editor.
- Git remote operations are intentionally non-interactive; repositories that require an interactive credential prompt must be configured with working non-interactive credentials/SSH agent state on the host.
- WSL support is implemented but still needs real owner-host/long-running validation, including distribution enumeration, default-shell launch semantics, directory selection, and workspace-variable forwarding through `WSLENV`; repository CI does not provide a real WSL environment.
- Linux host runtime is exercised on Ubuntu CI. macOS uses the same host adapter but remains unverified because there is no macOS CI job.
- Windows Worker runtime file ACL behavior relies on the current-user application-data boundary and still merits dedicated real-host review.
- The current xterm 6 package is loaded through an isolated CommonJS boundary in the Node Worker because the published headless package is not reliably consumable through native Node ESM named exports; re-review this when upgrading xterm.
- GitHub Dependency Review remains unavailable while Dependency graph is disabled; `pnpm audit --prod` plus the production dependency license-policy check are enforced instead.

## Required honesty rule

Do not claim persistence beyond what is tested: browser disconnect and Agent restart are covered; OS reboot/logoff and Worker-process loss are not. If CI demonstrates a regression, update this file in the same task as the fix.
