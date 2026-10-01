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
- executable discovery is a bounded control-plane surface: known PATH/install-root candidates plus capped Windows App Paths registry and Start Menu shortcut target inspection, followed by directory/.exe enumeration only; never a general browser file-read, unbounded filesystem scan or command API.
- native WebRTC readiness must be checked in a disposable process; installed Windows runtime smoke must load the packaged addon rather than relying only on compiled TypeScript or PE presence.

MSIX and media diagnostic references:
- Get-StartApps (Windows PowerShell): https://learn.microsoft.com/powershell/module/startlayout/get-startapps
- Get-AppxPackage (current-user package registration): https://learn.microsoft.com/powershell/module/appx/get-appxpackage
- IApplicationActivationManager::ActivateApplication: https://learn.microsoft.com/windows/win32/api/shobjidl_core/nf-shobjidl_core-iapplicationactivationmanager-activateapplication
- GetPackageFamilyName: https://learn.microsoft.com/windows/win32/api/appmodel/nf-appmodel-getpackagefamilyname
- HTMLVideoElement.requestVideoFrameCallback: https://developer.mozilla.org/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback

MSIX activation returns a PID but does not prove ownership. PalmTTY requires a fresh process, exact package-family verification and successful Job assignment before granting capture/input. Window-only PrintWindow remains the actual capture backend pending real Windows Graphics Capture integration; synthetic WebRTC round-trip smoke does not prove any particular real application's PrintWindow compatibility.

- SetWindowPos for consented current-HWND sizing: https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-setwindowpos
- Touch gesture ownership: https://www.w3.org/TR/pointerevents/#the-touch-action-css-property

PalmTTY's optional per-session adaptWindow display flag can resize only the already verified Job-owned HWND and must restore its original size on disable or helper shutdown; this does not broaden capture authority. Real dark windows are not conclusive PrintWindow failures. WGC requires separate window-only capture, device-loss, and real Windows host qualification; synthetic WebRTC smoke is insufficient.

## Owned cursor and mobile dock boundary

The Windows host samples only the currently verified Job-owned HWND and emits 0–1000000 normalized fixed-point cursor coordinates, or `-1 -1` outside. AppWorker validates native stderr samples and forwards only bounded, typed cursor/foreground-input telemetry on the existing authenticated single-peer WebRTC control DataChannel; backpressured telemetry is discarded. The Web pointer is theme-owned, pointer-events-none and projected through inverse contain/cover geometry, hidden beyond clipped video boundaries. No desktop or arbitrary-window capture, input elevation or new peer is introduced. The always-visible mobile Terminal dock puts Long Text second and directly expands extra keys with a fixed More button; its one-row Tools header and expanded key row are browser presentation state; xterm/WebSocket remain mounted, and the existing mount ResizeObserver/FitAddon owns geometry.

## Low-latency cursor presentation

Cursor feedback runs independently of window capture on a best-effort ~30 Hz thread, taking a fresh verified-owned HWND bounds snapshot before each normalized sample; no desktop coordinates leave the native host. For the common case where the owned application already has Windows foreground focus, relative pointer input skips redundant window restoration and cross-thread focus attachment while preserving the same ownership and foreground checks. Browser pointermove deltas are coalesced to at most one ordered WebRTC message per animation frame; primary-button down/up and cancellation flush pending movement first. A display-only bounded cursor preview updates the 5.667×8 CSS-pixel SVG through requestAnimationFrame without a React update per sample; it ignores late samples while fingers move, then converges on the most recent authenticated native coordinate after a short settling window. Native off-window hidden samples override predictions immediately. The first bottom key is Text and no text action is duplicated in display/diagnostic options.

## Unified phone window adaptation

Remove the independent arbitrary `cover`/`contain` toggle from browser options. Unadapted application windows always preserve the complete image (`contain`). Opt-in `adaptWindow` may compensate at most 32 outer pixels per axis for the difference between a verified HWND’s `GetWindowRect` and its DWM extended frame bounds; actual post-resize DWM geometry remains the capture/input authority. For a successfully adapted stream with residual aspect mismatch of at most 4% of an edge, the browser automatically uses `object-fit: cover` solely to remove tiny letterbox slivers, without stretching the image. A larger mismatch implies Windows minimum-size/aspect constraints, so remain in `contain` and show a non-blocking explanatory note in Options rather than cropping controls. Calculate display hints from the actual video content box and use the identical effective fit and video content rectangle for Direct Touch, Trackpad deltas, and remote cursor projection. Normal view, peer authority, terminal state and Safari pinch ownership are unchanged.
