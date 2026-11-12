import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { activeCampaignActions, type CampaignAction, type CampaignPlan, type CampaignQuestChange } from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { campaignActionLockText, campaignRouteLockSchema, type CampaignRouteLockContext } from "./campaign-route-lock.js";
import { reuseCampaignRoutePrefix, type CampaignRoutePrefix } from "./campaign-route-prefix.js";
import { prepareCampaignPlan, type CampaignPreparationEvidence } from "./campaign-preparation.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";

const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
function change(questId: number, state: CampaignQuestChange["state"]): CampaignQuestChange {
  return { questId, state, title: `Quest ${questId}`, objectiveIndex: state === "objectives-complete" ? 1 : null };
}
function action(id: string, legId: string, changes: readonly CampaignQuestChange[] = []): CampaignAction {
  return { id, legId, kind: changes.length ? "quests" : "instructions", title: id, instructions: [], questChanges: changes,
    source: null, positions: [], leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null };
}
function plan(actions: readonly CampaignAction[]): CampaignPlan {
  return { release: "synthetic-prefix-unit-test", race: "human", leaderClass: "warrior", sharedQuestsOnly: true,
    incidentalKillXpPercent: 10, dungeonCollectionPolicy: "selected-clear", acquisitionXpPolicy: "exclude-unpriced-extra",
    targetBuild: 70205, sourceArchiveSha256: "a".repeat(64), actions,
    legs: [...new Set(actions.map((entry) => entry.legId))].map((id) => ({ id, kind: "preparation", title: id, from: 1, to: 20,
      stopId: null, actionIds: actions.filter((entry) => entry.legId === id).map((entry) => entry.id), questIds: [], unresolvedQuestIds: [] })) };
}
function fixture(): { prefix: CampaignRoutePrefix; context: CampaignRouteLockContext; current: CampaignPlan } {
  const approved = plan([action("approved-quest", "first", [change(18, "accepted"), change(18, "rewarded")]),
    action("carry-quest", "first", [change(19, "accepted")]), action("handoff", "first")]);
  const current = plan([action("different-old-task", "first"), action("handoff", "first"),
    action("repeated-quest", "later", [change(18, "accepted"), change(18, "rewarded")]),
    action("mixed-pickup", "later", [change(19, "accepted"), change(20, "accepted")]),
    action("carried-return", "later", [change(19, "objectives-complete"), change(19, "rewarded")]),
    action("later-return", "later", [change(20, "rewarded")])]);
  const party = ["warrior", "priest", "mage", "rogue", "warlock"].map((classSlug, index) => ({
    raceId: "human", classSlug, role: index === 0 ? "tank" : index === 1 ? "healer" : "dps",
  }));
  const lock = campaignRouteLockSchema.parse({ schema: "campaign-route-lock.v1", blockSize: 10, targetLevel: 10,
    race: approved.race, leaderClass: approved.leaderClass, targetBuild: approved.targetBuild,
    sourceArchiveSha256: approved.sourceArchiveSha256, party, boundaryActionId: "handoff",
    actions: approved.actions.map((entry) => ({ id: entry.id, sha256: digest(campaignActionLockText(entry)) })),
    payload: { file: `route-${"d".repeat(64)}.json`, sha256: "d".repeat(64) },
    validation: { file: `validation-${"e".repeat(64)}.json`, sha256: "e".repeat(64), engineSha256: "b".repeat(64),
      referenceSha256: "c".repeat(64), forecastCases: 48, nativeCases: 20, questLogCapacity: 40, kind: "projected-reference-xp" } });
  return { prefix: { schema: "campaign-route-prefix.v1", plan: approved }, current,
    context: { lock, party: lock.party, hashText: digest, engineSha256: "b".repeat(64), referenceSha256: "c".repeat(64) } };
}

describe("approved prefix reuse", () => {
  it("carries newly admitted earlier prerequisites after the sealed handoff without inventing their completion", () => {
    const f = fixture();
    const first = action("new-first", "first", [change(21, "accepted"), change(21, "rewarded")]);
    const second = { ...action("new-second", "first", [change(22, "accepted"), change(22, "rewarded")]), requiredQuestIds: [21] };
    const child = { ...action("new-child", "later", [change(23, "accepted"), change(23, "rewarded")]), requiredQuestIds: [22] };
    const current = plan([first, second, action("handoff", "first"), child]);
    const before = structuredClone(current);
    const result = reuseCampaignRoutePrefix(current, f.prefix, f.context);
    expect(result.actions.slice(0, 3)).toEqual(f.prefix.plan.actions);
    expect(result.actions.slice(3).map((entry) => entry.id)).toEqual(["new-first", "new-second", "new-child"]);
    expect(result.actions.slice(3).every((entry) => entry.legId === "later")).toBe(true);
    expect(result.actions[4]!.requiredQuestIds).toEqual([21]);
    expect(current).toEqual(before);
  });

  it("restores the actual tasks, retains carried quest work and leaves inputs unchanged", () => {
    const f = fixture(), original = { current: structuredClone(f.current), prefix: structuredClone(f.prefix) };
    const result = reuseCampaignRoutePrefix(f.current, f.prefix, f.context);
    expect(result.actions.slice(0, 3)).toEqual(f.prefix.plan.actions);
    expect(result.actions.map((entry) => entry.id)).toEqual(["approved-quest", "carry-quest", "handoff", "mixed-pickup", "carried-return", "later-return"]);
    expect(result.actions[3]!.questChanges).toEqual([change(20, "accepted")]);
    expect(result.actions[4]!.questChanges).toEqual([change(19, "objectives-complete"), change(19, "rewarded")]);
    expect(result.actions.flatMap((entry) => entry.questChanges).filter((row) => row.questId === 18 && row.state === "rewarded")).toHaveLength(1);
    expect(f.current).toEqual(original.current);
    expect(f.prefix).toEqual(original.prefix);
  });

  it("continues the boundary leg when the block ends at a quest handoff", () => {
    const f = fixture(), extra = action("remaining-in-leg", "first", [change(21, "accepted")]);
    const result = reuseCampaignRoutePrefix({ ...f.current, actions: [...f.current.actions.slice(0, 2), extra, ...f.current.actions.slice(2)] }, f.prefix, f.context);
    expect(result.actions[3]).toEqual(extra);
    expect(result.legs.find((leg) => leg.id === "first")?.actionIds).toEqual(["approved-quest", "carry-quest", "handoff", "remaining-in-leg"]);
  });

  it("does not inject legacy catch-up batches into the approved prefix", () => {
    const f = fixture(), current = { ...f.current, defaultCatchUpBatches: { first: ["old-extra"], later: ["later-extra"] } };
    const result = reuseCampaignRoutePrefix(current, f.prefix, f.context);
    expect(result.defaultCatchUpBatches).toEqual({ later: ["later-extra"] });
    expect(activeCampaignActions(result, emptyPremadeProgress()).slice(0, 3)).toEqual(f.prefix.plan.actions);
  });

  it.each(["missing handoff", "other race", "wrong model", "changed task", "wrong extent", "duplicate identity", "utility collision", "unshared", "changed incidental XP", "changed collections", "changed acquisition"])("rejects %s", (kind) => {
    const f = fixture();
    if (kind === "missing handoff") f.current = { ...f.current, actions: f.current.actions.filter((entry) => entry.id !== "handoff") };
    if (kind === "other race") f.current = { ...f.current, race: "dwarf" };
    if (kind === "wrong model") f.context = { ...f.context, engineSha256: "f".repeat(64) };
    if (kind === "changed task") f.prefix = { ...f.prefix, plan: { ...f.prefix.plan, actions: f.prefix.plan.actions.map((entry, index) => index === 0 ? { ...entry, instructions: ["Changed"] } : entry) } };
    if (kind === "wrong extent") f.prefix = { ...f.prefix, plan: { ...f.prefix.plan, actions: [...f.prefix.plan.actions, action("extra", "first")] } };
    if (kind === "duplicate identity") f.current = { ...f.current, actions: [...f.current.actions, action("approved-quest", "later")] };
    if (kind === "utility collision") f.current = { ...f.current, actions: f.current.actions.map((entry) => entry.id === "repeated-quest" ? { ...entry, nativeUtilityTags: [".fly"] } : entry) };
    if (kind === "unshared") {
      const { sharedQuestsOnly, ...current } = f.current;
      expect(sharedQuestsOnly).toBe(true);
      f.current = current;
    }
    if (kind === "changed incidental XP") f.current = { ...f.current, incidentalKillXpPercent: 0 };
    if (kind === "changed collections") {
      const { dungeonCollectionPolicy, ...current } = f.current;
      expect(dungeonCollectionPolicy).toBe("selected-clear");
      f.current = current;
    }
    if (kind === "changed acquisition") {
      const { acquisitionXpPolicy, ...current } = f.current;
      expect(acquisitionXpPolicy).toBe("exclude-unpriced-extra");
      f.current = current;
    }
    expect(() => reuseCampaignRoutePrefix(f.current, f.prefix, f.context)).toThrow();
  });

  it("requires a validation context before production preparation can reuse a prefix", () => {
    const f = fixture();
    expect(() => prepareCampaignPlan(f.current, [], { starters: { entries: [], routes: [] }, rewardFacts: [], rewardRevision: "test", rewardBuild: 70205, rewardNotice: null, combat: null }, { routePrefix: f.prefix })).toThrow("validation context");
  });

  it("rebuilds the restored tasks' required combat before funding can invent an XP gap", () => {
    const f = fixture(), questId = 300001;
    const approved = plan([action("approved-pickup", "first", [change(questId, "accepted")]),
      action("approved-kills", "first", [change(questId, "objectives-complete")]),
      action("approved-reward", "first", [change(questId, "rewarded")]), action("handoff", "first")]);
    const lock = { ...f.context.lock, actions: approved.actions.map((entry) => ({ id: entry.id, sha256: digest(campaignActionLockText(entry)) })) };
    const provider = { repository: "https://example.test/prefix-regression", revision: "f".repeat(40),
      layer: "forever-static-with-authored" as const, questSha256: "1".repeat(64), npcSha256: "2".repeat(64),
      itemSha256: "3".repeat(64), limitations: ["Synthetic required-combat regression"] };
    const data: CombatDataset = { schema: "forever-combat-reference.v1", targetBuild: 70205, publication: "private-reference",
      authorizationNote: "Synthetic regression", provider,
      quests: [{ questId, creatureIds: [114], itemCreatureIds: [], onlyCreatureObjectives: true,
        objectiveText: ["Kill ten spiders."], killQuotas: [{ objectiveIndex: 1, npcId: 114, kills: 10, source: "Synthetic counter" }] }],
      npcs: [{ id: 114, name: "Test spider", minimumLevel: 2, maximumLevel: 2, rank: 0, zoneIds: [12], xpEligibility: "assumed" }],
      dungeons: [], killXpEvidence: [] };
    const endpoint = { npcId: 234, name: "Test captain", friendlyToAlliance: true, positions: [{ zone: "1429", x: 50, y: 50 }] };
    const catalog: QuestCatalog = { schema: "forever-quest-funding-catalog.v1", targetBuild: 70205,
      publication: "private-reference", authorizationNote: "Synthetic regression", providerRevision: provider.revision,
      questSha256: provider.questSha256, npcSha256: provider.npcSha256, areaMapSha256: "4".repeat(64),
      sourceArchiveSha256: approved.sourceArchiveSha256!, includesAuthoredCorrections: false,
      quests: [{ questId, title: "Patrol", minimumLevel: 1, questLevel: 2, requiredRaces: 0, requiredClasses: 0,
        starts: [endpoint], ends: [endpoint], prerequisites: { allOf: [], anyOf: [] }, exclusiveWith: [],
        category: "shared-kills", unsupportedRequirements: [], objectives: [{ index: 1, npcId: 114, count: 10, positions: endpoint.positions }] }] };
    let reachedFunding = false;
    const stop = new Error("Required combat checked before funding");
    const cold = plan([action("old-unrelated-work", "first"), action("handoff", "first")]);
    const evidence: CampaignPreparationEvidence = {
      starters: { entries: [], routes: [] }, rewardFacts: [], rewardRevision: "synthetic", rewardBuild: 70205,
      rewardNotice: null, combat: { data, revision: "synthetic" }, questCatalog: catalog,
    };
    const options = { routeLock: { ...f.context, lock }, routePrefix: { schema: "campaign-route-prefix.v1" as const, plan: approved } };
    expect(() => prepareCampaignPlan(cold, [], { ...evidence, combat: null }, options)).toThrow("requires matching combat references");
    expect(() => prepareCampaignPlan(cold, [], evidence, { ...options,
      fundingExecutor: (candidate): never => {
        reachedFunding = true;
        expect(candidate.combat?.activities.find((activity) => activity.actionId === "approved-kills")?.objectives)
          .toEqual([expect.objectContaining({ questId, npcIds: [114], requiredKills: 10, credit: "shared-kills" })]);
        expect(candidate.combat?.activities.some((activity) => activity.actionId === "old-unrelated-work")).toBe(false);
        throw stop;
      },
    })).toThrow(stop);
    expect(reachedFunding).toBe(true);
  });
});
