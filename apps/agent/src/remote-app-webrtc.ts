import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { installedRoot } from "./runtime-layout.js";

const CHECK_TIMEOUT_MS = 8000;
const MAX_DIAGNOSTIC_BYTES = 2048;
const VERIFY_WEBRTC_SCRIPT = [
  "const wrtc = require(process.argv[1]);",
  "if (typeof wrtc.RTCPeerConnection !== 'function' ||",
  "    typeof wrtc.nonstandard?.RTCVideoSource !== 'function' ||",
  "    typeof wrtc.nonstandard?.rgbaToI420 !== 'function') {",
  "  throw new Error('Installed WebRTC package does not expose the required native APIs');",
  "}"
].join("\n");

let successfulProbe: Promise<void> | undefined;

function repairInstruction(): string {
  return installedRoot()
    ? "Reinstall the Windows x64 PalmTTY package: the packaged WebRTC native runtime is incomplete."
    : "From the PalmTTY repository run pnpm install --frozen-lockfile, then restart PalmTTY.";
}

/**
 * Validate the same native WebRTC entrypoint the detached AppWorker loads.
 * The probe runs in a separate Node process: libwebrtc never enters the
 * long-lived Agent, and an incompatible addon cannot crash the Agent.
 */
export async function assertRemoteAppWebRtcAvailable(): Promise<void> {
  successfulProbe ??= (async () => {
    let entry: string;
    try {
      entry = createRequire(import.meta.url).resolve("@roamhq/wrtc");
    } catch {
      throw new Error("Remote App WebRTC dependency @roamhq/wrtc is missing. " + repairInstruction());
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["-e", VERIFY_WEBRTC_SCRIPT, entry], {
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"]
      });
      let stderr = "";
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        if (stderr.length < MAX_DIAGNOSTIC_BYTES) {
          stderr += chunk.slice(0, MAX_DIAGNOSTIC_BYTES - stderr.length);
        }
      });
      child.once("error", (error) => finish(error));
      child.once("close", (code) => {
        if (code === 0) {
          finish();
        } else {
          finish(new Error(
            "Remote App WebRTC native runtime cannot load" +
            (stderr.trim() ? ": " + stderr.trim().slice(0, 500) : ".") +
            " " + repairInstruction()
          ));
        }
      });
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error("Remote App WebRTC native runtime probe timed out. " + repairInstruction()));
      }, CHECK_TIMEOUT_MS);
      timer.unref();
    });
  })().catch((error: unknown) => {
    // A failed probe is not cached. A repaired node_modules installation may
    // be retried without restarting the whole Agent.
    successfulProbe = undefined;
    throw error;
  });
  return successfulProbe;
}
