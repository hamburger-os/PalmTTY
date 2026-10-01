import { randomBytes } from "node:crypto";
import type { PalmTTYConfig } from "@palmtty/config";
import {
  isActiveAppSessionState,
  isTerminalAppSessionState,
  type AppSessionPublic,
  type RemoteAppCapabilities
} from "@palmtty/protocol";
import { controlEnvironmentKeys } from "./control-environment.js";
import { withoutEnvironmentKeys } from "./host-environment.js";
import { resolveRemoteAppHost } from "./remote-app-host.js";
import { RemoteAppWorkerClient } from "./remote-app-worker-client.js";
import {
  REMOTE_APP_WORKER_PROTOCOL_VERSION,
  type RemoteAppWorkerBootstrap
} from "./remote-app-worker-protocol.js";
import {
  cleanupDanglingRemoteAppState,
  defaultRemoteAppRuntimeDir,
  ensureRemoteAppRuntimeLayout,
  listRemoteAppRecords,
  readRemoteAppRecord,
  readRemoteAppSecret,
  removeRemoteAppWorkerState,
  type RemoteAppWorkerRecord
} from "./remote-app-worker-storage.js";
import {
  ProcessRemoteAppWorkerSpawner,
  type RemoteAppWorkerSpawner
} from "./remote-app-worker-spawner.js";
import { resolveRemoteAppLaunch } from "./remote-app-launch.js";
import { assertRemoteAppWebRtcAvailable } from "./remote-app-webrtc.js";
import type { WorkspaceStore } from "./workspace-store.js";

type ManagedRemoteApp = {
  record: RemoteAppWorkerRecord;
  secret: string;
  worker: RemoteAppWorkerClient;
  session: AppSessionPublic;
  reconnecting: boolean;
};

export type RemoteAppSessionManagerOptions = {
  runtimeDir?: string;
  workerSpawner?: RemoteAppWorkerSpawner;
  workspaceStore: WorkspaceStore;
};

const CREATE_CONNECT_DELAYS_MS = [0, 50, 100, 200, 400, 800, 1200, 1600];
const REDISCOVER_CONNECT_DELAYS_MS = [0, 100, 250, 500, 1000, 2000, 4000];
const RECONNECT_DELAYS_MS = [100, 250, 500, 1000, 2000, 5000];

function sessionId(): string {
  return randomBytes(24).toString("base64url");
}

function endpointId(): string {
  return randomBytes(18).toString("base64url");
}

function workerSecret(): string {
  return randomBytes(32).toString("base64url");
}

function processDefinitelyDead(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

export class RemoteAppSessionManager {
  readonly runtimeDir: string;
  private readonly workerSpawner: RemoteAppWorkerSpawner;
  private readonly sessions = new Map<string, ManagedRemoteApp>();
  private pendingCreates = 0;
  private initialized = false;
  private closing = false;
  private webRtcIssue: string | undefined;

  constructor(
    private readonly config: PalmTTYConfig,
    private readonly options: RemoteAppSessionManagerOptions
  ) {
    this.runtimeDir = options.runtimeDir ?? defaultRemoteAppRuntimeDir();
    this.workerSpawner = options.workerSpawner ?? new ProcessRemoteAppWorkerSpawner();
  }

  capabilities(): RemoteAppCapabilities {
    const enabled = this.config.remoteApps.enabled;
    const platformSupported = process.platform === "win32" && process.arch === "x64";
    const iceServers = this.config.remoteApps.webrtc.iceServers;
    return {
      supported: enabled && platformSupported && !this.webRtcIssue,
      platform: process.platform,
      transport: "webrtc",
      capture: "window",
      input: "restricted",
      iceServers,
      relayConfigured: iceServers.some((server) =>
        server.urls.some((url) => /^turns?:/i.test(url))
      ),
      ...(!enabled
        ? { reason: "Remote Apps are disabled by PalmTTY configuration" }
        : !platformSupported
          ? { reason: "Remote Apps currently require Windows x64" }
          : this.webRtcIssue
            ? { reason: this.webRtcIssue }
            : {})
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await ensureRemoteAppRuntimeLayout(this.runtimeDir);
    await cleanupDanglingRemoteAppState(this.runtimeDir);

    const records = await listRemoteAppRecords(this.runtimeDir);
    await Promise.all(records.map(async (record) => {
      try {
        const secret = await readRemoteAppSecret(this.runtimeDir, record.sessionId);
        const worker = await this.connectWithRetry(
          record.endpointId,
          secret,
          REDISCOVER_CONNECT_DELAYS_MS
        );
        this.install({
          record,
          secret,
          worker,
          session: worker.session,
          reconnecting: false
        });
      } catch {
        if (processDefinitelyDead(record.workerPid)) {
          await removeRemoteAppWorkerState(this.runtimeDir, record);
        }
      }
    }));
    if (this.config.remoteApps.enabled && process.platform === "win32" && process.arch === "x64") {
      try {
        await assertRemoteAppWebRtcAvailable();
        this.webRtcIssue = undefined;
      } catch (error) {
        this.webRtcIssue = error instanceof Error ? error.message : String(error);
      }
    }
    this.initialized = true;
  }

  list(): AppSessionPublic[] {
    this.requireInitialized();
    return [...this.sessions.values()]
      .map((managed) => this.publicSession(managed))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): AppSessionPublic | undefined {
    const managed = this.sessions.get(id);
    return managed ? this.publicSession(managed) : undefined;
  }

  hasActiveWorkspaceSessions(workspaceId: string): boolean {
    return [...this.sessions.values()].some(
      (managed) =>
        managed.session.workspaceId === workspaceId &&
        isActiveAppSessionState(managed.session.state)
    );
  }

  async create(workspaceId: string, profileId: string): Promise<AppSessionPublic> {
    this.requireInitialized();
    const capabilities = this.capabilities();
    if (!capabilities.supported) {
      throw new Error(capabilities.reason ?? "Remote Apps are unavailable");
    }

    const active = [...this.sessions.values()].filter(
      (managed) => isActiveAppSessionState(managed.session.state)
    ).length;
    if (active + this.pendingCreates >= this.config.remoteApps.maxSessions) {
      throw new Error(
        `Maximum Remote App Session count reached (${this.config.remoteApps.maxSessions})`
      );
    }

    const workspace = this.options.workspaceStore.get(workspaceId);
    if (!workspace) throw new Error("Unknown workspace");
    const profile = workspace.remoteApps.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error("Unknown Remote App profile");

    this.pendingCreates += 1;
    try {
      const launch = await resolveRemoteAppLaunch(workspace, profile);
      const excludedEnvKeys = controlEnvironmentKeys(this.config.auth.tokenEnv, {
        ...process.env,
        ...launch.environment
      });
      const environment = withoutEnvironmentKeys(
        launch.environment,
        excludedEnvKeys
      );
      await assertRemoteAppWebRtcAvailable();
      const helperPath = await resolveRemoteAppHost();
      const id = sessionId();
      const endpoint = endpointId();
      const secret = workerSecret();
      const createdAt = new Date().toISOString();
      const bootstrap: RemoteAppWorkerBootstrap = {
        protocol: REMOTE_APP_WORKER_PROTOCOL_VERSION,
        runtimeDir: this.runtimeDir,
        sessionId: id,
        endpointId: endpoint,
        secret,
        excludedEnvKeys,
        createdAt,
        workspaceId,
        helperPath,
        exitedRetentionMinutes: this.config.remoteApps.exitedRetentionMinutes,
        profile: {
          id: launch.id,
          name: launch.name,
          executable: launch.executable,
          args: launch.args,
          cwd: launch.cwd,
          environment
        }
      };

      await this.workerSpawner.spawn(bootstrap);
      let worker: RemoteAppWorkerClient | undefined;
      try {
        worker = await this.connectWithRetry(
          endpoint,
          secret,
          CREATE_CONNECT_DELAYS_MS
        );
        const record = await this.readRecordWithRetry(id);
        const adopted = await this.adoptWithRetry(
          worker,
          endpoint,
          secret,
          CREATE_CONNECT_DELAYS_MS
        );
        const managed: ManagedRemoteApp = {
          record,
          secret,
          worker: adopted,
          session: adopted.session,
          reconnecting: false
        };
        this.install(managed);
        return this.publicSession(managed);
      } catch (error) {
        worker?.close();
        throw error;
      }
    } finally {
      this.pendingCreates -= 1;
    }
  }

  async negotiate(
    id: string,
    offerSdp: string
  ): Promise<{ clientId: string; answerSdp: string }> {
    const managed = this.requireManaged(id);
    if (managed.session.state !== "running") {
      throw new Error("Remote App Session is not running");
    }
    const clientId = randomBytes(12).toString("base64url");
    const answerSdp = await managed.worker.negotiate(
      clientId,
      offerSdp,
      this.config.remoteApps.webrtc.iceServers
    );
    return { clientId, answerSdp };
  }

  async detach(id: string, clientId: string): Promise<void> {
    const managed = this.sessions.get(id);
    if (!managed || managed.reconnecting) return;
    await managed.worker.detach(clientId).catch(() => undefined);
  }

  async terminate(id: string): Promise<AppSessionPublic | undefined> {
    const managed = this.sessions.get(id);
    if (!managed) return undefined;
    await managed.worker.terminate();
    return this.publicSession(managed);
  }

  async remove(id: string): Promise<"missing" | "active" | "removed"> {
    const managed = this.sessions.get(id);
    if (!managed) return "missing";
    if (isActiveAppSessionState(managed.session.state)) return "active";

    await managed.worker.retire();
    if (this.sessions.get(id) === managed) this.sessions.delete(id);
    managed.worker.close();
    return "removed";
  }

  async close(): Promise<void> {
    this.closing = true;
    for (const managed of this.sessions.values()) managed.worker.close();
    this.sessions.clear();
  }

  private install(managed: ManagedRemoteApp): void {
    this.sessions.set(managed.record.sessionId, managed);
    managed.worker.onStatus((session) => {
      managed.session = session;
    });
    managed.worker.onClose(() => {
      if (
        this.closing ||
        this.sessions.get(managed.record.sessionId) !== managed
      ) return;

      if (isTerminalAppSessionState(managed.session.state)) {
        this.sessions.delete(managed.record.sessionId);
        return;
      }
      void this.reconnect(managed);
    });
  }

  private async reconnect(managed: ManagedRemoteApp): Promise<void> {
    if (managed.reconnecting || this.closing) return;
    managed.reconnecting = true;
    let attempt = 0;
    try {
      while (
        !this.closing &&
        this.sessions.get(managed.record.sessionId) === managed
      ) {
        const delay = RECONNECT_DELAYS_MS[
          Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)
        ] ?? 5000;
        attempt += 1;
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          const worker = await RemoteAppWorkerClient.connect({
            runtimeDir: this.runtimeDir,
            endpointId: managed.record.endpointId,
            secret: managed.secret
          });
          if (
            this.closing ||
            this.sessions.get(managed.record.sessionId) !== managed
          ) {
            worker.close();
            return;
          }
          managed.worker = worker;
          managed.session = worker.session;
          managed.reconnecting = false;
          this.install(managed);
          return;
        } catch {
          if (processDefinitelyDead(managed.record.workerPid)) {
            if (this.sessions.get(managed.record.sessionId) === managed) {
              this.sessions.delete(managed.record.sessionId);
            }
            await removeRemoteAppWorkerState(this.runtimeDir, managed.record);
            return;
          }
          // A live or unverifiable AppWorker retains recovery authority.
          // Keep retrying rather than converting a local IPC outage into
          // Remote App Session loss.
        }
      }
    } finally {
      managed.reconnecting = false;
    }
  }

  private publicSession(managed: ManagedRemoteApp): AppSessionPublic {
    return managed.session;
  }

  private requireManaged(id: string): ManagedRemoteApp {
    const managed = this.sessions.get(id);
    if (!managed) throw new Error("Unknown Remote App Session");
    if (managed.reconnecting) throw new Error("Remote App Worker is reconnecting");
    return managed;
  }

  private requireInitialized(): void {
    if (!this.initialized) throw new Error("Remote App manager is not initialized");
  }

  private async connectWithRetry(
    endpoint: string,
    secret: string,
    delays: number[]
  ): Promise<RemoteAppWorkerClient> {
    let lastError: unknown;
    for (const delay of delays) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        return await RemoteAppWorkerClient.connect({
          runtimeDir: this.runtimeDir,
          endpointId: endpoint,
          secret
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Unable to connect to Remote App Worker");
  }

  private async adoptWithRetry(
    initialWorker: RemoteAppWorkerClient,
    endpoint: string,
    secret: string,
    delays: number[]
  ): Promise<RemoteAppWorkerClient> {
    let worker = initialWorker;
    let lastError: unknown;
    for (let index = 0; index < delays.length; index += 1) {
      if (index > 0) {
        worker.close();
        const delay = delays[index] ?? 0;
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          worker = await RemoteAppWorkerClient.connect({
            runtimeDir: this.runtimeDir,
            endpointId: endpoint,
            secret
          });
        } catch (error) {
          lastError = error;
          continue;
        }
      }
      try {
        await worker.adopt();
        return worker;
      } catch (error) {
        lastError = error;
      }
    }
    worker.close();
    throw lastError instanceof Error
      ? lastError
      : new Error("Unable to adopt Remote App Worker");
  }

  private async readRecordWithRetry(id: string): Promise<RemoteAppWorkerRecord> {
    let lastError: unknown;
    for (const delay of [0, 25, 50, 100, 200, 400]) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        return await readRemoteAppRecord(this.runtimeDir, id);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Remote App Worker did not publish its metadata");
  }
}
