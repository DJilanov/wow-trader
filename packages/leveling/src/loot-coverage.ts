import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import type { LootSharing, QuestLootDrop } from "./quest-loot.js";
import type { LootStackWeight } from "./loot-stack-distribution.js";
import { capturedItemObjectives } from "./loot-quantities.js";

export interface LootCapture {
  readonly game: "forever" | "tbc";
  readonly kind: "item" | "quest" | "spell";
  readonly id: number;
  readonly sourceUrl: string;
  readonly sourceSha256: string;
  readonly capturedAt: string;
  readonly name?: string;
  readonly objectives?: readonly string[];
  readonly requiredItems?: readonly { readonly itemId: number; readonly quantity: number }[];
  readonly relations: readonly {
    readonly relation: string;
    readonly kind: string;
    readonly id: number;
    readonly dropStatistics?: {
      readonly percent: number | null;
      readonly percentBasis?: "reported" | "reported-override" | "sample-ratio";
      readonly attempts: number | null;
      readonly minimumQuantity: number | null;
      readonly maximumQuantity: number | null;
      readonly quantityDistribution?: readonly LootStackWeight[];
    };
  }[];
}
export interface LootSharingOverride {
  readonly questId: number;
  readonly itemId: number;
  readonly sharing: LootSharing;
}
export interface LootCoveragePlan {
  readonly data: CombatDataset;
  readonly queue: readonly {
    readonly game: "forever";
    readonly kind: "item" | "quest";
    readonly id: number;
  }[];
  readonly reviews: readonly {
    readonly questId: number;
    readonly itemId: number | null;
    readonly reason: string;
  }[];
  readonly questIds: readonly number[];
}

function distributionKey(distribution: readonly LootStackWeight[] | undefined): string | null {
  return distribution
    ? JSON.stringify(
        [...distribution]
          .sort((a, b) => a.quantity - b.quantity)
          .map((entry) => [entry.quantity, entry.percent]),
      )
    : null;
}

/** Pure preparation. Captures must be schema-validated by the storage/parser boundary. */
export function prepareCampaignLootReferences(
  dataset: CombatDataset,
  questIds: ReadonlySet<number>,
  captures: readonly LootCapture[],
  overrides: readonly LootSharingOverride[] = [],
): LootCoveragePlan {
  const byKey = new Map<string, LootCapture>();
  for (const capture of captures) {
    if (capture.game !== "forever") continue;
    const key = `${capture.kind}:${capture.id}`,
      previous = byKey.get(key);
    if (!previous || previous.capturedAt < capture.capturedAt) byKey.set(key, capture);
  }
  const queue = new Map<string, { game: "forever"; kind: "item" | "quest"; id: number }>();
  const enqueue = (kind: "item" | "quest", id: number): void => {
    queue.set(`${kind}:${id}`, { game: "forever", kind, id });
  };
  const reviews: { questId: number; itemId: number | null; reason: string }[] = [];
  const drops = new Map(
    (dataset.lootDrops ?? []).map((drop) => [`${drop.itemId}:${drop.npcId}`, drop]),
  );
  const conflicted = new Set<string>();
  const npcIds = new Set(dataset.npcs.map((npc) => npc.id));
  const selected = new Set<number>();
  const quests = dataset.quests.map((quest) => {
    if (
      !questIds.has(quest.questId) ||
      (!quest.itemCreatureIds.length &&
        !quest.itemObjectives?.some((item) => item.npcIds.length > 0))
    )
      return quest;
    selected.add(quest.questId);
    const capture = byKey.get(`quest:${quest.questId}`);
    const items: NonNullable<CombatDataset["quests"][number]["itemObjectives"]> = quest
      .itemObjectives?.length
      ? quest.itemObjectives
      : (capture?.requiredItems ?? []).map((item) => ({
          ...item,
          objectiveIndex:
            quest.creatureIds.length === 0 && capture?.requiredItems?.length === 1 ? 1 : null,
          npcIds: quest.itemCreatureIds,
          sharing: "unknown" as const,
        }));
    if (!items.length) enqueue("quest", quest.questId);
    const namedObjectives = capturedItemObjectives(
      capture?.objectives ?? [],
      items.flatMap((item) => {
        const name = byKey.get(`item:${item.itemId}`)?.name;
        return name ? [{ itemId: item.itemId, name }] : [];
      }),
    );
    return {
      ...quest,
      itemObjectives: items.map((item) => {
        const named = namedObjectives.get(item.itemId);
        const quantity =
          item.quantity ??
          capture?.requiredItems?.find((entry) => entry.itemId === item.itemId)?.quantity ??
          named?.quantity ??
          null;
        if (item.provided || named?.provided)
          return { ...item, quantity, provided: true, npcIds: [] };
        if (item.npcIds.length === 0) return { ...item, quantity };
        if (quantity === null) enqueue("quest", quest.questId);
        const override = overrides.find(
          (entry) => entry.questId === quest.questId && entry.itemId === item.itemId,
        );
        const sharing = override?.sharing ?? item.sharing;
        const record = byKey.get(`item:${item.itemId}`);
        const related =
          record?.relations.filter(
            (r) =>
              r.relation === "dropped-by" &&
              r.kind === "npc" &&
              (item.npcIds.length === 0 || item.npcIds.includes(r.id)),
          ) ?? [];
        if (item.objectiveIndex === null)
          reviews.push({
            questId: quest.questId,
            itemId: item.itemId,
            reason:
              "Map the item to its exact source objective index; mixed-objective order is not assumed.",
          });
        if (sharing === "unknown")
          reviews.push({
            questId: quest.questId,
            itemId: item.itemId,
            reason:
              "Confirm independent rolls versus pooled quest loot before using this in a party.",
          });
        let quantified = 0;
        for (const relation of related) {
          const stats = relation.dropStatistics;
          if (!stats || stats.percent === null) continue;
          if (!npcIds.has(relation.id)) {
            reviews.push({
              questId: quest.questId,
              itemId: item.itemId,
              reason: `Creature ${relation.id} needs a compatible level/rank reference.`,
            });
            continue;
          }
          const drop: QuestLootDrop = {
            itemId: item.itemId,
            npcId: relation.id,
            probability: stats.percent / 100,
            probabilityBasis: stats.percentBasis ?? "reported",
            minimumQuantity: stats.minimumQuantity,
            maximumQuantity: stats.maximumQuantity,
            ...(stats.quantityDistribution
              ? { quantityDistribution: stats.quantityDistribution.map((entry) => ({ ...entry })) }
              : {}),
            sampleSize: stats.attempts,
            targetBuild: dataset.targetBuild,
            sourceBuild: null,
            sourceUrl: record!.sourceUrl,
            sourceSha256: record!.sourceSha256,
            capturedAt: record!.capturedAt,
          };
          const key = `${drop.itemId}:${drop.npcId}`,
            previous = drops.get(key);
          if (conflicted.has(key)) continue;
          if (
            previous?.capturedAt === drop.capturedAt &&
            (previous.probability !== drop.probability ||
              previous.minimumQuantity !== drop.minimumQuantity ||
              previous.maximumQuantity !== drop.maximumQuantity ||
              distributionKey(previous.quantityDistribution) !==
                distributionKey(drop.quantityDistribution))
          ) {
            reviews.push({
              questId: quest.questId,
              itemId: item.itemId,
              reason: `Conflicting drop probability for creature ${drop.npcId}.`,
            });
            drops.delete(key);
            conflicted.add(key);
            continue;
          }
          if (!previous || previous.capturedAt <= drop.capturedAt) drops.set(key, drop);
          quantified++;
          if (drop.probability === 0)
            reviews.push({
              questId: quest.questId,
              itemId: item.itemId,
              reason: `Creature ${drop.npcId} has no positive reported drop chance; choose another source or review it.`,
            });
          if (
            !stats.quantityDistribution &&
            (stats.minimumQuantity === null ||
              stats.maximumQuantity === null ||
              stats.minimumQuantity !== stats.maximumQuantity)
          )
            reviews.push({
              questId: quest.questId,
              itemId: item.itemId,
              reason:
                "Confirm items per drop or provide a variable-stack distribution; another identical page fetch is not sufficient.",
            });
        }
        const candidates = related.length ? [...new Set(related.map((r) => r.id))] : item.npcIds;
        if (
          !quantified &&
          ![...drops.values()].some(
            (drop) => drop.itemId === item.itemId && candidates.includes(drop.npcId),
          )
        )
          enqueue("item", item.itemId);
        if (candidates.length !== 1)
          reviews.push({
            questId: quest.questId,
            itemId: item.itemId,
            reason: "Choose an on-route dropping creature; a uniform creature mix is not assumed.",
          });
        return { ...item, quantity, npcIds: candidates, sharing };
      }),
    };
  });
  return {
    data: combatDatasetSchema.parse({ ...dataset, quests, lootDrops: [...drops.values()] }),
    queue: [...queue.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id),
    reviews,
    questIds: [...selected].sort((a, b) => a - b),
  };
}
