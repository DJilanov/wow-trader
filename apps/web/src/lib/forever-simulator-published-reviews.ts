import { validateFullRaidDruidPublishedRows } from "./forever-simulator-full-raid-druid-registration";
import { readQualifiedTankSimulatorModelUpdate } from "./forever-simulator-qualified-tank-model";
import { readQualifiedCombatSimulatorModelUpdate } from "./forever-simulator-qualified-combat-model";
import { readQualifiedDpsSimulatorModelUpdate } from "./forever-simulator-qualified-dps-model";
import { readQualifiedWarriorTankSimulatorModelUpdate } from "./forever-simulator-qualified-warrior-tank-model";
import { createHash } from "node:crypto";
import console from "node:console";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";
import type { SimulatorPresentation } from "./forever-simulator-presentation";
import { simulatorDirectory } from "./forever-simulator";
import { validateSimulatorModelUpdateBuilds } from "./forever-simulator-model-updates";
import { validateFullRaidRoguePublishedRows } from "./forever-simulator-full-raid-rogue-profile";
import { validateFullRaidHunterPublishedRows } from "./forever-simulator-full-raid-hunter-profile";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const release = z.string().regex(/^[a-f0-9]{24}$/);
const profileName = z.string().regex(/^[a-z][a-z_]*$/);
const rotationGuidance = z
  .object({
    talents: z.string().min(1).max(100),
    scenario: z.string().min(1).max(4000),
    instruction: z.string().min(1).max(12000).optional(),
    prepull: z.array(z.string().min(1).max(4000)).max(16).optional(),
    priorities: z.array(z.string().min(1).max(4000)).min(1).max(32),
    caveats: z.array(z.string().min(1).max(4000)).max(20),
  })
  .strict();
const build = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    spec: z.string().regex(/^[a-z_]+\/[a-z_]+$/),
    faction: z.enum(["Alliance", "Horde", "alliance", "horde"]),
    scenario: z.string().min(1).max(100),
    stage: z.string().min(1).max(200),
    status: z.literal("reviewed"),
    href: z.string().min(100).max(512_000),
    referenceDps: z.number().finite().positive(),
    requiresProvisionalEnchantOptIn: z.boolean(),
    warnings: z.array(z.string().min(1).max(4000)).max(20),
    displayName: z.string().min(1).max(160).optional(),
    validationIterations: z.number().int().positive().safe(),
    rotationGuidance: rotationGuidance.optional(),
  })
  .strict();
const publication = z
  .object({
    schema: z.literal("kfc-published-simulator-profile.v1"),
    profile: profileName,
    sourceRelease: release,
    presentationRelease: release,
    presentationProofSha256: digest,
    builds: z.array(build).min(1).max(40),
  })
  .strict();
const pointer = z
  .object({
    schema: z.literal("kfc-published-simulator-reviews.v1"),
    profiles: z.record(
      profileName,
      z.object({ path: z.string().min(1).max(200), sha256: digest }).strict(),
    ),
  })
  .strict();

export type PublishedSimulatorProfile = z.infer<typeof publication>;
type PublishedSimulatorBuild = z.infer<typeof build>;

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createPublishedSimulatorProfile(
  presentation: SimulatorPresentation,
  profile: string,
  builds: readonly LocalSimulatorBuildReview[],
): PublishedSimulatorProfile {
  if (presentation.kind !== "reviewed-presets")
    throw new Error("Publishing requires browser-approved preset presentation");
  const proof = presentation.manifest.files["kfc-reviewed-presets.json"];
  if (!proof || !presentation.manifest.pages.includes(profile))
    throw new Error("Published profile has no presentation proof");
  const value = publication.parse({
    schema: "kfc-published-simulator-profile.v1",
    profile,
    sourceRelease: presentation.sourceRelease,
    presentationRelease: presentation.manifest.release,
    presentationProofSha256: proof.sha256,
    builds: builds.map((entry) => ({
      ...entry,
      validationIterations: entry.validationIterations ?? 400_000,
    })),
  });
  if (new Set(value.builds.map((entry) => entry.id)).size !== value.builds.length)
    throw new Error("Duplicate published build");
  for (const entry of value.builds) {
    const url = new URL(entry.href, "https://helper.invalid");
    if (
      entry.spec.split("/")[0] !== profile ||
      url.origin !== "https://helper.invalid" ||
      url.pathname !== `/forever-sim/${value.presentationRelease}/${profile}/` ||
      url.search ||
      !/^#[A-Za-z0-9+/]{64,}={0,2}$/.test(url.hash) ||
      entry.href !== url.pathname + url.hash ||
      (entry.scenario === "provisional-procs") !== entry.requiresProvisionalEnchantOptIn
    )
      throw new Error("Published build does not match its approved profile and consent policy");
  }
  return value;
}

async function document(directory: string, path: string, maximumBytes: number): Promise<unknown> {
  const root = await realpath(directory);
  const canonical = await realpath(resolve(root, path));
  const offset = relative(root, canonical);
  if (!offset || offset === ".." || offset.startsWith("../") || isAbsolute(offset))
    throw new Error("Published simulator review escaped its directory");
  const info = await stat(canonical);
  if (!info.isFile() || info.size > maximumBytes)
    throw new Error("Published simulator review is too large");
  const bytes = await readFile(canonical);
  if (bytes.length > maximumBytes)
    throw new Error("Published simulator review exceeded read limit");
  return JSON.parse(bytes.toString("utf8")) as unknown;
}

function toLocalBuildReview(entry: PublishedSimulatorBuild): LocalSimulatorBuildReview {
  const review: LocalSimulatorBuildReview = {
    id: entry.id,
    spec: entry.spec,
    faction: entry.faction,
    scenario: entry.scenario,
    stage: entry.stage,
    status: entry.status,
    href: entry.href,
    referenceDps: entry.referenceDps,
    requiresProvisionalEnchantOptIn: entry.requiresProvisionalEnchantOptIn,
    warnings: entry.warnings,
    validationIterations: entry.validationIterations,
  };
  const named =
    entry.displayName === undefined ? review : { ...review, displayName: entry.displayName };
  if (entry.rotationGuidance === undefined) return named;
  const { instruction, prepull, ...guidance } = entry.rotationGuidance;
  const withPrepull = prepull === undefined ? guidance : { ...guidance, prepull };
  return {
    ...named,
    rotationGuidance: instruction === undefined ? withPrepull : { ...withPrepull, instruction },
  };
}

export async function readPublishedSimulatorReviews(
  presentation: SimulatorPresentation,
  profile: string,
  directory: string = simulatorDirectory(),
): Promise<readonly LocalSimulatorBuildReview[]> {
  if (presentation.kind !== "reviewed-presets") return [];
  try {
    const qualifiedDps = await readQualifiedDpsSimulatorModelUpdate(profile, directory);
    if (qualifiedDps) {
      if (
        qualifiedDps.manifest.release !== presentation.manifest.release ||
        qualifiedDps.sourceRelease !== presentation.sourceRelease
      )
        throw new Error("Qualified DPS library presentation is stale");
      return qualifiedDps.builds;
    }
    const qualifiedCombat = await readQualifiedCombatSimulatorModelUpdate(profile, directory);
    if (qualifiedCombat) {
      if (
        qualifiedCombat.manifest.release !== presentation.manifest.release ||
        qualifiedCombat.sourceRelease !== presentation.sourceRelease
      )
        throw new Error("Qualified combat library presentation is stale");
      return qualifiedCombat.builds;
    }
    const qualifiedTank =
      (await readQualifiedWarriorTankSimulatorModelUpdate(profile, directory)) ??
      (await readQualifiedTankSimulatorModelUpdate(profile, directory));
    if (qualifiedTank) {
      if (
        qualifiedTank.manifest.release !== presentation.manifest.release ||
        qualifiedTank.sourceRelease !== presentation.sourceRelease
      )
        throw new Error("Qualified tank library presentation is stale");
      return qualifiedTank.builds;
    }
    const selected = pointer.parse(await document(directory, "published-reviews.json", 32_000));
    const reference = Object.entries(selected.profiles).find(([key]) => key === profile)?.[1];
    if (!reference) return [];
    if (reference.path !== `published-reviews/${profile}-${reference.sha256.slice(0, 16)}.json`)
      throw new Error("Invalid published simulator review path");
    const raw = await document(directory, reference.path, 4_000_000);
    if (hash(raw) !== reference.sha256) throw new Error("Published simulator review hash changed");
    const value = publication.parse(raw);
    if (
      value.profile !== profile ||
      value.sourceRelease !== presentation.sourceRelease ||
      value.presentationRelease !== presentation.manifest.release ||
      value.presentationProofSha256 !==
        presentation.manifest.files["kfc-reviewed-presets.json"]?.sha256
    )
      throw new Error("Published simulator review approval is stale");
    const builds = value.builds.map(toLocalBuildReview);
    await validateSimulatorModelUpdateBuilds(
      profile,
      presentation.manifest,
      value.builds,
      directory,
    );
    if (profile === "rogue")
      await validateFullRaidRoguePublishedRows(presentation.manifest, value.builds, directory);
    if (profile === "hunter")
      await validateFullRaidHunterPublishedRows(presentation.manifest, value.builds, directory);
    if (profile === "feral_druid" || profile === "balance_druid")
      await validateFullRaidDruidPublishedRows(
        profile,
        presentation.manifest,
        value.builds,
        directory,
      );
    createPublishedSimulatorProfile(presentation, profile, builds);
    return builds;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    console.warn(
      "[simulator] Ignoring invalid published builds",
      error instanceof Error ? error.message : "Unknown review error",
    );
    return [];
  }
}
