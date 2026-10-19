import { z } from "zod";
import rawXp from "./dungeon-bundle-xp.json" with { type: "json" };
import {
  GUARANTEED_DUNGEON_IDS,
  dungeonBundleKey,
  dungeonBundleSchema,
  dungeonBundleSlotKey,
  type DungeonBundle,
  type DungeonBundleFaction,
  type GuaranteedDungeonId,
} from "./dungeon-bundle-model.js";
import {
  estimateDungeonReward,
  ORDINARY_DUNGEON_XP_MULTIPLIER,
  type DungeonRewardEstimate,
} from "./dungeon-xp.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { DUNGEON_QUESTS } from "./dungeon-catalog.js";

const reference = z
  .object({
    sourceBuild: z.literal(70205),
    difficultyIndex: z.literal(7),
    effectiveRowsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    anchorQuestIds: z.array(z.number().int().positive()).length(4),
    baseXpByLevel: z.array(z.number().int().nonnegative()).length(61),
  })
  .strict()
  .parse(rawXp);

export const DUNGEON_BUNDLE_REVISION = "guaranteed-four-20261019-v1";
export const DUNGEON_BUNDLE_XP_SOURCE = reference;
export const DEFAULT_DUNGEON_BUNDLE_LEVELS: Readonly<Record<GuaranteedDungeonId, number>> = {
  "drowned-city": 37,
  kroldok: 42,
  alcaz: 50,
};

export function getDungeonBundle(
  dungeonId: string,
  faction: DungeonBundleFaction,
  overrides: Readonly<Record<string, DungeonBundle>> = {},
): DungeonBundle | null {
  const id = GUARANTEED_DUNGEON_IDS.find((candidate) => candidate === dungeonId);
  if (!id) return null;
  const saved = overrides[dungeonBundleKey(id, faction)];
  if (saved) {
    const parsed = dungeonBundleSchema.parse(saved);
    if (parsed.dungeonId !== id || parsed.faction !== faction)
      throw new Error("Saved dungeon bundle identity mismatch.");
    return parsed;
  }
  return dungeonBundleSchema.parse({
    schema: "guaranteed-dungeon-bundle.v1",
    dungeonId: id,
    faction,
    countProvenance: "owner-confirmed",
    planningQuestLevel: DEFAULT_DUNGEON_BUNDLE_LEVELS[id],
    slots: Array.from({ length: 4 }, (_, index) => ({
      index: index + 1,
      questId: null,
      selected: true,
    })),
  });
}

export function updateDungeonBundleSlot(
  bundle: DungeonBundle,
  index: number,
  change: { readonly questId?: number | null; readonly selected?: boolean },
): DungeonBundle {
  dungeonBundleSlotKey(bundle, index);
  return dungeonBundleSchema.parse({
    ...bundle,
    slots: bundle.slots.map((slot) => (slot.index === index ? { ...slot, ...change } : slot)),
  });
}

export function estimateDungeonBundleReward(
  questLevel: number,
  handInLevel: number,
): DungeonRewardEstimate {
  if (
    ![questLevel, handInLevel].every(
      (level) => Number.isInteger(level) && level >= 1 && level <= 60,
    )
  )
    throw new Error("Bundle quest and hand-in levels must be integers from 1 to 60.");
  if (handInLevel === 60)
    return { xp: 0, basis: "base-estimate", source: "Level 60 awards no leveling XP." };
  const base = reference.baseXpByLevel[questLevel]!;
  const difference = handInLevel - questLevel;
  const reduction = difference >= 10 ? 0.1 : difference >= 6 ? 1 - (difference - 5) * 0.2 : 1;
  // Match the reviewed reference renderer: integer scaling, reduction, then reward rounding.
  const amount = Math.round(base * ORDINARY_DUNGEON_XP_MULTIPLIER) * reduction;
  const step = amount < 1000 ? 10 : 50;
  return {
    xp: Math.round(amount / step) * step,
    basis: "base-estimate",
    source: `Owner-confirmed quest slot; level ${questLevel} QuestXP tier 7 base ${base} × ${ORDINARY_DUNGEON_XP_MULTIPLIER}. Estimated reward, not collected quest data.`,
  };
}

export interface DungeonBundlePosition {
  readonly level: number;
  readonly currentXp: number;
}

export interface DungeonBundleRewardRow extends DungeonRewardEstimate {
  readonly slotKey: string;
  readonly questId: number | null;
  readonly handInLevel: number;
  readonly state: "selected" | "skipped" | "rewarded";
}

export interface DungeonBundleForecast {
  readonly rows: readonly DungeonBundleRewardRow[];
  readonly referenceXp: number;
  readonly estimatedXp: number;
  readonly unknownSlotKeys: readonly string[];
  readonly endpoint: DungeonBundlePosition | null;
}

export function forecastDungeonBundle(
  bundle: DungeonBundle,
  start: DungeonBundlePosition | null,
  member: {
    readonly questStates?: Readonly<Record<string, string>>;
    readonly bundleSlotStates?: Readonly<Record<string, "skipped" | "rewarded">>;
    readonly classSlug?: string | null;
    readonly raceId?: string | null | undefined;
  } = {},
  resolveRealReward: (
    questId: number,
    level: number,
  ) => DungeonRewardEstimate = estimateDungeonReward,
): DungeonBundleForecast {
  const checked = dungeonBundleSchema.parse(bundle);
  let level = start?.level ?? checked.planningQuestLevel;
  let currentXp = start?.currentXp ?? 0;
  if (
    start &&
    (!Number.isInteger(level) ||
      level < 1 ||
      level > 60 ||
      !Number.isInteger(currentXp) ||
      currentXp < 0 ||
      (level === 60 ? currentXp !== 0 : currentXp >= FOREVER_XP_CURVE[level]!))
  )
    throw new Error("Invalid starting XP for dungeon bundle.");
  let referenceXp = 0;
  let estimatedXp = 0;
  const unknownSlotKeys: string[] = [];
  const paidIds = new Set<number>();
  const rows = [...checked.slots]
    .sort((left, right) => left.index - right.index)
    .map((slot): DungeonBundleRewardRow => {
      const slotKey = dungeonBundleSlotKey(checked, slot.index);
      const paid =
        member.bundleSlotStates?.[slotKey] === "rewarded" ||
        (slot.questId !== null &&
          (member.questStates?.[String(slot.questId)] === "rewarded" || paidIds.has(slot.questId)));
      const skipped =
        !checked.included || !slot.selected || member.bundleSlotStates?.[slotKey] === "skipped";
      const state = paid ? "rewarded" : skipped ? "skipped" : "selected";
      const handInLevel = level;
      const quest =
        slot.questId === null ? null : DUNGEON_QUESTS.find((entry) => entry.id === slot.questId);
      const incompatible =
        slot.questId !== null &&
        (!quest ||
          (quest.faction !== "both" && quest.faction !== checked.faction) ||
          (quest.classSlug !== null && quest.classSlug !== member.classSlug) ||
          (quest.raceIds.length > 0 &&
            (!member.raceId || !quest.raceIds.includes(member.raceId))) ||
          (quest.minimumLevel !== null && level < quest.minimumLevel));
      const reward: DungeonRewardEstimate =
        state !== "selected"
          ? {
              xp: 0,
              basis: "base-estimate",
              source: paid
                ? "Already accounted for; no repeated reward."
                : "Skipped; no reward planned.",
            }
          : unknownSlotKeys.length
            ? { xp: null, basis: "unknown", source: "An earlier slot reward is unresolved." }
            : incompatible
              ? {
                  xp: null,
                  basis: "unknown",
                  source:
                    "Mapped quest identity or faction/class/race/pickup eligibility is not established for this member.",
                }
              : slot.questId === null
                ? estimateDungeonBundleReward(checked.planningQuestLevel, level)
                : resolveRealReward(slot.questId, level);
      if (state === "selected") {
        if (reward.xp === null) unknownSlotKeys.push(slotKey);
        else {
          if (!Number.isSafeInteger(reward.xp) || reward.xp < 0 || reward.xp > 1_000_000)
            throw new Error("Invalid resolved bundle quest reward.");
          if (reward.basis === "base-estimate") estimatedXp += reward.xp;
          else referenceXp += reward.xp;
          currentXp += reward.xp;
          while (level < 60 && currentXp >= FOREVER_XP_CURVE[level]!) {
            currentXp -= FOREVER_XP_CURVE[level]!;
            level++;
          }
          if (level === 60) currentXp = 0;
        }
        if (slot.questId !== null) paidIds.add(slot.questId);
      }
      return { ...reward, slotKey, questId: slot.questId, handInLevel, state };
    });
  return {
    rows,
    referenceXp,
    estimatedXp,
    unknownSlotKeys,
    endpoint: start && !unknownSlotKeys.length ? { level, currentXp } : null,
  };
}
