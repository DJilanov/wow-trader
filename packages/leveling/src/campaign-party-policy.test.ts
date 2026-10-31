import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { buildCampaignQuestLibrary } from "./campaign-library.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { applyCampaignPartyQuestPolicy } from "./campaign-party-policy.js";
import {
  combatDatasetSchema,
  type CombatDataset,
  type CombatQuestReference,
} from "./combat-model.js";
import type { CampaignPlan, CampaignSource } from "./campaign.js";

const body =
  "step\n.accept 102 >> Accept Patrolling Westfall\n.accept 12 >> Accept The People's Militia\nstep\n.complete 102,1 >> Gnoll Paw (8)\n.mob Riverpaw Gnoll\n>>Kill gnolls and loot their paws\nstep\n.complete 12,1 >> Defias Trapper slain (15)\n.mob Defias Trapper\nstep\n.turnin 102 >> Turn in Patrolling Westfall\n.accept 13 >> Accept The People's Militia\nstep\n.complete 13,1 >> Defias Looter slain (15)\n.mob Defias Looter\nstep\n.turnin 12 >> Turn in The People's Militia\nstep\n.turnin 13 >> Turn in The People's Militia";

function reference(questId: number, collection = false): CombatQuestReference {
  return {
    questId,
    creatureIds: collection ? [] : [504],
    itemCreatureIds: collection ? [117] : [],
    objectiveText: [],
    onlyCreatureObjectives: !collection,
    requiredClasses: 0,
    prerequisites: { allOf: [], anyOf: [] },
    itemObjectives: collection
      ? [{ itemId: 725, objectiveIndex: 1, quantity: 8, npcIds: [117], sharing: "unknown" }]
      : [],
  };
}

function fixture(): {
  plan: CampaignPlan;
  sources: readonly CampaignSource[];
  data: CombatDataset;
} {
  const chapter = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 125)!;
  const sources = [
    { reference: chapter, guide: parseGuideChapter(body, chapter.id, "a".repeat(64), 70205) },
  ];
  const library = buildCampaignQuestLibrary(
    sources,
    createCampaignSourceProfile("human", "warrior"),
    [],
  );
  const actions = library.flatMap((quest) =>
    quest.actions.map((action) => ({ ...action, legId: "route" })),
  );
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
      limitations: ["Reference fixture"],
    },
    npcs: [],
    quests: [reference(102, true), reference(12), reference(13)],
    dungeons: [],
  });
  return {
    plan: {
      release: "fixture",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions,
      legs: [
        {
          id: "route",
          title: "Westfall",
          from: 10,
          to: 15,
          kind: "xp-bridge",
          stopId: null,
          actionIds: actions.map((action) => action.id),
          questIds: [102, 12, 13],
          unresolvedQuestIds: [],
        },
      ],
    },
    sources,
    data,
  };
}

describe("global five-player route policy", () => {
  it("keeps per-step prerequisites when a reference dataset is unavailable", () => {
    const { plan, sources } = fixture();
    const selected = applyCampaignPartyQuestPolicy(
      {
        ...plan,
        legs: plan.legs.map((leg) => ({ ...leg, kind: "starter", from: 1, to: 6 })),
        actions: plan.actions.map((action) => ({
          ...action,
          leaderOnly: true,
          requiredQuestIds: [],
        })),
      },
      sources.map((source) => ({
        ...source,
        reference: { ...source.reference, title: "1-6 Northshire" },
      })),
    );
    const pickup = selected.actions.find((action) =>
      action.questChanges.some((change) => change.questId === 13 && change.state === "accepted"),
    );
    expect(pickup).toBeDefined();
    expect(pickup?.requiredQuestIds).toEqual([]);
  });

  it("holds a known repeat-visit dungeon chain even without an applicable archived lifecycle", () => {
    const { plan, sources } = fixture();
    const manual = {
      ...plan,
      actions: plan.actions.map((action) => ({
        ...action,
        questChanges: action.questChanges.map((change) =>
          change.questId === 13 ? { ...change, questId: 1139 } : change,
        ),
      })),
    };
    const selected = applyCampaignPartyQuestPolicy(manual, sources);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 1139)?.included,
    ).toBe(false);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 1139)?.reason,
    ).toContain("earlier Uldaman visit");
  });
  it("removes every phase of the paw farm and keeps true kill quests", () => {
    const { plan, sources, data } = fixture();
    const before = structuredClone(plan);
    const selected = applyCampaignPartyQuestPolicy(plan, sources, data);
    expect(
      selected.actions
        .flatMap((action) => action.questChanges)
        .some((change) => change.questId === 102),
    ).toBe(false);
    expect(selected.legs[0]!.questIds).toEqual([12, 13]);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 102)?.included,
    ).toBe(false);
    expect(plan).toEqual(before);
    expect(applyCampaignPartyQuestPolicy(selected, sources, data)).toEqual(selected);
  });
  it("uses factual prerequisites instead of treating an adjacent unrelated hand-in as an unlock", () => {
    const { plan, sources, data } = fixture();
    const selected = applyCampaignPartyQuestPolicy(plan, sources, data);
    expect(
      selected.actions.find((action) =>
        action.questChanges.some((change) => change.questId === 13 && change.state === "accepted"),
      )?.requiredQuestIds,
    ).toEqual([]);
  });
  it("holds an optional chain whose real prerequisite is an expensive collection", () => {
    const { plan, sources, data } = fixture();
    const linked = {
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === 13 ? { ...quest, prerequisites: { allOf: [102], anyOf: [] } } : quest,
      ),
    };
    const selected = applyCampaignPartyQuestPolicy(plan, sources, linked);
    expect(
      selected.actions.flatMap((action) => action.questChanges).map((change) => change.questId),
    ).not.toContain(13);
  });
  it("retains a required dungeon unlock's complete prerequisite chain", () => {
    const { plan, sources, data } = fixture();
    const linked = {
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === 13 ? { ...quest, prerequisites: { allOf: [102], anyOf: [] } } : quest,
      ),
    };
    const required = {
      ...plan,
      actions: [
        ...plan.actions,
        {
          ...plan.actions[0]!,
          id: "dungeon-entry",
          kind: "checkpoint" as const,
          questChanges: [],
          requiredQuestIds: [13],
        },
      ],
    };
    const selected = applyCampaignPartyQuestPolicy(required, sources, linked);
    expect(
      selected.actions.flatMap((action) => action.questChanges).map((change) => change.questId),
    ).toContain(102);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 102)?.requiredFor,
    ).toContain(13);
  });
  it("orders a newly verified prerequisite hand-in before its follow-up pickup in the same leg", () => {
    const { plan, sources, data } = fixture();
    const selected = applyCampaignPartyQuestPolicy(plan, sources, {
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === 13 ? { ...quest, prerequisites: { allOf: [12], anyOf: [] } } : quest,
      ),
    });
    const phase = (id: number, state: "accepted" | "rewarded"): number =>
      selected.actions.findIndex((action) =>
        action.questChanges.some((change) => change.questId === id && change.state === state),
      );
    expect(phase(12, "rewarded")).toBeLessThan(phase(13, "accepted"));
  });
  it("brings an archived outdoor prerequisite onto its earlier selected visit instead of blocking the route", () => {
    const { plan, sources, data } = fixture();
    const route = {
      ...plan,
      legs: [...plan.legs, { ...plan.legs[0]!, id: "later-visit" }],
      actions: plan.actions.map((action) =>
        action.questChanges.some((change) => change.questId === 12)
          ? { ...action, legId: "later-visit" }
          : action,
      ),
    };
    const selected = applyCampaignPartyQuestPolicy(route, sources, {
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === 13 ? { ...quest, prerequisites: { allOf: [12], anyOf: [] } } : quest,
      ),
    });
    expect(
      selected.actions
        .filter((action) => action.questChanges.some((change) => change.questId === 12))
        .every((action) => action.legId === "route"),
    ).toBe(true);
    expect(selected.legs.find((leg) => leg.id === "later-visit")?.questIds).not.toContain(12);
  });
  it("keeps class unlocks and rejects a foreign-build reference", () => {
    const { plan, sources, data } = fixture();
    const classData = {
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === 102 ? { ...quest, requiredClasses: 1 } : quest,
      ),
    };
    expect(
      applyCampaignPartyQuestPolicy(plan, sources, classData).partyPolicy?.decisions.find(
        (decision) => decision.questId === 102,
      )?.included,
    ).toBe(true);
    expect(() =>
      applyCampaignPartyQuestPolicy(plan, sources, { ...data, targetBuild: 99999 }),
    ).toThrow(/different build/);
  });
  it("does not protect an ordinary farm because a solo source uses class conditions or a preparation container", () => {
    const { plan, sources, data } = fixture();
    const selected = applyCampaignPartyQuestPolicy(
      {
        ...plan,
        legs: plan.legs.map((leg) => ({ ...leg, kind: "preparation" as const })),
        actions: plan.actions.map((action) => ({ ...action, libraryRequired: true })),
      },
      sources.map((source) => ({
        ...source,
        reference: { ...source.reference, condition: "Alliance Warrior" },
      })),
      data,
    );
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 102)?.included,
    ).toBe(false);
  });
  it("applies the same rule to manual quest actions absent from the archive library", () => {
    const { plan, sources, data } = fixture();
    const unrelated = sources.map((source) => ({
      ...source,
      guide: parseGuideChapter(
        body.replaceAll("102", "900001"),
        source.guide.chapterId,
        "a".repeat(64),
        70205,
      ),
    }));
    const selected = applyCampaignPartyQuestPolicy(plan, unrelated, data);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 102)?.included,
    ).toBe(false);
    expect(
      selected.actions.some((action) =>
        action.questChanges.some((change) => change.questId === 102),
      ),
    ).toBe(false);
  });
  it("holds an optional kill quest when its factual prerequisite has no route actions", () => {
    const { plan, sources, data } = fixture();
    const selected = applyCampaignPartyQuestPolicy(plan, sources, {
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === 13 ? { ...quest, prerequisites: { allOf: [99999], anyOf: [] } } : quest,
      ),
    });
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 13)?.included,
    ).toBe(false);
  });
  it("reports a missing required prerequisite instead of inventing a completed chain", () => {
    const { plan, sources, data } = fixture();
    const selected = applyCampaignPartyQuestPolicy(
      {
        ...plan,
        actions: [
          ...plan.actions,
          {
            ...plan.actions[0]!,
            id: "required-entry",
            kind: "checkpoint",
            questChanges: [],
            requiredQuestIds: [13],
          },
        ],
      },
      sources,
      {
        ...data,
        quests: data.quests.map((quest) =>
          quest.questId === 13 ? { ...quest, prerequisites: { allOf: [99999], anyOf: [] } } : quest,
        ),
      },
    );
    expect(selected.partyPolicy?.unresolvedPrerequisiteIds).toEqual([99999]);
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 13)?.included,
    ).toBe(true);
  });
  it("allows a prerequisite hand-in before a follow-up pickup in the same source step", () => {
    const { plan, sources, data } = fixture();
    const turnin = plan.actions.find((action) =>
      action.questChanges.some((change) => change.questId === 102 && change.state === "rewarded"),
    )!;
    const pickup = plan.actions.find((action) =>
      action.questChanges.some((change) => change.questId === 13 && change.state === "accepted"),
    )!;
    const combined = {
      ...turnin,
      id: "handin-and-accept",
      questChanges: [...turnin.questChanges, ...pickup.questChanges],
    };
    const selected = applyCampaignPartyQuestPolicy(
      {
        ...plan,
        actions: [
          ...plan.actions.filter((action) => action !== turnin && action !== pickup),
          combined,
        ],
      },
      sources,
      {
        ...data,
        quests: data.quests.map((quest) =>
          quest.questId === 102
            ? { ...quest, requiredClasses: 1 }
            : quest.questId === 13
              ? { ...quest, prerequisites: { allOf: [102], anyOf: [] } }
              : quest,
        ),
      },
    );
    expect(selected.actions.find((action) => action.id === combined.id)?.requiredQuestIds).toEqual(
      [],
    );
  });
  it("retains the personal first-zone flow before applying the shared-party policy", () => {
    const { plan, sources, data } = fixture();
    const selected = applyCampaignPartyQuestPolicy(
      {
        ...plan,
        legs: plan.legs.map((leg) => ({ ...leg, kind: "starter" as const, from: 1, to: 6 })),
        actions: plan.actions.map((action) => ({ ...action, leaderOnly: true })),
      },
      sources.map((source) => ({
        ...source,
        reference: { ...source.reference, title: "1-6 Northshire" },
      })),
      data,
    );
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 102)?.reason,
    ).toContain("Personal starter");
  });
});
