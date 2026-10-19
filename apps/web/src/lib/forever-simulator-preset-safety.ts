import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { readSimulatorManifest, simulatorDirectory } from "./forever-simulator";
import type { SimulatorPresentation } from "./forever-simulator-presentation";
import { readSimulatorModelUpdate } from "./forever-simulator-model-updates";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const releaseId = z.string().regex(/^[a-f0-9]{24}$/);
const reference = z.object({ path: z.string().min(1).max(2048), sha256: digest }).strict();
const parents = z.object({ warrior: releaseId, rogue: releaseId, hunter: releaseId }).strict();
const pointerSchema = z
  .object({
    schema: z.literal("kfc-simulator-preset-safety-selection.v1"),
    sourceRelease: releaseId,
    release: releaseId,
    reportSha256: digest,
    parents,
    browserReview: reference,
  })
  .strict();
const reportSchema = z.object({
  schema: z.literal("kfc-simulator-preset-safety.v1"),
  release: releaseId,
  sourceRelease: releaseId,
  parents,
  typecheckDiagnostics: z.literal(0),
  modelAssets: z.record(
    z.string(),
    z.object({ bytes: z.number().int().nonnegative(), sha256: digest }).strict(),
  ),
  repairs: z.array(z.object({ profile: z.string(), variant: z.string() })).length(28),
});
const reviewSchema = z.object({
  schema: z.literal("kfc-preset-safety-browser.v1"),
  status: z.literal("passed"),
  release: releaseId,
  reportSha256: digest,
  checked: z
    .object({
      allPresets: z.literal(true),
      reviewedShares: z.literal(true),
      firstVisitDefault: z.literal(true),
      savedCharacterPreserved: z.literal(true),
      modelAssetsUnchanged: z.literal(true),
      desktopMobile: z.literal(true),
    })
    .strict(),
  errors: z.array(z.string()).length(0),
});

async function readBounded(
  directory: string,
  path: string,
  limit: number,
): Promise<{ value: unknown; bytesSha256: string }> {
  const root = await realpath(directory);
  const canonical = await realpath(resolve(root, path));
  const offset = relative(root, canonical);
  if (!offset || offset === ".." || offset.startsWith("../") || isAbsolute(offset))
    throw new Error("Preset safety evidence escaped simulator storage");
  const metadata = await stat(canonical);
  if (!metadata.isFile() || metadata.size > limit)
    throw new Error("Invalid preset safety evidence size");
  const bytes = await readFile(canonical);
  if (bytes.length > limit) throw new Error("Preset safety evidence exceeded read budget");
  return {
    value: JSON.parse(bytes.toString("utf8")) as unknown,
    bytesSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function readSimulatorPresetSafety(
  presentation: SimulatorPresentation,
  profile: string,
  directory: string = simulatorDirectory(),
): Promise<string | null> {
  const modelUpdate = await readSimulatorModelUpdate(profile, directory);
  if (modelUpdate) {
    if (
      modelUpdate.sourceRelease !== presentation.sourceRelease ||
      modelUpdate.manifest.release !== presentation.manifest.release
    )
      throw new Error("Corrected model presentation is stale");
    return modelUpdate.manifest.release;
  }
  let raw: Awaited<ReturnType<typeof readBounded>>;
  try {
    raw = await readBounded(directory, "preset-safety.json", 32_000);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const pointer = pointerSchema.parse(raw.value);
  if (pointer.sourceRelease !== presentation.sourceRelease)
    throw new Error("Preset safety review is required for the new numerical source");
  const parent =
    profile === "warrior" || profile === "rogue" || profile === "hunter"
      ? pointer.parents[profile]
      : pointer.sourceRelease;
  if (parent !== presentation.manifest.release)
    throw new Error("Preset safety parent approval is stale");
  const manifest = await readSimulatorManifest(directory, pointer.release);
  if (!manifest?.pages.includes(profile)) throw new Error("Missing preset safety page");
  const report = await readBounded(directory, `${pointer.release}/kfc-preset-safety.json`, 512_000);
  if (
    report.bytesSha256 !== pointer.reportSha256 ||
    report.bytesSha256 !== manifest.files["kfc-preset-safety.json"]?.sha256
  )
    throw new Error("Preset safety report checksum mismatch");
  const evidence = reportSchema.parse(report.value);
  if (
    evidence.release !== pointer.release ||
    evidence.sourceRelease !== pointer.sourceRelease ||
    JSON.stringify(evidence.parents) !== JSON.stringify(pointer.parents)
  )
    throw new Error("Preset safety provenance mismatch");
  const source = await readSimulatorManifest(directory, pointer.sourceRelease);
  if (!source) throw new Error("Missing preset safety numerical source");
  const keys = Object.keys(source.files)
    .filter((name) => /wasm|worker|^assets\/database\//.test(name))
    .sort();
  if (
    !keys.includes("lib.wasm") ||
    JSON.stringify(Object.keys(evidence.modelAssets).sort()) !== JSON.stringify(keys)
  )
    throw new Error("Incomplete preset safety model evidence");
  for (const name of keys) {
    if (
      JSON.stringify(manifest.files[name]) !== JSON.stringify(source.files[name]) ||
      JSON.stringify(evidence.modelAssets[name]) !== JSON.stringify(source.files[name])
    )
      throw new Error("Preset repair changed numerical assets");
  }
  const review = await readBounded(directory, pointer.browserReview.path, 2_000_000);
  if (
    createHash("sha256").update(JSON.stringify(review.value)).digest("hex") !==
    pointer.browserReview.sha256
  )
    throw new Error("Preset safety browser checksum mismatch");
  const approval = reviewSchema.parse(review.value);
  if (approval.release !== pointer.release || approval.reportSha256 !== pointer.reportSha256)
    throw new Error("Preset safety browser approval is stale");
  return pointer.release;
}

export function remapSimulatorPresetHref(
  href: string,
  profile: string,
  parent: string,
  release: string,
): string {
  if (
    !/^[a-z_]+$/.test(profile) ||
    !releaseId.safeParse(parent).success ||
    !releaseId.safeParse(release).success
  )
    throw new Error("Invalid preset safety route");
  const url = new URL(href, "https://helper.invalid");
  if (
    !href.startsWith("/") ||
    href.startsWith("//") ||
    url.origin !== "https://helper.invalid" ||
    url.search ||
    ![`/forever-sim/${parent}/${profile}`, `/forever-sim/${parent}/${profile}/`].includes(
      url.pathname,
    )
  )
    throw new Error("Unexpected reviewed preset route");
  return `/forever-sim/${release}/${profile}/${url.hash}`;
}
