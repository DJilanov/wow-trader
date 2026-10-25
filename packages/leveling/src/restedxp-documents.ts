import { z } from "zod";
import { CAMPAIGN_RACES } from "./campaign-route.js";
import { classSlugs } from "./model.js";
import { getLevelingRace } from "./profile.js";
import { dungeonFinishSelectionSchema } from "./dungeon-finish-model.js";
import {
  premadeProgressSchema,
  emptyPremadeProgress,
  type PremadeProgress,
} from "./premade-model.js";

export const campaignExportSelectionSchema = z
  .object({
    selectedExtras: premadeProgressSchema.shape.selectedExtras,
    selectedBatches: premadeProgressSchema.shape.selectedBatches,
    guaranteedBundles: premadeProgressSchema.shape.guaranteedBundles,
    difficultyPolicy: premadeProgressSchema.shape.difficultyPolicy,
    raidGoals: premadeProgressSchema.shape.raidGoals,
    parityScenarios: premadeProgressSchema.shape.parityScenarios,
    dungeonFinish: dungeonFinishSelectionSchema.default(() =>
      dungeonFinishSelectionSchema.parse({}),
    ),
  })
  .strict();
export type CampaignExportSelection = z.infer<typeof campaignExportSelectionSchema>;

export const campaignPartyStarterSchema = z
  .object({
    race: z.enum(CAMPAIGN_RACES),
    classSlug: z.enum(classSlugs),
  })
  .strict()
  .superRefine((value, context) => {
    if (!getLevelingRace("alliance", value.race)?.classes.includes(value.classSlug))
      context.addIssue({ code: "custom", message: "Class is unavailable for this party starter." });
  });
export type CampaignPartyStarter = z.infer<typeof campaignPartyStarterSchema>;

export function campaignExportSelectionFromProgress(
  progress: PremadeProgress,
): CampaignExportSelection {
  return campaignExportSelectionSchema.parse({
    selectedExtras: progress.selectedExtras,
    selectedBatches: progress.selectedBatches,
    guaranteedBundles: progress.guaranteedBundles,
    difficultyPolicy: progress.difficultyPolicy,
    raidGoals: progress.raidGoals,
    parityScenarios: progress.parityScenarios,
    dungeonFinish: { strategy: progress.dungeonFinish.strategy },
  });
}

export function campaignExportProgress(selection: CampaignExportSelection): PremadeProgress {
  return premadeProgressSchema.parse({
    ...emptyPremadeProgress(),
    ...campaignExportSelectionSchema.parse(selection),
  });
}

export const restedXpGuideDocumentSchema = z
  .object({
    role: z.enum(["leader", "party", "source"]),
    group: z
      .string()
      .min(1)
      .max(300)
      .regex(/^[^\r\n]+$/)
      .refine((value) => !value.includes("\0")),
    name: z
      .string()
      .min(1)
      .max(500)
      .regex(/^[^\r\n]+$/)
      .refine((value) => !value.includes("\0")),
    content: z.string().min(1).max(4_000_000),
    actionIds: z
      .array(z.string().regex(/^[a-z0-9-]{1,180}$/))
      .min(1)
      .max(10000),
  })
  .strict();

export const restedXpDocumentSetSchema = z
  .object({
    schema: z.literal("kfc-restedxp-documents.v1"),
    publication: z.literal("review"),
    compilerRevision: z.string().min(1).max(100),
    routeRelease: z.string().min(1).max(100),
    sourceBuild: z.number().int().positive(),
    runtimeBuild: z.number().int().positive(),
    restedXpVersion: z.string().regex(/^v\d+\.\d+\.\d+$/),
    nativePolicy: z.enum(["normalized-v1", "canonical-sequential-v1"]).default("normalized-v1"),
    edition: z
      .object({
        leader: campaignPartyStarterSchema,
        partyStarter: campaignPartyStarterSchema.optional(),
      })
      .strict()
      .optional(),
    selection: campaignExportSelectionSchema,
    documents: z.array(restedXpGuideDocumentSchema).min(1).max(500),
  })
  .strict()
  .superRefine((set, context) => {
    const identities = new Set(
      set.documents.map((document) => `${document.group}\0${document.name}`),
    );
    if (identities.size !== set.documents.length)
      context.addIssue({ code: "custom", message: "Duplicate native guide identity." });
    for (const [index, document] of set.documents.entries()) {
      const name = /^#name ([^\r\n]+)\r?$/m.exec(document.content)?.[1];
      const group = /^#group ([^\r\n]+)\r?$/m.exec(document.content)?.[1];
      const next = /^#next ([^\r\n]+)\r?$/m.exec(document.content)?.[1];
      if (
        name !== document.name ||
        group !== document.group ||
        (next && !identities.has(`${group}\0${next}`))
      )
        context.addIssue({
          code: "custom",
          path: ["documents", index],
          message: "Native guide metadata or next chapter differs from its manifest.",
        });
      if (new Set(document.actionIds).size !== document.actionIds.length)
        context.addIssue({
          code: "custom",
          path: ["documents", index, "actionIds"],
          message: "Duplicate action identity in a guide.",
        });
    }
  });
export type RestedXpDocumentSet = z.infer<typeof restedXpDocumentSetSchema>;
