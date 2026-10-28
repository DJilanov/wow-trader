import { z } from "zod";
import {
  healerEnchantSchema,
  healerItemSchema,
  healerReleaseSchema,
  healerSpellSchema,
  healerTalentTreeSchema,
} from "./healing-simulator.js";
import { shamanHealingRankPolicySchema } from "./shaman-healing-simulator.js";

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.number().int().positive().safe();
const count = z.number().int().nonnegative().safe();
const key = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]*$/)
  .max(200);
const raceId = z.union([z.literal(1), z.literal(5), z.literal(6), z.literal(7), z.literal(10)]);
const release = healerReleaseSchema.shape;

export const shamanHealerReleaseSchema = z
  .object({
    schema: z.literal("kfc-shaman-healer-browser-release.v1"),
    release: release.release,
    profile: z.literal("healing-shaman"),
    modelIdentity: checksum,
    runtimeIdentity: checksum,
    libraryIndexSha256: checksum,
    preparedAt: release.preparedAt,
    files: release.files,
    encodings: release.encodings,
  })
  .strict()
  .superRefine((manifest, context): void => {
    for (const name of [
      "library-index.json",
      "catalog.json",
      "presentation.json",
      "healing.wasm",
      "healing-worker.js",
      "request-codec.js",
      "wasm_exec.js",
    ])
      if (!manifest.files[name])
        context.addIssue({ code: "custom", message: "Missing Shaman asset " + name });
    if (
      manifest.files["library-index.json"]?.sha256 !== manifest.libraryIndexSha256 ||
      Object.keys(manifest.files).some(
        (name) => !/^[a-z0-9][a-z0-9_.-]*$/.test(name) || name.includes(".."),
      ) ||
      Object.keys(manifest.encodings ?? {}).some((name) => !manifest.files[name])
    )
      context.addIssue({ code: "custom", message: "Invalid Shaman release asset identities" });
    for (const [name, asset] of Object.entries(manifest.files))
      if (name.endsWith(".json") && asset.bytes > 8_000_000)
        context.addIssue({
          code: "custom",
          message: "Shaman JSON asset exceeds its size limit",
          path: ["files", name],
        });
  });

export const shamanHealerPresentationSchema = z
  .object({
    schema: z.literal("kfc-shaman-healer-presentation.v1"),
    profile: z.literal("healing-shaman"),
    modelIdentity: checksum,
    runtimeIdentity: checksum,
    libraryIndexSha256: checksum,
    sourceBuild: id,
    professions: z.tuple([z.literal("Engineering"), z.literal("Tailoring")]),
    races: z
      .array(
        z
          .object({
            id: raceId,
            name: z.string().min(1),
            faction: z.enum(["Alliance", "Horde"]),
            profileId: z.string().min(1).max(160),
          })
          .strict(),
      )
      .min(1)
      .max(5),
    scenarios: z
      .array(
        z
          .object({
            id: key,
            label: z.string().min(1).max(150),
            description: z.string().min(1).max(1000),
            rankPolicy: shamanHealingRankPolicySchema,
            mp5Model: z.enum(["per-five-reference", "per-second-reference"]),
          })
          .strict(),
      )
      .min(1)
      .max(64),
    profiles: z
      .array(
        z
          .object({
            id: z.string().min(1).max(160),
            faction: z.enum(["Alliance", "Horde"]),
            professions: z.tuple([z.literal(4), z.literal(11)]),
            slots: z.array(z.array(id)).length(17),
            ownershipOverrides: z.array(
              z
                .object({
                  id,
                  singleCopy: z.boolean(),
                  limitCategory: count,
                  questChoices: z.array(z.string()),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    items: z.array(healerItemSchema).min(1).max(5000),
    equipmentRules: z
      .array(z.object({ id, setId: count }).strict())
      .min(1)
      .max(5000),
    enchants: z.array(healerEnchantSchema).max(500),
    spells: z.array(healerSpellSchema).min(1).max(200),
    talents: z.array(healerTalentTreeSchema).length(3),
    supportedTalentFields: z
      .array(z.string().regex(/^[a-z][a-zA-Z0-9]*$/))
      .min(1)
      .max(100),
    assumptions: z.array(z.string().min(1)).min(1).max(40),
  })
  .strict()
  .superRefine((presentation, context): void => {
    const issue = (message: string): void => context.addIssue({ code: "custom", message });
    for (const [name, values] of [
      ["items", presentation.items.map((entry) => entry.id)],
      ["equipment rules", presentation.equipmentRules.map((entry) => entry.id)],
      ["enchants", presentation.enchants.map((entry) => entry.id)],
      ["spells", presentation.spells.map((entry) => entry.id)],
      ["races", presentation.races.map((entry) => entry.id)],
      ["profiles", presentation.profiles.map((entry) => entry.id)],
      ["scenarios", presentation.scenarios.map((entry) => entry.id)],
    ] as const)
      if (new Set<string | number>(values).size !== values.length)
        issue("Duplicate Shaman " + name);
    const items = new Set(presentation.items.map((entry) => entry.id));
    const enchants = new Set(presentation.enchants.map((entry) => entry.id));
    const profiles = new Map(presentation.profiles.map((entry) => [entry.id, entry]));
    const talentFields = new Set(
      presentation.talents.flatMap((tree) => tree.talents.map((talent) => talent.field)),
    );
    if (
      presentation.equipmentRules.length !== items.size ||
      presentation.equipmentRules.some((entry) => !items.has(entry.id)) ||
      presentation.items.some((item) =>
        item.enchantIds.some((id) => id !== 0 && !enchants.has(id)),
      ) ||
      presentation.races.some(
        (race) =>
          profiles.get(race.profileId)?.faction !== race.faction ||
          (race.id === 1) !== (race.faction === "Alliance"),
      ) ||
      presentation.scenarios.some(
        (scenario) => scenario.id !== scenario.rankPolicy.id + "." + scenario.mp5Model,
      ) ||
      !presentation.scenarios.some(
        (scenario) => scenario.id === "unscaled-reference.per-five-reference",
      ) ||
      new Set(presentation.supportedTalentFields).size !==
        presentation.supportedTalentFields.length ||
      presentation.supportedTalentFields.some((field) => !talentFields.has(field))
    )
      issue("Incomplete Shaman presentation references");
    for (const profile of presentation.profiles)
      if (
        profile.slots.some(
          (slot) => new Set(slot).size !== slot.length || slot.some((id) => !items.has(id)),
        ) ||
        new Set(profile.ownershipOverrides.map((entry) => entry.id)).size !==
          profile.ownershipOverrides.length ||
        profile.ownershipOverrides.some((entry) => !items.has(entry.id))
      )
        issue("Invalid Shaman acquisition profile references");
  });

export type ShamanHealerRelease = z.infer<typeof shamanHealerReleaseSchema>;
export type ShamanHealerPresentation = z.infer<typeof shamanHealerPresentationSchema>;
