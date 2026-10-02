import {
  RemoteAppInputStatusSchema, type RemoteAppInputStatus
} from "@palmtty/protocol";

// The native stderr pipe is not a command channel. Never forward arbitrary
// error text, Windows names, PIDs or desktop identifiers to a browser peer.
export function parseNativeInputStatus(raw: string): RemoteAppInputStatus | null {
  const parsed = RemoteAppInputStatusSchema.safeParse(raw.trim());
  return parsed.success ? parsed.data : null;
}
