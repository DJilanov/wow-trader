import { z } from "zod";

const productKindSchema = z.enum(["tbc", "forever"]);
const productConfigurationSchema = z.object({
  id: z.string().min(1).max(64),
  kind: productKindSchema,
  label: z.string().min(1).max(128),
  rootPath: z.string().min(1).max(4_096),
  enabled: z.boolean(),
});
const companionSnapshotSchema = z.object({
  phase: z.enum([
    "setup_required",
    "paused",
    "waiting_for_saved_scan",
    "scan_detected",
    "uploading",
    "processing",
    "up_to_date",
    "offline",
    "error",
  ]),
  automaticUploads: z.boolean(),
  products: z.array(
    productConfigurationSchema.extend({ collectorFileCount: z.number().int().nonnegative() }),
  ),
  pendingScanCount: z.number().int().nonnegative(),
  activeScanId: z.string().uuid().nullable(),
  activeCharacterLabel: z.string().nullable(),
  lastProcessedAt: z.string().datetime().nullable(),
  lastProcessedScanId: z.string().uuid().nullable(),
  message: z.string(),
  errorCode: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export const desktopSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  endpoint: z.string().url(),
  automaticUploads: z.boolean(),
  startAtLogin: z.boolean(),
  notificationsEnabled: z.boolean(),
  products: z.array(productConfigurationSchema),
});
export type DesktopSettings = z.infer<typeof desktopSettingsSchema>;

export const addonHealthSchema = z.enum(["missing", "outdated", "ready", "unavailable"]);
export type AddonHealth = z.infer<typeof addonHealthSchema>;

export const desktopProductStatusSchema = productConfigurationSchema.extend({
  rootExists: z.boolean(),
  auctionatorInstalled: z.boolean(),
  collectorHealth: addonHealthSchema,
  collectorVersion: z.string().nullable(),
  collectorFileCount: z.number().int().nonnegative(),
  latestFileModifiedAt: z.string().datetime().nullable(),
});
export type DesktopProductStatus = z.infer<typeof desktopProductStatusSchema>;

export const desktopSnapshotSchema = z.object({
  companion: companionSnapshotSchema,
  settings: desktopSettingsSchema,
  credentialConfigured: z.boolean(),
  legacyServiceDetected: z.boolean(),
  products: z.array(desktopProductStatusSchema),
  recentActivity: z.array(
    z.object({
      scanId: z.string().uuid(),
      productId: z.string(),
      status: z.enum(["processed", "failed"]),
      occurredAt: z.string().datetime(),
      characterLabel: z.string().nullable(),
      message: z.string(),
      realmId: z.string().nullable().optional(),
      marketCount: z.number().int().nonnegative().optional(),
      receipt: z.enum(["processed", "duplicate", "failed"]).optional(),
    }),
  ),
  appVersion: z.string(),
});
export type DesktopSnapshot = z.infer<typeof desktopSnapshotSchema>;

export const utilityCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("configure"),
    endpoint: z.string().url(),
    statePath: z.string().min(1),
    products: z.array(productConfigurationSchema),
    automaticUploads: z.boolean(),
    credential: z.string().min(16).nullable(),
  }),
  z.object({ type: z.literal("check_now") }),
  z.object({ type: z.literal("retry") }),
  z.object({ type: z.literal("set_automatic"), enabled: z.boolean() }),
  z.object({ type: z.literal("set_credential"), credential: z.string().min(16).nullable() }),
  z.object({ type: z.literal("update_products"), products: z.array(productConfigurationSchema) }),
  z.object({ type: z.literal("stop") }),
]);
export type UtilityCommand = z.infer<typeof utilityCommandSchema>;

export const utilityEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("snapshot"), snapshot: companionSnapshotSchema }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
]);
export type UtilityEvent = z.infer<typeof utilityEventSchema>;

export const rendererCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("get_snapshot") }),
  z.object({ type: z.literal("check_now") }),
  z.object({ type: z.literal("retry") }),
  z.object({ type: z.literal("set_automatic"), enabled: z.boolean() }),
  z.object({ type: z.literal("set_start_at_login"), enabled: z.boolean() }),
  z.object({ type: z.literal("set_notifications"), enabled: z.boolean() }),
  z.object({ type: z.literal("choose_product_root"), product: productKindSchema }),
  z.object({ type: z.literal("install_collector"), productId: z.string().min(1).max(64) }),
  z.object({ type: z.literal("save_credential"), credential: z.string().min(16).max(512) }),
  z.object({ type: z.literal("remove_credential") }),
  z.object({ type: z.literal("disable_legacy_service") }),
  z.object({ type: z.literal("open_trader") }),
  z.object({ type: z.literal("open_logs") }),
]);
export type RendererCommand = z.infer<typeof rendererCommandSchema>;

export const rendererResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), snapshot: desktopSnapshotSchema }),
  z.object({
    ok: z.literal(false),
    code: z.string().min(1).max(128),
    message: z.string().min(1).max(1_024),
  }),
]);
export type RendererResult = z.infer<typeof rendererResultSchema>;

export const IPC_INVOKE_CHANNEL = "wow-trader:invoke";
export const IPC_SNAPSHOT_CHANNEL = "wow-trader:snapshot";
