import { describe, expect, it } from "vitest";
import { attachCampaignCombat } from "./campaign-combat.js";
import { attachCampaignReferenceFarmTargets } from "./campaign-reference-farm-targets.js";
import { createCampaignCombatReadiness } from "./campaign-combat-readiness.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { combatDatasetSchema } from "./combat-model.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { importedChapterSchema } from "./guide-archive.js";
import { partyQuestLootCost } from "./party-quest-cost.js";
import { resolveCombatQuota } from "./combat-loot.js";
import fixture from "./fixtures/dream-dust-source-candidates-70205.json" with { type: "json" };

function example(): { plan: CampaignPlan; sources: readonly CampaignSource[] } {
  const sources = fixture.sources.map((row): CampaignSource => ({
    reference: CHAPTER_REFERENCES.find((entry) => entry.id === row.chapterId)!,
    guide: importedChapterSchema.parse(row.guide),
  }));
  const actions = fixture.actions.map((action) => ({ ...action, legId: "swamp" })) as readonly CampaignAction[];
  const plan: CampaignPlan = { release: "captured-dream-dust", race: "human", leaderClass: "warrior",
    sharedQuestsOnly: true, targetBuild: 70205, sourceArchiveSha256: fixture.provenance.sourceArchiveSha256,
    actions, legs: [{ id: "swamp", title: "Swamp of Sorrows", kind: "preparation", from: 31, to: 37,
      actionIds: actions.map((action) => action.id), stopId: null, questIds: [1116], unresolvedQuestIds: [] }] };
  return { plan: attachCampaignCombat(plan, sources, combatDatasetSchema.parse(fixture.combat),
    fixture.provenance.combatSha256), sources };
}

describe("lowest-level eligible loot creatures", () => {
  it.each(["shared-party", "personal", "leader-only", "all-expensive", "other-review-action"] as const)(
    "checks the actual party workload before ranking a captured camp: %s", (mode) => {
      const { plan } = example(), combat = plan.combat!;
      const activities = combat.activities.map((activity) => ({ ...activity,
        objectives: activity.objectives.map((objective) => ({ ...objective,
          npcIds: objective.loot?.sourceNpcIds ?? objective.npcIds,
        })),
      }));
      const { sharedQuestsOnly: _shared, ...basePlan } = plan;
      const input: CampaignPlan = { ...basePlan,
        ...(mode !== "personal" ? { sharedQuestsOnly: true as const } : {}),
        actions: plan.actions.map((action) => ({ ...action, leaderOnly: mode === "leader-only" })),
        combat: { ...combat,
          activities: mode !== "other-review-action" ? activities : [...activities, {
            ...activities[0]!, id: "different-review", actionId: "different-review",
            objectives: activities[0]!.objectives.map((objective) => ({ ...objective,
              npcIds: [740], loot: { ...objective.loot!, quantity: 1 },
            })),
          }],
          lootDrops: combat.lootDrops!.map((drop) => drop.npcId === 740 || mode === "all-expensive"
            ? { ...drop, probability: 0.2,
              probabilityReference: { ...drop.probabilityReference!, probability: 0.2 } } : drop),
        },
      };
      const before = structuredClone(input), chosen = attachCampaignReferenceFarmTargets(input);
      const expectedNpc = mode === "shared-party" || mode === "other-review-action" ? 741 : 740;
      expect(chosen.combat!.activities[0]!.objectives[0]!.npcIds).toEqual([expectedNpc]);
      if (expectedNpc === 741) expect(partyQuestLootCost(1116, { ...chosen,
        combat: { ...chosen.combat!, activities: [chosen.combat!.activities[0]!] },
      }).eligible).toBe(true);
      expect(chosen.combat!.activities[0]!.objectives[0]!.loot!.quantity).toBe(10);
      expect(chosen.combat!.activities[0]!.objectives[0]!.loot!.sourceNpcIds)
        .toEqual(combat.activities[0]!.objectives[0]!.loot!.sourceNpcIds);
      expect(input).toEqual(before);
    },
  );

  it("uses the captured low-level whelp instead of a higher-level drop source with a better rate", () => {
    const { plan, sources } = example();
    const action = plan.actions.find((entry) => entry.questChanges.some((change) => change.state === "objectives-complete"))!;
    const activity = plan.combat!.activities.find((entry) => entry.actionId === action.id)!;
    expect(activity.objectives[0]!.npcIds).toEqual([740]);
    expect(action.referenceCreatureTargets).toEqual([{ npcId: 740, name: "Adolescent Whelp" }]);
    expect(createCampaignCombatReadiness(plan)(action).targetLevel).toBe(31);
    const quota = resolveCombatQuota(activity.objectives[0]!, plan.combat!, 5, "expected");
    expect(quota.kills).toBe(95);
    expect(quota.collection!.input).toMatchObject({ quantity: 10, partySize: 5, sharing: "pooled" });
    expect(plan.combat!.lootDrops!.find((drop) => drop.npcId === 740)!.probability)
      .toBe(fixture.combat.lootDrops.find((drop) => drop.npcId === 740)!.probability);
    expect(partyQuestLootCost(1116, plan)).toMatchObject({ eligible: true, expectedKills: 95, retainedByDropRate: true });
    expect(action.instructions.at(-1)).toContain("focus on Adolescent Whelp");
    expect(campaignNativeInstructions(plan, sources)(action)?.directives
      .filter((directive) => directive.tag === ".mob").map((directive) => directive.arguments))
      .toEqual(["Adolescent Whelp"]);
  });

  it("keeps the original references and source untouched and is stable when reapplied", () => {
    const original = JSON.stringify(fixture), { plan } = example();
    for (const drop of plan.combat!.lootDrops!)
      expect(drop).toEqual(fixture.combat.lootDrops.find((entry) => entry.npcId === drop.npcId));
    for (const npc of plan.combat!.npcs)
      expect(npc).toEqual(fixture.combat.npcs.find((entry) => entry.id === npc.id));
    expect(attachCampaignReferenceFarmTargets(plan)).toBe(plan);
    expect(JSON.stringify(fixture)).toBe(original);
  });

  it.each(["drop", "level"] as const)("uses the next eligible source when the lowest lacks a known %s", (missing) => {
    const { plan } = example(), combat = plan.combat!;
    const input: CampaignPlan = { ...plan, combat: { ...combat,
      npcs: combat.npcs.map((npc) => missing === "level" && npc.id === 740
        ? { ...npc, minimumLevel: null, maximumLevel: null } : npc),
      lootDrops: combat.lootDrops!.filter((drop) => missing !== "drop" || drop.npcId !== 740),
      activities: combat.activities.map((activity) => ({ ...activity,
        objectives: activity.objectives.map((objective) => ({ ...objective,
          npcIds: objective.loot?.sourceNpcIds ?? objective.npcIds,
        })),
      })),
    } };
    const chosen = attachCampaignReferenceFarmTargets(input);
    expect(chosen.combat!.activities[0]!.objectives[0]!.npcIds).toEqual([741]);
    expect(chosen.actions.find((action) => action.referenceCreatureTargets)?.referenceCreatureTargets)
      .toEqual([{ npcId: 741, name: "Dreaming Whelp" }]);
    expect(chosen.actions.flatMap((action) => action.instructions)
      .filter((line) => line.startsWith("For these objectives, focus on")))
      .toEqual(["For these objectives, focus on Dreaming Whelp."]);
  });
});
