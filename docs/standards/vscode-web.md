# Official Microsoft VS Code Web and DeepSeek Harness references

- Microsoft VS Code Server / CLI `serve-web`: <https://code.visualstudio.com/docs/remote/vscode-server>. Relevant CLI flags include `--host`, `--port`, `--default-folder`, `--server-data-dir` and `--connection-token-file`.
- Self-hosted VS Code Web security advisory: <https://github.com/microsoft/vscode/security/advisories/GHSA-v282-cxqj-xgj4>. Preserve connection-token protection and apply patched versions.
- Official DeepSeek Harness Web: <https://github.com/deepseek-ai/deepseek-harness>. Its own Web implementation maintains workspaces, sessions and authentication.
- Browser mobile support, optional Codex extension, folder deep routing and Windows `serve-web` Ctrl+C child-process cleanup require actual-host verification; PalmTTY does not assume these are upstream guarantees.


## Managed app constraints (2026-10)

- Microsoft VS Code Server official FAQ: <https://code.visualstudio.com/docs/remote/vscode-server>. It explicitly prohibits hosting the server as a service; discovery does not grant permission to daemonize it.
- DeepSeek Harness official CLI help: <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cli-help.md>. Web supports `--host`, `--port 0` and `--no-open`; it prints a token-bearing launch URL for first-party browser authentication. Host/trusted-host controls are not substitutes for authentication.
- Managed DSH installer targets a verified pinned npm release in a private staging directory, not mutable `latest`; remote access with an isolated Origin is an independent trust boundary. External reverse proxies must configure upstream `--public-url` and `--trusted-host` and retain independent authentication.
