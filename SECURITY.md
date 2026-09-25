# Security Policy / 安全策略

PalmTTY exposes an interactive shell. Treat every security issue as potentially equivalent to workstation access.

PalmTTY 会提供交互式 Shell。任何安全问题都应按“可能获得开发电脑权限”的级别处理。

## Supported versions / 支持范围

PalmTTY is alpha software with tagged releases. Security fixes target the latest tagged release and the latest `main` branch; older `0.x` releases are not maintained as separate security branches unless a release note explicitly says otherwise.

PalmTTY 当前为已有 Tag 的 Alpha 软件。安全修复面向最新已发布版本与最新 `main`；除非 Release Notes 明确说明，否则不会为旧的 `0.x` 版本单独维护安全分支。

## Reporting a vulnerability / 报告漏洞

**Do not open a public Issue with exploitable details.**

Use GitHub **Security → Report a vulnerability** / private vulnerability reporting when it is available for this repository. Include:

- affected commit/version;
- impact and required attacker position;
- minimal reproduction;
- whether secrets, terminal contents or remote command execution are involved;
- any suggested mitigation.

If private reporting is unavailable, publish only a non-exploitable impact summary and ask the maintainer for a private contact channel before sharing details.

请不要在公开 Issue 中发布尚未修复的利用步骤、凭据、终端内容或可直接复现的攻击代码。

## Response expectations

The maintainer will prioritize credible remote-shell, authentication, Origin-bypass, privilege-boundary, secret-exposure and persistence issues. Exact response times are not guaranteed during alpha, but security reports take precedence over normal feature work.

## Deployment boundary

The current alpha is intended for a private HTTPS entry point or an authenticated HTTPS reverse proxy. Direct unauthenticated Internet exposure is unsupported.

Read [docs/community/security.md](docs/community/security.md) for the implementation security model.
