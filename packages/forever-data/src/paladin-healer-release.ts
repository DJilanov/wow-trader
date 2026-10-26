import { z } from "zod";
import {
  healerEnchantSchema,
  healerItemSchema,
  healerReleaseSchema,
  healerSpellSchema,
  healerTalentTreeSchema,
} from "./healing-simulator.js";

const id = z.number().int().positive().safe();
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const release = healerReleaseSchema.shape;

export const paladinHealerReleaseSchema = z
  .object({
    schema: z.literal("kfc-paladin-healer-browser-release.v1"),
    release: release.release,
    profile: z.literal("healing-paladin"),
    modelIdentity: checksum,
    sourceArchiveSha256: checksum,
    preparedAt: release.preparedAt,
    files: release.files,
    encodings: release.encodings,
  })
  .strict()
  .superRefine((value, context): void => {
    for (const name of [
      "library-index.json",
      "catalog.json",
      "presentation.json",
      "healing.wasm",
      "healing-worker.js",
      "request-codec.js",
      "wasm_exec.js",
    ])
      if (!value.files[name])
        context.addIssue({ code: "custom", message: "Missing Paladin asset " + name });
    if (
      Object.keys(value.files).some(
        (name) => !/^[a-z0-9][a-z0-9_.-]*$/.test(name) || name.includes(".."),
      ) ||
      Object.keys(value.encodings ?? {}).some((name) => !value.files[name])
    )
      context.addIssue({ code: "custom", message: "Invalid Paladin asset identity" });
    for (const [name, identity] of Object.entries(value.files))
      if (name.endsWith(".json") && identity.bytes > 8_000_000)
        context.addIssue({
          code: "custom",
          message: "Paladin JSON asset exceeds its size limit",
          path: ["files", name],
        });
  });

export const paladinHealerPresentationSchema = z
  .object({
    schema: z.literal("kfc-paladin-healer-presentation.v1"),
    profile: z.literal("healing-paladin"),
    modelIdentity: checksum,
    sourceArchiveSha256: checksum,
    sourceBuild: id,
    professions: z.tuple([z.literal("Engineering"), z.literal("Tailoring")]),
    races: z
      .array(
        z
          .object({
            id,
            name: z.string().min(1),
            faction: z.enum(["Alliance", "Horde"]),
            profileId: z.enum(["1:4,11", "2:4,11"]),
          })
          .strict(),
      )
      .length(2),
    scenarios: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
            label: z.string().min(1),
            description: z.string().min(1),
          })
          .strict(),
      )
      .length(28),
    items: z.array(healerItemSchema).min(1).max(5000),
    enchants: z.array(healerEnchantSchema).max(500),
    spells: z.array(healerSpellSchema).min(1).max(200),
    talents: z.array(healerTalentTreeSchema).length(3),
    assumptions: z.array(z.string().min(1)).min(1).max(40),
  })
  .strict()
  .superRefine((value, context): void => {
    for (const [name, ids] of [
      ["items", value.items.map((entry) => entry.id)],
      ["enchants", value.enchants.map((entry) => entry.id)],
      ["spells", value.spells.map((entry) => entry.id)],
      ["races", value.races.map((entry) => entry.id)],
    ] as const)
      if (new Set(ids).size !== ids.length)
        context.addIssue({ code: "custom", message: "Duplicate Paladin " + name });
    const enchants = new Set(value.enchants.map((entry) => entry.id));
    if (
      value.items.some((item) => item.enchantIds.some((id) => id !== 0 && !enchants.has(id))) ||
      new Set(value.scenarios.map((entry) => entry.id)).size !== 28 ||
      !value.scenarios.some((entry) => entry.id === "reference")
    )
      context.addIssue({ code: "custom", message: "Incomplete Paladin presentation references" });
  });

export type PaladinHealerRelease = z.infer<typeof paladinHealerReleaseSchema>;
export type PaladinHealerPresentation = z.infer<typeof paladinHealerPresentationSchema>;
