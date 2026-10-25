import {
  questXpImportSetSchema,
  readQuestXpIndex,
  readPublishedQuestXp,
  type QuestXpImportSet,
} from "@wow-trader/reference-data";
import { isDungeonTableQuest, type QuestRewardFact } from "@wow-trader/leveling";
import { getForeverWorldData } from "./forever-world";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

export interface LevelingRewardSnapshot {
  readonly facts: readonly QuestRewardFact[];
  readonly revision: string;
  readonly clientBuild: number | null;
  readonly notice: string | null;
}

const MAXIMUM_IMPORT_BYTES = 8_000_000;
let importCache:
  | {
      readonly path: string;
      readonly size: number;
      readonly modifiedAt: number;
      readonly value: Promise<QuestXpImportSet>;
    }
  | undefined;

async function getHistoricalRewardImport(): Promise<QuestXpImportSet | null> {
  const configured = process.env.WOW_TRADER_LEVELING_QUEST_XP_IMPORT;
  if (!configured) return null;
  const path = resolve(configured);
  const metadata = await stat(path);
  if (metadata.size > MAXIMUM_IMPORT_BYTES)
    throw new Error("Leveling quest XP import exceeds its size budget.");
  if (
    !importCache ||
    importCache.path !== path ||
    importCache.size !== metadata.size ||
    importCache.modifiedAt !== metadata.mtimeMs
  ) {
    importCache = {
      path,
      size: metadata.size,
      modifiedAt: metadata.mtimeMs,
      value: readFile(path, "utf8").then((raw) => {
        const parsed = questXpImportSetSchema.parse(JSON.parse(raw));
        if (parsed.game !== "forever") throw new Error("Leveling XP import is not for Forever.");
        return parsed;
      }),
    };
  }
  return importCache.value;
}

export async function getLevelingRewardSnapshot(
  ids: readonly number[],
): Promise<LevelingRewardSnapshot> {
  const root = process.env.WOW_TRADER_REFERENCE_DIRECTORY;
  if (!root)
    return {
      facts: [],
      revision: "not-collected",
      clientBuild: null,
      notice: "Quest XP evidence is not configured here. Historical estimates remain separate.",
    };
  try {
    const index = await readQuestXpIndex(root);
    if (!index)
      return {
        facts: [],
        revision: "not-collected",
        clientBuild: null,
        notice: "Priority reward collection has not published an XP snapshot yet.",
      };
    const wanted = new Set(ids);
    const world = await getForeverWorldData();
    if (!world)
      return {
        facts: [],
        revision: "client-unavailable",
        clientBuild: null,
        notice: "Current-client quest identities are unavailable; XP evidence is held.",
      };
    const quests = new Map(world.quests.map((quest) => [quest.questId, quest.title]));
    const entries = index.records.filter(
      (entry) => entry.game === "forever" && wanted.has(entry.id),
    );
    const facts: QuestRewardFact[] = [];
    const heldIds = new Set<number>();
    let held = 0;
    for (let offset = 0; offset < entries.length; offset += 16) {
      const batch = await Promise.all(
        entries.slice(offset, offset + 16).map(async (entry): Promise<QuestRewardFact | null> => {
          const record = await readPublishedQuestXp(root, entry);
          if (!record) return null;
          const title = quests.get(record.id);
          // Requested IDs originate in the checksummed leveling plan. Some live server-side quests
          // have no static client task row, but a conflicting static title still invalidates them.
          if (title && title !== record.name) {
            heldIds.add(record.id);
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
            evidenceKind: "published-forever",
            referenceBaseXp: record.referenceBaseXp,
            pageMultiplier: record.pageMultiplier,
          };
        }),
      );
      facts.push(...batch.filter((fact): fact is QuestRewardFact => fact !== null));
    }
    let imported: QuestXpImportSet | null = null;
    let importUnavailable = false;
    try {
      imported = await getHistoricalRewardImport();
    } catch (error: unknown) {
      importUnavailable = true;
      console.error(
        "Historical leveling reward import validation failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
    let historical = 0;
    if (imported) {
      const byId = new Map(facts.map((fact) => [fact.questId, fact]));
      for (const record of imported.records) {
        if (!wanted.has(record.id) || heldIds.has(record.id) || record.status !== "available")
          continue;
        const primary = byId.get(record.id);
        if (primary?.status === "available" || primary?.status === "conflict") continue;
        const fallback: QuestRewardFact = {
          questId: record.id,
          fullXp: record.fullXp,
          questLevel: record.questLevel ?? primary?.questLevel ?? null,
          minimumLevel: primary?.minimumLevel ?? record.minimumLevel,
          xpByLevel: record.xpByLevel,
          sourceUrl: `${record.sourceKind}: ${record.sourceRef} · ${record.revision}`,
          capturedAt: record.importedAt,
          status: "available",
          evidenceKind: "historical-reference",
        };
        if (primary) facts[facts.indexOf(primary)] = fallback;
        else facts.push(fallback);
        byId.set(record.id, fallback);
        historical++;
      }
    }
    const revisionInput = imported
      ? `${JSON.stringify(index)}:${world.build.product}:${world.build.buildNumber}:${world.build.locale}:${imported.exportSha256}:${imported.revision}`
      : `${JSON.stringify(index)}:${world.build.product}:${world.build.buildNumber}:${world.build.locale}:${importUnavailable ? "historical-import-unavailable" : "no-historical-import"}`;
    const notices = [
      facts.some((fact) => isDungeonTableQuest(fact.questId))
        ? "Unscaled dungeon tables and unplayed dungeons beyond Gnomeregan use a 2.375× planning coefficient, not a measured reward. Earlier already-scaled rewards and in-game observations are not multiplied again; kills and unselected quests are separate."
        : null,
      held ? `${held} reward records are held for current-client identity checks.` : null,
      importUnavailable
        ? "The historical XP fallback could not be validated; published Forever rewards remain available."
        : null,
      historical
        ? `${historical} rewards use historical addon-database values because no published numeric Forever XP is available. They remain estimates until observed in game.`
        : null,
    ].filter((notice): notice is string => notice !== null);
    return {
      facts,
      revision: `quest-xp-${createHash("sha256").update(revisionInput).digest("hex").slice(0, 24)}`,
      clientBuild: world.build.buildNumber,
      notice: notices.join(" ") || null,
    };
  } catch (error: unknown) {
    console.error(
      "Leveling reward snapshot validation failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return {
      facts: [],
      revision: "validation-failed",
      clientBuild: null,
      notice: "XP evidence could not be validated. No unverified reward values are used.",
    };
  }
}
