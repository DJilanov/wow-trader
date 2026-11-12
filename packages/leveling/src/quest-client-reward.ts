import { z } from "zod";
import { CLIENT_QUEST_SOURCE_PATTERN } from "./quest-client-cache.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const level = z.number().int().min(1).max(60);
const cacheSource = z
  .object({
    build: z.number().int().positive(),
    url: z.url().max(1500),
    sha256: hash,
  })
  .strict();
const tableSource = z
  .object({
    build: z.number().int().positive(),
    evidenceSha256: hash,
    questXpSha256: hash,
    definitionsRevision: z.string().regex(/^[a-f0-9]{40}$/),
    hotfixSha256: hash,
  })
  .strict();

export const clientQuestRewardReferenceSchema = z
  .object({
    schema: z.literal("client-quest-reward-reference.v1"),
    calculation: z.literal("table-multiplier-reduction-rounding.v1"),
    targetBuild: z.number().int().positive(),
    questId: z.number().int().positive().max(10_000_000),
    questLevel: level,
    minimumLevel: level,
    difficulty: z.number().int().min(0).max(9),
    baseXp: z.number().int().min(0).max(1_000_000),
    xpMultiplier: z.number().finite().min(0).max(100),
    cacheSources: z.tuple([cacheSource, cacheSource]),
    tableSources: z.tuple([tableSource, tableSource]),
  })
  .strict()
  .superRefine((reference, context) => {
    const cache = reference.cacheSources;
    const table = reference.tableSources;
    const urls = cache.map((source) => CLIENT_QUEST_SOURCE_PATTERN.exec(source.url));
    if (
      cache[0].build !== reference.targetBuild ||
      cache[1].build <= reference.targetBuild ||
      table.some((source, index) => source.build !== cache[index]!.build) ||
      cache.some((source, index) => !urls[index] || Number(urls[index]![3]) !== source.build) ||
      urls[0]?.[1] !== urls[1]?.[1] ||
      cache[0].sha256 === cache[1].sha256 ||
      table[0].questXpSha256 !== table[1].questXpSha256 ||
      table[0].evidenceSha256 === table[1].evidenceSha256
    )
      context.addIssue({
        code: "custom",
        message:
          "Client reward sources do not bind the target and corroborating build to matching tables.",
      });
  });
export type ClientQuestRewardReference = z.infer<typeof clientQuestRewardReferenceSchema>;

/** Reference arithmetic only; eligibility and observed reward precedence are separate. */
export function calculateClientQuestXp(
  reference: Pick<ClientQuestRewardReference, "questLevel" | "baseXp" | "xpMultiplier">,
  playerLevel: number,
): number {
  if (
    !Number.isInteger(playerLevel) ||
    playerLevel < 1 ||
    playerLevel > 60 ||
    !Number.isInteger(reference.questLevel) ||
    reference.questLevel < 1 ||
    reference.questLevel > 60 ||
    !Number.isSafeInteger(reference.baseXp) ||
    reference.baseXp < 0 ||
    reference.baseXp > 1_000_000 ||
    !Number.isFinite(reference.xpMultiplier) ||
    reference.xpMultiplier < 0 ||
    reference.xpMultiplier > 100
  )
    throw new Error("Invalid client reward arithmetic input.");
  if (playerLevel === 60) return 0;
  const reduction = Math.min(10, Math.max(1, 2 * (reference.questLevel - playerLevel) + 20));
  const value = Math.trunc((reference.baseXp * reference.xpMultiplier * reduction) / 10);
  const step = value <= 100 ? 5 : value <= 500 ? 10 : value <= 1000 ? 25 : 50;
  const offset = step === 5 ? 2 : step === 25 ? 12 : step / 2;
  return step * Math.floor((value + offset) / step);
}
