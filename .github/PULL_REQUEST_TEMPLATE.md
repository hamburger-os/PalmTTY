## Summary

<!-- What changed and why? Keep this focused. -->

## Validation

- [ ] `pnpm check` passes locally, or I explained why local execution is unavailable.
- [ ] Dependency manifest changes include an updated `pnpm-lock.yaml`.
- [ ] New behavior has tests at the appropriate boundary.
- [ ] Windows-specific terminal behavior is covered by Windows CI where applicable.

## Architecture / security review

- [ ] This change does not log terminal input/output, access tokens, cookies or workspace environment secrets.
- [ ] Remote callers still cannot submit arbitrary cwd, shell executable or environment authority.
- [ ] Authentication and Origin validation remain separate controls.
- [ ] New buffers, caches or long-lived maps are explicitly bounded.
- [ ] I did not claim Agent-restart persistence unless independent session workers implement and test it.

## Documentation

- [ ] I reviewed `docs/ai/current-state.md`.
- [ ] I updated the relevant Owner/Community docs for behavior-changing work.
- [ ] `pnpm docs:check` passes.

## User-visible notes

<!-- Screenshots, terminal output, migration notes, or "none". Redact secrets. -->
