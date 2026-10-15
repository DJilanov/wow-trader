import { readQuestXpIndex, readPublishedQuestXp } from "@wow-trader/reference-data";
import type { QuestRewardFact } from "@wow-trader/leveling";
import { getForeverWorldData } from "./forever-world";
import { createHash } from "node:crypto";

export interface LevelingRewardSnapshot {
  readonly facts: readonly QuestRewardFact[];
  readonly revision: string;
  readonly notice: string | null;
}

export async function getLevelingRewardSnapshot(
  ids: readonly number[],
): Promise<LevelingRewardSnapshot> {
  const root = process.env.WOW_TRADER_REFERENCE_DIRECTORY;
  if (!root)
    return {
      facts: [],
      revision: "not-collected",
      notice: "Quest XP evidence is not configured here. Historical estimates remain separate.",
    };
  try {
    const index = await readQuestXpIndex(root);
    if (!index)
      return {
        facts: [],
        revision: "not-collected",
        notice: "Priority reward collection has not published an XP snapshot yet.",
      };
    const wanted = new Set(ids);
    const world = await getForeverWorldData();
    if (!world)
      return {
        facts: [],
        revision: "client-unavailable",
        notice: "Current-client quest identities are unavailable; XP evidence is held.",
      };
    const quests = new Map(world.quests.map((quest) => [quest.questId, quest.title]));
    const entries = index.records.filter(
      (entry) => entry.game === "forever" && wanted.has(entry.id),
    );
    const facts: QuestRewardFact[] = [];
    let held = 0;
    for (let offset = 0; offset < entries.length; offset += 16) {
      const batch = await Promise.all(
        entries.slice(offset, offset + 16).map(async (entry): Promise<QuestRewardFact | null> => {
          const record = await readPublishedQuestXp(root, entry);
          if (!record) return null;
          const title = quests.get(record.id);
          if (!quests.has(record.id) || (title && title !== record.name)) {
            held++;
            return null;
          }
          return {
            questId: record.id,
            fullXp: record.fullXp,
            questLevel: record.questLevel,
            minimumLevel: record.minimumLevel,
            xpByLevel: record.xpByLevel,
            sourceUrl: record.sourceUrl,
            capturedAt: record.capturedAt,
            status: record.status,
          };
        }),
      );
      facts.push(...batch.filter((fact): fact is QuestRewardFact => fact !== null));
    }
    return {
      facts,
      revision: `quest-xp-${createHash("sha256").update(JSON.stringify(index)).digest("hex").slice(0, 24)}`,
      notice: held ? `${held} reward records are held for current-client identity checks.` : null,
    };
  } catch (error: unknown) {
    console.error(
      "Leveling reward snapshot validation failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return {
      facts: [],
      revision: "validation-failed",
      notice: "XP evidence could not be validated. No unverified reward values are used.",
    };
  }
}
