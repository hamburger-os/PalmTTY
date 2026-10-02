import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { RemoteAppFrameDecoder } from "./remote-app-frame-decoder.js";
import { parseNativeCursorSample } from "./remote-app-cursor.js";
import { parseNativeInputStatus } from "./remote-app-input-status.js";
import { RemoteAppControlForwarder } from "./remote-app-control-forwarder.js";
import {
  AppSessionPublicSchema,
  REMOTE_APP_CAPTURE_DEFAULT_FPS,
  REMOTE_APP_CAPTURE_DEFAULT_HEIGHT,
  REMOTE_APP_CAPTURE_DEFAULT_WIDTH,
  parseRemoteAppControlMessage,
  RemoteAppTelemetryMessageSchema,
  type RemoteAppTelemetryMessage,
  type RemoteAppInputStatus,
  type RemoteAppCursorMessage,
  type AppSessionMediaState,
  type AppSessionPublic,
  type RemoteAppIceServer
} from "@palmtty/protocol";
import type {
  RemoteAppWorkerBootstrap
} from "./remote-app-worker-protocol.js";

type RuntimeState = "starting" | "running" | "stopping" | "exited" | "failed";
type StatusListener = (session: AppSessionPublic) => void;
type ExitListener = () => void;

type Peer = {
  clientId: string;
  connection: any;
  channel?: any;
};

const MAX_HELPER_STDERR_BYTES = 16 * 1024;
const HELPER_READY_PREFIX = "PALMTTY_APP_HOST_READY ";
const HELPER_STATE_PREFIX = "PALMTTY_APP_HOST_STATE ";
const HELPER_REASON_PREFIX = "PALMTTY_APP_HOST_CAPTURE_REASON ";
const HELPER_ERROR_PREFIX = "PALMTTY_APP_HOST_ERROR ";
const HELPER_CURSOR_PREFIX = "PALMTTY_APP_HOST_CURSOR ";
const HELPER_INPUT_PREFIX = "PALMTTY_APP_HOST_INPUT_STATE ";
const ICE_GATHER_TIMEOUT_MS = 8_000;

const MEDIA_STATES = new Set<AppSessionMediaState>([
  "launching",
  "waiting-for-window",
  "waiting-for-frame",
  "streaming",
  "capture-unavailable"
]);

function loadWebRtc(): any {
  const require = createRequire(import.meta.url);
  return require("@roamhq/wrtc");
}

export class RemoteAppRuntime {
  private state: RuntimeState = "starting";
  private mediaState: AppSessionMediaState = "launching";
  private helper: ChildProcessWithoutNullStreams | undefined;
  private nativeControl: RemoteAppControlForwarder | undefined;
  private appPid: number | undefined;
  private exitCode: number | undefined;
  private readonly frameDecoder = new RemoteAppFrameDecoder();
  private sourceFrames = 0;
  private submittedFrames = 0;
  private conversionFailures = 0;
  private lastSubmittedAt: string | undefined;
  private lastFailure: "invalid-frame" | "frame-conversion" | undefined;
  private lastFrameStatusAt = 0;
  private nativeFailure: "window-not-found" | "window-too-large" |
    "printwindow-failed" | "blank-window" | "capture-exception" |
    "frame-write-failed" | "window-resize-rejected" | undefined;
  private helperMediaState: AppSessionMediaState = "launching";
  private readonly statusListeners = new Set<StatusListener>();
  private readonly exitListeners = new Set<ExitListener>();
  private peer: Peer | undefined;
  private cursor: RemoteAppCursorMessage = { type: "cursor", visible: false };
  private nativeInputState: RemoteAppInputStatus | undefined;
  private wrtc: any;
  private videoSource: any;
  private videoTrack: any;
  private disposed = false;

  constructor(readonly bootstrap: RemoteAppWorkerBootstrap) {}

  async start(): Promise<void> {
    if (process.platform !== "win32") {
      throw new Error("Remote Apps are currently supported only on Windows");
    }
    // Starting native WebRTC before the Windows host becomes READY lets an
    // ordinary MSIX activation failure enter buggy native addon teardown.
    // Keep launch errors in JavaScript until an owned application exists.
    const child = spawn(this.bootstrap.helperPath, [], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: this.bootstrap.profile.environment
    });
    this.helper = child;
    this.nativeControl = new RemoteAppControlForwarder(child.stdin);

    let stderr = "";
    let hostStartupError: string | undefined;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > MAX_HELPER_STDERR_BYTES) {
        stderr = stderr.slice(-MAX_HELPER_STDERR_BYTES);
      }
      const lines = stderr.split(/\r?\n/);
      stderr = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith(HELPER_INPUT_PREFIX)) {
          const state = parseNativeInputStatus(line.slice(HELPER_INPUT_PREFIX.length));
          if (state) {
            this.nativeInputState = state;
            this.sendTelemetry({ type: "inputState", state });
          }
          continue;
        }
        if (line.startsWith(HELPER_CURSOR_PREFIX)) {
          const sample = parseNativeCursorSample(line.slice(HELPER_CURSOR_PREFIX.length));
          if (sample) {
            this.cursor = sample;
            this.sendTelemetry(sample);
          }
          continue;
        }
        if (line.startsWith(HELPER_ERROR_PREFIX)) {
          hostStartupError = line.slice(HELPER_ERROR_PREFIX.length).slice(0, 512);
          continue;
        }
        if (line.startsWith(HELPER_READY_PREFIX)) {
          const pid = Number(line.slice(HELPER_READY_PREFIX.length).trim());
          if (Number.isSafeInteger(pid) && pid > 0) this.appPid = pid;
          continue;
        }
        if (line.startsWith(HELPER_REASON_PREFIX)) {
          const reason = line.slice(HELPER_REASON_PREFIX.length).trim();
          const valid = [
            "window-not-found", "window-too-large", "printwindow-failed",
            "blank-window", "capture-exception", "frame-write-failed",
            "window-resize-rejected"
          ];
          this.nativeFailure = valid.includes(reason)
            ? reason as typeof this.nativeFailure
            : undefined;
          this.publishStatus();
          continue;
        }
        if (line.startsWith(HELPER_STATE_PREFIX)) {
          const next = line.slice(HELPER_STATE_PREFIX.length).trim() as AppSessionMediaState;
          if (MEDIA_STATES.has(next)) {
            this.helperMediaState = next;
            // A successful PrintWindow call does not prove that WebRTC accepted
            // its pixels. Report streaming only after onFrame succeeds.
            const visible = next === "streaming"
              ? (this.submittedFrames ? "streaming" : "waiting-for-frame")
              : next;
            if (visible !== this.mediaState) {
              this.mediaState = visible;
              this.publishStatus();
            }
          }
        }
      }
    });
    child.stdout.on("data", (chunk: Buffer) => this.consumeFrames(chunk));
    child.on("close", (code) => {
      this.nativeControl?.close();
      this.nativeControl = undefined;
      if (this.disposed) return;
      this.exitCode = typeof code === "number" ? code : undefined;
      this.state = this.state === "stopping" || code === 0 ? "exited" : "failed";
      this.closePeer();
      this.publishStatus();
      for (const listener of [...this.exitListeners]) listener();
    });

    const bootstrap = {
      ...this.bootstrap.profile.launch,
      cwd: this.bootstrap.profile.cwd,
      args: this.bootstrap.profile.args,
      frameRate: REMOTE_APP_CAPTURE_DEFAULT_FPS,
      maxWidth: REMOTE_APP_CAPTURE_DEFAULT_WIDTH,
      maxHeight: REMOTE_APP_CAPTURE_DEFAULT_HEIGHT
    };

    child.stdin.write(`${JSON.stringify(bootstrap)}\n`, "utf8");

    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => {
        reject(new Error(
          "Windows Remote App host did not become ready" +
          (hostStartupError ? `: ${hostStartupError}`
            : stderr.trim() ? `: ${stderr.trim().slice(0, 512)}` : "")
        ));
      }, 10_000);
      deadline.unref();

      const check = setInterval(() => {
        if (this.appPid) {
          clearInterval(check);
          clearTimeout(deadline);
          resolve();
        }
      }, 25);
      check.unref();

      child.once("error", (error) => {
        clearInterval(check);
        clearTimeout(deadline);
        reject(error);
      });
      child.once("close", (code) => {
        if (this.appPid) return;
        clearInterval(check);
        clearTimeout(deadline);
        reject(new Error(
          `Windows Remote App host exited before ready (code=${code ?? "null"})` +
          (hostStartupError ? `: ${hostStartupError}`
            : stderr.trim() ? `: ${stderr.trim().slice(0, 512)}` : "")
        ));
      });
    });

    this.wrtc = loadWebRtc();
    this.videoSource = new this.wrtc.nonstandard.RTCVideoSource();
    this.videoTrack = this.videoSource.createTrack();
    this.state = "running";
    this.publishStatus();
  }

  get pid(): number {
    if (!this.appPid) throw new Error("Remote App process is not ready");
    return this.appPid;
  }

  get active(): boolean {
    return this.state === "starting" || this.state === "running" || this.state === "stopping";
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onExit(listener: ExitListener): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  toPublic(connections = this.peer ? 1 : 0): AppSessionPublic {
    return AppSessionPublicSchema.parse({
      id: this.bootstrap.sessionId,
      workspaceId: this.bootstrap.workspaceId,
      profileId: this.bootstrap.profile.id,
      profileName: this.bootstrap.profile.name,
      state: this.state,
      mediaState: this.mediaState,
      mediaDiagnostics: {
        sourceFrames: this.sourceFrames,
        submittedFrames: this.submittedFrames,
        conversionFailures: this.conversionFailures,
        ...(this.lastSubmittedAt ? { lastSubmittedAt: this.lastSubmittedAt } : {}),
        ...(this.lastFailure ? { failure: this.lastFailure } : {}),
        ...(this.nativeFailure ? { nativeFailure: this.nativeFailure } : {})
      },
      createdAt: this.bootstrap.createdAt,
      connections,
      ...(this.appPid ? { pid: this.appPid } : {}),
      ...(this.exitCode !== undefined ? { exitCode: this.exitCode } : {})
    });
  }

  async negotiate(
    clientId: string,
    offerSdp: string,
    iceServers: RemoteAppIceServer[]
  ): Promise<string> {
    if (this.state !== "running") throw new Error("Remote App is not running");
    this.closePeer();

    const connection = new this.wrtc.RTCPeerConnection({ iceServers });
    this.peer = { clientId, connection };

    connection.addTrack(this.videoTrack);
    connection.ondatachannel = (event: any) => {
      const channel = event.channel;
      const currentPeer = this.peer;
      if (!channel || channel.label !== "control" ||
          !currentPeer || currentPeer.connection !== connection) {
        try { channel?.close(); } catch { /* ignore */ }
        return;
      }
      currentPeer.channel = channel;
      channel.onopen = () => {
        if (this.peer?.connection === connection) {
          this.sendTelemetry(this.cursor);
          if (this.nativeInputState) this.sendTelemetry({ type: "inputState", state: this.nativeInputState });
        }
      };
      channel.onmessage = (message: any) => {
        if (typeof message.data !== "string" || message.data.length > 32 * 1024) return;
        this.forwardControl(message.data);
      };
    };
    connection.onconnectionstatechange = () => {
      if (
        this.peer?.connection === connection &&
        ["failed", "closed"].includes(connection.connectionState)
      ) {
        this.closePeer();
        this.publishStatus();
      }
    };

    await connection.setRemoteDescription({ type: "offer", sdp: offerSdp });
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    await this.waitForIceGathering(connection);

    const sdp = connection.localDescription?.sdp;
    if (!sdp) {
      this.closePeer();
      throw new Error("Remote App WebRTC answer is missing SDP");
    }
    this.publishStatus();
    return sdp;
  }

  detach(clientId: string): void {
    if (this.peer?.clientId !== clientId) return;
    this.closePeer();
    this.publishStatus();
  }

  async terminate(): Promise<void> {
    if (!this.active) return;
    this.state = "stopping";
    this.publishStatus();
    this.closePeer();
    const helper = this.helper;
    if (helper && helper.exitCode === null && helper.signalCode === null) {
      helper.kill();
    }
  }

  async dispose(killApp: boolean): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.closePeer();
    try { this.videoTrack?.stop(); } catch { /* ignore */ }
    this.videoTrack = undefined;
    this.videoSource = undefined;

    const helper = this.helper;
    this.helper = undefined;
    this.nativeControl?.close();
    this.nativeControl = undefined;
    if (killApp && helper && helper.exitCode === null && helper.signalCode === null) {
      try { helper.kill(); } catch { /* ignore */ }
    }
    helper?.stdin.destroy();
    helper?.stdout.destroy();
    helper?.stderr.destroy();
    this.statusListeners.clear();
    this.exitListeners.clear();
  }

  private sendTelemetry(message: RemoteAppTelemetryMessage): void {
    const channel = this.peer?.channel;
    if (channel?.readyState !== "open" || channel.bufferedAmount > 4096) return;
    try { channel.send(JSON.stringify(RemoteAppTelemetryMessageSchema.parse(message))); }
    catch { /* Closed peer or out-of-budget diagnostics are never authoritative. */ }
  }

  private forwardControl(source: string): void {
    const helper = this.helper;
    if (!helper || helper.stdin.destroyed || this.state !== "running") return;
    try {
      const message = parseRemoteAppControlMessage(source);
      // One bounded ordered queue owns helper stdin: a write(false) has
      // accepted bytes, and all subsequent input waits for drain.
      this.nativeControl?.enqueue(`${JSON.stringify(message)}\n`);
    } catch {
      // Malformed, unauthenticated, or oversized controls never reach native.
    }
  }

  private consumeFrames(chunk: Buffer): void {
    if (this.disposed || !this.videoSource) return;
    try {
      this.frameDecoder.push(chunk, (rgba, width, height) => {
        this.sourceFrames += 1;
        try {
          const i420 = new Uint8ClampedArray((width * height * 3) / 2);
          this.wrtc.nonstandard.rgbaToI420(
            {
              width,
              height,
              data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength)
            },
            { width, height, data: i420 }
          );
          this.videoSource.onFrame({ width, height, data: i420 });
          this.submittedFrames += 1;
          this.lastSubmittedAt = new Date().toISOString();
          this.lastFailure = undefined;
          const changed = this.mediaState !== "streaming";
          this.mediaState = "streaming";
          if (changed || Date.now() - this.lastFrameStatusAt >= 2000) {
            this.lastFrameStatusAt = Date.now();
            this.publishStatus();
          }
        } catch {
          this.conversionFailures += 1;
          this.lastFailure = "frame-conversion";
          if (this.mediaState !== "capture-unavailable") {
            this.mediaState = "waiting-for-frame";
          }
          this.publishStatus();
        }
      });
    } catch {
      this.lastFailure = "invalid-frame";
      this.conversionFailures += 1;
      this.mediaState = "capture-unavailable";
      this.publishStatus();
    }
  }

  private closePeer(): void {
    const peer = this.peer;
    this.peer = undefined;
    if (!peer) return;
    try { peer.connection.close(); } catch { /* ignore */ }
  }

  private publishStatus(): void {
    const session = this.toPublic();
    for (const listener of [...this.statusListeners]) listener(session);
  }

  private async waitForIceGathering(connection: any): Promise<void> {
    if (connection.iceGatheringState === "complete") return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, ICE_GATHER_TIMEOUT_MS);
      timeout.unref();
      const onState = () => {
        if (connection.iceGatheringState !== "complete") return;
        clearTimeout(timeout);
        connection.removeEventListener?.("icegatheringstatechange", onState);
        resolve();
      };
      connection.addEventListener?.("icegatheringstatechange", onState);
      connection.onicegatheringstatechange = onState;
    });
  }
}
