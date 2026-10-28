import {
  DUNGEON_VISITS,
  DUNGEON_QUESTS,
  DUNGEON_FACTS,
  PREMADE_STOPS,
  GUARANTEED_DUNGEON_IDS,
  getDungeonBundle,
  forecastDungeonBundle,
  resolveQuestReward,
  questEligibility,
  isDungeonTableQuest,
  getPremadeRewardReference,
} from "../packages/leveling/dist/index.js";

// Independent arithmetic oracle: do not use the production rounding helper here.
function estimatedReward(base, questLevel, level) {
  if (level === 60) return 0;
  const difference = level - questLevel;
  const fraction = [1, 0.8, 0.6, 0.4, 0.2, 0.1][Math.min(5, Math.max(0, difference - 5))];
  const amount = Math.round(base * 2.375) * fraction;
  const rounding = amount < 1000 ? 10 : 50;
  return Math.round(amount / rounding) * rounding;
}

export function auditDungeonQuestRewards(facts) {
  const questIds = [
    ...new Set([
      ...DUNGEON_VISITS.flatMap((visit) => visit.questIds),
      ...PREMADE_STOPS.flatMap((stop) => stop.quests.map((quest) => quest.questId)),
    ]),
  ].sort((left, right) => left - right);
  const issues = [];
  const historicalReferenceDisagreements = [];
  let checkedRewards = 0;
  let checkedCapturedFullRewards = 0;
  const quests = questIds.map((questId) => {
    const fact = facts.find((entry) => entry.questId === questId);
    const quest = DUNGEON_QUESTS.find((entry) => entry.id === questId);
    const tableQuest = DUNGEON_FACTS.quests.find((entry) => entry.id === questId);
    const otherReference =
      tableQuest?.baseXp ?? tableQuest?.referenceXp ?? getPremadeRewardReference(questId)?.baseXp;
    if (
      fact?.evidenceKind === "historical-reference" &&
      fact.fullXp !== null &&
      otherReference != null &&
      fact.fullXp !== otherReference
    )
      historicalReferenceDisagreements.push({
        questId,
        name: quest?.title ?? null,
        importedXp: fact.fullXp,
        importedSource: fact.sourceUrl,
        otherReferenceXp: otherReference,
        otherSource: tableQuest ? DUNGEON_FACTS.source : getPremadeRewardReference(questId)?.source,
      });
    const { minimumLevel } = questEligibility(questId, facts);
    if (
      fact?.status === "available" &&
      fact.evidenceKind === "published-forever" &&
      fact.referenceBaseXp != null &&
      fact.pageMultiplier != null &&
      fact.fullXp !== null
    ) {
      const scaled = Math.round(fact.referenceBaseXp * fact.pageMultiplier);
      const step = scaled < 1000 ? 10 : 50;
      const expected = Math.round(scaled / step) * step;
      checkedCapturedFullRewards++;
      if (fact.fullXp !== expected)
        issues.push({ questId, kind: "captured-full-xp", expected, actual: fact.fullXp });
    }
    const rewards = [];
    for (let level = 1; level <= 60; level++) {
      const actual = resolveQuestReward(questId, level, facts);
      rewards.push({ level, xp: actual.xp, basis: actual.basis });
      let expected;
      if (level === 60) expected = 0;
      else if (fact?.status === "conflict" || (minimumLevel !== null && level < minimumLevel))
        expected = null;
      else if (fact?.status === "available") {
        const historicalBase =
          tableQuest?.baseXp ??
          tableQuest?.referenceXp ??
          getPremadeRewardReference(questId)?.baseXp;
        const base =
          fact.referenceBaseXp ??
          (fact.evidenceKind === "historical-reference" && fact.fullXp === historicalBase
            ? historicalBase
            : null);
        if (
          fact.evidenceKind !== "observed-forever" &&
          (fact.pageMultiplier === 1 || fact.evidenceKind === "historical-reference") &&
          base != null &&
          fact.questLevel !== null &&
          isDungeonTableQuest(questId)
        )
          expected = estimatedReward(base, fact.questLevel, level);
        else {
          const recorded = fact.xpByLevel.find((row) => row.level === level);
          expected = recorded
            ? recorded.xp
            : fact.fullXp !== null && fact.questLevel !== null && level <= fact.questLevel + 5
              ? fact.fullXp
              : null;
        }
      }
      // Missing source rewards are listed for follow-up, never treated as verified arithmetic.
      if (expected !== undefined) {
        checkedRewards++;
        if (actual.xp !== expected) issues.push({ questId, level, expected, actual: actual.xp });
      }
    }
    return {
      questId,
      name: quest?.title ?? null,
      faction: quest?.faction ?? null,
      visits: DUNGEON_VISITS.filter((visit) => visit.questIds.includes(questId)).map(
        (visit) => visit.id,
      ),
      evidenceStatus: fact?.status ?? "not-captured",
      evidenceKind: fact?.evidenceKind ?? null,
      capturedAt: fact?.capturedAt ?? null,
      sourceUrl: fact?.sourceUrl ?? null,
      questLevel: fact?.questLevel ?? null,
      minimumLevel,
      tableXp: fact?.referenceBaseXp ?? null,
      capturedFullXp: fact?.fullXp ?? null,
      capturedPageCoefficient: fact?.pageMultiplier ?? null,
      rewards,
    };
  });
  const bundles = GUARANTEED_DUNGEON_IDS.flatMap((id) =>
    ["alliance", "horde"].map((faction) => {
      const bundle = getDungeonBundle(id, faction);
      const forecast = forecastDungeonBundle(bundle, {
        level: bundle.planningQuestLevel,
        currentXp: 0,
      });
      return {
        dungeonId: id,
        faction,
        planningQuestLevel: bundle.planningQuestLevel,
        questIdsKnown: bundle.slots.every((slot) => slot.questId !== null),
        estimatedQuestXp: forecast.estimatedXp,
        perSlotXp: forecast.rows.map((row) => row.xp),
        source: forecast.rows[0].source,
      };
    }),
  );
  return {
    summary: {
      dungeonVisits: DUNGEON_VISITS.length,
      distinctQuestIds: quests.length,
      availableRecords: quests.filter((quest) => quest.evidenceStatus === "available").length,
      publishedPageRecords: quests.filter(
        (quest) =>
          quest.evidenceStatus === "available" && quest.evidenceKind === "published-forever",
      ).length,
      historicalEstimateRecords: quests.filter(
        (quest) =>
          quest.evidenceStatus === "available" && quest.evidenceKind === "historical-reference",
      ).length,
      missingOrHeldQuestIds: quests
        .filter((quest) => quest.evidenceStatus !== "available")
        .map((quest) => quest.questId),
      checkedRewards,
      checkedCapturedFullRewards,
      arithmeticIssues: issues.length,
      historicalReferenceDisagreements: historicalReferenceDisagreements.length,
      planningBundles: bundles.length,
    },
    issues,
    historicalReferenceDisagreements,
    quests,
    bundles,
  };
}
