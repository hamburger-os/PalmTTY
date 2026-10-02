# v0.3.0 unattended browser-RDP design contract

This is a **planned** architecture with one implemented read-only Windows readiness diagnostic. Neither a pre-login service nor a browser RDP tunnel is present in the 0.2.x runtime. Never claim an implemented unattended path based on the presence of this document or a successful registry probe.

## Fixed target

Windows 11 Pro x64 host, iPhone Safari, full browser-integrated RDP after NLA, no auto-logon, no secure-desktop bypass, no elevation for Terminal/AppWorker. Approved gateway options: an always-on external Linux/NAS, or a Hyper-V Linux VM with verified AutomaticStartAction=Start. Guacamole/guacd version, RDP NLA interactive credential prompt and iOS Safari are hard real-device qualification requirements, not assumed guarantees.

## Proposed process boundaries

- Machine Service: operator-approved pre-login Windows service, independently authenticated HTTPS entrypoint; own identity and storage, never own a PTY/window/User Agent credential or execute browser-provided arbitrary commands. The service account and ACL require a dedicated threat-model and lifecycle test.
- Gateway: version-pinned isolated Guacamole + guacd; proxy fixed upstream/host/port; authenticated tunnel behind same-origin HTTPS/WSS with stream/WebSocket support, bounded transport/connection budget and no generic URL proxy or RDP port exposed publicly. If interactive NLA prompts fail, the release is blocked.
- User Agent: existing ordinary OS-user InteractiveToken process with its own Workspace and Worker state; Machine Service may discover a user through strict SID/session identity-checked named-pipe IPC, but may not impersonate a user shell.
- Remote Desktop: separate browser Activity from existing Job-owned single-window Remote Apps. Preserve Windows WTS/WinSta0/Default/display/foreground/UIPI/captured-window validation; RDP disconnect must not silently convert to input-ready. Never replay queued input after unlock/reconnect.

## Security tests required before enabling

Cold boot before user login, guest VM boot without display, NLA credentials not in logs/persistent storage, forged Origin/CSRF, TLS termination, host/port allowlist, WebSocket upgrade, HTTP stream no-buffering, bounded client slow-consumer, failed service/gateway/Agent startup and individual restart, incorrect SID/session or named-pipe ACL, two-user isolation, guest compromised-network reachability, unsupported Windows Home/Server, Windows lock/UAC/RDP disconnect and genuine Safari suspend/reconnect. Assert no public 3389 exposure and no arbitrary host selection.

## Device acceptance

From a powered-off monitor-free Windows 11 Pro PC, an iPhone Safari user reaches the PalmTTY login page, authenticates PalmTTY independently, opens the integrated desktop, enters Windows credentials via NLA and obtains an actual interactive desktop. User Agent should then start as the Windows user; terminal/Git/files and PalmTTY-owned Remote App work with RDP active. On Safari backgrounding or RDP disconnection, input is blocked. On Windows reboot all transient PTY/GUI sessions are explicitly lost; only persisted Workspace definitions survive.

## Current implementation

Read-only probe: scripts/unattended-readiness.ps1, .mjs and -core.mjs; Node test cases verify strict parsing, unsupported target/NLA/VM failures and the unconditional manual verification requirement. The probe deliberately cannot prove network routing, browser behavior, credentials, NLA prompt compatibility, Windows service ACL or real cold-boot functionality. Development must not bump the release to 0.3.0, migrate user data or publish a release until real endpoint gates and protected branch CI succeed.
