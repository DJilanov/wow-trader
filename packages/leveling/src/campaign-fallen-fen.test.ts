import { describe, expect, it } from "vitest";
import captured from "./fixtures/fallen-fen-70205-70450.json" with { type: "json" };
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { batchCampaignDungeonFlow } from "./campaign-dungeon-flow.js";
import { attachCampaignLocations } from "./campaign-flow-locations.js";
import { campaignDungeonQuest } from "./campaign-dungeon-reference.js";
import { getPremadeQuest, PREMADE_STOPS, premadeQuestSelected } from "./premade.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { resolveQuestReward, type QuestRewardFact } from "./quest-rewards.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";

function fixture(): CampaignPlan {
  const quests = [95772, 95795];
  const actions = quests.flatMap((questId) =>
    (["accepted", "objectives-complete", "rewarded"] as const).map((state): CampaignAction => ({
      id: `${questId}-${state}`,
      legId: "dungeon-excavation",
      title: `${questId} ${state}`,
      instructions: [],
      questChanges: [
        {
          questId,
          state,
          title: captured.quests.find((q) => q.questId === questId)!.title,
          objectiveIndex: state === "objectives-complete" ? 1 : null,
        },
      ],
      ...(state === "objectives-complete" ? { wholeQuestObjectives: true as const } : {}),
      kind: "quests",
      source: null,
      positions: [],
      leaderOnly: false,
      raidOnly: false,
      targetLevel: null,
      targetStopId: null,
    })),
  );
  const plan: CampaignPlan = {
    release: "fallen-fen-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: captured.targetBuild,
    sourceArchiveSha256: captured.sourceArchiveSha256,
    sharedQuestsOnly: true,
    sharedSourceQuestIds: quests,
    actions,
    legs: [
      {
        id: "dungeon-excavation",
        title: "Excavation",
        kind: "dungeon",
        from: 26,
        to: 29,
        stopId: "excavation",
        actionIds: actions.map((action) => action.id),
        questIds: quests,
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: captured.rewardFacts.map((row): QuestRewardFact => ({
      questId: row.questId,
      fullXp: row.fullXp,
      questLevel: row.questLevel,
      minimumLevel: row.minimumLevel,
      xpByLevel: row.xpByLevel,
      sourceUrl: row.sourceUrl,
      capturedAt: row.capturedAt,
      status: "available",
      evidenceKind: "published-forever",
      rewardBasis: "final-reward",
    })),
  };
  return plan;
}

function party(): PremadeProgress {
  const initial = emptyPremadeProgress();
  const classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return {
    ...initial,
    members: initial.members.map((member, index) => ({
      ...member,
      raceId: "human",
      classSlug: classes[index]!,
      level: 26,
      currentXp: 0,
      xpNeedsUpdate: false,
    })),
  };
}

describe("complete Songblade Search and Fallen in the Fen handoffs", () => {
  it("redirects old generated objective links to the real hand-ins without changing other links", () => {
    const plan = { ...fixture(), bookmarkAliases: { existing: "95772-accepted" } };
    const result = batchCampaignDungeonFlow(attachCampaignLocations(plan, []));
    expect(result.bookmarkAliases).toEqual({
      existing: "95772-accepted",
      "95772-objectives-complete": "95772-rewarded",
      "95795-objectives-complete": "95795-rewarded",
    });
    expect(plan.bookmarkAliases).toEqual({ existing: "95772-accepted" });
  });
  it("retains both matching client identities and the stronger published reward without another coefficient", () => {
    for (const snapshot of captured.clients)
      for (const id of [95772, 95795] as const) {
        const quest = snapshot.quests[id];
        expect(quest.minLevel).toBe(24);
        expect(quest.level).toBe(31);
        expect("objectives" in quest).toBe(false);
        expect(quest.rewards).toMatchObject({ xpDifficulty: 6, xpMultiplier: 1.95 });
      }
    expect(captured.quests.find((q) => q.questId === 95795)!.prerequisites).toEqual({
      allOf: [95772],
      anyOf: [],
    });
    expect(resolveQuestReward(95795, 26, fixture().rewardFacts)).toMatchObject({
      xp: 6150,
      basis: "wowhead-reference",
    });
    expect(resolveQuestReward(95795, 23, fixture().rewardFacts).xp).toBeNull();
  });

  it("includes the return as ordinary core dungeon work and retains its real body prerequisite", () => {
    const stop = PREMADE_STOPS.find((entry) => entry.id === "excavation")!;
    const choice = stop.quests.find((entry) => entry.questId === 95795)!;
    expect(choice.role).toBe("core");
    expect(
      premadeQuestSelected(choice, {
        ...emptyPremadeProgress(),
        selectedExtras: { "95795": false },
      }),
    ).toBe(true);
    expect(getPremadeQuest(95795)?.gate).toEqual({
      kind: "quest",
      questId: 95772,
      state: "rewarded",
    });
    expect(campaignDungeonQuest(95795)?.objectiveStage).toBe("before");
  });

  it("takes the follow-up at the body, then returns to Lakeshire outside the dungeon", () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const result = batchCampaignDungeonFlow(attachCampaignLocations(input, []));
    expect(result.actions.map((action) => action.id)).toEqual([
      "95772-accepted",
      "95772-rewarded",
      "95795-accepted",
      "95795-rewarded",
    ]);
    expect(result.actions.find((action) => action.id === "95795-accepted")?.location).toEqual({
      zone: "1437",
      insideDungeon: "excavation",
    });
    expect(result.actions.find((action) => action.id === "95795-rewarded")?.location).toEqual({
      zone: "1433",
    });
    expect(result.legs[0]!.actionIds).toEqual(result.actions.map((action) => action.id));
    expect(JSON.stringify(input)).toBe(before);
    expect(batchCampaignDungeonFlow(result)).toEqual(result);
  });

  it("pays only the reached hand-in; leaving the return unfinished cannot borrow its XP", () => {
    const plan = batchCampaignDungeonFlow(attachCampaignLocations(fixture(), []));
    const beforeReturn = {
      ...plan,
      actions: plan.actions.filter((action) => action.id !== "95795-rewarded"),
    };
    const partial = forecastCampaignXp(beforeReturn, party());
    const complete = forecastCampaignXp(plan, party());
    for (let index = 0; index < 5; index++) {
      expect(
        partial
          .flatMap((row) => row.members[index]!.rewards)
          .filter((row) => row.xp !== null)
          .map((row) => [row.questId, row.xp]),
      ).toEqual([[95772, 6150]]);
      const rewards = complete
        .flatMap((row) => row.members[index]!.rewards)
        .filter((row) => row.xp !== null);
      expect(rewards.map((row) => [row.questId, row.xp])).toEqual([
        [95772, 6150],
        [95795, 6150],
      ]);
      expect(complete.every((row) => row.members[index]!.combatXp === 0)).toBe(true);
    }
    expect(
      auditCampaignQuestLog(plan, party()).every(
        (row) => row.withinCapacity && row.capacity === 40,
      ),
    ).toBe(true);
  });

  it("does not accept or reward the follow-up before the actual body hand-in", () => {
    const plan = batchCampaignDungeonFlow(attachCampaignLocations(fixture(), []));
    const missing = {
      ...plan,
      actions: plan.actions.filter((action) => action.id !== "95772-rewarded"),
    };
    const forecast = forecastCampaignXp(missing, party());
    for (let index = 0; index < 5; index++) {
      const rows = forecast.map((row) => row.members[index]!);
      expect(rows.find((row) => row.blockedAtActionId)?.blockedAtActionId).toBe("95795-accepted");
      expect(
        rows.flatMap((row) => row.rewards).some((row) => row.questId === 95795 && row.xp !== null),
      ).toBe(false);
    }
  });

  it.each(["warrior", "priest", "mage", "rogue", "warlock"] as const)(
    "exports only the actual accepts and returns for %s",
    (classSlug) => {
      const plan = batchCampaignDungeonFlow(attachCampaignLocations(fixture(), []));
      const result = compileCampaignAddon(plan, plan.actions, {
        version: "0.2.0-fallen-fen-test",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
        includeObservers: false,
        partyStarter: { race: "human", classSlug },
      });
      const text = result.documents
        .filter((document) => document.role === "party")
        .map((document) => document.content)
        .join("\n");
      for (const id of [95772, 95795]) {
        for (const tag of ["accept", "turnin"])
          expect([...text.matchAll(new RegExp(`\\.${tag} ${id}\\b`, "g"))]).toHaveLength(1);
        expect(text).not.toContain(`.complete ${id},`);
      }
    },
  );

  it("does not erase a captured source objective or an explicitly scoped manual phase", () => {
    const input = fixture();
    const objectives = input.actions.filter(
      (action) => action.questChanges[0]!.state === "objectives-complete",
    );
    const actions = objectives.map((action, index) =>
      index === 0
        ? { ...action, source: { chapterId: "captured", version: "review", stepId: "first" } }
        : { ...action, wholeQuestObjectives: undefined },
    );
    const explicit = actions.map((action) => {
      const { wholeQuestObjectives: _wholeQuestObjectives, ...rest } = action;
      return action.source ? { ...rest, wholeQuestObjectives: true as const } : rest;
    });
    const plan = { ...input, actions: explicit };
    const result = batchCampaignDungeonFlow(plan);
    expect(result.actions).toHaveLength(2);
    expect(result.actions.map((action) => action.id).sort()).toEqual(
      objectives.map((action) => action.id).sort(),
    );
  });
});
