# Remote App runtime references

PalmTTY Remote Apps intentionally use a separate runtime/security model from PTY sessions.

Authoritative references used by the Windows/Web implementation:

- WebRTC 1.0: https://www.w3.org/TR/webrtc/
- WebRTC data channels: https://www.w3.org/TR/webrtc/#datachannel
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
- the AppWorker is a disposable native-media boundary and has a separate authenticated recovery generation from Terminal Workers;
- no TURN/cloud relay is part of the core architecture at this stage.
