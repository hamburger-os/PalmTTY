# Acceptance gates

A coding agent should not declare a repository-wide task complete before the relevant gates pass.

## Static/documentation

~~~text
pnpm docs:check
pnpm typecheck
~~~

## Tests

~~~text
pnpm test
~~~

Security, session and reconnect changes should include or update tests for:

- exact Origin rejection
- authentication failure
- required WebSocket subprotocol
- resume-before-input/resize ordering
- input/size bounds
- browser disconnect without PTY termination
- reconnect sequence replay
- stale-history snapshot fallback
- Agent restart without PTY termination
- Worker rediscovery using authenticated local IPC
- wrong Worker secret rejection
- preservation of potentially-live recovery state when Worker death cannot be proven
- Worker self-healing of missing recovery artifacts and fail-closed handling of conflicting recovery authority
- unadopted Worker creation-lease cleanup, idempotent adoption across controller reconnects, and lost-adoption-result recovery
- detached Worker survival after the creator Agent process exits
- auth-session expiry closing established sockets
- backpressure / slow-client cutoff
- exit delivery and retained-session cleanup
- concurrent maxSessions enforcement

The Agent suite includes:

- end-to-end Fastify HTTP/WebSocket + Worker IPC coverage with deterministic PTYs;
- a real detached-process integration test where one Agent process creates a Worker and exits, and another Agent later rediscovers the same live terminal;
- Windows CI coverage using real node-pty + PowerShell 7 / ConPTY and Unicode, while local Windows checks may use Windows PowerShell for generic ConPTY/process coverage;
- workspace-runtime coverage for absolute shell resolution and actionable preflight failures.

## Build

~~~text
pnpm build
~~~

For broad changes:

~~~text
pnpm check
~~~

## Host runtime preflight

On a configured PalmTTY host, before `dev`/`start` or release validation:

~~~text
pnpm run preflight
~~~

This requires the intended PalmTTY config and authentication environment. It is not a generic CI/contributor prerequisite. The explicit `run` form is required because pnpm 10 has its own built-in `doctor` command; PalmTTY deliberately names its host check `preflight` to avoid command dispatch ambiguity.

## Manual Windows validation before a release

- run `pnpm run preflight` with the intended config/token and confirm every workspace resolves its shell successfully;

- start pwsh through PalmTTY;
- run a Unicode/CJK command;
- start Codex CLI;
- Ctrl+C a foreground command;
- resize the browser;
- close/reopen the browser view without losing PTY;
- restart only the PalmTTY Agent, sign in again and return to the same live Session;
- switch phone network or background/foreground and reconnect;
- verify stale/new browser state recovers via snapshot;
- verify non-loopback unsafe configuration is rejected;
- verify HTTPS reverse-proxy login with Secure Cookie;
- inspect the per-user Worker runtime directory and confirm secret/record files are not exposed through the browser or logs.

## Review evidence

The task summary should identify:

- code areas changed;
- documentation layers changed;
- tests/build run;
- whether Windows and Ubuntu CI passed;
- any acceptance step not executed;
- any newly introduced gap or deferred item.
