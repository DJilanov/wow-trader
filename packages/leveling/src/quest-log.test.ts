import { describe, expect, it } from "vitest";
import {
  QUEST_LOG_CAPACITY,
  QuestLogLedger,
  canOccupyQuestLogSlot,
  questLogUsage,
} from "./quest-log.js";
import { emptyPremadeProgress, type PremadeMember, type PremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { campaignActionReasons, type CampaignAction, type CampaignPlan } from "./campaign.js";
import { PREMADE_STOPS, updatePremadeQuestState } from "./premade.js";
import { DUNGEON_QUESTS } from "./dungeon-catalog.js";
import { getDungeonBundle, updateDungeonBundleSlot } from "./dungeon-bundles.js";
import { dungeonBundleKey, dungeonBundleSlotKey } from "./dungeon-bundle-model.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";

function held(count: number): PremadeMember["questStates"] {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      String(300000 + index),
      index % 2 ? "objectives-complete" : "accepted",
    ]),
  );
}
function progress(count: number): PremadeProgress {
  const result = emptyPremadeProgress();
  result.members = result.members.map((member) => ({
    ...member,
    level: 60,
    currentXp: 0,
    xpNeedsUpdate: false,
    questStates: held(count),
  }));
  return result;
}
function action(id: string, changes: CampaignAction["questChanges"] = []): CampaignAction {
  return {
    id,
    legId: "route",
    title: id,
    instructions: [],
    positions: [],
    source: null,
    kind: "quests",
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    questChanges: changes,
  };
}
function pickup(id = 420001): CampaignAction {
  return action("pickup-" + id, [
    { questId: id, title: "Next quest", state: "accepted", objectiveIndex: null },
  ]);
}
function route(actions: readonly CampaignAction[]): CampaignPlan {
  return {
    release: "quest-log-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "route",
        title: "Quest log test",
        kind: "preparation",
        from: 1,
        to: 60,
        stopId: null,
        actionIds: actions.map((entry) => entry.id),
        questIds: [],
        unresolvedQuestIds: [],
      },
    ],
    rewardFacts: [300000, 420001, 420002].map((questId) => ({
      questId,
      fullXp: 0,
      questLevel: 1,
      minimumLevel: 1,
      xpByLevel: [],
      status: "available",
      evidenceKind: "published-forever",
      sourceUrl: "https://example.test/quest",
      capturedAt: "2026-11-01T00:00:00.000Z",
    })),
  };
}
function dungeonEntry(): CampaignAction {
  return { ...action("dungeon-entry"), kind: "checkpoint", targetStopId: "drowned-city" };
}

describe("whole-itinerary quest-log bounds", () => {
  it("continues through later actions even when XP eligibility stops the continuous forecast", () => {
    const take = pickup(),
      plan = route([
        { ...action("early-gate"), kind: "checkpoint", targetLevel: 60 },
        ...Array.from({ length: 41 }, (_, index) => ({
          ...pickup(420001 + index),
          xpOptional: true,
        })),
      ]),
      state = progress(0);
    state.members = state.members.map((member) => ({ ...member, level: 1 }));
    expect(forecastCampaignXp(plan, state)[0]!.members[0]!.blockedAtActionId).toBe("early-gate");
    const review = auditCampaignQuestLog(plan, state);
    expect(review.every((member) => !member.withinCapacity)).toBe(true);
    expect(review[0]).toMatchObject({
      capacity: 40,
      peakUpperBound: 41,
      firstPotentialOverflowActionId: "pickup-420041",
    });
    expect(review[0]!.carriedAtEnd).toContain(`quest:${take.questChanges[0]!.questId}`);
  });

  it("preserves hand-in and pickup order within a single NPC interaction", () => {
    const reward = { ...pickup(300000).questChanges[0]!, state: "rewarded" as const };
    const take = pickup().questChanges[0]!;
    expect(
      auditCampaignQuestLog(route([action("swap", [reward, take])]), progress(40))[0],
    ).toMatchObject({
      initialUsed: 40,
      peakUpperBound: 40,
      withinCapacity: true,
    });
    expect(
      auditCampaignQuestLog(route([action("swap", [take, reward])]), progress(40))[0]!
        .peakUpperBound,
    ).toBe(41);
  });

  it("does not release slots on objective completion", () => {
    const next = pickup();
    const complete = { ...next.questChanges[0]!, state: "objectives-complete" as const };
    const review = auditCampaignQuestLog(
      route([next, action("complete", [complete]), pickup(420002)]),
      progress(39),
    );
    expect(review[0]!.peakUpperBound).toBe(41);
    expect(review[0]!.carriedAtEnd).toHaveLength(41);
  });

  it("checks personal starter owners and party pickups separately", () => {
    const personal = { ...pickup(), leaderOnly: true };
    const review = auditCampaignQuestLog(route([personal, pickup(420002)]), progress(39), {
      personalActionPlayers: { [personal.id]: 4 },
    });
    expect(review.map((member) => member.peakUpperBound)).toEqual([40, 40, 40, 41, 40]);
    expect(() =>
      auditCampaignQuestLog(route([personal]), progress(0), {
        personalActionPlayers: { [personal.id]: 6 },
      }),
    ).toThrow("Invalid personal");
  });

  it("counts a duplicate quest once and excludes already-rewarded history", () => {
    const next = pickup(),
      state = progress(39);
    state.members[0]!.questStates["420001"] = "rewarded";
    const review = auditCampaignQuestLog(route([next, { ...next, id: "repeat" }]), state);
    expect(review.map((member) => member.peakUpperBound)).toEqual([39, 40, 40, 40, 40]);
  });

  it("widens optional duplicate lifetimes instead of assuming a skipped hand-in frees a slot", () => {
    const take = pickup(),
      reward = action("handin", [{ ...take.questChanges[0]!, state: "rewarded" }]);
    const plan = route([
      take,
      reward,
      pickup(420002),
      { ...take, id: "late-pickup" },
      { ...reward, id: "late-handin" },
    ]);
    expect(auditCampaignQuestLog(plan, progress(39))[0]).toMatchObject({
      peakUpperBound: 41,
      firstPotentialOverflowActionId: "pickup-420002",
    });
  });

  it("counts four guaranteed dungeon quests and releases them at their hand-in", () => {
    const plan = route([
      dungeonEntry(),
      { ...action("bundle-reward"), bundleId: "drowned-city" },
      pickup(),
    ]);
    expect(auditCampaignQuestLog(plan, progress(36))[0]).toMatchObject({
      peakUpperBound: 40,
      withinCapacity: true,
    });
    expect(auditCampaignQuestLog(plan, progress(36))[0]!.carriedAtEnd).toHaveLength(37);
    expect(auditCampaignQuestLog(plan, progress(37))[0]!.peakUpperBound).toBe(41);
    const state = progress(37),
      bundle = getDungeonBundle("drowned-city", "alliance")!;
    state.guaranteedBundles[dungeonBundleKey("drowned-city", "alliance")] = updateDungeonBundleSlot(
      bundle,
      1,
      { questId: 300000 },
    );
    expect(auditCampaignQuestLog(plan, state)[0]!.peakUpperBound).toBe(40);
  });

  it("holds unmodeled pickups from the start and keeps unmatched pickups to the end", () => {
    const review = auditCampaignQuestLog(
      route([
        pickup(),
        action("handin-only", [
          { questId: 300500, title: "Carried work", state: "rewarded", objectiveIndex: null },
        ]),
      ]),
      progress(39),
    );
    expect(review[0]).toMatchObject({ peakUpperBound: 41, inferredCarriedQuestIds: [300500] });
    expect(review[0]!.carriedAtEnd).toContain("quest:420001");
  });
});

describe("40-quest per-character capacity", () => {
  it("counts completed but unhanded quests and excludes the rewarded history", () => {
    expect(QUEST_LOG_CAPACITY).toBe(40);
    const states = { ...held(40), "500000": "rewarded", "500001": "not-started" } as const;
    expect(questLogUsage(states)).toEqual({ used: 40, free: 0 });
    expect(canOccupyQuestLogSlot(states, 420001)).toBe(false);
    expect(canOccupyQuestLogSlot(states, 300001)).toBe(true);
  });

  it("admits the fortieth quest, rejects the forty-first, and frees a slot only on hand-in", () => {
    const ledger = new QuestLogLedger(held(39));
    expect(ledger.accept(420001)).toBe(true);
    expect(ledger.accept(420001)).toBe(true);
    expect(ledger.used).toBe(40);
    expect(ledger.accept(420002)).toBe(false);
    ledger.handIn(300001);
    expect(ledger.accept(420002)).toBe(true);
    expect(ledger.used).toBe(40);
    expect(ledger.peak).toBe(40);
  });

  it("reserves unknown dungeon slots atomically and does not double-count a mapped quest", () => {
    const ledger = new QuestLogLedger(held(36));
    expect(ledger.reserve(["bundle:a", "bundle:b", "bundle:c", "quest:420001"])).toBe(true);
    expect(ledger.used).toBe(40);
    expect(ledger.reserve(["bundle:extra", "bundle:a"])).toBe(false);
    expect(ledger.used).toBe(40);
    expect(ledger.accept(420001)).toBe(true);
    expect(ledger.used).toBe(40);
    ledger.handIn(420001);
    ledger.releaseReservation("bundle:a");
    expect(ledger.used).toBe(38);
    expect(ledger.peak).toBe(40);
  });

  it("preserves legacy overfull reports and allows corrections without deleting quests", () => {
    const ledger = new QuestLogLedger(held(41));
    expect(ledger.used).toBe(41);
    expect(ledger.accept(420001)).toBe(false);
    ledger.handIn(300000);
    ledger.handIn(300001);
    expect(ledger.accept(420001)).toBe(true);
    expect(ledger.used).toBe(40);
  });

  it("syncs known quest states without losing reserved slots", () => {
    const ledger = new QuestLogLedger(held(38));
    ledger.reserve(["quest:420001", "bundle:unknown"]);
    ledger.sync({ ...held(38), "420001": "accepted" });
    expect(ledger.used).toBe(40);
    ledger.sync({ ...held(38), "420001": "rewarded" });
    expect(ledger.used).toBe(39);
    expect(ledger.accept(420002)).toBe(true);
    expect(ledger.used).toBe(40);
  });

  it.each([39, 40])("checks actual pickup capacity at %i held quests", (count) => {
    const plan = route([pickup()]);
    const forecast = forecastCampaignXp(plan, progress(count));
    for (const member of forecast[0]!.members) {
      expect(member.questLog.used).toBe(40);
      expect(member.questLog.peak).toBe(40);
      expect(member.steps[0]!.status).toBe(count === 39 ? "projected" : "blocked");
      expect(member.issues.some((issue) => issue.code === "quest-log-full")).toBe(count === 40);
      expect(member.rewards).toEqual([]);
    }
  });

  it("checks every member and uses the same limit for interactive pickup reporting", () => {
    const state = progress(39),
      next = pickup();
    state.members[3] = { ...state.members[3]!, questStates: held(40) };
    expect(campaignActionReasons(next, state, route([next]).rewardFacts)[0]).toContain("Player 4");
    const rows = forecastCampaignXp(route([next]), state)[0]!.members;
    expect(rows[0]!.blockedReason).toBeNull();
    expect(rows[3]!.blockedReason).toContain("quest log is full");
    const questId = PREMADE_STOPS.flatMap((stop) => stop.quests)[0]!.questId;
    expect(() => updatePremadeQuestState(state, 3, questId, "objectives-complete")).toThrow(
      "Player 4's quest log is full",
    );
  });

  it("holds an inconsistent overfull starting report without deleting its saved quest states", () => {
    const state = progress(41),
      frozen = JSON.stringify(state);
    for (const member of forecastCampaignXp(route([pickup()]), state)[0]!.members) {
      expect(member.questLog.used).toBe(41);
      expect(member.blockedReason).toContain("recorded quest log contains 41");
      expect(member.endpoint).toBeNull();
    }
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it("hands in before accepting at the same NPC without temporarily exceeding 40", () => {
    const turnin = {
      questId: 300000,
      title: "Carried quest",
      state: "rewarded" as const,
      objectiveIndex: null,
    };
    const take = pickup().questChanges[0]!;
    const safe = action("swap", [turnin, take]);
    expect(campaignActionReasons(safe, progress(40), route([safe]).rewardFacts)).toEqual([]);
    for (const member of forecastCampaignXp(route([safe]), progress(40))[0]!.members) {
      expect(member.questLog).toEqual({ capacity: 40, used: 40, peak: 40 });
      expect(member.blockedReason).toBeNull();
    }
    const unsafe = action("wrong-order", [take, turnin]);
    expect(campaignActionReasons(unsafe, progress(40), route([unsafe]).rewardFacts)[0]).toContain(
      "quest log is full",
    );
  });

  it.each([36, 37])(
    "reserves all four unidentified dungeon quests with %i carried quests",
    (count) => {
      const entry = dungeonEntry(),
        plan = route([entry]);
      for (const member of forecastCampaignXp(plan, progress(count))[0]!.members) {
        expect(member.questLog.used).toBe(count === 36 ? 40 : 37);
        expect(member.issues.some((issue) => issue.code === "quest-log-full")).toBe(count === 37);
        expect(member.checkpoints[0]!.ready).toBe(count === 36);
      }
    },
  );

  it("does not reserve a mapped bundle quest twice when it is already held", () => {
    const state = progress(37),
      bundle = getDungeonBundle("drowned-city", "alliance")!;
    state.guaranteedBundles[dungeonBundleKey("drowned-city", "alliance")] = updateDungeonBundleSlot(
      bundle,
      1,
      { questId: 300000 },
    );
    for (const member of forecastCampaignXp(route([dungeonEntry()]), state)[0]!.members) {
      expect(member.questLog.used).toBe(40);
      expect(member.blockedReason).toBeNull();
    }
  });

  it("frees reserved bundle slots only at the modeled hand-in", () => {
    const entry = dungeonEntry();
    const rewards = {
      ...action("bundle-handins"),
      kind: "instructions" as const,
      bundleId: "drowned-city" as const,
    };
    const next = pickup();
    const forecast = forecastCampaignXp(route([entry, rewards, next]), progress(36));
    for (const member of forecast[0]!.members) {
      expect(member.questLog.used).toBe(37);
      expect(member.questLog.peak).toBe(40);
      expect(member.blockedReason).toBeNull();
    }
  });

  it("does not bypass dungeon capacity when the forecast starts after its entry step", () => {
    const rewards = { ...action("bundle-reward"), bundleId: "drowned-city" as const };
    const forecast = forecastCampaignXp(route([dungeonEntry(), rewards]), progress(37), {
      fromActionId: rewards.id,
    });
    for (const member of forecast[0]!.members) {
      expect(member.issues.some((issue) => issue.code === "quest-log-full")).toBe(true);
      expect(member.bundleRewards).toEqual([]);
    }
  });

  it("keeps an overfull saved XP correction blocked until its quest states are corrected", () => {
    const next = pickup(),
      plan = route([next]),
      state = progress(0);
    const forecast = forecastCampaignXp(plan, state, {
      anchors: [
        {
          player: 1,
          release: plan.release,
          actionId: next.id,
          level: 60,
          currentXp: 0,
          questStates: held(41),
          confirmations: {},
          bundleSlotStates: {},
        },
      ],
    });
    expect(forecast[0]!.members[0]!.blockedReason).toContain("recorded quest log contains 41");
    expect(forecast[0]!.members[0]!.questLog.used).toBe(41);
    expect(forecast[0]!.members[0]!.endpoint).toBeNull();
    expect(forecast[0]!.members[1]!.blockedReason).toContain("Wait for Player 1");
    expect(forecast[0]!.members[1]!.questLog.used).toBe(0);
    expect(state.members[0]!.questStates).toEqual({});
  });

  it("releases a dungeon reservation explicitly skipped in a saved XP correction", () => {
    const next = pickup(),
      bundle = getDungeonBundle("drowned-city", "alliance")!,
      plan = route([dungeonEntry(), next]),
      state = progress(36);
    const forecast = forecastCampaignXp(plan, state, {
      anchors: [
        {
          player: 1,
          release: plan.release,
          actionId: next.id,
          level: 60,
          currentXp: 0,
          questStates: {},
          confirmations: {},
          bundleSlotStates: { [dungeonBundleSlotKey(bundle, 1)]: "skipped" },
        },
      ],
    });
    expect(forecast[0]!.members[0]!.questLog.used).toBe(40);
    expect(forecast[0]!.members[0]!.blockedReason).toBeNull();
    expect(forecast[0]!.members[1]!.issues.some((issue) => issue.code === "quest-log-full")).toBe(
      true,
    );
  });

  it("guards direct status editing and leaves all existing progress intact on rejection", () => {
    const state = progress(0);
    const ids = [...new Set(DUNGEON_QUESTS.map((quest) => quest.id))].slice(0, 40);
    const next =
      PREMADE_STOPS[0]!.quests.find((quest) => !ids.includes(quest.questId))?.questId ??
      DUNGEON_QUESTS.find((quest) => !ids.includes(quest.id))!.id;
    state.members[0]!.questStates = Object.fromEntries(ids.map((id) => [String(id), "accepted"]));
    const frozen = JSON.stringify(state);
    expect(() => updatePremadeQuestState(state, 0, next, "accepted")).toThrow("quest log is full");
    expect(() => updatePremadeQuestState(state, 0, next, "objectives-complete")).toThrow(
      "quest log is full",
    );
    expect(JSON.stringify(state)).toBe(frozen);
    const freed = updatePremadeQuestState(state, 0, ids[0]!, "rewarded");
    const accepted = updatePremadeQuestState(freed, 0, next, "accepted");
    expect(questLogUsage(accepted.members[0]!.questStates).used).toBe(40);
  });
});
