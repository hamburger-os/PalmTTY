import { z } from "zod";
import {
  AppSessionPublicSchema,
  REMOTE_APP_MAX_SDP_BYTES,
  RemoteAppIceServerSchema,
  RemoteAppLaunchSchema
} from "@palmtty/protocol";
import { FramedJsonSocket } from "./worker-protocol.js";

export { FramedJsonSocket };

export const REMOTE_APP_WORKER_PROTOCOL_VERSION = 2 as const;

const encoder = new TextEncoder();
const RequestIdSchema = z.string().min(1).max(128);

export const ResolvedRemoteAppProfileSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  launch: RemoteAppLaunchSchema,
  args: z.array(z.string().max(4096)).max(32),
  cwd: z.string().min(1).max(4096),
  environment: z.record(z.string(), z.string())
}).strict();
export type ResolvedRemoteAppProfile = z.infer<typeof ResolvedRemoteAppProfileSchema>;

export const RemoteAppWorkerBootstrapSchema = z.object({
  protocol: z.literal(REMOTE_APP_WORKER_PROTOCOL_VERSION),
  runtimeDir: z.string().min(1),
  sessionId: z.string().min(16).max(128),
  endpointId: z.string().min(16).max(128),
  secret: z.string().min(32).max(256),
  excludedEnvKeys: z.array(z.string().min(1).max(256)).max(64),
  createdAt: z.string().datetime(),
  workspaceId: z.string().min(1).max(64),
  helperPath: z.string().min(1).max(4096),
  exitedRetentionMinutes: z.number().int().min(1).max(1440),
  profile: ResolvedRemoteAppProfileSchema
}).strict();
export type RemoteAppWorkerBootstrap = z.infer<typeof RemoteAppWorkerBootstrapSchema>;

const SdpSchema = z.string().min(1).superRefine((value, ctx) => {
  if (encoder.encode(value).byteLength > REMOTE_APP_MAX_SDP_BYTES) {
    ctx.addIssue({ code: "custom", message: "WebRTC SDP exceeds 64 KiB" });
  }
});

export const RemoteAppWorkerRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    requestId: RequestIdSchema,
    protocol: z.literal(REMOTE_APP_WORKER_PROTOCOL_VERSION),
    secret: z.string().min(1).max(256)
  }).strict(),
  z.object({
    type: z.literal("adopt"),
    requestId: RequestIdSchema
  }).strict(),
  z.object({
    type: z.literal("negotiate"),
    requestId: RequestIdSchema,
    clientId: z.string().min(1).max(128),
    offerSdp: SdpSchema,
    iceServers: z.array(RemoteAppIceServerSchema).max(8)
  }).strict(),
  z.object({
    type: z.literal("detach"),
    requestId: RequestIdSchema,
    clientId: z.string().min(1).max(128)
  }).strict(),
  z.object({
    type: z.literal("terminate"),
    requestId: RequestIdSchema
  }).strict(),
  z.object({
    type: z.literal("retire"),
    requestId: RequestIdSchema
  }).strict(),
  z.object({
    type: z.literal("ping"),
    requestId: RequestIdSchema
  }).strict()
]);
export type RemoteAppWorkerRequest = z.infer<typeof RemoteAppWorkerRequestSchema>;

export const RemoteAppWorkerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("response"),
    requestId: RequestIdSchema,
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().max(512).optional()
  }).strict(),
  z.object({
    type: z.literal("status"),
    session: AppSessionPublicSchema
  }).strict()
]);
export type RemoteAppWorkerEvent = z.infer<typeof RemoteAppWorkerEventSchema>;
