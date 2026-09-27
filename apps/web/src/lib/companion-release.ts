import "server-only";

import path from "node:path";
import { readFile } from "node:fs/promises";

import { z } from "zod";

const releaseAssetSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  label: z.string().min(1).max(100),
  platform: z.enum(["macos", "windows"]),
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

const companionReleaseSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/),
  channel: z.enum(["maintainer-alpha", "public"]),
  publishedAt: z.string().datetime(),
  collectorVersion: z.string().min(1).max(32),
  supportedProducts: z.array(z.enum(["wow_anniversary", "wow_classic_beta"])).min(1),
  minimumMacOs: z.string().min(1).max(32).optional(),
  notes: z.array(z.string().min(1).max(300)).max(12),
  assets: z.array(releaseAssetSchema).min(1),
});

export type CompanionRelease = z.infer<typeof companionReleaseSchema>;
export type CompanionReleaseAsset = CompanionRelease["assets"][number];

export interface ResolvedCompanionAsset {
  readonly release: CompanionRelease;
  readonly asset: CompanionReleaseAsset;
  readonly absolutePath: string;
}

export async function getCompanionRelease(): Promise<CompanionRelease | null> {
  const root = releaseRoot();
  if (!root) return null;
  try {
    const contents = await readFile(path.join(root, "latest.json"), "utf8");
    return companionReleaseSchema.parse(JSON.parse(contents) as unknown);
  } catch {
    return null;
  }
}

export async function resolveCompanionAsset(
  assetId: string,
): Promise<ResolvedCompanionAsset | null> {
  const root = releaseRoot();
  if (!root) return null;
  const release = await getCompanionRelease();
  const asset = release?.assets.find((candidate) => candidate.id === assetId);
  if (!release || !asset) return null;

  const releaseDirectory = path.resolve(root, "releases", release.version);
  const absolutePath = path.resolve(releaseDirectory, asset.filename);
  if (!absolutePath.startsWith(`${releaseDirectory}${path.sep}`)) return null;
  return { release, asset, absolutePath };
}

function releaseRoot(): string | null {
  const configured = process.env.COMPANION_RELEASE_ROOT?.trim();
  return configured ? path.resolve(configured) : null;
}
