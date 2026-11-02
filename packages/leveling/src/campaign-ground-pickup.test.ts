import { describe, expect, it } from "vitest";
import { isSingleGroundPickup } from "./campaign-ground-pickup.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset, CombatQuestReference } from "./combat-model.js";
import { buildCampaignQuestLibrary } from "./campaign-library.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { applyCampaignPartyQuestPolicy } from "./campaign-party-policy.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";

const pickup =
  "step\n.goto 1439,36.37,50.92\n>>Open the Beached Sea Creature. Loot it for the Sea Creature Bones\n.complete 3524,1 >>Sea Creature Bones (1)";

function reference(): CombatQuestReference {
  return {
    questId: 3524,
    creatureIds: [],
    itemCreatureIds: [],
    objectiveText: ["Recover the Sea Creature Bones from the beached creature."],
    onlyCreatureObjectives: false,
    requiredClasses: 0,
    prerequisites: { allOf: [], anyOf: [] },
    itemObjectives: [
      {
        itemId: 12242,
        itemName: "Sea Creature Bones",
        quantity: 1,
        objectiveIndex: 1,
        npcIds: [],
        sharing: "pooled",
      },
    ],
  };
}

function source(body = pickup): CampaignSource {
  const chapter = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 126)!;
  return { reference: chapter, guide: parseGuideChapter(body, chapter.id, "a".repeat(64), 70205) };
}

describe("single sourced ground pickups", () => {
  it("requires a matching one-item world-object instruction and exact objective", () => {
    const step = source().guide.steps[0]!,
      quest = reference();
    expect(isSingleGroundPickup(quest, 1, step.directives)).toBe(true);
    for (const changed of [
      { ...quest, creatureIds: [400010] },
      { ...quest, itemCreatureIds: [400010] },
      { ...quest, itemObjectives: [{ ...quest.itemObjectives![0]!, npcIds: [400010] }] },
      { ...quest, itemObjectives: [{ ...quest.itemObjectives![0]!, quantity: 2 }] },
      { ...quest, itemObjectives: [{ ...quest.itemObjectives![0]!, itemName: "Different Bones" }] },
      { ...quest, itemObjectives: [{ ...quest.itemObjectives![0]!, quantity: null }] },
      {
        ...quest,
        itemObjectives: [
          ...quest.itemObjectives!,
          { ...quest.itemObjectives![0]!, itemId: 12243, objectiveIndex: 2 },
        ],
      },
    ])
      expect(isSingleGroundPickup(changed, 1, step.directives)).toBe(false);
    expect(isSingleGroundPickup(quest, 2, step.directives)).toBe(false);
    expect(isSingleGroundPickup(undefined, 1, step.directives)).toBe(false);
  });

  it("holds missing locations, mixed quotas, mob hints and triggered encounters", () => {
    for (const body of [
      pickup.replace(".goto 1439,36.37,50.92\n", ""),
      pickup.replace(
        "Open the Beached Sea Creature. Loot it for the Sea Creature Bones",
        "Loot bones nearby",
      ),
      `${pickup}\n.mob Sea Creature`,
      `${pickup}\n.use 12345`,
      `${pickup}\n.collect 12242,1,3524`,
      `${pickup}\n.complete 4681,1 >>Sea Turtle Remains (1)`,
      `${pickup}\n>>Kill the guardian that spawns.`,
      `${pickup}\n>>Defend against the guardian.`,
    ])
      expect(isSingleGroundPickup(reference(), 1, source(body).guide.steps[0]!.directives)).toBe(
        false,
      );
  });

  it("distinguishes a ground object's possible locations from a spawned encounter", () => {
    const body = pickup.replace(
      ".complete 3524,1",
      ">>It has multiple spawn locations in the Lake\n.complete 3524,1",
    );
    expect(isSingleGroundPickup(reference(), 1, source(body).guide.steps[0]!.directives)).toBe(
      true,
    );
    for (const warning of [
      "A guardian will spawn when you open it.",
      "It has multiple spawn locations in the Lake. Defeat its guardian.",
      "It has multiple spawn locations in the Lake. A guardian will spawn.",
      "Summon the creature at one of its spawn locations.",
    ]) {
      const guarded = body.replace("It has multiple spawn locations in the Lake", warning);
      expect(isSingleGroundPickup(reference(), 1, source(guarded).guide.steps[0]!.directives)).toBe(
        false,
      );
    }
  });

  it("retains a nearby ground task as interaction work and awards no item-drop kill XP", () => {
    const body = `step\n.goto 1439,36.62,45.59\n.accept 3524 >>Accept Washed Ashore\n${pickup}\nstep\n.goto 1439,36.62,45.59\n.turnin 3524 >>Turn in Washed Ashore\n.accept 400001 >>Accept Shore Patrol\nstep\n.goto 1439,37,51\n.complete 400001,1 >>Thistle Bear slain (10)\n.mob Thistle Bear\nstep\n.goto 1439,36.62,45.59\n.turnin 400001 >>Turn in Shore Patrol`;
    const sources = [source(body)];
    const data: CombatDataset = {
      schema: "forever-combat-reference.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "",
      provider: {
        repository: "https://example.test/reference",
        revision: "a".repeat(40),
        layer: "forever-static-with-authored",
        npcSha256: "b".repeat(64),
        questSha256: "c".repeat(64),
        itemSha256: "d".repeat(64),
        limitations: ["Synthetic regression fixture"],
      },
      quests: [
        reference(),
        {
          questId: 400001,
          creatureIds: [400010],
          itemCreatureIds: [],
          onlyCreatureObjectives: true,
          objectiveText: ["Kill 10 Thistle Bears."],
          prerequisites: { allOf: [], anyOf: [] },
        },
      ],
      npcs: [
        {
          id: 400010,
          name: "Thistle Bear",
          minimumLevel: 13,
          maximumLevel: 13,
          rank: 0,
          zoneIds: [148],
          xpEligibility: "assumed",
        },
      ],
      dungeons: [],
      killXpEvidence: [],
    };
    const library = buildCampaignQuestLibrary(
      sources,
      createCampaignSourceProfile("human", "warrior"),
      [],
      new Set(),
      data.quests,
    );
    expect(library.find((quest) => quest.questId === 3524)?.objective).toBe("interaction");
    const actions = library.flatMap((quest) =>
      quest.actions.map((action) => ({ ...action, legId: "shore" })),
    );
    const plan: CampaignPlan = {
      release: "ground-fixture",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      actions,
      legs: [
        {
          id: "shore",
          title: "Darkshore",
          kind: "preparation",
          from: 14,
          to: 14,
          stopId: null,
          actionIds: actions.map((action) => action.id),
          questIds: [3524, 400001],
          unresolvedQuestIds: [],
        },
      ],
      rewardFacts: [3524, 400001].map((questId) => ({
        questId,
        fullXp: 680,
        minimumLevel: 10,
        questLevel: 14,
        xpByLevel: [],
        status: "available",
        evidenceKind: "published-forever",
        sourceUrl: "https://example.test/quest",
        capturedAt: "2026-11-01T00:00:00.000Z",
      })),
    };
    const before = JSON.stringify({ plan, data, sources });
    const selected = applyCampaignPartyQuestPolicy(
      attachCampaignCombat(plan, sources, data, "fixture"),
      sources,
      data,
    );
    expect(
      selected.partyPolicy?.decisions.find((decision) => decision.questId === 3524),
    ).toMatchObject({ objective: "interaction", included: true });
    expect(
      selected.actions.filter((action) =>
        action.questChanges.some((change) => change.questId === 3524),
      ),
    ).toHaveLength(3);
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member) => ({
      ...member,
      level: 14,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    const forecast = forecastCampaignXp(selected, progress)[0]!;
    for (const member of forecast.members) {
      expect(member.rewards.find((reward) => reward.questId === 3524)?.xp).toBe(680);
      expect(member.combatRows.every((row) => !row.activityId.includes("3524"))).toBe(true);
    }
    const dropData = {
      ...data,
      quests: [
        {
          ...reference(),
          itemCreatureIds: [400010],
          itemObjectives: [{ ...reference().itemObjectives![0]!, npcIds: [400010] }],
        },
        data.quests[1]!,
      ],
    };
    const held = applyCampaignPartyQuestPolicy(
      attachCampaignCombat(plan, sources, dropData, "drop-fixture"),
      sources,
      dropData,
    );
    expect(
      held.partyPolicy?.decisions.find((decision) => decision.questId === 3524)?.included,
    ).toBe(false);
    expect(JSON.stringify({ plan, data, sources })).toBe(before);
  });
});
