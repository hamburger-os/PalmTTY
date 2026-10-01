import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import {
  AppSessionPublicSchema,
  REMOTE_APP_CAPTURE_DEFAULT_FPS,
  REMOTE_APP_CAPTURE_DEFAULT_HEIGHT,
  REMOTE_APP_CAPTURE_DEFAULT_WIDTH,
  parseRemoteAppControlMessage,
  type AppSessionMediaState,
  type AppSessionPublic
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
};

const FRAME_HEADER_BYTES = 16;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_HELPER_STDERR_BYTES = 16 * 1024;
const HELPER_READY_PREFIX = "PALMTTY_APP_HOST_READY ";
const HELPER_STATE_PREFIX = "PALMTTY_APP_HOST_STATE ";
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
  private appPid: number | undefined;
  private exitCode: number | undefined;
  private frameBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private readonly statusListeners = new Set<StatusListener>();
  private readonly exitListeners = new Set<ExitListener>();
  private peer: Peer | undefined;
  private wrtc: any;
  private videoSource: any;
  private videoTrack: any;
  private disposed = false;

  constructor(readonly bootstrap: RemoteAppWorkerBootstrap) {}

  async start(): Promise<void> {
    if (process.platform !== "win32") {
      throw new Error("Remote Apps are currently supported only on Windows");
    }
    this.wrtc = loadWebRtc();
    this.videoSource = new this.wrtc.nonstandard.RTCVideoSource();
    this.videoTrack = this.videoSource.createTrack();

    const child = spawn(this.bootstrap.helperPath, [], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: this.bootstrap.profile.environment
    });
    this.helper = child;

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > MAX_HELPER_STDERR_BYTES) {
        stderr = stderr.slice(-MAX_HELPER_STDERR_BYTES);
      }
      const lines = stderr.split(/\r?\n/);
      stderr = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith(HELPER_READY_PREFIX)) {
          const pid = Number(line.slice(HELPER_READY_PREFIX.length).trim());
          if (Number.isSafeInteger(pid) && pid > 0) this.appPid = pid;
          continue;
        }
        if (line.startsWith(HELPER_STATE_PREFIX)) {
          const next = line.slice(HELPER_STATE_PREFIX.length).trim() as AppSessionMediaState;
          if (MEDIA_STATES.has(next) && next !== this.mediaState) {
            this.mediaState = next;
            this.publishStatus();
          }
        }
      }
    });
    child.stdout.on("data", (chunk: Buffer) => this.consumeFrames(chunk));
    child.on("close", (code) => {
      if (this.disposed) return;
      this.exitCode = typeof code === "number" ? code : undefined;
      this.state = this.state === "stopping" || code === 0 ? "exited" : "failed";
      this.closePeer();
      this.publishStatus();
      for (const listener of [...this.exitListeners]) listener();
    });

    const bootstrap = {
      executable: this.bootstrap.profile.executable,
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
          (stderr.trim() ? `: ${stderr.trim()}` : "")
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
          (stderr.trim() ? `: ${stderr.trim()}` : "")
        ));
      });
    });

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
      createdAt: this.bootstrap.createdAt,
      connections,
      ...(this.appPid ? { pid: this.appPid } : {}),
      ...(this.exitCode !== undefined ? { exitCode: this.exitCode } : {})
    });
  }

  async negotiate(clientId: string, offerSdp: string): Promise<string> {
    if (this.state !== "running") throw new Error("Remote App is not running");
    this.closePeer();

    const connection = new this.wrtc.RTCPeerConnection({
      iceServers: this.bootstrap.iceServers
    });
    this.peer = { clientId, connection };

    connection.addTrack(this.videoTrack);
    connection.ondatachannel = (event: any) => {
      const channel = event.channel;
      if (!channel || channel.label !== "control") {
        try { channel?.close(); } catch { /* ignore */ }
        return;
      }
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
    if (killApp && helper && helper.exitCode === null && helper.signalCode === null) {
      try { helper.kill(); } catch { /* ignore */ }
    }
    helper?.stdin.destroy();
    helper?.stdout.destroy();
    helper?.stderr.destroy();
    this.statusListeners.clear();
    this.exitListeners.clear();
  }

  private forwardControl(source: string): void {
    const helper = this.helper;
    if (
      !helper ||
      helper.stdin.destroyed ||
      helper.stdin.writableNeedDrain ||
      this.state !== "running"
    ) return;
    try {
      const message = parseRemoteAppControlMessage(source);
      const encoded = JSON.stringify(message);
      helper.stdin.write(`${encoded}\n`, "utf8");
    } catch {
      // Invalid, oversized, or backpressured control input is dropped.
    }
  }

  private consumeFrames(chunk: Buffer): void {
    if (this.disposed || !this.videoSource) return;
    this.frameBuffer = this.frameBuffer.length === 0
      ? chunk
      : Buffer.concat([this.frameBuffer, chunk]);

    if (this.frameBuffer.length > MAX_FRAME_BYTES + FRAME_HEADER_BYTES) {
      this.frameBuffer = Buffer.alloc(0);
      return;
    }

    while (this.frameBuffer.length >= FRAME_HEADER_BYTES) {
      if (
        this.frameBuffer[0] !== 0x50 ||
        this.frameBuffer[1] !== 0x54 ||
        this.frameBuffer[2] !== 0x46 ||
        this.frameBuffer[3] !== 0x31
      ) {
        this.frameBuffer = Buffer.alloc(0);
        return;
      }
      const width = this.frameBuffer.readUInt32LE(4);
      const height = this.frameBuffer.readUInt32LE(8);
      const length = this.frameBuffer.readUInt32LE(12);
      const expected = width * height * 4;
      if (
        width < 2 || height < 2 ||
        width > 1600 || height > 1000 ||
        width % 2 !== 0 || height % 2 !== 0 ||
        length !== expected ||
        length < 1 || length > MAX_FRAME_BYTES
      ) {
        this.frameBuffer = Buffer.alloc(0);
        return;
      }
      if (this.frameBuffer.length < FRAME_HEADER_BYTES + length) return;

      const rgba = this.frameBuffer.subarray(FRAME_HEADER_BYTES, FRAME_HEADER_BYTES + length);
      this.frameBuffer = this.frameBuffer.subarray(FRAME_HEADER_BYTES + length);
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
        if (this.mediaState !== "streaming") {
          this.mediaState = "streaming";
          this.publishStatus();
        }
      } catch {
        // A malformed/native conversion failure drops only the current frame.
      }
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
