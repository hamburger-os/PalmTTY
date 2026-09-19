# Contributing to PalmTTY

PalmTTY is early-stage. Contributions are welcome, but the project is deliberately keeping its first milestones narrow.

## Before opening code

Please read:

- [README.md](README.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/PROTOCOL.md](docs/PROTOCOL.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)

For architecture-changing work, open or join an issue before a large implementation PR.

## Priorities

The current priority order is:

1. Windows 11 / PowerShell 7 correctness;
2. reliable session lifecycle;
3. mobile terminal UX;
4. security boundaries;
5. portability.

A cross-platform abstraction should not make the initial Windows path harder to reason about.

## Development conventions

Planned stack:

- TypeScript;
- pnpm workspaces;
- React/Vite for web;
- Node.js for the Agent;
- Zod for shared schemas;
- Vitest/Playwright for tests.

Exact versions will be pinned when M0 is implemented.

## Pull requests

Prefer small PRs that complete one vertical behavior.

A PR should include tests for changed protocol/config/session behavior when practical.

Avoid introducing:

- hidden telemetry;
- cloud-only dependencies;
- command logging;
- credentials in URLs;
- direct privilege escalation;
- AI-vendor-specific assumptions in the terminal core.

## Security issues

Do not publish exploit details for an unpatched vulnerability in a public issue. See [docs/SECURITY.md](docs/SECURITY.md).

## Commit style

Conventional-style prefixes are encouraged:

- `feat:`
- `fix:`
- `docs:`
- `test:`
- `refactor:`
- `chore:`

They are not a substitute for a clear commit message.
