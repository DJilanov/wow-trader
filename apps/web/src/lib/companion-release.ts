import "server-only";

import path from "node:path";
import { readFile } from "node:fs/promises";

import {
  companionReleaseSchema,
  type CompanionRelease,
  type CompanionReleaseAsset,
} from "./companion-release-contract";

export type { CompanionRelease, CompanionReleaseAsset } from "./companion-release-contract";

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
