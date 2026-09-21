# PalmTTY architecture invariants

These constraints are intentional. A task that needs to break one must explicitly update architecture/security documentation and explain the trade-off.

1. **Shell access is high trust.** PalmTTY is equivalent to remote access as the Agent OS user.
2. **Browser lifetime is not terminal lifetime.** Browser disconnect must not terminate a running PTY.
3. **Agent lifetime is not terminal lifetime.** Each live terminal is owned by an independent Session Worker and must survive restart or replacement of the HTTP/API Agent. This does not imply persistence across OS reboot, logoff, or Worker termination.
4. **The Session Worker owns canonical terminal state.** PTY ownership, headless xterm state, output sequence, replay history and exited-session retention live in the Worker. The Agent is a replaceable control plane and must not recreate a competing canonical terminal state.
5. **Recovery is authenticated local IPC.** Agent↔Worker control uses a per-session high-entropy secret. The secret never reaches the browser and must not appear in argv, URLs, normal logs or terminal environment. Persisted PIDs are metadata, never authority to kill a process. IPC failure alone is not proof that a Worker is dead; recovery capability is Worker-owned state.
6. **Durability begins at authenticated adoption.** A newly spawned Worker is provisional even after READY; it becomes an independent durable Session only after the creator authenticates and sends `adopt`. An unadopted Worker must self-clean its PTY and recovery state after a short creation lease.
7. **All buffers are bounded.** Replay history, WebSocket payloads, Worker IPC frames, terminal dimensions, session counts and slow-client queues need explicit limits.
8. **Workspace authority stays explicit.** Authenticated, exact-Origin Web requests may create/edit/delete persistent workspace definitions, including cwd/runtime/shell/startup command. The directory picker may enumerate directories only through a bounded read-only API for the selected Host/WSL runtime; it must not expose file contents or become a general filesystem API. Session creation itself accepts only a workspace ID, and the Web workspace model must not expose arbitrary environment-variable injection. Workspace launch targets are validated on mutation and again before Worker bootstrap.
9. **Authentication and Origin are separate controls.** A browser terminal connection requires both. Origin never replaces authentication.
10. **No secrets in URLs.** Login secrets/tokens and Worker capabilities must not be query parameters.
11. **No terminal content in default logs.** Input, output, AI prompts, access tokens, Worker secrets and workspace environment values are sensitive.
12. **No silent elevation.** Workers and PTYs inherit normal-user privileges; PalmTTY does not silently elevate them.
13. **The terminal core is AI-vendor-neutral.** Codex, Claude Code, OpenCode or other CLI agents remain workloads, not core protocol dependencies.
14. **Documentation is part of done.** Behavior-changing work must run the docs-sync workflow and keep all four layers consistent.
