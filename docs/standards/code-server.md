# code-server and DeepSeek Harness upstream references

- code-server installation by platform: <https://coder.com/docs/code-server/install>. Verify supported OS/architecture for the selected release. Windows support and binary availability can vary across versions.
- code-server secure exposure and authentication: <https://coder.com/docs/code-server/guide>. Default to loopback and upstream password authentication; a public editor should use an independently protected HTTPS Origin.
- DeepSeek Harness official CLI: <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cli-help.md>. Web supports `--host`, random `--port 0`, `--no-open`, `--public-url`, and `--trusted-host`. Proxy Host trust and URL advertisement are separate from authentication.
- Official Microsoft VS Code Server: <https://code.visualstudio.com/docs/remote/vscode-server>. Microsoft's `code serve-web` is a different product/license from open-source code-server, and is not the managed IDE offered by this integration.
