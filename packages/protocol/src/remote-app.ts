import { z } from "zod";

export const REMOTE_APP_PROTOCOL_VERSION = 2 as const;
export const REMOTE_APP_DATA_MAX_BYTES = 32 * 1024;
export const REMOTE_APP_MAX_SDP_BYTES = 64 * 1024;
export const REMOTE_APP_CAPTURE_MIN_WIDTH = 320;
export const REMOTE_APP_CAPTURE_MIN_HEIGHT = 240;
export const REMOTE_APP_CAPTURE_MAX_WIDTH = 1600;
export const REMOTE_APP_CAPTURE_MAX_HEIGHT = 1000;
export const REMOTE_APP_CAPTURE_DEFAULT_WIDTH = 1280;
export const REMOTE_APP_CAPTURE_DEFAULT_HEIGHT = 800;
export const REMOTE_APP_CAPTURE_DEFAULT_FPS = 12;
export const REMOTE_APP_CAPTURE_MAX_FPS = 15;

const encoder = new TextEncoder();

export const RemoteAppProfileIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const ExecutableSchema = z.string().trim().min(1).max(4096)
  .refine((value) => !value.includes("\0"), "Remote App executable must not contain NUL");
const AppUserModelIdSchema = z.string().min(5).max(384)
  .regex(/^[a-zA-Z0-9._-]+![a-zA-Z0-9._-]+$/, "Invalid packaged application ID");
const PackageFamilyNameSchema = z.string().min(3).max(256)
  .regex(/^[a-zA-Z0-9._~-]+$/, "Invalid package family name");

/** Launch identity is persisted, never supplied to session create/signaling. */
export const RemoteAppLaunchSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("win32"), executable: ExecutableSchema }).strict(),
  z.object({
    kind: z.literal("packaged"),
    appUserModelId: AppUserModelIdSchema,
    packageFamilyName: PackageFamilyNameSchema
  }).strict().refine(
    (entry) => entry.appUserModelId.startsWith(entry.packageFamilyName + "!"),
    "Packaged application ID must belong to the selected package"
  )
]);
export type RemoteAppLaunch = z.infer<typeof RemoteAppLaunchSchema>;

export const RemoteAppProfileSchema = z.object({
  id: RemoteAppProfileIdSchema,
  name: z.string().trim().min(1).max(100),
  launch: RemoteAppLaunchSchema,
  args: z.array(
    z.string().max(4096)
      .refine((value) => !value.includes("\0"), "Remote App argv must not contain NUL")
  ).max(32).default([])
}).strict().superRefine((profile, ctx) => {
  const argumentCharacters = profile.args.reduce(
    (total, argument) => total + argument.length,
    0
  );
  if (argumentCharacters > 24_000) {
    ctx.addIssue({
      code: "custom",
      path: ["args"],
      message: "Remote App argv exceeds 24,000 characters"
    });
  }
});
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

export const RemoteAppIceServerSchema = z.object({
  urls: z.array(
    z.string()
      .trim()
      .min(1)
      .max(2048)
      .regex(
        /^(stun|turn|turns):[^\s\u0000-\u001F\u007F]+$/i,
        "Remote App ICE URLs must use stun:, turn:, or turns: without whitespace/control characters"
      )
  ).min(1).max(8),
  username: z.string().max(512).optional(),
  credential: z.string().max(1024).optional()
}).strict().superRefine((server, ctx) => {
  for (const [index, value] of server.urls.entries()) {
    if (!/^(stun|turn|turns):/i.test(value)) {
      ctx.addIssue({
        code: "custom",
        path: ["urls", index],
        message: "Remote App ICE URLs must use stun:, turn:, or turns:"
      });
    }
  }
});
export type RemoteAppIceServer = z.infer<typeof RemoteAppIceServerSchema>;

export const AppSessionStateSchema = z.enum([
  "starting",
  "running",
  "stopping",
  "exited",
  "failed"
]);
export type AppSessionState = z.infer<typeof AppSessionStateSchema>;

export const AppSessionMediaStateSchema = z.enum([
  "launching",
  "waiting-for-window",
  "waiting-for-frame",
  "streaming",
  "capture-unavailable"
]);
export type AppSessionMediaState = z.infer<typeof AppSessionMediaStateSchema>;

export function isActiveAppSessionState(state: AppSessionState): boolean {
  return state === "starting" || state === "running" || state === "stopping";
}

export function isTerminalAppSessionState(state: AppSessionState): boolean {
  return state === "exited" || state === "failed";
}

export const RemoteAppMediaDiagnosticsSchema = z.object({
  sourceFrames: z.number().int().nonnegative(),
  submittedFrames: z.number().int().nonnegative(),
  conversionFailures: z.number().int().nonnegative(),
  lastSubmittedAt: z.string().datetime().optional(),
  failure: z.enum(["invalid-frame", "frame-conversion"]).optional()
}).strict();
export type RemoteAppMediaDiagnostics = z.infer<typeof RemoteAppMediaDiagnosticsSchema>;

export const AppSessionPublicSchema = z.object({
  id: z.string().min(16).max(128),
  workspaceId: z.string().min(1).max(64),
  profileId: RemoteAppProfileIdSchema,
  profileName: z.string().min(1).max(100),
  state: AppSessionStateSchema,
  mediaState: AppSessionMediaStateSchema,
  mediaDiagnostics: RemoteAppMediaDiagnosticsSchema.optional(),
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
    ctx.addIssue({ code: "custom", message: "WebRTC SDP exceeds 64 KiB" });
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
  iceServers: z.array(RemoteAppIceServerSchema).max(8),
  relayConfigured: z.boolean(),
  reason: z.string().max(512).optional()
}).strict();
export type RemoteAppCapabilities = z.infer<typeof RemoteAppCapabilitiesSchema>;

export const RemoteAppCatalogEntrySchema = z.object({
  name: z.string().trim().min(1).max(100),
  launch: RemoteAppLaunchSchema,
  source: z.enum(["detected", "path"])
}).strict();
export type RemoteAppCatalogEntry = z.infer<typeof RemoteAppCatalogEntrySchema>;

export const RemoteAppCatalogResponseSchema = z.object({
  apps: z.array(RemoteAppCatalogEntrySchema).max(64)
}).strict();
export type RemoteAppCatalogResponse = z.infer<typeof RemoteAppCatalogResponseSchema>;

export const BrowseRemoteAppExecutableRequestSchema = z.object({
  path: z.string().trim().min(1).max(4096).optional()
}).strict();
export type BrowseRemoteAppExecutableRequest = z.infer<
  typeof BrowseRemoteAppExecutableRequestSchema
>;

export const RemoteAppExecutableLocationSchema = z.object({
  label: z.string().min(1).max(512),
  path: z.string().min(1).max(4096)
}).strict();
export type RemoteAppExecutableLocation = z.infer<
  typeof RemoteAppExecutableLocationSchema
>;

export const RemoteAppExecutableListingSchema = z.object({
  currentPath: z.string().min(1).max(4096),
  parentPath: z.string().min(1).max(4096).nullable(),
  locations: z.array(RemoteAppExecutableLocationSchema).max(64),
  directories: z.array(RemoteAppExecutableLocationSchema).max(256),
  executables: z.array(RemoteAppCatalogEntrySchema).max(256),
  truncated: z.boolean()
}).strict();
export type RemoteAppExecutableListing = z.infer<
  typeof RemoteAppExecutableListingSchema
>;

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
  }).strict(),
  z.object({
    type: z.literal("display"),
    width: z.number().int()
      .min(REMOTE_APP_CAPTURE_MIN_WIDTH)
      .max(REMOTE_APP_CAPTURE_MAX_WIDTH),
    height: z.number().int()
      .min(REMOTE_APP_CAPTURE_MIN_HEIGHT)
      .max(REMOTE_APP_CAPTURE_MAX_HEIGHT)
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
