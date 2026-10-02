# v0.3 Windows-native unattended RDP contract

Status: only the **read-only Windows-native gateway readiness CLI** and architecture docs exist. No PalmTTY pre-login Machine Service, signed authorization bridge, scoped browser RDCleanPath transport or PalmTTY Desktop Activity is implemented. Never report that native unattended login is available because the readiness probe passes.

## Selected technology and non-goals

Target: Windows 11 Pro x64 + iPhone Safari on the same physical host. No Hyper-V/WSL2/Docker or Windows auto-login. Use the Windows MSI/service distribution of Devolutions Gateway with matching, pinned, reviewed IronRDP browser WASM/Web Component; the official client requires RDCleanPath support, **not** a naive WebSocket/TCP proxy. Earlier Guacamole Linux gateway is superseded; don't silently implement it. Gateway standalone WebApp(Custom) permits arbitrary user-selected RDP destinations and is therefore **P0 local experiment only**. Do not deploy standalone free-target UI to public ingress or disable NLA.

## Final trust boundaries (not yet implemented)

- Explicit opt-in pre-login Machine Service, separately authenticated device session and trusted HTTPS/WSS, no persistent Windows credentials, no arbitrary shell/desktop access.
- Local native Gateway service with ACL-protected keys and strictly loopback listeners. Machine Service mints short-lived/single-target association authorization fixed to 127.0.0.1:3389 and proxies only audited Gateway paths. Never let browser choose arbitrary host, path, port or gateway bearer tokens.
- Existing InteractiveToken User Agent remains unprivileged. Machine/User handoff must authenticate Windows SID and session ID over ACL-bound local IPC, never PID-only authority; machine service never imports user Agent cookies, workspace store or Worker recovery secrets.
- Reviewed IronRDP WebAssembly client embedded as PalmTTY Desktop Activity. Explicit Windows credential input is transient. Preserve existing AppWorker Job window capture and WTSActive/Default/monitor/foreground/UIPI input gates, no desktop fallback and no queued input replay.
- RDP disconnected, Safari suspended, Winlogon/UAC, VM-less headless reboot, service startup delays and mobile reconnect each need explicit states and no privilege escalation.

## Test/release sequence (#90–#93)

P0: Target PC native Gateway service installed and loopback-only/Custom, actual monitor-free cold boot, iPhone browser RDP NLA; verify Windows session and Remote App in that RDP desktop. Pin audited Gateway/IronRDP versions, check Apache/MIT/NOTICE and distribution terms. P1: independent Machine Service and SID-scoped IPC and service installer. P2: fixed-destination signed Gateway tokens + trusted same-origin proxy + IronRDP UI. P3: user Agent/Desktop/Remote App lifecycle, real-phone/reboot/lock/IME/network/failure tests and complete Windows/Linux CI/Distribution/CodeQL/Audit. Only then prepare root v0.3.0 metadata and release.

## Current implemented check

The `pnpm unattended:check -- --json` output schema is now 2/target=windows-native. Strictly parse typed Windows/RDP/NLA/TermService and native service status, automatic start, whether config is readable, standalone Custom authentication, provisioner configuration and all listeners loopback-only. Missing/unknown fields block. The tool never installs/starts the Gateway, parses credential contents, discloses URLs or prints private keys. It unconditionally sets endToEndCertified=false and enumerates genuine manual device gates. A green result is **not** a statement that P0, P1, P2 or P3 passed.
