import { z } from "zod";

export const companionReleaseAssetSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  label: z.string().min(1).max(100),
  platform: z.enum(["macos", "windows", "linux"]),
  architecture: z.enum(["x64", "arm64", "universal"]),
  filename: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 ._()-]{1,180}$/),
  contentType: z.enum([
    "application/x-apple-diskimage",
    "application/zip",
    "application/x-msdownload",
  ]),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  signed: z.boolean(),
  recommended: z.boolean(),
});

export const companionReleaseSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/),
  channel: z.enum(["maintainer-alpha", "public"]),
  publishedAt: z.string().datetime(),
  collectorVersion: z.string().min(1).max(32),
  supportedProducts: z.array(z.enum(["wow_anniversary", "wow_classic_beta"])).min(1),
  minimumMacOs: z.string().min(1).max(64).optional(),
  minimumWindows: z.string().min(1).max(64).optional(),
  minimumLinux: z.string().min(1).max(100).optional(),
  notes: z.array(z.string().min(1).max(300)).max(12),
  assets: z.array(companionReleaseAssetSchema).min(1),
});

export type CompanionRelease = z.infer<typeof companionReleaseSchema>;
export type CompanionReleaseAsset = CompanionRelease["assets"][number];
