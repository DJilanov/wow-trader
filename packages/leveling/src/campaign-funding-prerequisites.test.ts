import { describe, expect, it } from "vitest";
import type { CampaignAction } from "./campaign.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";
import { existingFundingPrerequisite } from "./campaign-funding-prerequisites.js";

const giver = {
  npcId: 717,
  name: "Camp quest giver",
  friendlyToAlliance: true,
  positions: [{ zone: "1434", x: 35.62, y: 10.62 }],
};

function quest(questId: number, npcId: number, x: number): QuestCatalogEntry {
  const endpoint = { ...giver, npcId, positions: [{ ...giver.positions[0]!, x }] };
  return {
    questId,
    title: `Camp quest ${questId}`,
    minimumLevel: 28,
    questLevel: 31,
    requiredRaces: 4294967373,
    requiredClasses: 0,
    starts: [endpoint],
    ends: [endpoint],
    prerequisites: { allOf: [], anyOf: [] },
    exclusiveWith: [],
    category: "shared-kills",
    objectives: [{ index: 1, npcId: 681, count: 10, positions: [] }],
    unsupportedRequirements: [],
  };
}

function action(
  id: string,
  changes: readonly (readonly [number, "accepted" | "objectives-complete" | "rewarded"])[],
): CampaignAction {
  return {
    id,
    legId: "later-camp",
    title: id,
    instructions: [],
    questChanges: changes.map(([questId, state]) => ({
      questId,
      state,
      title: `Camp quest ${questId}`,
      objectiveIndex: state === "objectives-complete" ? 1 : null,
    })),
    positions: [],
    source: { chapterId: "camp", version: "test-v1", stepId: id },
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
}

function fixture(): {
  readonly current: QuestCatalogEntry;
  readonly neighbor: QuestCatalogEntry;
  readonly catalog: ReadonlyMap<number, QuestCatalogEntry>;
  readonly actions: readonly CampaignAction[];
} {
  const current = quest(185, 717, 35.62),
    neighbor = quest(190, 718, 35.55);
  return {
    current,
    neighbor,
    catalog: new Map([
      [185, current],
      [190, neighbor],
    ]),
    actions: [
      action("camp-pickups", [
        [185, "accepted"],
        [190, "accepted"],
      ]),
      action("tiger-kills", [[185, "objectives-complete"]]),
      action("camp-returns", [
        [185, "rewarded"],
        [190, "rewarded"],
      ]),
    ],
  };
}

describe("captured prerequisites sharing a quest-giver camp", () => {
  it("splits a complete source lifecycle from a nearby giver's phases without mutating either", () => {
    const input = fixture(),
      before = structuredClone(input.actions);
    const retained = existingFundingPrerequisite(input.current, input.catalog, input.actions, true);
    expect(retained).not.toBeNull();
    expect(
      retained!.flatMap((entry) =>
        entry.questChanges.map((change) => [change.questId, change.state]),
      ),
    ).toEqual([
      [185, "accepted"],
      [185, "objectives-complete"],
      [185, "rewarded"],
    ]);
    expect(retained!.map((entry) => [entry.id, entry.source, entry.positions])).toEqual(
      input.actions.map((entry) => [entry.id, entry.source, entry.positions]),
    );
    expect(input.actions).toEqual(before);
  });

  it.each(
    (["starts", "ends"] as const).flatMap((side) =>
      ["distant", "different-zone", "missing-position", "ambiguous-position", "hostile"].map(
        (reason) => ({ side, reason }),
      ),
    ),
  )("keeps a composite visit held when the other's $side is $reason", ({ side, reason }) => {
    const input = fixture();
    const neighbor = {
      ...input.neighbor,
      [side]: input.neighbor[side].map((entry) => ({
        ...entry,
        friendlyToAlliance: reason !== "hostile",
        positions:
          reason === "missing-position"
            ? []
            : [
                {
                  zone: reason === "different-zone" ? "1433" : "1434",
                  x: reason === "distant" ? 45 : 35.55,
                  y: 10.62,
                },
                ...(reason === "ambiguous-position" ? [{ zone: "1434", x: 60, y: 70 }] : []),
              ],
      })),
    };
    expect(
      existingFundingPrerequisite(
        input.current,
        new Map([
          [185, input.current],
          [190, neighbor],
        ]),
        input.actions,
        true,
      ),
    ).toBeNull();
  });

  it("keeps the hold when another quest's objective is coupled to a camp phase", () => {
    const input = fixture();
    const actions = [
      action("coupled", [
        [185, "accepted"],
        [190, "objectives-complete"],
      ]),
      ...input.actions.slice(1),
    ];
    expect(existingFundingPrerequisite(input.current, input.catalog, actions, true)).toBeNull();
  });

  it("keeps distinct-giver source splitting disabled for existing callers", () => {
    const input = fixture();
    expect(existingFundingPrerequisite(input.current, input.catalog, input.actions)).toBeNull();
  });

  it("retains the established same-NPC proof without requiring a new coordinate", () => {
    const input = fixture();
    const neighbor = {
      ...input.neighbor,
      starts: [{ ...giver, positions: [] }],
      ends: [{ ...giver, positions: [] }],
    };
    expect(
      existingFundingPrerequisite(
        input.current,
        new Map([
          [185, input.current],
          [190, neighbor],
        ]),
        input.actions,
        true,
      ),
    ).not.toBeNull();
  });
});
