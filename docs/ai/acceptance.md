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
- stale recovery metadata cleanup without PID-based process killing
- detached Worker survival after the creator Agent process exits
- auth-session expiry closing established sockets
- backpressure / slow-client cutoff
- exit delivery and retained-session cleanup
- concurrent maxSessions enforcement

The Agent suite includes:

- end-to-end Fastify HTTP/WebSocket + Worker IPC coverage with deterministic PTYs;
- a real detached-process integration test where one Agent process creates a Worker and exits, and another Agent later rediscovers the same live terminal;
- Windows CI coverage using real node-pty + PowerShell 7 / ConPTY and Unicode.

## Build

~~~text
pnpm build
~~~

For broad changes:

~~~text
pnpm check
~~~

## Manual Windows validation before a release

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
