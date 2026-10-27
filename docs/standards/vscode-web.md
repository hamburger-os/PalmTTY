# Official VS Code Web and Harness references

- Server terms: <https://code.visualstudio.com/license/server>. Review the actual installation/use and hosting/redistribution restrictions; private use is not a blanket permission claim.
- Server FAQ: <https://code.visualstudio.com/docs/remote/vscode-server> says hosting as a service is not allowed.
- Remote Tunnels: <https://code.visualstudio.com/docs/remote/tunnels#_how-can-i-ensure-i-keep-my-tunnel-running> explicitly documents `code tunnel service install`. This is a distinct command and network architecture; it neither proves arbitrary serve-web hosting is licensed nor establishes a universal TTY requirement.
- Remote Development FAQ: <https://code.visualstudio.com/docs/remote/faq> distinguishes internal/private use from public/commercial offerings.
- Official CLI argument contract: <https://github.com/microsoft/vscode/blob/main/cli/src/commands/args.rs>; retain upstream token protection and explicit license acceptance. No VS Code binaries are redistributed.
- Upstream self-hosted security advisory: <https://github.com/microsoft/vscode/security/advisories/GHSA-v282-cxqj-xgj4>.
- Harness CLI: <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cli-help.md>; public-url advertises the route and trusted-host admits authority, neither replaces authentication. Validate the actual operator-installed version, not just current main documentation.
- CSP frame ancestors: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors>. Independent-Origin framing, SameSite Cookies, OAuth callbacks and HTTP/WebSocket behavior need exact-version/device acceptance.
- Caddy logging: <https://caddyserver.com/docs/caddyfile/directives/log> and <https://caddyserver.com/docs/caddyfile/options#log>. Access and runtime error logging are separate; proxy bootstrap queries/headers must not leak credentials. Preserve upstream CSP when adding an ancestor allowlist.

- Browser secure contexts: <https://www.w3.org/TR/secure-contexts/#examples-framed>. A trusted HTTPS top-level page can be secure even when opened from an HTTP page; an HTTPS iframe under an HTTP ancestor is not secure. PalmTTY now uses independent navigation. WireGuard does not alter the browser scheme. Code webviews check crypto.subtle; this does not imply Harness requires HTTPS.
- Cookie port isolation: <https://www.rfc-editor.org/rfc/rfc6265.html#section-8.5>. Separate ports are not separate cookie hosts. PalmTTY’s single-user managed IP gateway explicitly treats applications as one trusted host and strips its session cookie upstream; it does not claim hostname isolation.
- Harness remote HTTP is explicitly supported: <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/web-app/README.zh.md>. Authentication and trusted Host/Origin checks remain separate from TLS.

- Internal HTTPS/CA: <https://caddyserver.com/docs/automatic-https#local-https>; manual iOS trust: <https://support.apple.com/en-us/102390>.
- The managed IP gateway has no private DNS dependency. Caddy supports private IP certificates; preserve an IP SAN and trusted chain. Official Caddy archive version/hash live only in private-gateway.ts.
- Code folder URLs: <https://github.com/microsoft/vscode/blob/main/src/vs/code/browser/workbench/workbench.ts>. Host cwd is encoded as a URI folder path; Windows Code cannot infer a WSL mapping.

- Harness Desktop bundled command runtime and installation ownership: <https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md#bundled-command-runtime>. Reuse the published CLI shim and its Desktop-owned runtime rather than changing ASAR or depending on private GUI IPC. The operator owns Desktop upgrades/uninstall.
- Harness persistence concurrency: <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-persistence-jsonl/README.md#known-limitations-and-deferred-work>. Shared storage does not permit concurrent cross-process writers to one session; release the writer before handoff. Desktop and web profiles are distinct compositions over shared product data, not a shared live backend.
