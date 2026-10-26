# Official VS Code Web and Harness references

- Server terms: <https://code.visualstudio.com/license/server>. Review the actual installation/use and hosting/redistribution restrictions; private use is not a blanket permission claim.
- Server FAQ: <https://code.visualstudio.com/docs/remote/vscode-server> says hosting as a service is not allowed.
- Remote Tunnels: <https://code.visualstudio.com/docs/remote/tunnels#_how-can-i-ensure-i-keep-my-tunnel-running> explicitly documents `code tunnel service install`. This is a distinct command and network architecture; it neither proves arbitrary serve-web hosting is licensed nor establishes a universal TTY requirement.
- Remote Development FAQ: <https://code.visualstudio.com/docs/remote/faq> distinguishes internal/private use from public/commercial offerings.
- Official CLI argument contract: <https://github.com/microsoft/vscode/blob/main/cli/src/commands/args.rs>; retain upstream token protection and explicit license acceptance. No VS Code binaries are redistributed.
- Upstream self-hosted security advisory: <https://github.com/microsoft/vscode/security/advisories/GHSA-v282-cxqj-xgj4>.
- Harness CLI: <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cli-help.md>; public-url advertises the route and trusted-host admits authority, neither replaces authentication. Validate the exact pinned package, not just current main documentation.
- CSP frame ancestors: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors>. Independent-Origin framing, SameSite Cookies, OAuth callbacks and HTTP/WebSocket behavior need exact-version/device acceptance.
- Caddy logging: <https://caddyserver.com/docs/caddyfile/directives/log> and <https://caddyserver.com/docs/caddyfile/options#log>. Access and runtime error logging are separate; proxy bootstrap queries/headers must not leak credentials. Preserve upstream CSP when adding an ancestor allowlist.

- Browser secure contexts: <https://www.w3.org/TR/secure-contexts/#examples-framed>. A trusted HTTPS top-level page can be secure even when opened from an HTTP page; an HTTPS iframe under an HTTP ancestor is not secure. PalmTTY now uses independent navigation. WireGuard does not alter the browser scheme. Code webviews check crypto.subtle; this does not imply Harness requires HTTPS.
- Cookie port isolation: <https://www.rfc-editor.org/rfc/rfc6265.html#section-8.5>. Separate ports are not separate cookie hosts.
- Harness remote HTTP is explicitly supported: <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/web-app/README.zh.md>. Authentication and trusted Host/Origin checks remain separate from TLS.

- Internal HTTPS/CA: <https://caddyserver.com/docs/automatic-https#local-https>; manual iOS trust: <https://support.apple.com/en-us/102390>.
- Private DNS source ACL and bounded forwarding: <https://coredns.io/plugins/acl/> and <https://coredns.io/plugins/forward/>. Official release archive versions and hashes live only in private-gateway.ts.
- Code folder URLs: <https://github.com/microsoft/vscode/blob/main/src/vs/code/browser/workbench/workbench.ts>. Host cwd is encoded as a URI folder path; Windows Code cannot infer a WSL mapping.
