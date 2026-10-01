# Remote App runtime references

PalmTTY Remote Apps intentionally use a separate runtime/security model from PTY sessions.

Authoritative references used by the Windows/Web implementation:

- WebRTC 1.0: https://www.w3.org/TR/webrtc/
- WebRTC data channels: https://www.w3.org/TR/webrtc/#datachannel
- ICE/STUN/TURN configuration exposed by `RTCPeerConnection`: https://www.w3.org/TR/webrtc/#dom-rtcconfiguration
- Windows Job Objects: https://learn.microsoft.com/windows/win32/procthread/job-objects
- AssignProcessToJobObject: https://learn.microsoft.com/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject
- PrintWindow: https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-printwindow
- DwmGetWindowAttribute: https://learn.microsoft.com/windows/win32/api/dwmapi/nf-dwmapi-dwmgetwindowattribute
- SendInput: https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-sendinput

Project interpretation:

- capture authority is the PalmTTY-launched PalmTTY-owned Job Object, not the logged-in desktop;
- failure to capture one app is not authorization to fall back to whole-desktop capture;
- input is allowed only after re-validating that the target window belongs to the PalmTTY-owned Job Object;
- Windows UIPI / integrity-level restrictions documented with SendInput remain a security boundary and must not be bypassed;
- AppWorker and Terminal Worker have separate lifecycle protocols, canonical state and authenticated recovery generations;
- Remote App presentation size is live client presentation state, not persisted App Profile authority; browser display hints are bounded by protocol/native hard limits;
- direct LAN/VPN WebRTC may use host candidates; deployments that require NAT traversal may configure STUN/TURN through bounded host configuration;
- configured ICE servers are signaling configuration, not a PalmTTY-operated relay service; adding a PalmTTY-hosted relay would require a separate privacy/security/deployment design;
- executable discovery is a bounded control-plane surface: known-app detection plus directory/.exe enumeration only, never a general browser file-read or command API.
