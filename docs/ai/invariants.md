# PalmTTY architecture invariants

These constraints are intentional. A task that needs to break one must explicitly update architecture/security documentation and explain the trade-off.

1. **Shell access is high trust.** PalmTTY is equivalent to remote access as the Agent OS user.
2. **Browser lifetime is not terminal lifetime.** Browser disconnect must not terminate a running PTY.
3. **Current persistence claim is disconnect-only.** Agent restart persistence is forbidden as a product claim until independent session workers exist and are tested.
4. **The Agent owns canonical terminal state.** Reconnect uses a server-side headless terminal snapshot plus bounded sequenced replay.
5. **All buffers are bounded.** Replay history, WebSocket payloads, terminal dimensions, session counts and slow-client queues need explicit limits.
6. **Workspace authority is local configuration.** Remote callers select a workspace ID; they do not provide arbitrary cwd, executable, or environment authority.
7. **Authentication and Origin are separate controls.** A browser terminal connection requires both. Origin never replaces authentication.
8. **No secrets in URLs.** Login secrets/tokens must not be query parameters.
9. **No terminal content in default logs.** Input, output, AI prompts, access tokens and workspace environment values are sensitive.
10. **No silent elevation.** PTYs inherit Agent privileges; the Agent is intended to run as a normal user.
11. **The terminal core is AI-vendor-neutral.** Codex, Claude Code, OpenCode or other CLI agents remain workloads, not core protocol dependencies.
12. **Documentation is part of done.** Behavior-changing work must run the docs-sync workflow and keep all four layers consistent.
