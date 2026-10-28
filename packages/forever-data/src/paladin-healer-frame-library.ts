import { z } from "zod";
import type { PaladinHealerFullCatalog } from "./paladin-healer-catalog.js";
import {
  paladinHealerFrameDescriptorSchema,
  parsePaladinHealerFramePayload,
  type PaladinHealerFramePayload,
} from "./paladin-healer-frame.js";
import type { PaladinHealerFullPresentation } from "./paladin-healer-presentation.js";

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.object({ path: z.string().min(1).max(1000), byteSha256: checksum }).strict();
const asset = z
  .object({
    file: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_.-]*$/)
      .refine((name): boolean => !name.includes("..")),
    byteSha256: checksum,
    bytes: z.number().int().positive().max(8_000_000),
  })
  .strict();
const scenario = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]*$/)
  .max(150);
const supportedProfessions = new Set([1, 2, 3, 4, 8, 11]);
const profile = z
  .object({
    id: z.string().regex(/^[12]:[1-9][0-9]?,[1-9][0-9]?$/),
    context: paladinHealerFrameDescriptorSchema.shape.context,
  })
  .strict();
const entry = z
  .object({
    frame: paladinHealerFrameDescriptorSchema,
    asset,
    defaultConfigurationId: checksum,
    nativeOriginReview: reference,
  })
  .strict();

function expectedFrameIds(profiles: readonly { readonly id: string }[]): Set<string> {
  const ids = new Set<string>();
  for (const profile of profiles)
    for (const archetype of ["direct-healing-support", "vigil-mobility", "vigil-support"])
      for (const assignment of ["tank", "group", "burst"])
        for (const duration of [180, 300])
          for (const layout of assignment === "tank" ? ["stacked"] : ["stacked", "spread"])
            ids.add([archetype, assignment, profile.id, layout, duration].join("|"));
  return ids;
}

/** The initial release covers every profession, archetype and assignment at three minutes. */
export function assertPaladinHealerCoreFrameCoverage(index: PaladinHealerFrameLibraryIndex): void {
  const frames = new Set(index.frames.map((entry): string => entry.frame.id));
  for (const profile of index.profiles)
    for (const archetype of ["direct-healing-support", "vigil-mobility", "vigil-support"])
      for (const assignment of ["tank", "group", "burst"])
        if (!frames.has([archetype, assignment, profile.id, "stacked", 180].join("|")))
          throw new Error("Paladin core release is missing a profession or assignment preset");
}

const structure = z
  .object({
    schema: z.literal("kfc-paladin-healer-frame-library-index.v2"),
    profile: z.literal("healing-paladin"),
    modelIdentity: checksum,
    runtimeSha256: checksum,
    catalog: asset,
    presentation: asset,
    profiles: z.array(profile).length(30),
    scenarios: z.array(scenario).length(28),
    frames: z.array(entry).min(1).max(900),
    defaultFrameId: z.string().min(1).max(250),
    sourceReviews: z.array(reference).min(1).max(1000),
    coverage: z
      .object({
        requiredFrames: z.literal(900),
        requiredConfigurations: z.literal(25_200),
        preparedFrames: z.number().int().positive().max(900),
        preparedConfigurations: z.number().int().positive().max(25_200),
        complete: z.boolean(),
      })
      .strict(),
    fullClassQualified: z.literal(false),
    publicationAllowed: z.literal(false),
  })
  .strict()
  .superRefine((value, context): void => {
    const issue = (message: string): void => context.addIssue({ code: "custom", message });
    const profiles = new Map(value.profiles.map((profile) => [profile.id, profile.context]));
    const expected = expectedFrameIds(value.profiles);
    const frames = new Set(value.frames.map((entry) => entry.frame.id));
    const files = [
      "library-index.json",
      value.catalog.file,
      value.presentation.file,
      ...value.frames.map((entry) => entry.asset.file),
    ];
    const reviews = new Map(
      value.sourceReviews.map((reference) => [reference.path, reference.byteSha256]),
    );
    if (
      profiles.size !== 30 ||
      expected.size !== 900 ||
      new Set(value.scenarios).size !== 28 ||
      !value.scenarios.includes("reference") ||
      reviews.size !== value.sourceReviews.length
    )
      issue("Incomplete or duplicate Paladin library domain");
    if (
      value.catalog.file !== "catalog.json" ||
      value.presentation.file !== "presentation.json" ||
      new Set(files).size !== files.length
    )
      issue("Duplicate or invalid Paladin library asset");
    for (const profile of value.profiles)
      if (
        profile.context.professions[0] >= profile.context.professions[1] ||
        profile.context.professions.some(
          (profession): boolean => !supportedProfessions.has(profession),
        ) ||
        profile.id !== `${profile.context.faction}:${profile.context.professions.join(",")}`
      )
        issue("Invalid Paladin library profession profile");
    if (
      frames.size !== value.frames.length ||
      !frames.has(value.defaultFrameId) ||
      value.frames.some((entry): boolean => !expected.has(entry.frame.id)) ||
      value.coverage.preparedFrames !== frames.size ||
      value.coverage.preparedConfigurations !== frames.size * 28 ||
      value.coverage.complete !== (frames.size === expected.size)
    )
      issue("Paladin library coverage does not match its actual frame assets");
    for (const entry of value.frames) {
      const declared = profiles.get(entry.frame.profileId);
      if (
        !declared ||
        declared.raceId !== entry.frame.context.raceId ||
        !/^frame-(?:[a-f0-9]{32}|[a-f0-9]{64})\.json$/.test(entry.asset.file) ||
        reviews.get(entry.nativeOriginReview.path) !== entry.nativeOriginReview.byteSha256
      )
        issue("Paladin frame has an undeclared profile, asset or native-origin review");
    }
  });

export type PaladinHealerFrameLibraryIndex = z.infer<typeof structure>;
export type PaladinHealerFrameLibraryEntry = z.infer<typeof entry>;

export const paladinHealerFrameLibraryIndexSchema = z
  .unknown()
  .superRefine((input, context): void => {
    const parsed = structure.safeParse(input);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        context.addIssue({ code: "custom", message: issue.message, path: issue.path });
  })
  .transform((input): PaladinHealerFrameLibraryIndex => input as PaladinHealerFrameLibraryIndex);

/** Bind frame navigation to the admitted full catalog and presentation. */
export function parsePaladinHealerFrameLibraryIndex(
  catalog: PaladinHealerFullCatalog,
  presentation: PaladinHealerFullPresentation,
  input: unknown,
): PaladinHealerFrameLibraryIndex {
  const value = paladinHealerFrameLibraryIndexSchema.parse(input);
  if (
    value.modelIdentity !== catalog.modelIdentity ||
    value.modelIdentity !== presentation.modelIdentity ||
    value.catalog.byteSha256 !== presentation.sourceCatalogSha256 ||
    JSON.stringify(value.scenarios) !==
      JSON.stringify(presentation.scenarios.map((scenario) => scenario.id))
  )
    throw new Error("Paladin frame library belongs to another catalog, model or scenario set");
  const profiles = new Map(catalog.profiles.map((profile) => [profile.id, profile]));
  for (const profile of value.profiles) {
    const original = profiles.get(profile.id);
    const race = presentation.races.find((race): boolean => race.id === profile.context.raceId);
    if (
      !original ||
      !presentation.profiles.some((entry): boolean => entry.id === profile.id) ||
      original.faction !== profile.context.faction ||
      original.professions.some(
        (profession, index): boolean => profession !== profile.context.professions[index],
      ) ||
      !race ||
      race.faction !== (profile.context.faction === 1 ? "Alliance" : "Horde")
    )
      throw new Error("Paladin frame library profile differs from its catalog or measured race");
  }
  return value;
}

/** Admit only the requested indexed frame; downloaded bytes must also match its asset identity. */
export function parsePaladinHealerIndexedFrame(
  index: PaladinHealerFrameLibraryIndex,
  frameId: string,
  input: unknown,
): PaladinHealerFramePayload {
  const descriptor = index.frames.find((entry): boolean => entry.frame.id === frameId);
  if (!descriptor) throw new Error("This Paladin frame is not prepared in this library");
  const value = parsePaladinHealerFramePayload(input);
  if (
    value.modelIdentity !== index.modelIdentity ||
    value.runtimeSha256 !== index.runtimeSha256 ||
    value.frame.id !== descriptor.frame.id ||
    value.frame.context.raceId !== descriptor.frame.context.raceId ||
    value.defaultConfigurationId !== descriptor.defaultConfigurationId ||
    value.source.nativeOriginReview.path !== descriptor.nativeOriginReview.path ||
    value.source.nativeOriginReview.byteSha256 !== descriptor.nativeOriginReview.byteSha256 ||
    value.configurations.some(
      (configuration): boolean => !index.scenarios.includes(configuration.scenarioId),
    )
  )
    throw new Error("Paladin frame differs from its indexed source identity");
  return value;
}

/** Require the complete navigation domain; numerical and release qualification remain separate. */
export function assertPaladinHealerFrameLibraryCoverage(
  index: PaladinHealerFrameLibraryIndex,
): void {
  paladinHealerFrameLibraryIndexSchema.parse(index);
  if (!index.coverage.complete)
    throw new Error(
      `Paladin frame library is incomplete: ${index.coverage.preparedFrames}/900 frames`,
    );
}
