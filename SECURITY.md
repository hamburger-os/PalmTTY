# Security Policy / 安全策略

PalmTTY exposes an interactive shell. Treat every security issue as potentially equivalent to workstation access.

PalmTTY 会提供交互式 Shell。任何安全问题都应按“可能获得开发电脑权限”的级别处理。

Please read [docs/community/security.md](docs/community/security.md) and the reference layer under [docs/standards/](docs/standards/).

请不要在公开 Issue 中披露尚未修复的可利用细节。若仓库的 **Security → Report a vulnerability** 可用，请优先使用 GitHub 私密漏洞报告；否则只公开不含利用细节的影响摘要。

The current alpha is intended for a private network or an authenticated HTTPS reverse proxy. Direct unauthenticated Internet exposure is unsupported.
