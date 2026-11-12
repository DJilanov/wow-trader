import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import {
  assertCampaignRouteLock, campaignActionLockText, campaignRouteLockSchema,
  type CampaignRouteLock, type CampaignRouteLockContext,
} from "./campaign-route-lock.js";
import { prepareCampaignPlan } from "./campaign-preparation.js";

const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
const party: CampaignRouteLock["party"] = [
  { raceId: "human", classSlug: "warrior", role: "tank" },
  { raceId: "human", classSlug: "priest", role: "healer" },
  { raceId: "human", classSlug: "mage", role: "dps" },
  { raceId: "human", classSlug: "rogue", role: "dps" },
  { raceId: "human", classSlug: "warlock", role: "dps" },
];

function fixture(): CampaignPlan {
  const actions = ["first", "handoff", "later"].map((id): CampaignAction => ({
    id, legId: "route", title: id, instructions: [`Complete ${id}`], questChanges: [],
    kind: "instructions", source: null, positions: [], leaderOnly: false, raidOnly: false,
    targetLevel: null, targetStopId: null,
  }));
  return {
    release: "synthetic-lock-unit-test", race: "human", leaderClass: "warrior", targetBuild: 70205,
    sourceArchiveSha256: "a".repeat(64), actions,
    legs: [{ id: "route", title: "Route", kind: "preparation", from: 1, to: 20,
      stopId: null, questIds: [], unresolvedQuestIds: [], actionIds: actions.map((action) => action.id) }],
  };
}

function context(plan: CampaignPlan): CampaignRouteLockContext {
  return {
    hashText: digest, engineSha256: "b".repeat(64), referenceSha256: "c".repeat(64), party,
    lock: campaignRouteLockSchema.parse({
      schema: "campaign-route-lock.v1", blockSize: 10, targetLevel: 10,
      race: plan.race, leaderClass: plan.leaderClass, targetBuild: plan.targetBuild,
      sourceArchiveSha256: plan.sourceArchiveSha256, party,
      boundaryActionId: plan.actions[1]!.id,
      actions: plan.actions.slice(0, 2).map((action) => ({ id: action.id, sha256: digest(campaignActionLockText(action)) })),
      payload: { file: `route-${"d".repeat(64)}.json`, sha256: "d".repeat(64) },
      validation: { file: `validation-${"e".repeat(64)}.json`, sha256: "e".repeat(64),
        engineSha256: "b".repeat(64), referenceSha256: "c".repeat(64),
        forecastCases: 48, nativeCases: 20, questLogCapacity: 40, kind: "projected-reference-xp" },
    }),
  };
}

describe("immutable ten-level route prefixes", () => {
  it("survives JSON round trips and allows later work to change", () => {
    const plan = fixture(), lock = context(plan);
    lock.lock.actions.forEach((row) => expect(row.sha256).toMatch(/^[a-f0-9]{64}$/));
    expect(() => assertCampaignRouteLock(JSON.parse(JSON.stringify(plan)) as CampaignPlan, lock)).not.toThrow();
    expect(() => assertCampaignRouteLock({ ...plan, actions: [
      ...plan.actions.slice(0, 2), { ...plan.actions[2]!, instructions: ["Revised later content"] },
      { ...plan.actions[2]!, id: "new-later-work" },
    ] }, lock)).not.toThrow();
  });

  it.each(["insert", "remove", "reorder", "instruction", "quest", "position", "cash"])(
    "rejects a silent %s change in the approved prefix", (kind) => {
      const plan = fixture(), lock = context(plan), first = plan.actions[0]!;
      let actions = [...plan.actions];
      if (kind === "insert") actions.unshift({ ...first, id: "inserted" });
      if (kind === "remove") actions.shift();
      if (kind === "reorder") actions = [actions[1]!, actions[0]!, actions[2]!];
      if (kind === "instruction") actions[0] = { ...first, instructions: ["Different task"] };
      if (kind === "quest") actions[0] = { ...first, questChanges: [{ questId: 18, state: "accepted", title: "Test", objectiveIndex: null }] };
      if (kind === "position") actions[0] = { ...first, positions: [{ sourceLine: 1, position: { zone: "1429", x: 1, y: 2, floor: null, space: "map-percent" } }] };
      if (kind === "cash") actions[0] = { ...first, minimumMoneyCopper: 3000 };
      expect(() => assertCampaignRouteLock({ ...plan, actions }, lock)).toThrow("changed at");
    },
  );

  it("requires revalidation when the model or referenced facts change without rewriting the payload", () => {
    const plan = fixture(), lock = context(plan), original = structuredClone(lock.lock);
    expect(() => assertCampaignRouteLock(plan, { ...lock, engineSha256: "f".repeat(64) })).toThrow("XP revalidation");
    expect(() => assertCampaignRouteLock(plan, { ...lock, referenceSha256: "f".repeat(64) })).toThrow("XP revalidation");
    expect(lock.lock).toEqual(original);
  });

  it("does not apply a Human five-class lock to another edition or party", () => {
    const plan = fixture(), lock = context(plan);
    expect(() => assertCampaignRouteLock({ ...plan, race: "dwarf" }, lock)).toThrow("different edition");
    expect(() => assertCampaignRouteLock(plan, { ...lock, party: party.map((member, index) => index === 2
      ? { ...member, raceId: "gnome" } : member) })).toThrow("different party");
  });

  it.each(["level", "duplicate", "boundary", "payload", "validation", "roles", "capacity"])(
    "rejects inconsistent lock metadata (%s)", (kind) => {
      const lock = structuredClone(context(fixture()).lock);
      if (kind === "level") lock.targetLevel = 15;
      if (kind === "duplicate") lock.actions[1] = lock.actions[0]!;
      if (kind === "boundary") lock.boundaryActionId = "missing";
      if (kind === "payload") lock.payload.file = `route-${"f".repeat(64)}.json`;
      if (kind === "validation") lock.validation.file = `validation-${"f".repeat(64)}.json`;
      if (kind === "roles") lock.party[0]!.role = "dps";
      if (kind === "capacity") Object.assign(lock.validation, { questLogCapacity: 25 });
      expect(campaignRouteLockSchema.safeParse(lock).success).toBe(false);
    },
  );

  it("rejects a changed approved prefix before later production stages run", () => {
    const evidence = { starters: { entries: [], routes: [] }, rewardFacts: [], rewardRevision: "unit-test",
      rewardBuild: 70205, rewardNotice: null, combat: null };
    const plan = prepareCampaignPlan(fixture(), [], evidence), lock = context(plan);
    expect(() => prepareCampaignPlan(plan, [], evidence, { routeLock: lock })).not.toThrow();
    const changed = { ...plan, actions: plan.actions.map((action, index) => index === 0
      ? { ...action, instructions: ["Unreviewed early change"] } : action) };
    expect(() => prepareCampaignPlan(changed, [], evidence, { routeLock: lock })).toThrow("during ordered pickups");
  });
});
