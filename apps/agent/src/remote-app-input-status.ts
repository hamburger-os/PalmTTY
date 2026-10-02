import {
  RemoteAppInputStatusSchema, type RemoteAppInputStatus
} from "@palmtty/protocol";

export function blocksRemoteAppInput(status: RemoteAppInputStatus | undefined): boolean {
  return status === "session-disconnected" ||
    status === "desktop-unavailable" ||
    status === "display-unavailable";
}

// The native stderr pipe is not a command channel. Never forward arbitrary
// error text, Windows names, PIDs or desktop identifiers to a browser peer.
export function parseNativeInputStatus(raw: string): RemoteAppInputStatus | null {
  const parsed = RemoteAppInputStatusSchema.safeParse(raw.trim());
  return parsed.success ? parsed.data : null;
}
