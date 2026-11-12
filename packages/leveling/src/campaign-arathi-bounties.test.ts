import { describe, expect, it } from "vitest";
import { buildCampaignPlan, type CampaignSource } from "./campaign.js";
import { CAMPAIGN_BRIDGES, campaignStarterSourceIds } from "./campaign-route.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { importedChapterSchema, parseGuideChapter } from "./guide-archive.js";
import { combatDatasetSchema } from "./combat-model.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { questRewardFactSchema, type QuestRewardFact } from "./quest-rewards.js";
import { questCatalogRewardFacts, questCatalogSchema } from "./quest-catalog.js";
import { applyCampaignPartyQuestPolicy } from "./campaign-party-policy.js";
import data from "./fixtures/arathi-wanted-bounties-70205.json" with { type: "json" };

function source(): CampaignSource {
  const guide = importedChapterSchema.parse(structuredClone(data.guide));
  return { guide, reference: CHAPTER_REFERENCES.find((row) => row.id === guide.chapterId)! };
}

function rewardFacts(): readonly QuestRewardFact[] {
  const facts = questRewardFactSchema.array().parse(data.rewardFacts).map((fact): QuestRewardFact => {
    const { rewardBasis, evidenceKind, referenceBaseXp, pageMultiplier, clientReference, ...required } = fact;
    return { ...required,
      ...(rewardBasis === undefined ? {} : { rewardBasis }),
      ...(evidenceKind === undefined ? {} : { evidenceKind }),
      ...(referenceBaseXp === undefined ? {} : { referenceBaseXp }),
      ...(pageMultiplier === undefined ? {} : { pageMultiplier }),
      ...(clientReference === undefined ? {} : { clientReference }),
    };
  });
  return questCatalogRewardFacts(facts, questCatalogSchema.parse(data.catalog));
}

describe("northern Arathi bounty visit", () => {
  it("keeps both wanted bounties in one mandatory group before Scarlet Monastery", () => {
    const before = CAMPAIGN_BRIDGES.find((row) => row.id === "scarlet-northern-return")!;
    const after = CAMPAIGN_BRIDGES.find((row) => row.id === "post-scarlet-east")!;
    expect(before.quests).toEqual(expect.arrayContaining([684, 685]));
    expect(before.mandatoryQuestGroups).toContainEqual([684, 685]);
    expect(before.mandatoryQuestGroups).toContainEqual([642, 651]);
    for (const id of [684, 685]) expect(after.quests).not.toContain(id);
  });

  it.each(["warrior", "priest", "mage", "rogue", "warlock"] as const)(
    "preserves the captured pickup, all three heads and hand-ins for %s", (classSlug) => {
      const captured = source(), original = structuredClone(captured);
      const combat = combatDatasetSchema.parse(data.combat);
      const starters: CampaignSource[] = campaignStarterSourceIds("human", classSlug).map((id) => {
        const reference = CHAPTER_REFERENCES.find((row) => row.sourceId === id)!;
        return { reference, guide: parseGuideChapter("step\n+Test-only companion chapter",
          reference.id, "f".repeat(64), 70205) };
      });
      const plan = buildCampaignPlan("human", "f".repeat(64), [...starters, captured], classSlug,
        { sharedQuestsOnly: true, questReferences: combat.quests });
      const sm = plan.actions.findIndex((row) => row.id === "dungeon-scarlet-monastery-entry");
      expect(sm).toBeGreaterThan(0);
      for (const id of [651, 684, 685]) {
        const actions = plan.actions.filter((row) => row.questChanges.some((change) => change.questId === id));
        const phases = actions.flatMap((row) => row.questChanges.filter((change) => change.questId === id));
        expect(phases.map((row) => row.state)).toEqual([
          "accepted", ...Array.from({ length: id === 651 ? 3 : id === 685 ? 2 : 1 }, () => "objectives-complete"), "rewarded",
        ]);
        expect(actions.every((row) => row.legId === "scarlet-northern-return" && plan.actions.indexOf(row) < sm)).toBe(true);
        expect(actions.every((row) => row.source?.chapterId === captured.guide.chapterId &&
          row.source.version === captured.guide.version && !row.leaderOnly && !row.xpOptional)).toBe(true);
      }
      expect(plan.actions.some((row) => row.questChanges.some((change) => change.questId === 652))).toBe(false);
      const west = plan.actions.find((row) => row.questChanges.some((change) =>
        change.questId === 651 && change.objectiveIndex === 1));
      expect(west?.source?.stepId).toBe("source-step-0117");
      expect(captured).toEqual(original);
    },
  );

  it("retains the binding follow-up through party policy with its explicitly selected parent", () => {
    const captured = source(), combat = combatDatasetSchema.parse(data.combat);
    const starters = campaignStarterSourceIds("human", "warrior").map((id): CampaignSource => {
      const reference = CHAPTER_REFERENCES.find((row) => row.sourceId === id)!;
      return { reference, guide: parseGuideChapter("step\n+Test-only companion chapter",
        reference.id, "f".repeat(64), 70205) };
    });
    const plan = buildCampaignPlan("human", "f".repeat(64), [...starters, captured], "warrior",
      { sharedQuestsOnly: true, questReferences: combat.quests });
    const attached = attachCampaignCombat(plan, [captured], combat, "captured-key-policy");
    const selected = applyCampaignPartyQuestPolicy(attached, [captured], combat, questCatalogSchema.parse(data.catalog));
    for (const id of [642, 651]) {
      expect(selected.partyPolicy?.decisions.find((row) => row.questId === id)?.included).toBe(true);
      expect(selected.actions.some((action) => action.questChanges.some((change) =>
        change.questId === id && change.state === "rewarded"))).toBe(true);
    }
  });

  it.each([
    { level: 35, currentXp: 0, bindingKeys: false },
    { level: 36, currentXp: 0, bindingKeys: false },
    { level: 35, currentXp: 66336, bindingKeys: true },
  ])("checks actual bounty combat from $level + $currentXp, binding keys: $bindingKeys", ({ level, currentXp, bindingKeys }) => {
    const captured = source(), combat = combatDatasetSchema.parse(data.combat);
    const starters = campaignStarterSourceIds("human", "warrior").map((id): CampaignSource => {
      const reference = CHAPTER_REFERENCES.find((row) => row.sourceId === id)!;
      return { reference, guide: parseGuideChapter("step\n+Test-only companion chapter",
        reference.id, "f".repeat(64), 70205) };
    });
    const plan = buildCampaignPlan("human", "f".repeat(64), [...starters, captured], "warrior",
      { sharedQuestsOnly: true, questReferences: combat.quests });
    const ids = bindingKeys ? [651, 684, 685] : [684, 685];
    const actions = plan.actions.filter((row) => row.questChanges.some((change) => ids.includes(change.questId)));
    const leg = plan.legs.find((row) => row.id === "scarlet-northern-return")!;
    const component = attachCampaignCombat({ ...plan, actions,
      legs: [{ ...leg, from: 35, to: 38, actionIds: actions.map((row) => row.id), questIds: ids, unresolvedQuestIds: [] }],
      rewardFacts: rewardFacts(),
    }, [captured], combat, "captured-arathi-bounty-test");
    const initial = emptyPremadeProgress(), classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
    const progress = { ...initial, difficultyPolicy: "experienced-premade" as const,
      members: initial.members.map((member, index) => ({ ...member, raceId: "human" as const,
        classSlug: classes[index]!, level, currentXp, xpNeedsUpdate: false,
        questStates: bindingKeys ? { "642": "rewarded" as const } : {} })) };
    const forecast = forecastCampaignXp(component, progress);
    for (let player = 0; player < 5; player++) {
      const rows = forecast.map((section) => section.members[player]!);
      const rewards = rows.flatMap((row) => row.steps).filter((step) => step.status === "projected" && step.phase === "rewarded");
      if (level === 35 && !bindingKeys) {
        expect(rows.some((row) => row.blockedAtActionId)).toBe(true);
        expect(rewards).toEqual([]);
      } else {
        expect(rows.every((row) => row.blockedAtActionId === null && row.unknownQuestIds.length === 0)).toBe(true);
        expect(rewards.map((step) => step.questId).sort()).toEqual(ids);
        expect(rewards.reduce((sum, step) => sum + step.questXp, 0)).toBe(bindingKeys ? 10500 : 7650);
      }
    }
  });
});
