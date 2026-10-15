import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { createCharacterProfile } from "./profile.js";
import { extractCampaignQuestBatches } from "./campaign-catchup.js";
import { recommendCampaignCatchUp } from "./campaign-catchup-planner.js";
import { activeCampaignActions, type CampaignPlan, updateCampaignAction } from "./campaign.js";
import { emptyPremadeProgress, premadeProgressSchema } from "./premade-model.js";
import { campaignSections, campaignSectionActions } from "./campaign-sections.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { auditCampaignSections } from "./campaign-coverage.js";

function fixture(): CampaignPlan {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 128)!;
  const body =
    "step\n.accept 300001 >> Accept Gnoll Patrol\nstep\n.complete 300001,1 >> Kill 10 gnolls\nstep\n.turnin 300001 >> Turn in Gnoll Patrol\nstep\n.accept 300002 >> Accept Supplies\nstep\n.complete 300002,1 >> Collect 10 boxes\nstep\n.turnin 300002 >> Turn in Supplies";
  const guide = parseGuideChapter(body, reference.id, "a".repeat(64), 70205);
  const batches = extractCampaignQuestBatches(
    [{ reference, guide }],
    { ...createCharacterProfile(), classSlug: "warrior" },
    new Set(),
    [],
  );
  const brief = {
    id: "redridge-kill-batch-brief",
    legId: "redridge-kill-batch",
    title: "Redridge",
    instructions: [],
    questChanges: [],
    positions: [],
    source: null,
    kind: "instructions" as const,
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
  return {
    release: "catchup-test",
    race: "human",
    leaderClass: null,
    targetBuild: 70205,
    catchUpBatches: batches,
    actions: [brief],
    legs: [
      {
        id: brief.legId,
        title: "Redridge",
        from: 20,
        to: 23,
        kind: "xp-bridge",
        stopId: null,
        actionIds: [brief.id],
        questIds: [],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [
      {
        questId: 300001,
        fullXp: 2500,
        minimumLevel: 20,
        questLevel: 23,
        xpByLevel: [],
        status: "available",
        sourceUrl: "https://www.wowhead.com/forever/quest=300001",
        capturedAt: "2026-10-15T00:00:00.000Z",
      },
    ],
  };
}
function party(): ReturnType<typeof emptyPremadeProgress> {
  const progress = emptyPremadeProgress();
  return {
    ...progress,
    members: progress.members.map((member) => ({
      ...member,
      level: 20,
      currentXp: 0,
      xpNeedsUpdate: false,
    })),
  };
}

describe("source-backed additional quest batches", () => {
  it.each([
    "step\n.accept 300001 >> Accept Patrol\nstep\n.complete 300001,1\n.complete 300002,1\n>> Kill gnolls and collect their supplies\nstep\n.turnin 300001 >> Turn in Patrol",
    "step\n.accept 300001 >> Accept Patrol\nstep\n.use 12345\n.complete 300001,1 >> Kill the summoned gnoll\nstep\n.turnin 300001 >> Turn in Patrol",
    "step\n.accept 300001 >> Accept Patrol\nstep\n.complete 300001,1 >> Kill gnolls\nstep\n.complete 300001,2 >> Speak to the guard\nstep\n.turnin 300001 >> Turn in Patrol",
  ])("does not classify ambiguous or mixed objectives as a pure shared-kill batch", (body) => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 128)!;
    const guide = parseGuideChapter(body, reference.id, "a".repeat(64), 70205);
    const batches = extractCampaignQuestBatches(
      [{ reference, guide }],
      { ...createCharacterProfile(), classSlug: "warrior" },
      new Set(),
      [],
    );
    expect(batches.find((batch) => batch.questId === 300001)?.objectiveType).toBe("unclassified");
  });
  it("keeps complete kill batches separate from collection farms", () => {
    const batches = fixture().catchUpBatches!;
    expect(batches).toHaveLength(2);
    expect(batches.find((batch) => batch.questId === 300001)?.objectiveType).toBe("shared-kills");
    expect(batches.find((batch) => batch.questId === 300002)?.objectiveType).toBe("collection");
  });
  it("recommends only eligible, fully resolved rewards and does not count combat automatically", () => {
    const plan = fixture();
    const state = party();
    const before = JSON.stringify(state);
    expect(recommendCampaignCatchUp(plan, "redridge-kill-batch", state)).toMatchObject([
      { questId: 300001, xpByPlayer: [2500, 2500, 2500, 2500, 2500] },
    ]);
    expect(JSON.stringify(state)).toBe(before);
    expect(
      recommendCampaignCatchUp({ ...plan, rewardFacts: [] }, "redridge-kill-batch", state),
    ).toEqual([]);
    state.members[4]!.xpNeedsUpdate = true;
    expect(recommendCampaignCatchUp(plan, "redridge-kill-batch", state)).toEqual([]);
  });
  it("inserts chosen batches into the same ordered route and persists progress without granting XP", () => {
    const plan = fixture();
    const state = { ...party(), selectedBatches: { "redridge-kill-batch": ["quest-300001"] } };
    const reloaded = premadeProgressSchema.parse(JSON.parse(JSON.stringify(state)));
    const actions = activeCampaignActions(plan, reloaded);
    expect(actions).toHaveLength(4);
    const chapter = campaignSections(plan, reloaded)[0]!;
    expect(campaignSectionActions(plan, chapter, actions).map((entry) => entry.id)).toEqual(
      actions.map((entry) => entry.id),
    );
    const updated = updateCampaignAction(plan, reloaded, actions[0]!.id, true);
    expect(updated.members[0]!.questStates[300001]).toBe("accepted");
    expect(updated.members[0]!.currentXp).toBe(0);
    expect(updated.campaigns[plan.release]!.selectedActionId).toBe(actions[1]!.id);
    expect(forecastCampaignXp(plan, reloaded)[0]!.members[0]!.referenceQuestXp).toBe(2500);
    expect(recommendCampaignCatchUp(plan, "redridge-kill-batch", reloaded)).toEqual([]);
  });
  it("does not pay already rewarded quests twice and never hides the remaining coverage gap", () => {
    const plan = fixture();
    const state = { ...party(), selectedBatches: { "redridge-kill-batch": ["quest-300001"] } };
    state.members[0]!.questStates[300001] = "rewarded";
    expect(forecastCampaignXp(plan, state)[0]!.members[0]!.referenceQuestXp).toBe(0);
    expect(auditCampaignSections(plan, state)[0]!.status).not.toBe("reference-covered");
  });
  it("requires source-chain hand-ins before recommending a batch", () => {
    const plan = fixture();
    const batches = plan.catchUpBatches!.map((batch) => ({
      ...batch,
      actions: batch.actions.map((action, index) =>
        index === 0 ? { ...action, requiredQuestIds: [300003] } : action,
      ),
    }));
    const state = party();
    expect(
      recommendCampaignCatchUp({ ...plan, catchUpBatches: batches }, "redridge-kill-batch", state),
    ).toEqual([]);
    for (const member of state.members) member.questStates[300003] = "rewarded";
    expect(
      recommendCampaignCatchUp({ ...plan, catchUpBatches: batches }, "redridge-kill-batch", state),
    ).toHaveLength(1);
  });
  it("ignores batches assigned to a different source region", () => {
    const plan = fixture();
    const catchUpBatches = plan.catchUpBatches!.map((batch) => ({ ...batch, sourceIds: [999999] }));
    const state = { ...party(), selectedBatches: { "redridge-kill-batch": ["quest-300001"] } };
    expect(activeCampaignActions({ ...plan, catchUpBatches }, state)).toHaveLength(1);
    expect(
      recommendCampaignCatchUp({ ...plan, catchUpBatches }, "redridge-kill-batch", party()),
    ).toEqual([]);
  });
});
