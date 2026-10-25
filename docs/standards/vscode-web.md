# Official VS Code Web and DSH references

- Microsoft VS Code Server / CLI `serve-web`: <https://code.visualstudio.com/docs/remote/vscode-server>. Relevant CLI flags include `--host`, `--port`, `--default-folder`, `--server-data-dir` and `--connection-token-file`.
- Self-hosted VS Code Web security advisory: <https://github.com/microsoft/vscode/security/advisories/GHSA-v282-cxqj-xgj4>. Preserve connection-token protection and apply patched versions.
- Official DeepSeek Harness Web: <https://github.com/deepseek-ai/deepseek-harness>. Its own Web implementation maintains workspaces, sessions and authentication.
- Browser mobile support, optional Codex extension, link deep routing and Windows `serve-web` Ctrl+C child-process cleanup require actual-host verification; they are not upstream guarantees assumed by PalmTTY.
