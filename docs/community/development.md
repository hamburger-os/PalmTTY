<!-- bilingual -->
# Development workflow / 开发工作流

## English

### Before changing code

Read:

1. [../ai/invariants.md](../ai/invariants.md)
2. [../ai/current-state.md](../ai/current-state.md)
3. the relevant owner-facing module under [../owner/README.md](../owner/README.md)

### Before finishing

Run:

```powershell
pnpm docs:check
pnpm typecheck
pnpm scripts:check
pnpm terminal:check
pnpm test
pnpm build
```

For a repository-wide change, `pnpm check` runs the static/test/build acceptance path. When validating a real PalmTTY host, run `pnpm run preflight` separately; it is a machine-specific runtime preflight that depends on the local config/token and validates auth/security configuration plus Agent TCP endpoint bindability. Workspace/runtime validation belongs to the managed workspace API and Session creation path rather than Agent startup. CI installs with `pnpm install --frozen-lockfile` on Windows and Ubuntu. The Agent test suite exercises Fastify HTTP/WebSocket plus the authenticated Session Worker IPC boundary end to end, including replay/snapshot recovery, Agent restart rediscovery, explicit terminal replacement restart, wrong Worker-secret rejection, fresh workspace-environment handling, stale recovery cleanup, backpressure, auth expiry, exited-session cleanup and concurrent session limits. A separate detached-process test proves a Worker survives the complete exit of the Agent process that created it. Windows CI additionally performs a real node-pty + PowerShell 7/ConPTY Unicode smoke test. Local Windows checks prefer `pwsh.exe` when installed and otherwise use Windows PowerShell for generic ConPTY/Worker-process integration coverage, so `pnpm check` does not require an extra shell installation. Runtime executable discovery treats the current user's `%LOCALAPPDATA%\Microsoft\WindowsApps` directory specially because MSIX App Execution Aliases are reparse points that normal Node file traversal can reject even though Windows can launch them. The root development launcher reads the validated PalmTTY config after preflight, derives the local Agent URL from its exposure profile, injects it into the Web dev process as `PALMTTY_AGENT_URL`, and keeps the Agent on that profile. Vite uses strict port 5173 and listens on `0.0.0.0` by default. The launcher generates exact development Origins from current private/overlay IPv4 interfaces and injects them only into the `--development` Agent at runtime, so LAN testing does not mutate the production exposure profile. On Windows the launcher also enables content-free Worker/PTTY spawn phase tracing by default so a visible console flash can be correlated to a lifecycle stage without logging argv, environment values or terminal I/O. Web tests/build do not load host runtime config. Update `pnpm-lock.yaml` whenever dependency manifests change. Root `scripts:test` also exercises autostart task/unit generation; on Windows CI it compiles the real C# `WindowsApplication` host, verifies the PE GUI subsystem, executes a fixture Agent, checks exit-code propagation, and proves detached Worker breakaway. Agent tests cover strict environment-file parsing. Platform registration itself remains a real-host acceptance path because CI must not modify the runner's Task Scheduler/systemd user configuration.

### Distribution development

Normal contributor checks do not publish installers. The release packager is nevertheless repository code and its scripts are syntax-checked by `pnpm scripts:check`.

After a full `pnpm build`, a platform-native runtime can be assembled locally with:

~~~text
pnpm package:runtime -- --out <directory> --platform <win32|linux> --arch x64
pnpm package:smoke -- --root <directory>
~~~

On Linux, `pnpm package:deb -- --root <directory> --out <file.deb>` builds the Debian wrapper. Windows installer creation is owned by the Release workflow and `packaging/windows/PalmTTY.iss`. The runtime packager deliberately uses the current platform and architecture; cross-compiling native `node-pty` release trees is not supported.

Do not add repository paths or globally installed Node/pnpm assumptions to installed-runtime code. `release-manifest.json` is the installed-layout sentinel; source mode remains the fallback only when that manifest is absent.

### Terminal dependency policy

`terminal-stack.json` is the repository source of truth for the browser/Worker xterm family. Every `@xterm/*` entry in `apps/web` and `apps/agent` is exact-pinned and checked by `pnpm terminal:check`; dependency-manifest changes must update the frozen lockfile in the same commit. The browser currently uses `@xterm/xterm 6.1.0-beta.304` with `@xterm/addon-fit 0.12.0-beta.301` because xterm 6.0.0 has an upstream touch-scroll regression. The Worker intentionally remains on stable `@xterm/headless 6.0.0` + `@xterm/addon-serialize 0.14.0` until a separate recovery/snapshot qualification justifies moving it. Mobile scrolling must stay xterm-owned: PalmTTY may suppress browser panning on `.xterm-screen`, but must not add an application touch handler, row-quantized scroll shim, document-level gesture handler, or second scroll viewport. A normal click/tap may synchronously call `terminal.focus()` (and the key bar may expose a keyboard-focus control) because focus activation is not scroll physics; do not turn that bridge into a touch recognizer. Every editable control on coarse-pointer/mobile layouts must stay at 16px or larger, including compact selects, login/Git inputs, long-input textareas and xterm's hidden helper textarea. SessionWorkbench, not TerminalView, owns the current VisualViewport presentation geometry at every zoom level; browser chrome/soft-keyboard changes must resize the whole workbench and reach FitAddon only through the terminal mount ResizeObserver. Never use `visualViewport.scale !== 1` to disable framing and never programmatically reset user pinch zoom. Keep the visual `terminal-frame` separate from the padding-free `terminal-mount` used by FitAddon, and keep the xterm viewport remainder on the same theme background. Dense workbench regions should also have one deliberate vertical scroll owner; the Git sidebar owns its groups/lists/tools rather than nesting additional scrollers. Mobile keybar additions must go through the shared terminal-key encoder instead of component-local escape strings. Keep Enter in the core row, keep Ctrl/Alt one-shot semantics consistent between xterm typed input and virtual navigation, and place lower-frequency keys in the expandable second horizontal row rather than creating another vertical scroll region.

Any behavior-changing PR must use the documentation-sync workflow in `.agents/skills/docs-sync/SKILL.md`. Security, session lifecycle, reconnect behavior, protocol and configuration changes always require a documentation review.

For a release PR, also run `pnpm license:check` and `pnpm release:check -- X.Y.Z`. Publication is performed only by **Actions → Release** from protected `main`; the workflow pins one source SHA, re-runs Windows/Ubuntu CI, vulnerability/license checks and CodeQL, and creates the annotated tag/GitHub Release only after those automated gates pass. Real-device/deployment checks remain recommended operator evidence and are not represented by a release checkbox.

### Contribution principles

- Keep the terminal core vendor-neutral; Codex is a supported workload, not a protocol dependency.
- Prefer small, testable boundaries.
- Do not add terminal I/O logging for debugging.
- Treat workspace CRUD as a high-trust remote mutation surface; keep authentication, exact Origin checks, persistence validation and Session creation/restart bound to persisted workspace authority rather than per-Session overrides. Terminal-profile discovery must remain bounded enumeration: known Host shells plus registered WSL distributions, not arbitrary command execution.
- Workspace environment is intentionally supported but bounded and persisted; do not broaden it into arbitrary process execution or a secret-management feature without an architecture/security review.
- Keep Session workbench tools separate from terminal transport. Files remain Workspace-root-scoped and read-only. Git writes are now implemented only through the typed operation contract: preserve expected-state checks, fail closed on incomplete/truncated status, serialize by resolved repository rather than Workspace ID, keep rename-aware pathsets and explicit repository-wide stage-all/unstage-all semantics, preserve diff-snapshot verification for destructive restore, explicit trusted-repository acknowledgement, disabled hooks/interactive prompts, bounded subprocesses, and the prohibition on arbitrary browser-supplied Git argv. Treat normal Git filter execution as trusted repository code, not as sandboxed behavior.
- Distinguish implemented platform adapters from platforms actually exercised in CI.

## 中文

### 修改代码之前

先阅读：

1. [../ai/invariants.md](../ai/invariants.md)
2. [../ai/current-state.md](../ai/current-state.md)
3. [../owner/README.md](../owner/README.md) 中对应的 Owner 模块文档

### 完成任务之前

执行：

```powershell
pnpm docs:check
pnpm typecheck
pnpm scripts:check
pnpm terminal:check
pnpm test
pnpm build
```

仓库级代码质量门禁可以直接执行 `pnpm check`。在真实 PalmTTY 宿主机上做运行验证时，再单独执行 `pnpm run preflight`；它依赖本机 config/token，用于检查认证/安全配置与 Agent TCP 监听端点是否可绑定，不属于通用 CI 门禁。Workspace/运行环境验证由工作区管理 API 与 Session 创建路径负责，不再阻塞 Agent 启动。CI 在 Windows 和 Ubuntu 上使用 `pnpm install --frozen-lockfile` 安装依赖。Agent 测试套件通过真实 Fastify HTTP/WebSocket 与认证后的 Session Worker IPC 边界，端到端覆盖 replay/snapshot、Agent 重启 rediscovery、显式终端替换重启、工作区环境刷新、错误 Worker secret、stale recovery 清理、backpressure、登录过期、退出清理和并发 Session 上限；独立的真实进程测试还验证创建 Worker 的 Agent 进程彻底退出后 Worker 仍存活。Windows CI 另行通过真实 node-pty 强制启动 PowerShell 7/ConPTY 并验证 Unicode 往返。本机 Windows 质量门禁会优先使用 `pwsh.exe`，未安装时退回系统 Windows PowerShell，仅用于通用 ConPTY/Worker 进程集成测试，因此 `pnpm check` 不再要求额外安装 PowerShell 7。运行时可执行文件解析会专门识别当前用户的 `%LOCALAPPDATA%\Microsoft\WindowsApps`；MSIX App Execution Alias 属于特殊 reparse point，Node 的普通文件遍历可能拒绝它，但 Windows 本身仍可通过该 alias 启动应用。PR 还会执行生产依赖漏洞审计、license policy 检查和 CodeQL；受保护的 `main` 必须通过 PR 和四项自动检查。当前 AI 主维护治理模型有意不强制人工 approval，也不强制 Code Owner approval。根开发启动器会在 preflight 后读取已验证的 PalmTTY config，从 exposure profile 推导本地 Agent URL，并以 `PALMTTY_AGENT_URL` 注入 Web dev 进程；Agent 仍按该 profile 监听。Vite 固定使用 strict 5173，并默认监听 `0.0.0.0`。启动器根据当前私有/overlay IPv4 网卡生成精确 development Origins，只在运行时注入 `--development` Agent，因此局域网调试不会改写 production exposure profile。Windows 下根开发启动器还会默认开启不含内容的 Worker/PTTY spawn phase trace，用于把可见 console 闪窗定位到具体生命周期阶段，同时不记录 argv、环境变量值或 terminal I/O。Web 测试/构建不会读取宿主 runtime config。修改依赖清单时必须同步更新 `pnpm-lock.yaml`。根 `scripts:test` 还覆盖自启动 task/unit 生成逻辑；Windows CI 会真实编译 C# `WindowsApplication` host、检查 PE GUI subsystem、执行 fixture Agent、验证退出码传播与 detached Worker breakaway。Agent 测试覆盖严格 env-file 解析；真正向 Task Scheduler/systemd user manager 注册属于真实宿主验收路径，CI 不修改 runner 的系统服务配置。

### 发行包开发

普通 PR 门禁不会发布 installer，但发行脚本本身属于仓库代码，`pnpm scripts:check` 会检查其语法。

完成 `pnpm build` 后，可以在当前平台本机构建 installed runtime：

~~~text
pnpm package:runtime -- --out <目录> --platform <win32|linux> --arch x64
pnpm package:smoke -- --root <目录>
~~~

Linux 可继续执行 `pnpm package:deb -- --root <目录> --out <文件.deb>`。Windows installer 由 Release workflow + `packaging/windows/PalmTTY.iss` 负责。由于 `node-pty` 属于平台原生依赖，正式发行不做跨平台交叉构建。

installed runtime 代码不能重新引入 repo path、全局 Node 或 pnpm 假设。`release-manifest.json` 是安装态布局的 sentinel；只有不存在该 manifest 时才进入源码布局 fallback。

### 终端依赖策略

根目录 `terminal-stack.json` 是浏览器/Worker xterm 家族的版本真源。`apps/web` 与 `apps/agent` 中所有 `@xterm/*` 依赖都必须精确锁版本，并由 `pnpm terminal:check` 检查；修改依赖清单时必须在同一变更中同步 frozen lockfile。浏览器当前使用 `@xterm/xterm 6.1.0-beta.304` + `@xterm/addon-fit 0.12.0-beta.301`，原因是 xterm 6.0.0 存在上游触摸滚动回归；Worker 刻意继续使用稳定的 `@xterm/headless 6.0.0` + `@xterm/addon-serialize 0.14.0`，直到单独完成 snapshot/replay/geometry recovery 验证。手机滚动必须保持 xterm 单一所有权：PalmTTY 可以在 `.xterm-screen` 上阻止浏览器 page pan，但不能再增加应用级 touch handler、逐行滚动 shim、document 级手势处理或第二层滚动 viewport。普通 click/tap 可以同步调用 `terminal.focus()`（keybar 也可以提供键盘 focus 控件），因为 focus 激活不属于滚动物理；不能把这条桥接扩展成 touch recognizer。coarse-pointer/mobile 布局中的所有可编辑控件都必须保持至少 16px，包括紧凑 select、登录/Git 输入、长文本 textarea 与 xterm helper textarea。当前 VisualViewport 的展示几何在所有缩放级别都由 SessionWorkbench（而不是 TerminalView）单独拥有；浏览器栏/软键盘变化必须先调整整个工作台，并且只能通过 terminal mount ResizeObserver 进入 FitAddon。不能用 `visualViewport.scale !== 1` 关闭 framing，也不能程序化重置用户 pinch zoom。视觉 `terminal-frame` 必须与 FitAddon 使用的无 padding `terminal-mount` 分离，xterm viewport 剩余区域也必须沿用同一主题背景。高密度 workbench 区域同样应只有一个明确纵向 scroll owner；Git sidebar 负责 groups/lists/tools 的滚动，内部不再嵌套额外 scroller。 手机快捷键新增必须经过共享 terminal-key 编码器，不能重新在组件中散落 escape 字节；Enter 保持在核心行，Ctrl/Alt 的一次性语义必须在 xterm 输入与虚拟导航键之间一致，低频按键放进可展开的第二条横向按键行，不能因此创建新的纵向滚动区。

任何影响行为的 PR 都必须按 `.agents/skills/docs-sync/SKILL.md` 同步文档。安全、会话生命周期、重连、协议、配置的变更始终需要文档审查。

Release PR 还必须执行 `pnpm license:check` 与 `pnpm release:check -- X.Y.Z`。正式发布只允许从受保护的 `main` 手动触发 **Actions → Release**：workflow 锁定一个源码 SHA，针对该 SHA 重跑 Windows/Ubuntu CI、漏洞/许可证检查与 CodeQL，所有自动门禁通过后才创建 annotated Tag 与 GitHub Release。真实设备/部署检查仍是推荐的发布证据，但不再通过勾选框作为机器门禁。

### 贡献原则

- 终端核心保持厂商无关；Codex 是支持的工作负载，不是协议依赖。
- 优先建立小而可测试的边界。
- 不要为了调试增加终端 I/O 日志。
- Workspace CRUD 属于高信任远程修改面，必须保持认证、精确 Origin、持久化验证以及“Session 创建/重启只消费持久化 Workspace authority”的边界。终端 Profile 发现必须继续只是“已知 Host Shell + 已注册 WSL 发行版”的有界枚举，不能退化成任意命令执行。
- Workspace environment 已作为有界持久化配置开放；如果要继续扩大到任意进程执行或密钥管理，必须先进行架构与安全审查。
- Session Workbench 工具必须与终端 transport 分离。Files 保持 Workspace 根目录范围内的只读能力。Git 写操作已经只通过 typed operation contract 落地：必须保留 expected-state 校验、truncated/不完整 status fail closed、按已解析仓库而不是 Workspace ID 串行、rename-aware pathset、显式仓库级 stage-all/unstage-all、破坏性 restore 的 diff-snapshot 校验、可信仓库显式确认、hooks/交互提示禁用、有界子进程，以及“禁止浏览器传任意 Git argv”的边界。正常 Git filter 仍属于可信仓库代码执行，不能把当前设计描述成沙箱。
- 必须区分“已经实现的平台适配器”与“已进入 CI 实机路径的平台”。
