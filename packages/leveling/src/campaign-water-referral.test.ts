import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { campaignStarterSourceIds } from "./campaign-route.js";
import { parseGuideChapter } from "./guide-archive.js";
import { buildCampaignPlan, type CampaignPlan, type CampaignSource } from "./campaign.js";
import { applyCampaignPartyQuestPolicy } from "./campaign-party-policy.js";
import {
  attachCampaignCombat,
  indexCombatReferences,
  resolveCombatObjectives,
} from "./campaign-combat.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";

const archiveHash = "a".repeat(64);
const body = `step
.goto 1439,39.37,43.48
.accept 984 >> Accept How Big a Threat?
step
.goto 1439,39,53
.complete 984,1 >> Find the furbolg camp
step
.goto 1439,39.37,43.48
.turnin 984 >> Turn in How Big a Threat?
.accept 4761 >> Accept Thundris Windweaver
step
.goto 1439,37.39,40.13
.turnin 4761 >> Turn in Thundris Windweaver
.accept 4762 >> Accept The Cliffspring River
step
.goto 1439,50.74,25.21
#season 0 << !Warrior !Rogue
>>Use the Empty Sampling Tube in the river water
.complete 4762,1 >> Cliffspring River Sample (1)
.use 12350
step
.goto 1439,37.39,40.13
.turnin 4762 >> Turn in The Cliffspring River`;

function fixture(classSlug: "warrior" | "paladin" | "priest" | null = "warrior"): {
  readonly plan: CampaignPlan;
  readonly sources: readonly CampaignSource[];
  readonly data: CombatDataset;
} {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 126)!;
  const sources = [
    ...campaignStarterSourceIds("human", classSlug).map((sourceId) => {
      const starter = CHAPTER_REFERENCES.find((entry) => entry.sourceId === sourceId)!;
      return {
        reference: starter,
        guide: parseGuideChapter("step\n>>Starter fixture", starter.id, archiveHash, 70205),
      };
    }),
    { reference, guide: parseGuideChapter(body, reference.id, archiveHash, 70205) },
  ];
  const data = combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "",
    provider: {
      repository: "https://example.test/questie",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "a".repeat(64),
      questSha256: "b".repeat(64),
      itemSha256: "c".repeat(64),
      limitations: ["Source referral regression fixture"],
    },
    npcs: [],
    quests: [984, 4761, 4762].map((questId) => ({
      questId,
      creatureIds: [],
      itemCreatureIds: [],
      objectiveText: [],
      onlyCreatureObjectives: false,
      onlyInteractionObjectives: questId === 984,
      requiredClasses: 0,
      prerequisites: {
        allOf: [],
        anyOf: questId === 4761 ? [984] : questId === 4762 ? [4761] : [],
      },
      itemObjectives:
        questId === 4762
          ? [{ itemId: 12349, objectiveIndex: 1, quantity: 1, npcIds: [], sharing: "pooled" }]
          : [],
    })),
    dungeons: [],
  });
  const base = buildCampaignPlan("human", archiveHash, sources, classSlug, {
    includeLibrary: false,
    questReferences: data.quests,
  });
  return {
    plan: applyCampaignPartyQuestPolicy(
      attachCampaignCombat(base, sources, data, "fixture"),
      sources,
      data,
    ),
    sources,
    data,
  };
}

describe("complete Cliffspring River referral", () => {
  it.each(["warrior", "paladin", "priest", null] as const)(
    "retains the selected water interaction and its real referral for %s",
    (classSlug) => {
      const { plan } = fixture(classSlug);
      const phases = (questId: number): string[] =>
        plan.actions.flatMap((action) =>
          action.questChanges
            .filter((change) => change.questId === questId)
            .map((change) => change.state),
        );
      expect(phases(4761)).toEqual(["accepted", "rewarded"]);
      expect(phases(4762)).toEqual(["accepted", "objectives-complete", "rewarded"]);
      const pickup = plan.actions.find((action) =>
        action.questChanges.some(
          (change) => change.questId === 4762 && change.state === "accepted",
        ),
      )!;
      expect(pickup.questChanges.map((change) => [change.questId, change.state])).toEqual([
        [4761, "rewarded"],
        [4762, "accepted"],
      ]);
      expect(
        plan.partyPolicy?.decisions.find((decision) => decision.questId === 4762),
      ).toMatchObject({
        included: true,
        requiredFor: [4762],
      });
    },
  );

  it("retains the source's sampling item use without attributing creature kills", () => {
    const { plan, sources, data } = fixture();
    const completion = plan.actions.find((action) =>
      action.questChanges.some(
        (change) => change.questId === 4762 && change.state === "objectives-complete",
      ),
    )!;
    expect(completion).toBeDefined();
    const native = campaignNativeInstructions(plan, sources)(completion)!;
    expect(native.directives).toEqual(
      expect.arrayContaining([expect.objectContaining({ tag: ".use", arguments: "12350" })]),
    );
    expect(
      resolveCombatObjectives(native.directives, indexCombatReferences(data), "fixture"),
    ).toEqual([
      expect.objectContaining({
        questId: 4762,
        credit: "non-combat",
        npcIds: [],
        requiredKills: null,
      }),
    ]);
  });

  it("counts each hand-in once and releases the referral slot before the water pickup", () => {
    const { plan } = fixture();
    const actions = plan.actions.filter((action) => action.legId === "northern-approach");
    const leg = plan.legs.find((entry) => entry.id === "northern-approach")!;
    const scoped: CampaignPlan = {
      ...plan,
      actions,
      legs: [{ ...leg, actionIds: actions.map((action) => action.id) }],
      rewardFacts: [4761, 4762].map((questId) => ({
        questId,
        fullXp: questId === 4761 ? 50 : 1400,
        questLevel: 15,
        minimumLevel: 11,
        xpByLevel: [],
        sourceUrl: `https://example.test/quest=${questId}`,
        capturedAt: "2026-11-01T00:00:00.000Z",
        status: "available" as const,
      })),
    };
    const base = emptyPremadeProgress();
    const progress = {
      ...base,
      members: base.members.map((member) => ({
        ...member,
        level: 15,
        currentXp: 0,
        xpNeedsUpdate: false,
        questStates: { "984": "rewarded" as const },
      })),
    };
    for (const member of forecastCampaignXp(scoped, progress)[0]!.members) {
      expect(member.blockedReason).toBeNull();
      expect(member.referenceQuestXp).toBe(1450);
      expect(member.combatXp).toBe(0);
      expect(member.questLog.peak).toBe(1);
      expect(member.questLog.used).toBe(0);
    }
    expect(
      auditCampaignQuestLog(scoped, progress).every((member) => member.peakUpperBound === 1),
    ).toBe(true);
  });
});
