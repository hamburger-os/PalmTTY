# Current implementation state


## Implemented

### Node.js 24 LTS runtime baseline (2026-10-25)

- `.node-version` is the exact CI/release security pin; root `engines.node` bounds supported runtime versions within major 24. `@types/node` and frozen pnpm lockfile use major 24.
- Windows/Ubuntu CI, Security Audit, Distribution and Release select `.node-version`. Native PTY/ConPTY tests verify their host runtime; installed package smoke checks its Node binary against the release manifest and pinned baseline.
- Node 22 is not a supported runtime, and there is no dual-ABI fallback. Real-host autostart / ConPTY visual tests remain separate owner-host acceptance. Managed Harness provisioning is documented in the current Web application section; the Node runtime migration was an earlier independent change.



### Workspace Code and private HTTPS access (2026-10-26)

- Product copy describes a self-hosted remote development workbench. Generic access copy is device-neutral; touch/keyboard-specific mobile documentation remains specific.
- Global three-way application navigation is removed. Code follows Artifacts in the existing workspace tab row and opens the persisted host cwd using the upstream folder URL parameter. WSL paths are explicitly unsupported by a Windows host Code instance; no guessed mapping or process restart. Terminal stays mounted and hidden geometry is paused. Harness is entered from its home card and returns through a single back action.
- Missing remote routes are separate from installation failures; running applications without an access URL do not offer installation retry.
- Optional server.privateGateway is an explicit Windows x64 deployment profile adjunct: loopback reverseProxy, one PalmTTY Origin plus two managed-app URLs with distinct sibling hostnames under .home.arpa, all HTTPS port 443. Those URLs are the sole hostname source. Different HTTPS ports do not isolate authentication cookies, so shared HTTPS hostnames are rejected.
- deploy:local provisions pinned SHA-256-verified Caddy/CoreDNS archives from official releases. Agent-owned leases supervise the HTTPS gateway and private-address-only DNS, strip unrelated environment, and reclaim both on shutdown. The HTTPS listener binds the configured private IP; DNS forwards other names to the configured private resolver with bounded concurrency and no query logging. Unknown port owners are never killed; trust-store/firewall elevation is never automatic.
- The private CA persists in the current user's private-network directory. Deployment exports only its public root certificate and iOS profile plus client instructions. Client DNS, root trust and private firewall access remain explicit operator setup. All three browser pages must use trusted HTTPS; VPN transport alone does not establish a browser secure context. Exact iOS Safari iframe/API/WS acceptance still requires the owner's device.

### Explicit managed Web applications and embedded views (2026-10-26)

- Optional `integrations.vscodeWeb` / `harness` entries are discriminated objects: `managed` owns a fixed loopback port, default-off autoStart and optional independent public URL; `external` owns only its URL and never launches locally. Legacy strings and the separate interactive joint launcher are removed.
- Agent onListen starts configured applications; browser login/catalogue polling have no installation side effects. Ensure is authenticated, exact-Origin and single-flight per app. Disabled/external states never claim local readiness.
- Code binaries remain separately installed. Personal managed launch is a host-only opt-in; no automatic license acceptance or token-disable flags. Official tunnel service support and Server hosting restrictions are distinct; a universal TTY requirement is not asserted and no Azure tunnel is introduced.
- Harness uses one verified pinned private npm installation. Install stages publish only after validation, retain bounded output without killing verbose successful npm, and distinguish 10-minute install timeout from 75-second startup timeout. Unverified global npm entries are not executed.
- Managed apps/installers have a pipe lease and Windows non-breakaway kill-on-close Job or POSIX workload process group. Agent signal shutdown closes the app; forcible Agent loss closes leases. Durable Terminal Workers retain their independent lifecycle; no saved PID grants kill authority.
- Source Windows helpers are content-addressed so rebuilding does not replace an executable held by running applications.
- Catalogue/iframe URLs never contain bootstrap tokens. Only explicit authenticated exact-Origin POST `/api/v1/integrations/:id/authorize` may hand off the owned instance's upstream process URL to its operator-configured independent HTTPS root. Remote loopback token URLs remain withheld; credentials never enter logs, storage, iframe state or PalmTTY cookies.
- Independent-Origin frames mount lazily and survive switching. Hidden terminal geometry is paused without remount/reconnect. First authorization opens separately. Shared card geometry and button/link actions consume existing theme tokens.
- Explicit interactive `pnpm app:authorize <vscodeWeb|harness>` can display a private local bootstrap URL to its operator; direct numeric local authority/socket checks reject forwarded traffic. This intentional display is not a default log surface.
- Source `pnpm deploy:local` installs frozen dependencies, builds, preflights, installs user startup and verifies autoStart apps; Windows without arguments reuses installed config/env-file paths. Upgrade preflight may stop only the registered user startup instance when its sole failure is endpoint occupancy, then retries and restores startup on failure; unknown listeners are never terminated. DNS/TLS/NAS and exact-version mobile embedded HTTP/WebSocket acceptance remain external checks. Legacy direct Windows Code leftovers have an explicit scoped cleanup script.

### Mobile terminal pointer routing (2026-10-15)

- Touch clients start in Browse mode; the fixed keybar switches to Interact. Browse forwards **only validated SGR wheel reports** when a TUI enables mouse tracking (so the TUI can scroll its own transcript), while blocking mouse clicks/drags/movement; when tracking is off, xterm scrolls local normal-buffer history without sending mouse input. Interact forwards all valid complete SGR reports. NaN/malformed SGR and X10/onBinary packets are always discarded. Touch physics still belongs only to xterm. Alternate buffers have no native scrollback; scrolling there depends on the TUI's wheel support. Real iOS/Android testing remains necessary.


### Repository and governance

- pnpm/TypeScript monorepo
- Agent/Web/protocol/config packages
- reviewed toolchain versions are defined by the root/workspace package manifests and the single frozen `pnpm-lock.yaml` (rather than copied into this status report). Windows/Ubuntu CI, installed Windows/Linux distribution smoke, Security Audit and CodeQL validate changes; bundled Node runtime and `@types/node` use major 24.
- committed pnpm lockfile with frozen-lockfile CI installs; the repository pins Node.js 24 LTS for CI/release via `.node-version`, constrains accepted Node engines to major 24, and Dependabot excludes `@types/node` 25+. Dependency majors are validated individually on up-to-date main, including Windows/Linux installed distribution smoke. Windows native lifecycle smoke waits for surviving Worker/Agent close and bounds transient temp-directory deletion retries.
- Windows + Ubuntu CI passing
- root-script syntax checks plus Node built-in tests for private-LAN address/origin discovery
- Windows ConPTY smoke coverage that prefers PowerShell 7 locally, falls back to Windows PowerShell for generic host checks, and is forced to PowerShell 7 in repository Windows CI
- end-to-end Fastify HTTP/WebSocket/Worker IPC lifecycle coverage with deterministic PTY adapters
- detached-process integration coverage proving a Worker survives the creator Agent process exit and can be rediscovered with replay intact
- production dependency vulnerability audit, fail-closed license-policy review (including the exact DOMPurify package/version dual-license exception maintained only in `scripts/release-tools.mjs`), and CodeQL
- CODEOWNERS, PR/Issue templates, contribution/security/governance/release documentation
- root `package.json` is the single release/runtime version source; private workspace manifests intentionally omit duplicate versions and the Agent health endpoint reads the root version
- the source tree uses the root `package.json` version; `CHANGELOG.md` documents current `[Unreleased]` changes plus historical releases. The changelog, not this status report, owns versioned migration notes.
- guarded manual Release workflow locks an exact `main` SHA, reuses the Windows/Ubuntu CI + Security Audit + CodeQL workflows against that SHA, rejects tag/release reuse, aborts if `main` advances, and publishes an annotated tag plus verified GitHub Release with rollback before finalization; reusable gates consume `inputs.ref` directly and use separate CI/Security/CodeQL concurrency namespaces so sibling release gates cannot cancel one another; publication binds source authority through the remote peeled annotated tag, creates the draft through the Release REST API and retains its returned ID directly, and does not treat either list-enumeration visibility or Release `target_commitish` as source proof once the tag exists; it intentionally has no manual acceptance checkbox
- Apache-2.0 licensing
- self-contained installed distribution layout with bundled Node.js, production-only deployed Agent dependencies, compiled Web/PWA assets and an immutable `release-manifest.json`; installed runtime discovery does not depend on repository layout or on preserving `PALMTTY_INSTALL_ROOT` into Session Workers
- native Release packages: Windows x64 per-user Inno Setup installer + portable zip, Linux x64 Debian package + portable tar, per-platform CycloneDX SBOMs, Release `SHA256SUMS`, and GitHub build-provenance attestations
- installed `palmtty` CLI for init/info/start/preflight/version and current-user service install/status/restart/uninstall; Windows release packaging precompiles the GUI-subsystem autostart host so target installations do not compile C# or require global Node/pnpm
- Release package jobs copy the finished runtime outside the checkout and smoke it with the bundled Node runtime (version, preflight, Agent health and compiled Web serving); draft Release promotion verifies the exact asset set and remote size of every uploaded asset
- four documentation layers and docs-sync Agent Skill

### Agent and security

- Fastify HTTP/WebSocket service
- versioned per-user Workspace store v4 (`workspaces-v4.json`) managed through authenticated + exact-Origin CRUD API; the canonical `WorkspaceDefinitionSchema` contains the Workspace root and Terminal launch settings only. No Remote App profiles or runtime compatibility reads exist. An explicit offline v3→v4 exporter preserves the original file and validates output with the canonical schema.
- built-in single-user bootstrap-token login
- random in-memory login session cookie with bounded active-session count
- explicit `local` / `lan` / `reverseProxy` / direct `https` exposure profiles: bind host, trusted Origins and Secure-cookie behavior are derived from the profile; `lan` additionally rejects non-private client source addresses; legacy low-level exposure switches are rejected
- bounded login/session-create rate limiting
- Session creation/restart remain workspace-authority operations; Web workspace mutation may persist a bounded environment map except the reserved `PALMTTY_*` control namespace and any separately configured login-token variable, while Session requests cannot inject ad-hoc cwd/shell/environment overrides
- runtime preflight for auth/exposure policy, direct-HTTPS credential validity and derived Agent TCP bindability, exposed as the unambiguous `pnpm run preflight` package script
- workspace create/update plus Session creation both validate runtime launch targets
- authenticated + exact-Origin runtime-aware directory browsing for workspace selection plus unified terminal-profile discovery; directory responses expose directories only, while terminal profiles enumerate known Host shells and registered WSL distributions without starting the distributions; both surfaces are bounded and rate-limited
- authenticated + exact-Origin Session-workbench file APIs scoped to the persisted Workspace root: bounded directory/file enumeration, symlink containment checks, UTF-8 text preview capped at 512 KiB, binary detection, and structured Host/WSL implementations; a separate complete-file export path reuses the same canonical/symlink containment and stable bounded-handle semantics, is capped at 8 MiB, remains read-only, and returns private no-store/no-sniff bytes so copy/share/download never mistakes a truncated preview for complete content; PNG/JPEG/WebP/GIF image preview is a separate bounded binary read that reuses the same containment checks, performs stable bounded handle reads, validates server-side image signatures/dimensions/pixel count and returns no-sniff image bytes
- authenticated + exact-Origin Git workbench integration for the repository containing the Workspace cwd: explicit repository scope, porcelain-v2 branch/upstream/ahead-behind/status, bounded textual diff including untracked previews, local branches, and first-class read-only history inspection; history uses snapshot-stable opaque cursor pagination, optional file-scoped `--follow` queries, bounded commit metadata/changed-file lists and bounded per-commit file diff; root commits are compared against the empty tree while non-root (including merge) commit details use the first parent as the deterministic review baseline; reads disable external diff/textconv/fsmonitor and log signature-helper execution, working-tree diff first resolves the selected path's `filter` attribute and neutralizes that driver's clean/process commands plus `required` before comparing content, and all helper subprocesses remove the reserved `PALMTTY_*` control namespace plus any separately configured login-token variable
- typed Git write APIs cover stage/unstage, stale-safe destructive restore, commit, branch create/switch, stash push/pop, and non-interactive fetch/pull/push; no browser-supplied arbitrary Git argv exists. Mutations/remote operations are serialized per resolved repository (including across multiple Workspaces that point into the same repository), require the current status token plus an explicit repository-code-execution acknowledgement, and destructive restore additionally verifies the loaded diff snapshot. An incomplete/truncated status snapshot is never accepted as mutation authority, so all Git write/remote operations fail closed until status fits the safe bounds. Git hooks and interactive prompts are disabled; Git execution/config/SSH/askpass override environment variables are removed; remote transport is restricted to http/https/ssh/git while ext/file/unknown protocols are denied; normal Git filters and trusted host/repository Git configuration remain possible for acknowledged repositories
- host runtime adapter with absolute executable normalization, including current-user Windows App Execution Aliases for Store/MSIX PowerShell; each new/restarted Windows terminal refreshes Machine/User environment variables from Windows before resolving the shell and PATH
- Windows WSL runtime adapter using structured `wsl.exe` argv for distribution/cwd/shell rather than shell-string interpolation; configured workspace environment variables are forwarded by preserving existing colon-delimited `WSLENV` entries/flags and appending bounded names
- current-user Agent autostart management: Windows Task Scheduler `InteractiveToken` logon task and Linux `systemd --user`, with install/status/restart/uninstall; Windows install compiles `windows-autostart-host.cs` once with system Windows PowerShell 5.1 as a GUI-subsystem executable in Local AppData, and Task Scheduler launches that host directly. The native host creates Node suspended/no-window, assigns it to a `KILL_ON_JOB_CLOSE | SILENT_BREAKAWAY_OK` Job Object before resume, waits and propagates its exit code; PowerShell is not part of the long-lived runtime chain. Status is queried through `Get-ScheduledTask`/`Get-ScheduledTaskInfo` as UTF-8 JSON and augments task state with native-host/runtime/exposure diagnostics. Optional strict `--env-file` keeps secret values out of task/unit argv, Linux rejects group/world-readable env files, and systemd uses `KillMode=process` so Agent service restart does not redefine Worker lifetime
- Linux host runtime exercised by Ubuntu CI; macOS shares the host adapter but is not covered by repository CI
- root development launcher derives the Agent target from the validated exposure profile and exposes Vite on `0.0.0.0:5173` by default for private-LAN development; it enumerates current RFC1918/link-local/100.64/10 IPv4 addresses and adds only those exact `http://<address>:5173` Origins to the development Agent at runtime without mutating persistent exposure config, while Vite still refuses silent dev-port fallback; `PALMTTY_WEB_HOST` can override the development listener
- authenticated + exact-Origin Session image attachments stored outside the Git Workspace in a private runtime directory, with server-side PNG/JPEG/WebP/GIF signature/dimension/pixel-count validation, 8 MiB per-file / 32-file / 64 MiB aggregate Session bounds, private 0700/0600 Unix permissions, random storage names, no-sniff responses, stable bounded file-handle reads, Host/WSL-readable terminal paths derived from required immutable launch-runtime identity persisted in the Worker recovery record (never from a later Workspace edit), independent read/upload/delete rate limits, Agent-restart persistence while the Worker recovery record remains live, and cleanup on explicit clear/restart/retention expiry or startup orphan reconciliation
- bounded client message size and terminal dimensions
- no intentional terminal I/O logging
- Agent is a replaceable control plane and no longer owns PTYs or canonical terminal state

### Durable Session Workers

- restart failure safety: an exited Worker remains retained (including its canonical output and Session attachments) until replacement spawn, local IPC authentication and adoption all succeed; replacement failure leaves the old Session available for inspection and retry
- an exited retained Worker remains eligible for authenticated IPC reconnection; temporary control-channel closure no longer implies retirement
- Agent startup retries failed-but-potentially-live Worker discovery periodically while running instead of leaving those Sessions invisible until the next Agent restart
- concurrent restart calls for the same Session share the same in-flight result; clear and terminate are rejected while replacement is underway; the Web displays server restart details and reconciles its Session catalog on completion/error
- restart continues to create a new Session ID on success; it is not yet a durable idempotent HTTP operation across Agent crashes or lost response acknowledgements, and a pre-replacement PTY termination cannot be rolled back. These remain explicit limits

- one independent detached Worker process per Session
- Worker owns node-pty/ConPTY, headless xterm, sequence number, replay history and exited-session retention
- Windows Named Pipe IPC; Unix-domain-socket IPC on current non-Windows CI hosts
- Windows PTY creation uses node-pty's bundled ConPTY DLL path; this avoids node-pty 1.1.0's separate console-list helper on explicit kill, which can surface a transient console window and has upstream teardown races; root `pnpm dev` also enables content-free runtime/Worker/PTTY phase tracing (`runtime.resolve.begin`, `runtime.resolve.ready`, `worker.spawn.begin`, `pty.spawn.begin`, `pty.spawn.ready`, `worker.ipc.ready`, `worker.spawn.ready`) so real-host flash reports can be localized without logging argv, environment values or terminal I/O
- length-prefixed bounded JSON frames
- per-session 256-bit Worker secret
- bootstrap delivered over anonymous stdin, never argv/URL
- startup READY handshake: Session creation succeeds only after the Worker has published recovery state and is listening
- Worker secret and minimal record persisted in a per-user runtime directory isolated by private Worker IPC generation; protocol v5 uses `runtime-v5`
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
- explicit terminal restart reserves replacement capacity, validates the persisted Workspace and waits for the old PTY to exit; it creates/adopts the replacement before retiring the old exited Session, preserving the old retained record on replacement failure; successful restart creates a new Session ID/history
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
- explicit terminate/stopping/exit transition, idempotent termination, active-session clear rejection, immediate retained-session removal, restart-as-replacement lifecycle, plus Session attachment upload/list/read/delete and attachment-directory cleanup when the old Session is retired
- exited-session retention/cleanup
- maxSessions under concurrent creation
- wrong Worker secret rejection
- unadopted Worker creation-lease cleanup, idempotent adoption across reconnects, and recovery when an adoption success result is lost after commit
- preservation of potentially-live recovery metadata when rediscovery cannot prove the Worker is dead
- Worker self-healing of missing recovery record/secret without weakening conflict detection
- oversized Worker terminal input rejection
- detached Worker survival across complete creator Agent process exit
- real Windows node-pty + ConPTY Unicode smoke test with local PowerShell fallback; repository Windows CI explicitly requires PowerShell 7; owner-host MSIX/App Execution Alias PTY launch remains part of real-host validation
- Git porcelain-v2 repository scope/status/diff parsing plus typed stage/unstage/restore/commit/branch behavior, snapshot-stable paged repository/file history, commit changed-file inspection and commit-file diff, including stale-state rejection and path traversal rejection; complete Workspace file export is covered separately from the 512 KiB preview so truncation cannot silently change copy semantics; remote Git remains a manual/host-credential integration path rather than a networked CI dependency

### Web/mobile

- workspace editor opens independently of runtime capability probing; Host creation remains available while optional WSL capability detection is pending or unavailable
- native workspace dialog activation is idempotent under React StrictMode, with React state remaining the owner of open/close lifecycle
- token login
- English / Simplified Chinese UI with persisted browser language preference
- first-party PalmTTY branding assets: a canonical transparent `logo.png`, square 192/512 PNG app icons, theme-safe icon + live-text branding in login/loading/home chrome, plus favicon/Apple-touch/PWA manifest wiring; branding is presentation-only and does not enter terminal/session state
- client-side Spectrum / Obsidian / Frosted visual themes with persisted browser preference, plus Quality / Performance rendering modes and reduced-motion-aware decorative animation
- PalmTTY-owned semantic glass surface system and four-color ambient field; visual rules live in `.agents/skills/palmtty-theme/SKILL.md` rather than component-local palettes, with dedicated modal and terminal surface ownership instead of stacking generic glass under those regions
- Terminal startup-command presets include Pi (`pi`) alongside Codex/Claude and other CLI workloads; presets fill persisted `workspace.terminal.startupCommand` and do not install binaries or change Session launch authority.
- Startup commands now execute via selected shell argv (PowerShell `-NoExit -Command`, cmd `/K`, Unix interactive `-c`, WSL explicit shell or bounded default-shell trampoline) instead of the old 75ms PTY typing race. Unknown shells fail explicit validation. Unix shells return to a new interactive shell when the startup command exits.
- Browser xterm enables Kitty keyboard VT extension; mobile keybar adds generic Shift+Enter/Alt+Enter CSI-u and Ctrl+Q without changing xterm IME ownership, bounded transport or mouse handling. Real phone Pi/ConPTY/WSL modifier-key and CJK IME tests remain required.
- Host/WSL remote directory picker that selects directories on the Agent runtime rather than the browser device
- workspace launcher
- Git pane is a source-control workbench with first-class Changes / History modes: Changes keeps repository scope/branch/tracking state, conflict/staged/unstaged/untracked groups, structured unified diff with line numbers, untracked previews, stage/unstage plus explicit repository-wide stage-all/unstage-all actions, rename-aware single-file pathsets, stale-safe discard, commit, branch create/switch, stash, and fetch/pull/push; History is always read-only and lazily loads snapshot-stable paged commit history, optional file history, commit metadata/changed files and per-commit file diff. Write controls stay disabled until the user acknowledges the trusted-repository filter boundary for the current Session workbench; that acknowledgement survives Terminal/Git/Files/Artifacts pane switching but not leaving the Session page; status refreshes on entry, focus/visibility and a low-frequency visible-tab poll; the Git sidebar remains the single vertical scroll owner so wheel/trackpad/touch input over changes or history does not get trapped in nested list scrollers
- Files pane provides workspace-root-scoped directory navigation plus bounded read-only UTF-8 preview with binary/truncation states; `.md`/`.markdown` use a client-only GFM Markdown renderer with a Source/Rendered toggle, sanitized HTML, and no automatic external image fetch. Relative links resolve only inside the Workspace and use existing authenticated file reads; external HTTP(S)/mailto links open with `noopener noreferrer`. Wide GFM tables now keep native table layout in a bounded, horizontally scrollable viewport with 9rem minimum columns, normal wrapping, an overflow-only swipe hint, and keyboard focus only when overflow exists. The Markdown article alone scrolls vertically, without a new file-reading authority; rendering still uses only the capped preview bytes; the preview toolbar promotes basename over deep parent path and provides complete-text copy, Web Share file handoff with download fallback, plus a direct file-history jump into Git. Complete-file actions use the separate 8 MiB export path rather than the 512 KiB preview when necessary; supported image files use the protected image-preview endpoint so AI-generated screenshots/diagrams in the Workspace can be viewed directly without making Files writable; it remains a viewer/export surface, not a browser IDE/editor
- stopping Sessions remain non-interactive in the terminal view
- xterm.js terminal uses one theme-owned opaque viewport surface: the outer `terminal-frame` owns theme background/border/radius/padding/clipping, while the nested `terminal-mount` is padding-free and is the sole `terminal.open()` / FitAddon / ResizeObserver geometry parent; xterm's viewport/scrollable remainder explicitly inherits the same terminal background so sub-row unused height cannot appear as a black strip; theme updates apply in place without recreating the terminal or reconnecting the Session, and locale/presentation updates remain isolated from the transport lifecycle
- browser terminal dependencies are governed by the exact-version `terminal-stack.json` contract and `pnpm terminal:check`; browser xterm/fit/WebGL are pinned to `6.1.0-beta.304` / `0.12.0-beta.301` / `0.20.0-beta.300` because xterm 6.0.0 has the upstream touch-scroll regression fixed by xtermjs/xterm.js#5563, while Worker headless/serialize remain exact `6.0.0` / `0.14.0` until a separate recovery-compatibility upgrade
- Terminal scrollbar width is an xterm option, not a CSS gutter: coarse pointers use 4 CSS px and precise pointers use 8 CSS px. The same option informs both xterm's scrollable viewport and FitAddon's column calculation. The workbench removes `scrollbar-gutter: stable` on xterm and reduces horizontal frame padding at mobile widths; the `terminal-mount` remains padding-free. Narrowing the scroll indicator does not add another scroll owner, change WebSocket/Worker protocol, or guarantee zero remaining fractional-cell space. Real iOS Safari, Android and desktop checks remain manual acceptance gates.
- on touch devices, PalmTTY no longer translates touch deltas into terminal rows. Browser panning is suppressed at `.xterm-screen` with `touch-action: none`, while xterm's own Gesture/Viewport path receives the touch sequence and owns continuous pixel scrolling, release inertia, alternate-buffer key translation, mouse-protocol wheel reporting and scrollbar behavior; there is no PalmTTY touch listener, second DOM scroll owner or document-level gesture shim. A click/tap-only focus bridge and an explicit mobile keyboard button synchronously call `terminal.focus()` so iOS/Android can activate xterm's hidden textarea without taking ownership of swipe physics; all editable controls on coarse-pointer/mobile layouts, including compact selects and xterm's helper textarea, use at least 16px text to avoid browser focus zoom
- reconnect loop with retained lastSeq
- gap detection forces snapshot recovery
- WorkspaceWorkbench is the single mobile VisualViewport layout owner at every zoom level: it pins the full workbench to the current visual rectangle (including keyboard/browser-chrome offsets) without reading scale as an enable/disable gate or writing browser zoom; `interactive-widget=resizes-content` is progressive enhancement only. TerminalView no longer listens to VisualViewport directly—workbench geometry changes resize the terminal mount, whose existing ResizeObserver/FitAddon path is the only terminal geometry bridge. `?viewportDebug=1` exposes viewport/focus metrics for real-device diagnosis without logging terminal content
- browser terminal writes are serialized during recovery, fitting is frozen until recovery completes, and terminal input is blocked rather than discarded while disconnected or recovering; switching to Git/Files/Artifacts suppresses resize propagation and switching back performs a safe refit without recreating transport state
- mobile terminal input keeps xterm as the primary keyboard/composition owner but adds a narrow public-API keyCode-229 compatibility transaction for CJK/iOS IMEs: pending xterm data is buffered until the hidden textarea delta is known, real composition cancels the fallback, and confirmed physical Ctrl+letter/Ctrl+Space/Escape cases can re-enter through `terminal.input()` without bypassing the existing xterm `onData`/WebSocket path
- mobile terminal keybar is data-driven through a shared terminal-key encoder instead of hard-coded byte writes: Enter and a literal `/` fallback are core keys; the core row fixes Keyboard and frequent Long Text first, then Esc/Tab/Enter/slash/Ctrl, while a single pinned More button directly opens the second row with arrows, Ctrl+C/J/D, Shift+Tab, font controls and `\\`, `|`, `~`, PgUp/PgDn/Home/End/Backspace/Delete plus common Ctrl navigation/AI-CLI shortcuts; unmodified virtual arrows honor xterm DECCKM/application-cursor mode
- one-shot Ctrl/Alt modifiers are shared by xterm typed input and virtual key dispatch; modified navigation keys use xterm CSI modifier parameters, modifiers reset on successful send or disconnect, and fixed shortcuts clear any armed modifier after dispatch
- on-demand long-text dialog for pasted blocks, voice input and AI prompts uses xterm `paste()` so bracketed-paste mode is preserved; paste-only and paste-plus-Enter are explicit separate actions rather than forcing Enter
- terminal font size is a browser-local 11–18 px preference controlled by A−/A+; it updates the mounted xterm and refits geometry in place without recreating the WebSocket/Session
- responsive/safe-area layout
- terminal line-height and bottom spacing tuned so the last rendered row is not clipped by the lower controls
- PWA manifest and non-caching service worker

### Safe Markdown preview extensions (2026-10-17)

- Files has one GFM parser and DOMPurify sanitizer. Attribute-free author HTML accepts br, sup, sub, u, mark, kbd, small, details and summary; HTML comments are not shown. All other author HTML stays inert text, and normal Markdown single newline behavior is unchanged.
- Footnotes, repeated heading anchors and cross-file heading links are scoped to the current preview and existing Workspace read authority. PNG/JPEG/WebP/GIF images load only from the existing authenticated and dimension-checked Workspace image endpoint, only near the viewport, with at most two concurrent requests and 24 images; object URLs are reclaimed on disposal.
- Locally bundled syntax highlighter, KaTeX and GFM alerts share that same parser. Mermaid is dynamically imported for at most eight visible fenced blocks, rejecting directives, external links and clicks, rendering strict-mode sanitized SVG inside a sandboxed no-script iframe with a deny-by-default resource CSP; invalid diagrams retain fenced source.
- No new Agent endpoint, remote rendering service, terminal lifecycle state, external fonts or remote image loading. Markdown preview remains 512 KiB-bounded and full file export/reader retain separate established limits; real-device Safari scrolling and memory still require manual validation.

## Known gaps

- Windows/Linux current-user Agent autostart is implemented, but there is still no OS-reboot persistence for the pre-reboot PTY/Worker. Autostart creates a fresh Agent control plane after sign-in/user-manager startup.
- Login sessions are memory-only; after Agent restart the terminal survives but the browser must sign in again before reattaching.
- Authentication is a bootstrap token, not passkey/WebAuthn.
- No per-device session administration.
- No multi-user ACL.
- Reverse-proxy/Tailscale examples are documentation/configuration, not automated setup.
- Real owner workstation + mobile Safari/Chrome + long-running CLI validation remains required. CI guards the terminal dependency/version contract plus static frame/mount, click-to-focus, keyCode-229 compatibility state machine, mode-aware key encoding, bracketed-paste entry path, scale-independent workbench VisualViewport ownership, mobile-safe 16px editable controls, opt-in viewport diagnostics, terminal-surface and single-owner Git-scroll markers, but it does not fully emulate real iOS/Android IME event ordering, gesture physics, whether a particular browser version actually presents the soft keyboard after focus, browser chrome animations, stale browser zoom state or inertial feel.
- Windows autostart no longer depends on console hiding: CI compiles the actual launcher as PE Windows GUI subsystem, runs it, verifies Agent exit-code propagation and detached Worker breakaway, while Node is created with `CREATE_NO_WINDOW`. Real-host visual checks remain useful for PTY/ConPTY spawn/termination behavior, but the autostart lifecycle no longer has a console-subsystem parent by design. Development spawn-phase tracing narrows PTY-stage flashes without claiming to remove an upstream ConPTY/node-pty window if one is still shown.
- Potentially-live but unreachable recovery records are deliberately preserved when process death cannot be proven; this favors terminal survival over aggressive metadata reclamation.
- Files remains a read-only viewer; Git now supports a bounded typed local/remote write set, but deliberately does not expose arbitrary Git commands, force push, interactive rebase/cherry-pick/reflog recovery, submodule/LFS administration, or a general browser file editor.
- Git remote operations are intentionally non-interactive; repositories that require an interactive credential prompt must be configured with working non-interactive credentials/SSH agent state on the host.
- WSL support is implemented but still needs real owner-host/long-running validation, including distribution enumeration, default-shell launch semantics, directory selection, and workspace-variable forwarding through `WSLENV`; repository CI does not provide a real WSL environment.
- Linux host runtime is exercised on Ubuntu CI. macOS uses the same host adapter but remains unverified because there is no macOS CI job.
- Windows Worker runtime file ACL behavior relies on the current-user application-data boundary and still merits dedicated real-host review.
- The Worker intentionally remains on `@xterm/headless 6.0.0` + `@xterm/addon-serialize 0.14.0`; headless loading is isolated behind the existing CommonJS boundary because native Node ESM named imports are not reliable for that published line. Re-review the loading boundary together with snapshot/replay/geometry compatibility before moving the Worker stack.
- GitHub Dependency Review remains unavailable while Dependency graph is disabled; `pnpm audit --prod` plus the production dependency license-policy check are enforced instead.

## Required honesty rule

Do not claim persistence beyond what is tested: browser disconnect and Agent restart are covered; OS reboot/logoff and Worker-process loss are not. If CI demonstrates a regression, update this file in the same task as the fix.

### Mobile cursor and terminal dock (latest)

- Trackpad adds short two-finger right tap and long-press primary drag with cancellation releasing the button. Windows foreground/UIPI input denial is distinct from DataChannel readiness and neither expands authority.

### Mobile control polish

- Terminal keybar now exposes Keyboard and Long Text first, followed by Esc/Tab/Enter/slash/Ctrl, and uses one fixed More/Collapse action to reveal the optional advanced row. The compact/full/hidden state machine is removed; xterm/WebSocket lifecycle is unaffected.

## Mobile terminal latest-state recovery and native novel reader (2026-10-11)

- Short terminal socket outages keep the xterm instance and lastSeq so bounded replay actually works. Foreground return after >= 1.5 s background suspension, renderer congestion, output gaps or geometry mismatch remount xterm and request a canonical Worker snapshot (lastSeq=0); no PTY or Worker is restarted.
- Worker replay is limited by 64 missing frames / 64 KiB, a 4096-record history cap and configured history byte budget. Snapshots reduce old scrollback until <= 4 MiB; local Worker IPC frames are capped at 8 MiB and parsed incrementally. Browser remounts after more than 64 queued writes or 128 Ki characters.
- Returning from the background recreates only the terminal view, not the workspace or Agent process. The browser's independent xterm write pipeline is discarded; Worker canonical state and bounded scrollback remain intact. Mobile OS visibility and audio/background behavior still require device-specific validation.
- The read-only Files reader still uses the authenticated 8 MiB complete-file endpoint whenever the 512 KiB preview is truncated; no partial-text speech or file mutation. A common ReaderPlayback state machine owns paragraph/UTF-16 offset, lazy punctuation-aware segmentation, pause/resume/stop, and at most 256 Chinese/English chapter headings. Progress stores an opaque key plus whole-text lightweight signature and position, never source text; a changed signature invalidates old progress.
- BrowserSpeechOutput first filters browser-reported SpeechSynthesisVoice entries by their declared BCP 47 primary language tag (zh and defined Chinese varieties including cmn/yue; never by voice name) and excludes non-Chinese voices from the picker and default selection. It classifies the remaining voices as localService true/false/unknown, prefers a local Chinese default, and requires explicit per-voice session consent before using remote or unknown-origin voices (including preview). A saved foreign-language voice is rejected once the browser voice list is available; without any Chinese voice, the reader displays an installation/enablement hint and offers no implicit fallback. Browser pitch/rate/volume and voice preference are local UI state. OS/browser voices may be hosted and may fail or be interrupted in background; this code does not claim offline processing for remote voices.

- Optional Qwen3-TTS is disabled by default. `speech.qwen.enabled/port` is strict config; an Agent POST route with authenticated exact Origin, bounded zod schema (max 260 code units, speaker and style allowlists), dedicated IP limiter, one in-flight upstream request, 90 s timeout and <=8 MiB RIFF/WAVE validation proxies a fixed loopback URL using a separate PALMTTY_QWEN_TOKEN env secret (never returned to browser). Readiness is authenticated and never exposes the token. The Python sidecar is separately installed, loads an operator-chosen local model directory with HF_HUB_OFFLINE=1, uses fixed CustomVoice variants (0.6b neutral, 1.7b optional storytelling), serial inference and <=32 MiB memory-only LRU audio. The browser buffers only adjacent Qwen clips, with <=12 MiB transient audio cache per play; no Cloud API, voice cloning, audio download, model auto-install, or session Worker involvement. Paragraph bound 20,000 and reader page size 120 remain. Mobile audio autoplay/background and model hardware characteristics are not certified by CI.

- Browser terminal wire protocol: `palmtty.v4` (`PROTOCOL_VERSION=4`). One ephemeral Agent-owned input/resize controller per Session; observers are read-only and attach at canonical dimensions from a snapshot. A viewer can explicitly take control after the previous controller detaches, and view geometry changes may force a new snapshot. A random, in-memory, per-tab resume identity allows the *same browser* to replace its half-open controller socket after switching Wi-Fi/mobile networks without granting unrelated viewers takeover. Agent-originated WebSocket ping/pong expires unresponsive old sockets after approximately 45 seconds; denied takeover requests now produce an explicit browser hint. Lease transitions are serialized per Session; an unsuccessful replacement restores its former controller, and a viewer takeover reattaches to the Worker for a fresh canonical snapshot before accepting PTY input. A viewer proposes its visible FitAddon geometry without prematurely resizing its renderer while control is still denied. The Worker/PTY survives both paths.
- Outstanding validation: PTY output now pauses node-pty reads at a 512 KiB pending headless queue and resumes below 128 KiB while batching mirror parsing; real-host stress testing remains outstanding; canonical output backpressure and real iPhone/Android long-duration tests remain unverified. If the visible terminal alone exceeds the 4 MiB snapshot budget, recovery fails without terminating the Worker.

- Workspace file preview/export/image reads now reopen canonical host paths with no-follow final-component flags and validate the opened descriptor before reading; Linux resolves `/proc/self/fd/N` to check actual descriptor containment, while other hosts compare file identity after opening. WSL file/image read scripts open fd 3 and recheck `/proc/self/fd/3` before stat/read. Directory enumeration and non-Linux filesystem TOCTOU guarantees remain narrower than fully atomic openat2-style containment.

## Terminal v4 rollout recovery fix (2026-10-11)

- Browser terminal wire remains strictly `palmtty.v4` and only supports `PROTOCOL_VERSION=4`. New Agent and web bundles must be deployed together; an old running Agent may close the v4 websocket with code 1002. The browser now stops futile retries for that specific protocol error and instructs operators to restart Agent then hard-refresh the page.
- Independently durable Session Workers spawned before #100 still authenticate over Worker IPC v5 but emit `hello.protocol=3`. Previously the v4 `WorkerEventSchema` rejected this delivery, disconnected authenticated IPC and triggered a 1012 browser reconnect loop. The Agent now recognizes only the old v3 `hello` shape on **authenticated Worker IPC** and translates its protocol to v4 before sending it to a browser; all other messages and worker ownership remain unchanged. This is not a general legacy browser API or a fallback shell restart.


## Terminal TUI input hardening (2026-10-15)

- All keyboard, mouse reports, IME, virtual keys and xterm paste share one bounded ordered browser input queue. Large Unicode data splits at <=12 KiB WebSocket frames, unsent data is capped at 8 MiB, and interrupted paste is not replayed after socket close. No exactly-once acknowledgement is promised.
- Only keyboard/control data consumes virtual Ctrl/Alt modifiers. Complete valid SGR mouse reports are independently classified before IME. Browse forwards only wheel events to a mouse-tracking TUI, not clicks/drags/movement; Interact forwards all validated mouse reports. Normal-buffer scroll remains xterm-local. Legacy X10/onBinary and malformed/NaN SGR are always discarded; no UTF-8-incompatible byte stream is sent to node-pty.
- Long Text preflights the buffer before xterm.paste, preserving bracketed-paste ordering; input failure warnings remain visible. There is no PalmTTY-owned touch gesture/row translation layer.

## Canonical snapshot mouse encoding recovery (2026-10-15)

- The Worker headless parser observes DECSET/DECRST 1006 (SGR) and 1016 (SGR-pixel), plus RIS resets (1015 urxvt is unsupported by xterm), while continuing normal xterm parsing. SerializeAddon serializes mouse tracking but omits its encoding selection, so the Worker appends the active encoding to its existing bounded snapshot. The browser never guesses a mouse protocol or enables unsupported onBinary transport. The serialized suffix counts toward the same <=4 MiB budget; Worker remains the sole canonical owner.
- A backgrounded mobile page still remounts xterm and restores the bounded canonical snapshot rather than replaying minutes of output. This fix restores input negotiation but does not invent scrollback inside an alternate-screen TUI. Browser+Pi real-device regression coverage is still required.

## xterm touch wheel / SGR NaN regression guard (2026-10-15)

- Some browser xterm inertia events may lack coordinates and generate malformed SGR wheel data containing literal NaN. The single input guard validates a complete report, its button, position and active mouse mode; valid reports are forwarded under Browse/Interact policy, but all NaN/partial/legacy reports are rejected without remembering or reusing past coordinates. No vendor-specific CLI heuristics or application-level gesture adapter is installed. Real iPhone Safari and Android Chrome touch/fling tests remain outstanding.

## Mobile confirmation and retained terminal recovery (2026-10-16)

- A retained exited/stopping Session does not resize the canonical headless buffer during an attachment from a different-sized browser. The Worker snapshots the original terminal geometry; a running Session continues to resize PTY and mirror before its snapshot.
- Existing Pi Regular xterm scrolling, full-screen TUI input routing, multi-line Shell startup commands and background fast-forward protection are unchanged. Real iPhone + Pi Fullscreen mouse behavior remains to be validated.

## Browser terminal glyph rendering (2026-10-17)

- The browser terminal loads one matching xterm WebGL2 addon with `customGlyphs: true` after `terminal.open()`. Box-drawing and block characters, including Pi Fullscreen's `│`/`┃`/`█` scrollbar, are rasterized by xterm's glyph renderer rather than font glyphs where WebGL is available. The existing 1.15 line height, theme palette, 4px touch scrollbar setting and mount/FitAddon geometry are unchanged.
- WebGL construction/activation failure leaves the original xterm DOM renderer active; context loss disposes only the WebGL addon to restore DOM rendering. Terminal, socket, Worker, canonical output, touch routing and history remain unchanged. Renderer cleanup precedes xterm disposal on unmount/recovery; no second scrolling or input engine is introduced.
- A fullscreen TUI's scrollbar is an application-drawn sequence of terminal cells, not the browser's xterm scrollbar. WebGL improves line continuity but cannot promise identical glyph appearance in DOM fallback or native Safari-like momentum for TUI wheel reports: xterm gestures are converted to SGR events and the remote TUI chooses line navigation. iOS Safari/Android Chrome real-device comparisons, GPU context-loss tests and long-session resource tests remain outstanding.

## Dependency PR cleanup / review policy (2026-10-25)

- Dependabot only proposes routine compatible upgrades automatically. The verified `terminal-stack.json` pin set is owner-approved and must not be upgraded package-by-package.
- Mermaid and jsdom major upgrades remain blocked pending license/rendering review and Node runtime-minimum compatibility respectively; do not treat all-green CI as proof a newly raised transitive `engines.node` requirement matches the documented minimum.
- Safe dependency changes require fresh, up-to-date Windows/Ubuntu CI, Windows/Linux installed runtime smoke, Security Audit (including license review), and CodeQL before squash merge.

## Managed Web readiness follow-up (2026-10-25)

- Status refreshes installed CLI discovery instead of caching it until Agent restart.
- Harness readiness is established only by official `dsh web:` startup announcement and a still-live owned child; arbitrary diagnostic URLs do not count.


### Bundled npm for Harness provisioning (2026-10-25)

- Windows/Linux installed Agent packages include npm CLI from the same official Node 24 distribution. Package license file is preserved, npm packages are included in the SBOM and `npmVersion` is recorded in the release manifest. Installed smoke executes the real npm CLI under the bundled Node and matches its version.
- Source mode may still require an available npm installation. No proxy, elevated OS installer or automatic external HTTPS Origin provisioning is added.


### Switching an operator deployment from HTTPS reverse proxy to private VPN HTTP

- Existing `lan` exposure is the explicit profile for direct private/overlay IPv4 HTTP, including access routed through WireGuard. Replace the complete exposure object; do not retain strict-schema reverseProxy listenHost/origins fields. Authentication stays enabled, exact private Origins are derived from host interfaces, and Cookie Secure behavior follows the profile.
- This is operator deployment configuration, not a new product default or Origin bypass. It does not restrict reachability to VPN peers by itself; host firewall/routing policy remains operator-owned. Deployment checks must validate trusted-Origin login plus cookie-authenticated requests, reject an unrelated Origin and unauthenticated access, and reconcile live Sessions after restart.

### Windows managed-app host acceptance (2026-10-26)

- Actual official Code and pinned Harness startup succeeded on isolated ports and the configured 8000/3080 defaults; upstream unauthenticated HTTP remains rejected. Temporary owned trees and listeners were reclaimed after tests; the registered startup task uses Limited/Interactive current-user execution.
- Browser checks covered three themes by two performance modes with reduced motion active, portrait and short landscape, empty/populated workspace cards, lazy frame retention, and a connected terminal remaining mounted/connected across application and theme switches. Upstream phone HTTPS iframe authentication/WebSocket and physical-device keyboard/IME remain unverified until independent domains/proxies exist.

Private gateway bootstrap / 私有网关首次配置：the old private IP HTTP address serves only the public CA certificate/profile and setup page, never login/API/workspace content. 旧私有 IP HTTP 地址仅提供公开证书、描述文件和首次配置页，不提供登录、API 或工作区内容；认证工作台只经 HTTPS 访问。

### Integration closeout validation (2026-10-26)

- The operator confirmed phone access through the private HTTPS/WireGuard setup. Third-party small-screen usability is limited; Terminal remains the main workflow and both embedded tools stay optional. This is general access confirmation, not a claim that all upstream extensions/OAuth/IME combinations passed.
- Owned services start once on the native server listening event. Required private-gateway bootstrap failure explicitly sets a nonzero exit status and closes Agent-owned services. A closed gateway cannot regenerate children during asynchronous startup; independent Workers keep their existing lifetime.
- Source deployment and interactive authorization share a bounded local Agent client. Direct HTTPS connects to the configured local listener while validating the first configured HTTPS Origin identity against the configured certificate chain, with explicit partial-chain trust and certificate/hostname verification enabled. TLS errors fail immediately; no global trust modification or certificate-validation bypass.

- Managed application requests share one real per-IP budget; the same policy object supplies Fastify route metadata for static analysis. The runtime guard remains authoritative and authorization burst rejection is regression-tested. Listener lifecycle setup is distinct from HTTP request hooks; no CodeQL query is disabled or ignored.
