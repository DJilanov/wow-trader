import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { buildCampaignPlan, activeCampaignActions, type CampaignSource } from "./campaign.js";
import { prepareCampaignPlan } from "./campaign-preparation.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import type { QuestRewardFact } from "./quest-rewards.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { FINISH_PROVIDER_REVISION } from "./campaign-finish-route.js";

function thandolFacts(): readonly QuestRewardFact[] {
  return [472, 631, 632].map((questId): QuestRewardFact => ({
    questId,
    fullXp: questId === 472 ? 1000 : 2500,
    minimumLevel: questId === 472 ? 25 : 26,
    questLevel: 31,
    xpByLevel: [],
    status: "available",
    evidenceKind: "published-forever",
    sourceUrl: "https://example.test/synthetic-reward",
    capturedAt: "2026-11-03T00:00:00Z",
  }));
}

function fixture(
  sharedQuestsOnly = false,
  incidentalKillXpPercent?: number,
): {
  plan: ReturnType<typeof buildCampaignPlan>;
  sources: CampaignSource[];
} {
  const sources = [115, 116, 117, 11].map((sourceId): CampaignSource => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === sourceId)!;
    const body =
      sourceId === 11
        ? "step\n.goto Wetlands,11,56\n.accept 472\nstep\n.goto Wetlands,50,18\n.turnin 472\n.accept 631\nstep\n.goto Wetlands,51,8\n.turnin 631\n.accept 632\nstep\n.goto Wetlands,50,18\n.turnin 632"
        : "step\n>>Travel together";
    return { reference, guide: parseGuideChapter(body, reference.id, "a".repeat(64), 70205) };
  });
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic Thandol fixture",
    providerRevision: FINISH_PROVIDER_REVISION,
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    areaMapSha256: "d".repeat(64),
    sourceArchiveSha256: "a".repeat(64),
    includesAuthoredCorrections: true,
    quests: thandolFacts().map((fact) => ({
      questId: fact.questId,
      title: "Thandol handoff",
      minimumLevel: fact.minimumLevel,
      questLevel: fact.questLevel,
      requiredRaces: 4294967373,
      requiredClasses: 0,
      starts: [],
      ends: [],
      prerequisites: { allOf: [], anyOf: fact.questId === 632 ? [631] : [] },
      exclusiveWith: [],
      category: "delivery",
      objectives: [],
      unsupportedRequirements: [],
    })),
  };
  const plan = prepareCampaignPlan(
    {
      ...buildCampaignPlan(
        "human",
        "a".repeat(64),
        sources,
        "warrior",
        sharedQuestsOnly ? { sharedQuestsOnly: true } : {},
      ),
      ...(incidentalKillXpPercent === undefined ? {} : { incidentalKillXpPercent }),
    },
    sources,
    {
      starters: { entries: [], routes: [] },
      rewardFacts: sharedQuestsOnly ? thandolFacts() : [],
      rewardRevision: "synthetic-route-structure",
      rewardBuild: null,
      rewardNotice: null,
      combat: null,
      ...(sharedQuestsOnly ? { questCatalog: catalog } : {}),
    },
  );
  return { plan, sources };
}

describe("Dun Modr and Thandol before Excavation", () => {
  it("keeps the complete shared Thandol return at level 26 instead of dropping its 5,000 XP", () => {
    const { plan } = fixture(true);
    expect(plan.incidentalKillXpPercent).toBe(10);
    expect(fixture(true, 0).plan.incidentalKillXpPercent).toBe(0);
    expect(fixture().plan.incidentalKillXpPercent).toBeUndefined();
    const actions = plan.actions.filter((action) =>
      action.questChanges.some((change) => [631, 632].includes(change.questId)),
    );
    const selected = {
      ...plan,
      actions,
      legs: plan.legs
        .filter((leg) => leg.id === "excavation-approach")
        .map((leg) => ({
          ...leg,
          actionIds: actions.map((action) => action.id),
          questIds: [631, 632],
        })),
    };
    const initial = emptyPremadeProgress();
    const progress = {
      ...initial,
      members: initial.members.map((member) => ({
        ...member,
        level: 26,
        currentXp: 0,
        xpNeedsUpdate: false,
      })),
    };
    for (const member of forecastCampaignXp(selected, progress)[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.rewards.map((reward) => [reward.questId, reward.xp])).toEqual([
        [631, 2500],
        [632, 2500],
      ]);
      expect(member.knownEndpoint).toEqual({ level: 26, currentXp: 5000 });
    }
    expect(actions.every((action) => action.libraryRequired === true)).toBe(true);
    const underlevel = {
      ...progress,
      members: progress.members.map((member) => ({ ...member, level: 25 })),
    };
    for (const member of forecastCampaignXp(selected, underlevel)[0]!.members) {
      expect(member.blockedAtActionId).not.toBeNull();
      expect(member.rewards).toEqual([]);
      expect(member.knownEndpoint).toEqual({ level: 25, currentXp: 0 });
    }
    const courier = plan.actions.filter((action) =>
      action.questChanges.some((change) => change.questId === 472),
    );
    expect(courier.every((action) => action.libraryRequired === true)).toBe(true);
    const courierPlan = {
      ...selected,
      actions: courier,
      legs: selected.legs.map((leg) => ({
        ...leg, actionIds: courier.map((action) => action.id), questIds: [472],
      })),
    };
    for (const member of forecastCampaignXp(courierPlan, progress)[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.rewards.map((reward) => [reward.questId, reward.xp])).toEqual([[472, 1000]]);
      expect(member.knownEndpoint).toEqual({ level: 26, currentXp: 1000 });
    }
    expect(
      fixture()
        .plan.actions.filter((action) =>
          action.questChanges.some((change) => [631, 632].includes(change.questId)),
        )
        .every((action) => !action.libraryRequired),
    ).toBe(true);
  });

  it.each(["warrior", "priest", "mage", "rogue", "warlock"] as const)(
    "exports the required shared Thandol phases once for %s",
    (leaderClass) => {
      const { plan, sources } = fixture(true);
      const configured = { ...plan, leaderClass };
      const compiled = compileCampaignAddon(
        configured,
        activeCampaignActions(configured, emptyPremadeProgress()),
        {
          version: "0.1.0-test",
          runtimeBuild: 70450,
          interfaceVersion: 16001,
          restedXpVersion: "v4.11.27",
          nativeSources: sources,
          includeObservers: false,
          partyStarter: { race: "human", classSlug: leaderClass },
        },
      );
      const text = compiled.documents
        .filter((document) => document.role === "party")
        .map((document) => document.content)
        .join("\n");
      for (const questId of [631, 632])
        for (const tag of ["accept", "turnin"])
          expect([...text.matchAll(new RegExp(`\\.${tag} ${questId}\\b`, "g"))]).toHaveLength(1);
      expect(text).toContain(".goto Wetlands,51,8");
      expect(text).toContain(".goto Wetlands,50,18");
    },
  );

  it("takes the courier in Menethil and returns it before the Thandol pickup and Excavation", () => {
    const { plan } = fixture();
    const actions = activeCampaignActions(plan, emptyPremadeProgress());
    const pickup = actions.findIndex((action) =>
      action.questChanges.some((change) => change.questId === 472 && change.state === "accepted"),
    );
    const reward = actions.findIndex((action) =>
      action.questChanges.some((change) => change.questId === 472 && change.state === "rewarded"),
    );
    const excavation = actions.findIndex((action) => action.id === "dungeon-excavation-entry");
    expect(pickup).toBeGreaterThanOrEqual(0);
    expect(pickup).toBeLessThan(excavation);
    expect(actions[pickup]!.legId).toBe("excavation-approach");
    expect(reward).toBeGreaterThan(pickup);
    expect(reward).toBeLessThan(excavation);
    expect(actions[reward]!.legId).toBe("excavation-approach");
  });

  it("retains every source phase and legacy link, before Excavation", () => {
    const { plan } = fixture();
    const actions = activeCampaignActions(plan, emptyPremadeProgress());
    const excavation = actions.findIndex((action) => action.id === "dungeon-excavation-entry");
    for (const questId of [631, 632]) {
      const phases = actions.flatMap((action, index) =>
        action.questChanges
          .filter((change) => change.questId === questId)
          .map((change) => ({ action, index, change })),
      );
      expect(phases.map((phase) => phase.change.state)).toEqual(["accepted", "rewarded"]);
      for (const phase of phases) {
        expect(phase.index).toBeLessThan(excavation);
        expect(phase.action.legId).toBe("excavation-approach");
        expect(phase.action.source?.chapterId).toBe("chapter-11-27-29-wetlands-hillsbrad");
        expect(phase.action.positions.length).toBeGreaterThan(0);
        const oldId = `library-quest-${questId}-${phase.change.state}-0`;
        expect(plan.bookmarkAliases?.[oldId]).toBe(phase.action.id);
        const legacyId = `dalaran-approach-11-${phase.action.source!.stepId}`;
        expect(plan.bookmarkAliases?.[legacyId]).toBe(phase.action.id);
      }
    }
  });

  it("credits the actual courier hand-in before testing the next pickup's level", () => {
    const { plan } = fixture();
    const actions = plan.actions.filter((action) =>
      action.questChanges.some((change) => [472, 631, 632].includes(change.questId)),
    );
    const selected = {
      ...plan,
      actions,
      legs: plan.legs
        .filter((leg) => leg.id === "excavation-approach")
        .map((leg) => ({
          ...leg,
          actionIds: actions.map((action) => action.id),
          questIds: [472, 631, 632],
        })),
      rewardFacts: thandolFacts(),
    };
    const initial = emptyPremadeProgress();
    for (const member of forecastCampaignXp(selected, {
      ...initial,
      members: initial.members.map((member) => ({
        ...member,
        level: 25,
        currentXp: FOREVER_XP_CURVE[25]! - 196,
        xpNeedsUpdate: false,
      })),
    })[0]!.members) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.rewards.map((reward) => reward.questId)).toEqual([472, 631, 632]);
      expect(member.knownEndpoint).toEqual({ level: 26, currentXp: 5804 });
    }
    for (const member of forecastCampaignXp(selected, {
      ...initial,
      members: initial.members.map((member) => ({
        ...member,
        level: 25,
        currentXp: FOREVER_XP_CURVE[25]! - 1200,
        xpNeedsUpdate: false,
      })),
    })[0]!.members) {
      expect(member.blockedAtActionId).not.toBeNull();
      expect(member.rewards.map((reward) => reward.questId)).toEqual([472]);
    }
  });

  it("exports both common handoffs once with their original physical visits", () => {
    const { plan, sources } = fixture();
    const compiled = compileCampaignAddon(
      plan,
      activeCampaignActions(plan, emptyPremadeProgress()),
      {
        version: "0.1.0-test",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
        nativeSources: sources,
        includeObservers: false,
        partyStarter: { race: "human", classSlug: "warrior" },
      },
    );
    const text = compiled.documents
      .filter((document) => document.role === "party")
      .map((document) => document.content)
      .join("\n");
    for (const questId of [472, 631, 632])
      for (const tag of ["accept", "turnin"])
        expect([...text.matchAll(new RegExp(`\\.${tag} ${questId}\\b`, "g"))]).toHaveLength(1);
    expect(text).toContain(".goto Wetlands,51,8");
    expect(text).toContain(".goto Wetlands,50,18");
  });
});
