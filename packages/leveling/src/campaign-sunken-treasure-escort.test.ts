import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { importedChapterSchema } from "./guide-archive.js";
import { combatDatasetSchema } from "./combat-model.js";
import { questCatalogSchema, questCatalogRewardFacts } from "./quest-catalog.js";
import { questRewardFactSchema } from "./quest-rewards.js";
import { applyNarrativeEncounterReferences, campaignNarrativeEvents } from "./campaign-narrative-events.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { fundingDeliveryPickupQuestIds } from "./campaign-funding-deliveries.js";
import fixture from "./fixtures/sunken-treasure-escort-70205.json" with { type: "json" };

const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;

function input(): {
  plan: CampaignPlan;
  sources: CampaignSource[];
  combat: ReturnType<typeof combatDatasetSchema.parse>;
  catalog: ReturnType<typeof questCatalogSchema.parse>;
} {
  const guide = importedChapterSchema.parse(fixture.guide);
  const sources = [{ guide, reference: CHAPTER_REFERENCES.find((row) => row.id === guide.chapterId)! }];
  const actions: readonly CampaignAction[] = fixture.actions.map((action) => ({ ...action,
    kind: "quests", leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null,
    source: { ...action.source }, legId: "escort",
    positions: action.positions.map((row) => ({ ...row, position: { ...row.position, space: "world" } })),
    questChanges: action.questChanges.map((change) => ({ ...change,
      state: change.state as "accepted" | "objectives-complete" | "rewarded",
    })),
  }));
  const catalog = questCatalogSchema.parse({
    schema: "forever-quest-funding-catalog.v1", targetBuild: 70205,
    publication: "private-reference", authorizationNote: "Captured escort regression only",
    providerRevision: fixture.combat.provider.revision,
    questSha256: fixture.combat.provider.questSha256,
    npcSha256: fixture.combat.provider.npcSha256,
    itemSha256: fixture.combat.provider.itemSha256,
    objectSha256: fixture.combat.provider.objectSha256,
    areaMapSha256: "a".repeat(64), sourceArchiveSha256: fixture.provenance.sourceArchiveSha256,
    includesAuthoredCorrections: true, quests: [fixture.parent, fixture.quest],
  });
  const { rewardBasis, evidenceKind, clientReference, referenceBaseXp, pageMultiplier, ...reward }
    = questRewardFactSchema.parse(fixture.reward);
  return { sources, catalog, combat: combatDatasetSchema.parse(fixture.combat),
    plan: { release: "captured-escort", race: "human", leaderClass: "warrior", targetBuild: 70205,
      sourceArchiveSha256: fixture.provenance.sourceArchiveSha256, sharedQuestsOnly: true,
      sharedSourceQuestIds: [663, 665, 666], actions,
      legs: [{ id: "escort", title: "Sunken Treasure", kind: "preparation", from: 36, to: 41,
        stopId: null, actionIds: actions.map((action) => action.id), questIds: [665], unresolvedQuestIds: [] }],
      rewardFacts: questCatalogRewardFacts([{ ...reward,
        ...(rewardBasis === undefined ? {} : { rewardBasis }),
        ...(evidenceKind === undefined ? {} : { evidenceKind }),
        ...(clientReference === undefined ? {} : { clientReference }),
        ...(referenceBaseXp === undefined ? {} : { referenceBaseXp }),
        ...(pageMultiplier === undefined ? {} : { pageMultiplier }),
      }], catalog),
    },
  };
}

function progress(level: number, parentRewarded = true): ReturnType<typeof emptyPremadeProgress> {
  const initial = emptyPremadeProgress();
  return { ...initial, difficultyPolicy: "experienced-premade",
    members: initial.members.map((member, index) => ({ ...member, raceId: "human",
      classSlug: classes[index]!, level, currentXp: 0, xpNeedsUpdate: false,
      questStates: parentRewarded ? { "663": "rewarded" as const } : {},
    })),
  };
}

describe("captured Sunken Treasure escort", () => {
  it("qualifies all five classes with actual encounter access and no courier departure", () => {
    const data = input(), before = structuredClone(data);
    for (const leaderClass of classes) {
      const plan = { ...data.plan, leaderClass };
      const methods = campaignNarrativeEvents(plan, data.sources, data.combat, data.catalog);
      const method = methods.get(665)!;
      expect(method).toBeDefined();
      expect(method.maximumEnemyLevel).toBe(40);
      expect(method.canLeaveAfterPickup).toBeUndefined();
      expect(fundingDeliveryPickupQuestIds(data.catalog, data.combat, methods).has(665)).toBe(false);
      expect(method.actions.flatMap((action) => action.questChanges.map((change) => change.state)))
        .toEqual(["accepted", "objectives-complete", "rewarded"]);
      expect(method.actions[1]!.instructions.join(" ")).toContain("every player has received escort credit");
      expect(method.actions[1]!.instructions.join(" ")).not.toContain("repeat the conversation");
    }
    expect(data).toEqual(before);
  });

  it("preserves the exact event source and pays each player only the existing quest reward", () => {
    const data = input();
    const plan = attachCampaignCombat(data.plan, data.sources, data.combat, "escort-review");
    expect(plan.combat!.npcs).toEqual([{ id: 2776, name: "Vengeful Surge", minimumLevel: 40,
      maximumLevel: 40, rank: 0, zoneIds: [], xpEligibility: "assumed" }]);
    expect(plan.combat!.activities).toHaveLength(1);
    expect(plan.combat!.activities[0]!.objectives[0]).toMatchObject({
      credit: "non-combat", requiredKills: null, npcIds: [],
      combatAccess: { kind: "encounter", npcIds: [2776] },
      reason: expect.stringContaining("escort event"),
    });
    for (const member of forecastCampaignXp(plan, progress(36))[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.combatXp).toBe(0);
      expect(member.estimatedCombatXp).toBe(0);
      expect(member.rewards.map((reward) => [reward.questId, reward.xp])).toEqual([[665, 3150]]);
      expect(member.knownEndpoint).toEqual({ level: 36, currentXp: 3150 });
    }
    const counter = plan.actions[1]!;
    expect(counter.source).toEqual(data.plan.actions[1]!.source);
    expect(counter.positions).toEqual(data.plan.actions[1]!.positions);
    const native = campaignNativeInstructions(plan, data.sources)(counter)!;
    expect(native.directives).toContainEqual(expect.objectContaining({ tag: ".mob", arguments: "Vengeful Surge" }));
    const addon = compileCampaignAddon(plan, plan.actions, { version: "0.2.0-review.escort",
      runtimeBuild: 70450, interfaceVersion: 16001, restedXpVersion: "v4.11.27", nativeSources: data.sources });
    for (const role of ["leader", "party"]) {
      const text = addon.documents.filter((document) => document.role === role).map((document) => document.content).join("\n");
      expect(text.match(/\.accept 665\b/g)).toHaveLength(1);
      expect(text.match(/\.complete 665,1\b/g)).toHaveLength(1);
      expect(text.match(/\.turnin 665\b/g)).toHaveLength(1);
      expect(text).toContain("Vengeful Surge");
    }
  });

  it.each(["enemy-level", "missing-parent"])("holds the event at a real %s gate", (reason) => {
    const data = input(), plan = attachCampaignCombat(data.plan, data.sources, data.combat, "escort-review");
    for (const member of forecastCampaignXp(plan, progress(reason === "enemy-level" ? 35 : 36,
      reason !== "missing-parent"))[0]!.members) {
      expect(member.blockedAtActionId).not.toBeNull();
      expect(member.rewards).toEqual([]);
      expect(member.combatXp).toBe(0);
    }
  });

  it.each(["provider", "archive", "catalog", "reference", "source", "unknown-enemy"])(
    "does not qualify changed %s evidence", (reason) => {
      const data = input();
      if (reason === "provider") data.combat.provider.revision = "a".repeat(40);
      if (reason === "archive") data.plan = { ...data.plan, sourceArchiveSha256: "a".repeat(64) };
      if (reason === "catalog") data.catalog.quests[1]!.requiredClasses = 1;
      if (reason === "reference") data.combat.quests[0]!.objectiveText = ["Kill the professor."];
      if (reason === "source") data.sources[0]!.guide.steps[1]!.directives[0]!.text = "Use another route";
      if (reason === "unknown-enemy") data.combat = { ...data.combat,
        npcs: [{ id: 2776, name: "Vengeful Surge", minimumLevel: null, maximumLevel: null,
          rank: 0, zoneIds: [], xpEligibility: "unknown" }] };
      expect(campaignNarrativeEvents(data.plan, data.sources, data.combat, data.catalog).has(665)).toBe(false);
    },
  );

  it("leaves unrelated datasets and subsequently recorded enemy values unchanged", () => {
    const data = input();
    const unrelated = { ...data.combat, quests: [] };
    expect(applyNarrativeEncounterReferences(unrelated)).toBe(unrelated);
    const recorded = { ...data.combat, npcs: [{ id: 2776, name: "Vengeful Surge",
      minimumLevel: 41, maximumLevel: 41, rank: 0, zoneIds: [], xpEligibility: "assumed" as const }] };
    expect(applyNarrativeEncounterReferences(recorded)).toBe(recorded);
  });
});
