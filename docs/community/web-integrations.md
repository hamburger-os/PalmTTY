<!-- bilingual -->
# Independent Web applications / 独立 Web 应用

## English

PalmTTY always displays **code-server** and **DeepSeek Harness** on the home screen. Their status types are defined once in `@palmtty/protocol`. The no-store `GET /api/v1/integrations` needs authentication, and the single-purpose `POST /api/v1/integrations/:id/ensure` additionally requires an exact trusted Origin.

- **code-server**: The Agent detects known CLI paths and PATH entries. code-server remains an independently installed, launched and authenticated service. A configured external URL creates a navigation entry, not a health check or a process manager. This integration is for the open-source code-server, **not** Microsoft's official `code serve-web`.
- **Harness**: The Agent may install pinned `@deepseek-ai/dsh@0.2.1-rc.2` in user data using npm, then launch its own child on `127.0.0.1:0`. Native Windows/Linux packages bundle npm with Node 24; source installations need host npm. Readiness requires an official `dsh web:` line and a live owned child. A partial installation does not erase a failed state during status polling; retry is explicit.
- **Security**: Both are independent browser security principals. Never route third-party JavaScript through the PalmTTY login Origin. Only authenticated same-machine `local` access can receive Harness's upstream one-time launch token. Remote browsers get neither this token nor the workstation loopback URL. The URL config does not create a safe remote proxy or upstream session.
- **Remote DSH**: Independently served DSH behind an HTTPS proxy needs its upstream `--public-url` and `--trusted-host` setup, plus authenticated access. PalmTTY's managed loopback instance does not provision that proxy.

```yaml
integrations:
  codeServer: "https://code.example.test/"
  harness: "https://harness.example.test/"
```

Use HTTPS except loopback HTTP, without credentials, query or fragment. Real phone HTTPS use, browser Codex extensions, online Harness provisioning and full Windows process-tree shutdown require real-host validation.

## 中文

PalmTTY 首页展示独立的 **code-server** 和 **DeepSeek Harness**，不依赖 Workspace。服务端身份和状态结构以协议包为唯一来源；只读状态需要认证，安装/重试还要校验 Origin。

- **code-server**：扫描常见安装位置，只展示检测结果和部署者提供的安全外部 URL。不会自动安装、启动或接管服务；自己的认证、工作区与 HTTPS 由上游和部署者负责，不再把微软官方 `code serve-web` 当成 code-server。
- **Harness**：自动寻找 CLI；缺失时使用锁定版本和用户目录安装、启动回环 Web。安装版自带 Node 24 与 npm，源码版需额外 npm。失败状态不会因留下部分文件被轮询覆盖；启动要求官方 `dsh web:` 就绪行和存活子进程。
- **跨设备安全**：两款上游绝不代理进 PalmTTY 登录 Origin，也不共用 Cookie 或密钥。DSH 的一次性本机授权链接只发给已登录的同机 local 浏览器，手机/NAS 不会收到。
- **远程使用**：需分别部署受保护 HTTPS Origin，并完成上游认证和反向代理。DSH 额外需要官方 `--public-url` 与 `--trusted-host` 设置。配置外部 URL 只是提供入口，不代表手机已能直接使用。

## Workspace upgrade / 工作区迁移

Stop the Agent, back up V3, build `@palmtty/protocol`, then run `node scripts/migrate-workspaces-v4.mjs --from <v3-path> --to <v4-path>`. The tool validates the canonical schema, publishes output atomically without overwriting V4, and retains V3. / 旧 V3 需备份后手动离线导出为 V4；运行时没有双版本兼容。

## Distribution / 发行包

Windows/Linux releases include npm copied from the same official Node 24 distribution with license, SBOM and installed-runtime smoke verification. Registry access, a separate HTTPS Origin and independent authentication are not covered by this smoke. / 正式安装包已验证自带 npm 可以执行，但真实 DSH 下载安装和手机端访问仍需人工验收。
