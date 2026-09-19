# Acceptance gates

A coding agent should not declare a repository-wide task complete before the relevant gates pass.

## Static/documentation

```text
pnpm docs:check
pnpm typecheck
```

## Tests

```text
pnpm test
```

Security and reconnect changes should include or update tests for:

- exact Origin rejection
- authentication failure
- input/size bounds
- reconnect sequence behavior
- snapshot fallback
- backpressure or bounded history where practical

## Build

```text
pnpm build
```

For broad changes:

```text
pnpm check
```

## Manual Windows validation before a release

- start `pwsh` through PalmTTY;
- run a Unicode/CJK command;
- start Codex CLI;
- Ctrl+C a foreground command;
- resize the browser;
- close/reopen the browser view without losing PTY;
- switch phone network or background/foreground and reconnect;
- verify stale/new browser state recovers via snapshot;
- verify non-loopback unsafe configuration is rejected;
- verify HTTPS reverse-proxy login with Secure Cookie.

## Review evidence

The task summary should identify:

- code areas changed;
- documentation layers changed;
- tests/build run;
- any acceptance step not executed;
- any newly introduced gap or deferred item.
