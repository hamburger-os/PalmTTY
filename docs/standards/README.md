# Authoritative standards and upstream references

This layer records the external technical basis used by PalmTTY. It is not a place for project wishes or implementation status.

- [websocket-security.md](websocket-security.md) — RFC 6455 and OWASP WebSocket security guidance
- [terminal-runtime.md](terminal-runtime.md) — Microsoft ConPTY, PowerShell, WSL, node-pty and xterm.js
- [agent-skills.md](agent-skills.md) — Agent Skills / SKILL.md format used by the repository
- [git-cli.md](git-cli.md) — Git porcelain v2, diff helper controls, hooks path and transport protocol policy
- [autostart.md](autostart.md) — Microsoft Task Scheduler and systemd user-service behavior used by PalmTTY autostart

## Rule

When PalmTTY behavior differs from an external source, document the difference in the owner/AI layers. Do not rewrite this layer to make the implementation appear compliant.

Last reviewed: 2026-09-22.
