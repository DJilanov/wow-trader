import { describe, expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { activeCampaignActions, campaignActionAlias } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { attachWailingCavernsAlternative } from "./campaign-wailing-caverns-alternative.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { campaignSections } from "./campaign-sections.js";

function fixture(): { plan: CampaignPlan; catalog: QuestCatalog; coastIds: readonly string[] } {
  const step: CampaignAction = {
    id: "after-coast",
    legId: "westfall",
    title: "Next task",
    instructions: [],
    questChanges: [],
    source: null,
    positions: [],
    kind: "xp-check",
    leaderOnly: false,
    targetLevel: 18,
    targetStopId: "lordaeron",
    raidOnly: false,
  };
  const stages = ["accepted", "objectives-complete", "rewarded"] as const;
  const trip = [959, 1487, 6981].flatMap((questId) =>
    stages.map((state): CampaignAction => ({
      ...step,
      id: `trip-${questId}-${state}`,
      legId: "wc",
      title: "Synthetic WC task",
      kind: "quests",
      targetLevel: null,
      targetStopId: null,
      questChanges: [
        {
          questId,
          state,
          title: "Synthetic WC quest",
          objectiveIndex: state === "objectives-complete" ? 1 : null,
        },
      ],
    })),
  );
  const changes: CampaignAction["questChanges"] = [
    { questId: 152, state: "accepted", title: "The Coast Isn't Clear", objectiveIndex: null },
    ...[1, 2, 3, 4].map((objectiveIndex) => ({
      questId: 152,
      state: "objectives-complete" as const,
      title: "The Coast Isn't Clear",
      objectiveIndex,
    })),
    { questId: 152, state: "rewarded", title: "The Coast Isn't Clear", objectiveIndex: null },
  ];
  const coast = changes.map((change, index): CampaignAction => ({
    ...step,
    id: `coast-${index}`,
    kind: "quests",
    questChanges: [change],
    fundingCheckpointId: step.id,
    location: { zone: "1436" },
    targetLevel: null,
    targetStopId: null,
  }));
  const plan: CampaignPlan = {
    release: "synthetic-trip-alternative",
    race: "human",
    leaderClass: "warrior",
    sharedQuestsOnly: true,
    targetBuild: 70205,
    sourceArchiveSha256: "a".repeat(64),
    actions: [...trip, ...coast, step],
    legs: [
      {
        id: "wc",
        title: "Optional WC",
        kind: "xp-bridge",
        from: 16,
        to: 18,
        stopId: null,
        dungeonVisitId: "wailing-caverns",
        optionalQuestId: 959,
        questIds: [959, 1487, 6981],
        actionIds: trip.map((a) => a.id),
        unresolvedQuestIds: [],
      },
      {
        id: "westfall",
        title: "Westfall",
        kind: "preparation",
        from: 17,
        to: 18,
        stopId: null,
        questIds: [152],
        actionIds: [...coast.map((a) => a.id), step.id],
        unresolvedQuestIds: [],
      },
    ],
    partyPolicy: {
      revision: "five-player-kill-first-20261102-v9",
      partySize: 5,
      unresolvedPrerequisiteIds: [],
      decisions: [
        {
          questId: 152,
          objective: "shared-kills",
          included: true,
          requiredFor: [],
          lootCost: null,
          reason: "Synthetic funded decision",
        },
      ],
    },
    combat: {
      revision: "test",
      sourceRevision: "test",
      targetBuild: 70205,
      notice: null,
      activities: [],
      npcs: [
        {
          id: 126,
          name: "Murloc Coastrunner",
          minimumLevel: 12,
          maximumLevel: 13,
          rank: 0,
          zoneIds: [40],
          xpEligibility: "assumed",
        },
      ],
    },
  };
  const position = { zone: "1436", x: 30, y: 86 };
  const giver = {
    npcId: 392,
    name: "Captain Grayson",
    friendlyToAlliance: true,
    positions: [position],
  };
  const catalog: QuestCatalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic route selection fixture",
    sourceArchiveSha256: "a".repeat(64),
    providerRevision: "b".repeat(40),
    questSha256: "c".repeat(64),
    npcSha256: "d".repeat(64),
    areaMapSha256: "e".repeat(64),
    includesAuthoredCorrections: false,
    quests: [
      {
        questId: 152,
        title: "The Coast Isn't Clear",
        minimumLevel: 10,
        questLevel: 19,
        requiredClasses: 0,
        requiredRaces: 0,
        starts: [giver],
        ends: [giver],
        exclusiveWith: [],
        prerequisites: { allOf: [], anyOf: [] },
        category: "shared-kills",
        unsupportedRequirements: [],
        objectives: [126, 171, 127, 517].map((npcId, index) => ({
          index: index + 1,
          npcId,
          count: 7,
          positions: [position],
        })),
      },
    ],
  };
  return { plan, catalog, coastIds: coast.map((a) => a.id) };
}

describe("WC and late coastal quest alternatives", () => {
  it("recognizes generated quest coordinates before location projection", () => {
    const input = fixture();
    const plan = {
      ...input.plan,
      actions: input.plan.actions.map((action): CampaignAction => {
        if (!input.coastIds.includes(action.id)) return action;
        const { location: _location, ...unlocated } = action;
        return {
          ...unlocated,
          positions: [
            {
              sourceLine: 0,
              position: { zone: "1436", x: 30, y: 86, floor: null, space: "map-percent" },
            },
          ],
        };
      }),
    };
    const saved = structuredClone(plan);
    const selected = attachWailingCavernsAlternative(plan, input.catalog);
    const coast = selected.actions.filter((action) => input.coastIds.includes(action.id));
    expect(coast).toHaveLength(6);
    expect(coast.every((action) => action.location === undefined)).toBe(true);
    expect(coast.every((action) => action.excludedByOptionalQuestId === 959)).toBe(true);
    expect(plan).toEqual(saved);
  });

  it("keeps displayed quest counts consistent while preserving unresolved catalog placeholders", () => {
    const input = fixture();
    const plan = attachWailingCavernsAlternative(
      {
        ...input.plan,
        legs: input.plan.legs.map((leg) =>
          leg.id === "westfall"
            ? { ...leg, questIds: [...leg.questIds, 999], unresolvedQuestIds: [999] }
            : leg,
        ),
      },
      input.catalog,
    );
    const progress = emptyPremadeProgress();
    const current = campaignSections(plan, progress);
    expect(current.flatMap((section) => section.questIds)).not.toContain(152);
    expect(current.flatMap((section) => section.questIds)).toContain(999);
    expect(current.flatMap((section) => section.unresolvedQuestIds)).toContain(999);
    expect(
      campaignSections(plan, { ...progress, selectedExtras: { "959": false } }).flatMap(
        (section) => section.questIds,
      ),
    ).toContain(152);
    expect(campaignSections(plan).flatMap((section) => section.questIds)).toContain(152);
  });

  it("switches the entire outdoor lifecycle with the optional trip without changing its counters", () => {
    const { plan, catalog, coastIds } = fixture(),
      saved = structuredClone(plan);
    const selected = attachWailingCavernsAlternative(plan, catalog);
    const progress = emptyPremadeProgress();
    expect(activeCampaignActions(selected, progress).some((a) => coastIds.includes(a.id))).toBe(
      false,
    );
    const without = { ...progress, selectedExtras: { ...progress.selectedExtras, "959": false } };
    expect(
      activeCampaignActions(selected, without)
        .filter((a) => coastIds.includes(a.id))
        .map((a) => a.questChanges),
    ).toEqual(plan.actions.filter((a) => coastIds.includes(a.id)).map((a) => a.questChanges));
    expect(activeCampaignActions(selected, without).some((a) => a.legId === "wc")).toBe(false);
    expect(selected.actions.map((a) => a.id)).toEqual(plan.actions.map((a) => a.id));
    expect(selected.legs).toBe(plan.legs);
    expect(selected.combat).toBe(plan.combat);
    expect(plan).toEqual(saved);
    expect(attachWailingCavernsAlternative(selected, catalog)).toBe(selected);
  });

  it("resolves every old coastal link to the next active task only when WC is included", () => {
    const input = fixture(),
      selected = attachWailingCavernsAlternative(input.plan, input.catalog);
    const plan = { ...selected, bookmarkAliases: { "old-source-link": input.coastIds[0]! } };
    const progress = emptyPremadeProgress(),
      skipped = { ...progress, selectedExtras: { "959": false } };
    for (const id of input.coastIds) {
      expect(campaignActionAlias(plan, progress, id)).toBe("after-coast");
      expect(campaignActionAlias(plan, skipped, id)).toBe(id);
    }
    expect(campaignActionAlias(plan, progress, "old-source-link")).toBe("after-coast");
    expect(campaignActionAlias(plan, skipped, "old-source-link")).toBe(input.coastIds[0]);
  });

  it("exports either the trip or all four coastal counters and one hand-in", () => {
    const input = fixture(),
      plan = attachWailingCavernsAlternative(input.plan, input.catalog);
    for (const included of [true, false]) {
      const progress = { ...emptyPremadeProgress(), selectedExtras: { "959": included } };
      const artifact = compileCampaignAddon(plan, activeCampaignActions(plan, progress), {
        version: "0.2.0-test",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
        partyStarter: { race: "human", classSlug: "warrior" },
      });
      const text = artifact.documents
        .filter((d) => d.role === "party")
        .map((d) => d.content)
        .join("\n");
      expect(text.match(/\.accept 152\b/g) ?? []).toHaveLength(included ? 0 : 1);
      expect(text.match(/\.complete 152,[1-4]\b/g) ?? []).toHaveLength(included ? 0 : 4);
      expect(text.match(/\.turnin 152\b/g) ?? []).toHaveLength(included ? 0 : 1);
      expect(text.match(/\.turnin 959\b/g) ?? []).toHaveLength(included ? 1 : 0);
    }
  });

  it("preserves a useful earlier coastal placement", () => {
    const { plan, catalog, coastIds } = fixture();
    const earlier = {
      ...plan,
      actions: [
        ...plan.actions.filter((a) => coastIds.includes(a.id)),
        ...plan.actions.filter((a) => !coastIds.includes(a.id)),
      ],
    };
    expect(attachWailingCavernsAlternative(earlier, catalog)).toBe(earlier);
  });

  it.each([
    "catalog-all",
    "catalog-any",
    "selected-parent",
    "selected-guard",
    "source-owned",
    "missing-counter",
    "other-class",
    "changed-targets",
    "incomplete-trip",
    "unknown-location",
    "conflicting-location",
    "mixed-zones",
  ])("keeps the original route when alternative qualification is unsafe (%s)", (reason) => {
    const input = fixture();
    if (reason.startsWith("catalog-"))
      input.catalog.quests.push({
        ...input.catalog.quests[0]!,
        questId: 999,
        prerequisites:
          reason === "catalog-all" ? { allOf: [152], anyOf: [] } : { allOf: [], anyOf: [152] },
      });
    if (reason === "selected-parent")
      input.plan = {
        ...input.plan,
        actions: input.plan.actions.map((a) =>
          a.id === "after-coast" ? { ...a, requiredQuestIds: [152] } : a,
        ),
      };
    if (reason === "selected-guard" || reason === "source-owned") {
      const index =
        reason === "selected-guard"
          ? input.plan.actions.length - 1
          : input.plan.actions.findIndex((a) => a.id === input.coastIds[0]);
      input.plan = {
        ...input.plan,
        actions: input.plan.actions.map((a, i) =>
          i === index
            ? {
                ...a,
                source: {
                  chapterId: "control",
                  version: "v1",
                  stepId: "step-1",
                  conditions: {
                    checks: [
                      {
                        tag: ".isQuestTurnedIn",
                        arguments: "152",
                        condition: "",
                        text: "",
                        sourceLine: 1,
                        questId: null,
                        position: null,
                      },
                    ],
                    phases: [],
                    optional: false,
                  },
                },
              }
            : a,
        ),
      };
    }
    if (reason === "missing-counter")
      input.plan = {
        ...input.plan,
        actions: input.plan.actions.filter((a) => a.id !== input.coastIds[2]),
      };
    if (reason === "other-class") input.plan = { ...input.plan, leaderClass: "mage" };
    if (reason === "changed-targets") input.catalog.quests[0]!.objectives[0]!.count = 8;
    if (reason === "incomplete-trip")
      input.plan = {
        ...input.plan,
        actions: input.plan.actions.filter((a) => a.id !== "trip-1487-rewarded"),
      };
    if (["unknown-location", "conflicting-location", "mixed-zones"].includes(reason))
      input.plan = {
        ...input.plan,
        actions: input.plan.actions.map((action): CampaignAction => {
          if (action.id !== input.coastIds[0]) return action;
          const { location: _location, ...unlocated } = action;
          return {
            ...unlocated,
            ...(reason === "conflicting-location" ? { location: { zone: "1433" } } : {}),
            positions:
              reason === "unknown-location"
                ? []
                : (reason === "mixed-zones" ? ["1436", "1433"] : ["1436"]).map((zone) => ({
                    sourceLine: 0,
                    position: { zone, x: 30, y: 86, floor: null, space: "map-percent" },
                  })),
          };
        }),
      };
    expect(attachWailingCavernsAlternative(input.plan, input.catalog)).toBe(input.plan);
  });
});
