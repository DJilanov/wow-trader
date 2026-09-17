import { z } from "zod";

export const productKindSchema = z.enum(["tbc", "forever"]);
export type ProductKind = z.infer<typeof productKindSchema>;

export const productConfigurationSchema = z.object({
  id: z.string().min(1).max(64),
  kind: productKindSchema,
  label: z.string().min(1).max(128),
  rootPath: z.string().min(1).max(4_096),
  enabled: z.boolean(),
});
export type ProductConfiguration = z.infer<typeof productConfigurationSchema>;

export const companionPhaseSchema = z.enum([
  "setup_required",
  "paused",
  "waiting_for_saved_scan",
  "scan_detected",
  "uploading",
  "processing",
  "up_to_date",
  "offline",
  "error",
]);
export type CompanionPhase = z.infer<typeof companionPhaseSchema>;

export const productStatusSchema = z.object({
  id: z.string(),
  kind: productKindSchema,
  label: z.string(),
  rootPath: z.string(),
  enabled: z.boolean(),
  collectorFileCount: z.number().int().nonnegative(),
});
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const companionSnapshotSchema = z.object({
  phase: companionPhaseSchema,
  automaticUploads: z.boolean(),
  products: z.array(productStatusSchema),
  pendingScanCount: z.number().int().nonnegative(),
  activeScanId: z.string().uuid().nullable(),
  activeCharacterLabel: z.string().nullable(),
  lastProcessedAt: z.string().datetime().nullable(),
  lastProcessedScanId: z.string().uuid().nullable(),
  message: z.string(),
  errorCode: z.string().nullable(),
  updatedAt: z.string().datetime(),
});
export type CompanionSnapshot = z.infer<typeof companionSnapshotSchema>;
