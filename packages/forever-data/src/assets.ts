import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ForeverExport, ForeverSupplemental } from "./schemas.js";

interface AssetReference {
  readonly kind: "background" | "icon";
  readonly key: string;
  readonly url: string;
}

interface AssetManifestEntry {
  readonly kind: AssetReference["kind"];
  readonly key: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ForeverAssetSyncResult {
  readonly root: string;
  readonly total: number;
  readonly downloaded: number;
  readonly reused: number;
  readonly missing: readonly string[];
}

export async function syncForeverAssets(
  data: ForeverExport,
  supplemental: ForeverSupplemental,
  outputRoot: string,
  snapshotChecksum: string,
  fetcher: typeof fetch = fetch,
): Promise<ForeverAssetSyncResult> {
  const references = collectAssetReferences(data, supplemental);
  const reusableEntries = await readReusableEntries(outputRoot, snapshotChecksum);
  await Promise.all([
    mkdir(join(outputRoot, "icons"), { recursive: true }),
    mkdir(join(outputRoot, "backgrounds"), { recursive: true }),
  ]);

  let downloaded = 0;
  let reused = 0;
  const missing: string[] = [];
  const entries: AssetManifestEntry[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(12, references.length) }, async () => {
    while (cursor < references.length) {
      const reference = references[cursor];
      cursor += 1;
      if (!reference) continue;
      const filePath = assetPath(outputRoot, reference);
      const expected = reusableEntries.get(`${reference.kind}:${reference.key}`);
      if (expected) {
        try {
          const existing = await readFile(filePath);
          const actual = manifestEntry(reference, existing);
          if (actual.bytes === expected.bytes && actual.sha256 === expected.sha256) {
            entries.push(actual);
            reused += 1;
            continue;
          }
        } catch (error: unknown) {
          if (!isMissingFileError(error)) throw error;
        }
      }

      try {
        const response = await fetcher(reference.url, {
          headers: { accept: "image/jpeg", "user-agent": "KFC-Helper/1.0" },
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().startsWith("image/")) {
          throw new Error(`unexpected content type ${contentType || "unknown"}`);
        }
        const image = new Uint8Array(await response.arrayBuffer());
        if (image.byteLength === 0 || image.byteLength > 2_000_000) {
          throw new Error(`invalid image size ${image.byteLength}`);
        }
        const temporaryPath = `${filePath}.${process.pid}.tmp`;
        await writeFile(temporaryPath, image, { flag: "wx" });
        await rename(temporaryPath, filePath);
        entries.push(manifestEntry(reference, image));
        downloaded += 1;
      } catch {
        missing.push(`${reference.kind}:${reference.key}`);
      }
    }
  });
  await Promise.all(workers);
  entries.sort((left, right) =>
    `${left.kind}:${left.key}`.localeCompare(`${right.kind}:${right.key}`),
  );
  await writeFile(
    join(outputRoot, "manifest.json"),
    `${JSON.stringify(
      {
        version: "forever-asset-manifest.v1",
        snapshotChecksum,
        generatedAt: new Date().toISOString(),
        entries,
        missing,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { root: outputRoot, total: references.length, downloaded, reused, missing };
}

async function readReusableEntries(
  outputRoot: string,
  snapshotChecksum: string,
): Promise<ReadonlyMap<string, AssetManifestEntry>> {
  try {
    const unknownManifest: unknown = JSON.parse(
      await readFile(join(outputRoot, "manifest.json"), "utf8"),
    );
    if (!unknownManifest || typeof unknownManifest !== "object") return new Map();
    const manifest = unknownManifest as {
      readonly version?: unknown;
      readonly snapshotChecksum?: unknown;
      readonly missing?: unknown;
      readonly entries?: unknown;
    };
    if (
      manifest.version !== "forever-asset-manifest.v1" ||
      manifest.snapshotChecksum !== snapshotChecksum ||
      !Array.isArray(manifest.missing) ||
      manifest.missing.length > 0 ||
      !Array.isArray(manifest.entries)
    ) {
      return new Map();
    }
    return new Map(
      manifest.entries.flatMap((candidate): readonly [string, AssetManifestEntry][] => {
        if (!isManifestEntry(candidate)) return [];
        return [[`${candidate.kind}:${candidate.key}`, candidate]];
      }),
    );
  } catch (error: unknown) {
    if (error instanceof SyntaxError || isMissingFileError(error)) return new Map();
    throw error;
  }
}

function collectAssetReferences(
  data: ForeverExport,
  supplemental: ForeverSupplemental,
): AssetReference[] {
  const iconKeys = new Set<string>(Object.values(supplemental.spellbookIcons));
  const backgroundKeys = new Set<string>();
  for (const classData of Object.values(data.talents)) {
    iconKeys.add(classData.icon);
    for (const tree of classData.trees) {
      iconKeys.add(tree.icon);
      backgroundKeys.add(String(tree.bg));
      for (const talent of tree.talents) iconKeys.add(talent.icon);
    }
  }
  for (const races of Object.values(data.racials)) {
    for (const race of races) {
      iconKeys.add(race.icon);
      for (const ability of race.abilities) iconKeys.add(ability[2]);
    }
  }
  for (const classRacials of Object.values(data.class_racials)) {
    for (const abilities of Object.values(classRacials.races)) {
      for (const ability of abilities) iconKeys.add(ability[2]);
    }
  }
  for (const abilities of Object.values(data.class_abilities)) {
    for (const ability of abilities) iconKeys.add(ability[2]);
  }
  for (const tree of data.legacy.trees) {
    iconKeys.add(tree.icon);
    for (const perk of tree.perks) iconKeys.add(perk[3]);
  }

  return [
    ...[...iconKeys].sort().map((key) => ({
      kind: "icon" as const,
      key,
      url: `https://talentsforever.com/assets/icons/${key}.jpg`,
    })),
    ...[...backgroundKeys].sort().map((key) => ({
      kind: "background" as const,
      key,
      url: `https://talentsforever.com/assets/bg/${key}.jpg`,
    })),
  ];
}

function assetPath(root: string, reference: AssetReference): string {
  return join(root, reference.kind === "icon" ? "icons" : "backgrounds", `${reference.key}.jpg`);
}

function manifestEntry(reference: AssetReference, bytes: Uint8Array): AssetManifestEntry {
  return {
    kind: reference.kind,
    key: reference.key,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function isManifestEntry(value: unknown): value is AssetManifestEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AssetManifestEntry>;
  return (
    (candidate.kind === "icon" || candidate.kind === "background") &&
    typeof candidate.key === "string" &&
    typeof candidate.bytes === "number" &&
    Number.isSafeInteger(candidate.bytes) &&
    candidate.bytes > 0 &&
    typeof candidate.sha256 === "string" &&
    /^[a-f0-9]{64}$/u.test(candidate.sha256)
  );
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
