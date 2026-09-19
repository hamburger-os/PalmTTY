# PalmTTY documentation

PalmTTY documentation is deliberately split into four layers. Each layer has a different audience and authority.

| Layer | Audience | Purpose |
|---|---|---|
| [community/README.md](community/README.md) | Community developers | Bilingual contributor-facing setup, architecture, security and development guidance |
| [standards/README.md](standards/README.md) | Everyone | External authoritative standards and upstream references that PalmTTY relies on |
| [owner/README.md](owner/README.md) | Project owner | Chinese architecture-review documents for checking AI-delivered work without reading every line of code |
| [ai/README.md](ai/README.md) | Coding agents | Explicit invariants, current implementation state, acceptance rules and documentation-sync contract |

## Authority order

When information conflicts:

1. external facts belong in `docs/standards/` and must match authoritative upstream sources;
2. implemented behavior is evidenced by code and tests;
3. `docs/ai/current-state.md` must reflect the implementation honestly;
4. owner/community documents explain that behavior for their audiences.

A plan must never be presented as already implemented.

## Documentation synchronization

Repository agents must follow [`.agents/skills/docs-sync/SKILL.md`](../.agents/skills/docs-sync/SKILL.md). CI runs `pnpm docs:check` to enforce the document indexes and language-layer contract.
