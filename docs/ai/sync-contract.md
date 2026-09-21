# Code ↔ documentation sync contract

Use this map after every implementation change.

| Code area | Owner docs | Community docs | Standards review |
|---|---|---|---|
| `apps/agent/src/session-manager.ts`, `session-runtime.ts`, `session-worker.ts`, `worker-*.ts` | `session.md`, `reconnect.md`, `security.md` | `architecture.md`, `security.md` | terminal runtime if IPC/runtime assumptions changed |
| `apps/agent/src/auth.ts`, `security.ts`, security hooks | `security.md` | `security.md` | WebSocket/security references |
| `apps/agent/src/app.ts` HTTP/WS behavior | `agent.md`, possibly `reconnect.md` | `architecture.md`, `security.md` | RFC/WebSocket if protocol semantics changed |
| `packages/protocol` | relevant module | `architecture.md` | RFC only for external protocol assumptions |
| `packages/config` or examples | `agent.md`, `deployment.md`, `security.md` | `getting-started.md`, `security.md` | normally none |
| workspace store/runtime adapters/API | `agent.md`, `session.md`, `security.md`, `roadmap.md` | `architecture.md`, `getting-started.md`, `security.md` | OS/runtime references when assumptions change |
| `apps/web` | `web-mobile.md`, possibly `reconnect.md` | architecture/getting-started as needed | xterm upstream only if assumptions changed |
| deployment/reverse proxy | `deployment.md`, `security.md` | `security.md`, `getting-started.md` | security references |
| session worker lifecycle / IPC / recovery metadata | `session.md`, `reconnect.md`, `security.md`, `roadmap.md` | `architecture.md`, `security.md` | Windows/Node runtime references |
| GitHub workflows, dependency policy, release/governance files | `github-governance.md`, `roadmap.md` | `development.md` if contributor-visible | normally none |
| roadmap/completion status | `roadmap.md` | README if contributor-facing | none |

## Always update

Every behavior-changing task reviews:

- `docs/ai/current-state.md`
- the relevant owner module
- security/reconnect docs when either boundary is touched

## Index rule

Adding or moving a Markdown file requires updating that layer's `README.md`. Adding/moving a layer requires updating `docs/README.md`.

## Language rule

- `docs/owner/`: Chinese.
- `docs/community/`: English + 中文 in the same document and `<!-- bilingual -->` marker.
- `docs/standards/`: source-oriented, concise, language unrestricted.
- `docs/ai/`: optimized for unambiguous machine execution/review.
