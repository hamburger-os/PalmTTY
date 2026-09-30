import { z } from "zod";

export const REMOTE_APP_PROTOCOL_VERSION = 1 as const;
export const REMOTE_APP_DATA_MAX_BYTES = 32 * 1024;
export const REMOTE_APP_MAX_SDP_BYTES = 256 * 1024;

const encoder = new TextEncoder();

export const RemoteAppProfileIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

export const RemoteAppProfileSchema = z.object({
  id: RemoteAppProfileIdSchema,
  name: z.string().trim().min(1).max(100),
  executable: z.string().trim().min(1).max(4096),
  args: z.array(z.string().max(4096)).max(32).default([]),
  frameRate: z.number().int().min(5).max(30).default(15),
  maxWidth: z.number().int().min(320).max(2560).default(1600),
  maxHeight: z.number().int().min(240).max(1600).default(1200)
}).strict();
export type RemoteAppProfile = z.infer<typeof RemoteAppProfileSchema>;

export const RemoteAppProfilesSchema = z.array(RemoteAppProfileSchema)
  .max(16)
  .superRefine((profiles, ctx) => {
    const ids = new Set<string>();
    for (const [index, profile] of profiles.entries()) {
      if (ids.has(profile.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Remote App profile ids must be unique"
        });
      }
      ids.add(profile.id);
    }
  });

export const AppSessionStateSchema = z.enum([
  "starting",
  "running",
  "stopping",
  "exited",
  "failed"
]);
export type AppSessionState = z.infer<typeof AppSessionStateSchema>;

export function isActiveAppSessionState(state: AppSessionState): boolean {
  return state === "starting" || state === "running" || state === "stopping";
}

export function isTerminalAppSessionState(state: AppSessionState): boolean {
  return state === "exited" || state === "failed";
}

export const AppSessionPublicSchema = z.object({
  id: z.string().min(16).max(128),
  workspaceId: z.string().min(1).max(64),
  profileId: RemoteAppProfileIdSchema,
  profileName: z.string().min(1).max(100),
  state: AppSessionStateSchema,
  createdAt: z.string().datetime(),
  connections: z.number().int().nonnegative(),
  pid: z.number().int().positive().optional(),
  exitCode: z.number().int().optional()
}).strict();
export type AppSessionPublic = z.infer<typeof AppSessionPublicSchema>;

export const CreateAppSessionSchema = z.object({
  workspaceId: z.string().min(1).max(64),
  profileId: RemoteAppProfileIdSchema
}).strict();
export type CreateAppSessionInput = z.infer<typeof CreateAppSessionSchema>;

const SdpSchema = z.string().min(1).superRefine((value, ctx) => {
  if (encoder.encode(value).byteLength > REMOTE_APP_MAX_SDP_BYTES) {
    ctx.addIssue({ code: "custom", message: "WebRTC SDP exceeds 256 KiB" });
  }
});

export const RemoteAppOfferRequestSchema = z.object({
  type: z.literal("offer"),
  sdp: SdpSchema
}).strict();
export type RemoteAppOfferRequest = z.infer<typeof RemoteAppOfferRequestSchema>;

export const RemoteAppAnswerResponseSchema = z.object({
  type: z.literal("answer"),
  sdp: SdpSchema,
  connectionId: z.string().min(1).max(128)
}).strict();
export type RemoteAppAnswerResponse = z.infer<typeof RemoteAppAnswerResponseSchema>;

export const RemoteAppCapabilitiesSchema = z.object({
  supported: z.boolean(),
  platform: z.string().min(1).max(32),
  transport: z.literal("webrtc"),
  capture: z.literal("window"),
  input: z.literal("restricted"),
  reason: z.string().max(512).optional()
}).strict();
export type RemoteAppCapabilities = z.infer<typeof RemoteAppCapabilitiesSchema>;

const UnitCoordinateSchema = z.number().finite().min(0).max(1);
const PointerButtonSchema = z.number().int().min(0).max(2);

export const RemoteAppControlMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pointer"),
    action: z.enum(["move", "down", "up"]),
    x: UnitCoordinateSchema,
    y: UnitCoordinateSchema,
    button: PointerButtonSchema.default(0)
  }).strict(),
  z.object({
    type: z.literal("pointerRelative"),
    dx: z.number().finite().min(-1).max(1),
    dy: z.number().finite().min(-1).max(1),
    action: z.enum(["move", "down", "up"]).default("move"),
    button: PointerButtonSchema.default(0)
  }).strict(),
  z.object({
    type: z.literal("wheel"),
    deltaX: z.number().finite().min(-4096).max(4096),
    deltaY: z.number().finite().min(-4096).max(4096)
  }).strict(),
  z.object({
    type: z.literal("key"),
    action: z.enum(["down", "up"]),
    key: z.string().min(1).max(64),
    code: z.string().max(64).default(""),
    ctrl: z.boolean().default(false),
    alt: z.boolean().default(false),
    shift: z.boolean().default(false),
    meta: z.boolean().default(false)
  }).strict(),
  z.object({
    type: z.literal("text"),
    text: z.string().min(1).max(16 * 1024)
  }).strict()
]);
export type RemoteAppControlMessage = z.infer<typeof RemoteAppControlMessageSchema>;

export function parseRemoteAppControlMessage(value: string): RemoteAppControlMessage {
  if (encoder.encode(value).byteLength > REMOTE_APP_DATA_MAX_BYTES) {
    throw new Error("Remote App control message exceeds 32 KiB");
  }
  return RemoteAppControlMessageSchema.parse(JSON.parse(value));
}

export function encodeRemoteAppControlMessage(message: RemoteAppControlMessage): string {
  const value = JSON.stringify(RemoteAppControlMessageSchema.parse(message));
  if (encoder.encode(value).byteLength > REMOTE_APP_DATA_MAX_BYTES) {
    throw new Error("Remote App control message exceeds 32 KiB");
  }
  return value;
}
