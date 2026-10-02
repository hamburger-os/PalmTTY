# Unattended browser RDP: upstream references and non-implementation constraints

This document tracks authoritative Windows and Apache Guacamole behavior for the proposed v0.3.0 feature. It does not claim that the current PalmTTY runtime implements a pre-login service or integrated RDP.

## Windows 11 Pro and RDP

- Enable Remote Desktop and NLA (Microsoft): https://learn.microsoft.com/en-us/windows-server/remote/remote-desktop-services/remotepc/remote-desktop-allow-access
- Windows Services run in session 0, separate from the interactive user's desktop (Microsoft): https://learn.microsoft.com/en-us/windows/win32/services/interactive-services
- WTS_CONNECTSTATE_CLASS (Active and Disconnected are different): https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/ne-wtsapi32-wts_connectstate_class
- WTSQueryUserToken explicitly requires LocalSystem and SE_TCB_NAME; do not adopt this casually as a general service/user bridge: https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/nf-wtsapi32-wtsqueryusertoken
- Hyper-V Set-VM -AutomaticStartAction: https://learn.microsoft.com/en-us/powershell/module/hyper-v/set-vm
- Hyper-V virtualization requirements: https://learn.microsoft.com/en-us/virtualization/hyper-v-on-windows/reference/hyper-v-requirements

## Apache Guacamole

- Guacamole 1.6.0 client API and input abstraction: https://guacamole.apache.org/doc/gug/guacamole-common-js.html
- Guacamole Java API for custom authenticated tunnels: https://guacamole.apache.org/doc/gug/guacamole-common.html
- RDP NLA configuration / interactive credential prompting must be verified against the pinned guacd/webapp version: https://guacamole.apache.org/doc/gug/configuring-guacamole.html
- Reverse proxy requires correct WebSocket upgrade AND disabled HTTP-stream buffering: https://guacamole.apache.org/doc/gug/reverse-proxy.html
- Official OIDC authentication extension is an option requiring independent threat review; never pretend PalmTTY's bootstrap token is an OIDC identity provider: https://guacamole.apache.org/doc/gug/openid-auth.html

## PalmTTY interpretations

- A Machine Service is a new separately authenticated device entry point, not the existing current-user Agent run as SYSTEM. It cannot obtain arbitrary user capabilities by querying a PID or by trusting a browser claim.
- Windows Pro supports a normal RDP desktop, not Windows Server RemoteApp publishing or multi-user terminal services. The existing PalmTTY Remote App remains a distinct window-only Activity.
- A virtual RDP display solves a remote desktop session's presentation, not an already-disconnected or locked physical-console application's input authority.
- Do not suppress NLA or the existing native WTS/desktop/input checks to get a green demo. A positive read-only registry probe is not actual browser login proof.
