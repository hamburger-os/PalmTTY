import type { RemoteAppInputStatus } from "@palmtty/protocol";

// A working video stream does not establish a usable interactive desktop.
export const REMOTE_APP_INPUT_STATUS_KEYS = {
  ready: "remoteApp.inputBlocked",
  "session-disconnected": "remoteApp.inputState.sessionDisconnected",
  "desktop-unavailable": "remoteApp.inputState.desktopUnavailable",
  "display-unavailable": "remoteApp.inputState.displayUnavailable",
  "window-unavailable": "remoteApp.inputState.windowUnavailable",
  "focus-denied": "remoteApp.inputState.focusDenied",
  "window-occluded": "remoteApp.inputState.windowOccluded",
  "input-rejected": "remoteApp.inputState.inputRejected"
} as const satisfies Record<RemoteAppInputStatus, string>;

export function remoteAppInputStatusKey(state: RemoteAppInputStatus) {
  return REMOTE_APP_INPUT_STATUS_KEYS[state];
}
