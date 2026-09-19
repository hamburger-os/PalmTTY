# Roadmap

PalmTTY is planned as a sequence of usable vertical slices. Each milestone must leave the project in a state that can be tested end-to-end.

## M0 — Bootstrap

**Goal:** establish contracts before terminal code spreads across the repository.

Deliverables:

- pnpm TypeScript monorepo;
- `apps/agent`, `apps/web`, `packages/protocol`, `packages/config`;
- lint/format/test commands;
- GitHub Actions on Windows and Linux;
- Zod configuration schema;
- protocol types;
- development configuration;
- architecture/security docs.

Exit criteria:

- clean install from a fresh clone;
- `pnpm lint`, `pnpm test`, and `pnpm build` pass;
- no PTY implementation required yet.

## M1 — Windows local terminal

**Goal:** prove the core Windows architecture.

Deliverables:

- Agent starts on Windows 11;
- PowerShell 7 resolution;
- `node-pty` ConPTY session;
- create/list/attach/terminate API;
- xterm.js terminal;
- terminal resize;
- Ctrl+C;
- Unicode/CJK round trip;
- basic terminal state snapshot;
- Agent process keeps shell alive when browser disconnects.

Exit criteria:

- from a phone on the same trusted network, open PalmTTY and run commands in PowerShell;
- refresh the browser and reattach without killing the PowerShell process;
- run `codex` as an ordinary interactive CLI.

## M2 — Mobile-first experience

**Goal:** make it genuinely pleasant on a phone.

Deliverables:

- workspace launcher;
- session cards/status;
- sticky special-key toolbar;
- Ctrl/Alt modifier behavior;
- multiline prompt composer;
- connection-state UI;
- reconnect with sequence/snapshot recovery;
- PWA manifest/service worker;
- responsive portrait/landscape modes;
- iOS safe-area and visual-viewport handling;
- clipboard UX.

Exit criteria:

- normal Codex interaction can be completed without requiring a hardware keyboard;
- background/foreground and network switching recover cleanly.

## M3 — Secure self-hosting

**Goal:** graduate from trusted-LAN development to a defensible home deployment.

Deliverables:

- built-in auth decision and implementation, or hardened trusted-auth-proxy mode;
- exact Origin allowlist;
- login/session expiry;
- rate limiting;
- config secret redaction;
- security diagnostics;
- public-bind warnings;
- reverse proxy guide;
- QNAP/Caddy example;
- Tailscale/private-network guide;
- GitHub private vulnerability reporting.

Exit criteria:

- documented deployment behind HTTPS;
- security checklist in `SECURITY.md` completed;
- threat-model tests cover auth/origin boundaries.

## M4 — Durable session workers

**Goal:** separate web/API process lifetime from terminal process lifetime.

Deliverables:

- one local worker per PTY session;
- Windows named-pipe IPC;
- worker authentication secret;
- Agent re-discovers workers after restart;
- worker heartbeat/orphan cleanup;
- per-worker crash isolation;
- persisted session metadata.

Exit criteria:

- restart the PalmTTY Agent while a PowerShell/Codex session is running;
- reconnect through the restarted Agent to the same live PTY.

A Windows reboot is not required to preserve sessions in this milestone.

## M5 — Cross-platform adapters

**Goal:** preserve Windows quality while adding other hosts.

Deliverables:

- Linux PTY adapter;
- macOS PTY adapter;
- optional WSL workspace adapter on Windows;
- shell discovery abstraction;
- platform CI matrix;
- platform-specific install docs.

Exit criteria:

- same browser protocol works across supported host adapters.

## M6 — Developer control plane

Possible post-MVP features:

- Git status/diff viewer optimized for mobile;
- localhost service links/previews;
- file tree and read-only preview;
- image/screenshot upload into a workspace;
- Wake-on-LAN integration;
- push notifications for agent prompts/completion;
- workspace command palette;
- explicit AI CLI profiles without vendor lock-in.

These features should remain optional layers above the terminal core.

## Release strategy

Suggested tags:

- `v0.1.0-alpha.1`: M1 core local terminal;
- `v0.2.0-alpha.1`: M2 mobile UX;
- `v0.3.0-beta.1`: M3 secure self-hosting;
- `v0.4.0`: M4 durable workers;
- `v1.0.0`: stable protocol/config, documented upgrade policy, at least Windows production support.

## Explicit non-goals before v1.0

- multi-tenant hosting;
- central PalmTTY cloud relay;
- remote desktop;
- full browser code editor;
- collaborative shared shell;
- automatic administrator privilege;
- Windows reboot persistence.
