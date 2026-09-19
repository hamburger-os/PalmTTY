---
name: docs-sync
description: Synchronize PalmTTY's four documentation layers after code, architecture, protocol, configuration, security, session/reconnect, deployment, UI, or roadmap changes. Use before completing any implementation or review task that changes repository behavior.
license: Apache-2.0
metadata:
  version: "1.0.0"
---

# PalmTTY documentation sync

Documentation is part of PalmTTY's acceptance contract. Never finish a behavior-changing task with code-only changes.

## Required workflow

1. Inspect the actual changed files and observable behavior. Do not document planned behavior as implemented.
2. Read `docs/ai/sync-contract.md` and use its code-to-document map.
3. Update the AI layer first:
   - `docs/ai/current-state.md` for implementation status and known gaps.
   - `docs/ai/invariants.md` only when an architectural invariant intentionally changes.
4. Update the owner layer in `docs/owner/` when architecture, security, reconnect semantics, deployment, or a module boundary changes. Owner documents are Chinese and stay at architecture/design level rather than line-by-line implementation detail.
5. Update the community layer in `docs/community/` for contributor-visible API, setup, architecture, security, or workflow changes. Community documents must remain bilingual (English + 中文).
6. Update `docs/standards/` only when the external authoritative basis, version, or project interpretation changes. Never rewrite an external standard to match PalmTTY implementation.
7. Update affected README indexes when adding, moving, or removing documents.
8. Run `pnpm docs:check`, then the relevant tests; for a repository-wide change run `pnpm check`.
9. In the final task summary, name both code and documentation areas changed.

## Mandatory rules

- Security behavior and reconnect/session semantics always require documentation review.
- Never claim Agent-restart persistence unless independent session workers are actually implemented and tested.
- Never put secrets, real access tokens, private hostnames, or personal filesystem paths into documentation examples.
- Keep owner documentation concise enough for architecture review.
- Keep AI documentation explicit about invariants, current implementation, and known gaps.
- Community documentation must use the marker `<!-- bilingual -->` and contain both English and 中文 sections.
- If code and docs disagree, treat the code as evidence of current behavior and either fix the code or update the status document; do not hide the mismatch.
