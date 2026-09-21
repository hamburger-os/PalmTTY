# PalmTTY agent instructions

PalmTTY treats documentation as part of the implementation contract.

Before changing code, read `docs/ai/README.md`, `docs/ai/invariants.md`, `docs/ai/current-state.md`, and the relevant module in `docs/owner/`.

Security and reconnect/session-continuity behavior are architecture-critical. Do not weaken them for convenience.

After any behavior, architecture, configuration, protocol, security, deployment, session, reconnect, mobile UX, or roadmap change, use `.agents/skills/docs-sync/SKILL.md` and update the matching documentation layers.

Visual/theme work must follow `.agents/skills/palmtty-theme/SKILL.md`, the single source of truth for PalmTTY material, theme, motion and rendering-performance rules. Before completing a visual change, run the review procedure in `.agents/skills/palmtty-theme-review/SKILL.md`. Do not copy TauTerm component structure or keep parallel theme specifications in `docs/`.

A task is not complete until code and documentation agree and `pnpm docs:check` passes.

Never log terminal input/output, secrets, access tokens, or workspace environment values by default. Never silently elevate PalmTTY. Workspace CRUD is an intentional authenticated persistent mutation surface; do not bypass it by adding ad-hoc cwd/shell/env authority to Session creation.
