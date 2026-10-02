# Windows-native unattended RDP: authoritative upstream references

These upstream sources motivate PalmTTY v0.3 **planned** technology. They are not evidence that the complete integration is implemented or has been validated on an iPhone.

- Devolutions Gateway source, Windows MSI/service, gateway.json native Windows location, standalone WebApp(Custom), pinned provisioner keys and listener documentation: https://github.com/Devolutions/devolutions-gateway/blob/master/README.md
- Devolutions Gateway 2026.x source, matching release notes and versioned release downloads: https://github.com/Devolutions/devolutions-gateway/releases
- Devolutions native Windows service account guidance: https://github.com/Devolutions/devolutions-gateway
- IronRDP protocol implementation and Apache-2.0/MIT license: https://github.com/Devolutions/IronRDP
- IronRDP official Web Client README: https://github.com/Devolutions/IronRDP/blob/master/web-client/README.md
- IronRDP official Svelte demo: https://github.com/Devolutions/IronRDP/blob/master/web-client/iron-svelte-client/README.md (explicitly requires Gateway's RDCleanPath; demo not intended for production)
- Apache Guacamole **open** Windows guacd support issue: https://issues.apache.org/jira/browse/GUACAMOLE-1841 (reason to avoid unsupported native Guacamole port)
- Microsoft Windows Remote Desktop and NLA: https://learn.microsoft.com/en-us/windows-server/remote/remote-desktop-services/remotepc/remote-desktop-allow-access
- Windows Session 0 services are separate from interactive user desktops: https://learn.microsoft.com/en-us/windows/win32/services/interactive-services
- WTS Active vs Disconnected: https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/ne-wtsapi32-wts_connectstate_class

## PalmTTY interpretation

On Windows 11 Pro, the machine-level Gateway Windows service can run before a normal user logs in; a successful RDP connection must still complete Windows NLA. IronRDP official browser client uses RDCleanPath; do not assume a raw WS-to-TCP proxy supports the same security handshake. The Gateway standalone WebApp has an arbitrary-target connection form: it is not an appropriate production device-authority boundary. PalmTTY must enforce fixed-destination, short-lived signed tokens at the machine service/gateway layer before exposing a Desktop Activity.

The host readiness script verifies registry/service/gateway.json signals only; it cannot verify live NLA success, secure Windows ACLs, full network origin protections, production token restrictions or real browser interaction.
