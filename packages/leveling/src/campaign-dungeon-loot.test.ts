import { describe, expect, it } from "vitest";
import { filterDungeonLootSources } from "./campaign-dungeon-loot.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import type { CampaignPlan } from "./campaign.js";
import type { CombatDataset, CombatNpc, CombatObjective } from "./combat-model.js";
import type { CombatBossReference } from "./combat-boss-reference.js";

function npc(id: number): CombatNpc {
  return {
    id,
    name: `Enemy ${id}`,
    minimumLevel: 33,
    maximumLevel: 33,
    rank: 1,
    xpEligibility: "assumed",
    zoneIds: [],
  };
}

function boss(npcId: number, visit: string): CombatBossReference {
  return {
    npcId,
    name: npc(npcId).name,
    targetBuild: 70205,
    instanceMapId: 1,
    dungeonVisitIds: [visit],
    encounterIds: [1],
    identityEvidence: "client-creature-id",
    source: {
      build: 70205,
      manifestSha256: "a".repeat(64),
      encountersSha256: "b".repeat(64),
      bossesSha256: "c".repeat(64),
      mapsSha256: "d".repeat(64),
    },
  };
}

function context(): Parameters<typeof filterDungeonLootSources>[1] {
  return {
    targetBuild: 70205,
    dungeonVisitIds: ["dalaran"],
    npcs: new Map([1, 2, 3].map((id) => [id, npc(id)])),
    bosses: new Map([
      [1, boss(1, "dalaran")],
      [2, boss(2, "lordaeron")],
    ]),
  };
}

function objective(): CombatObjective {
  return {
    questId: 92458,
    objectiveIndex: 1,
    npcIds: [1, 2, 3],
    requiredKills: null,
    credit: "personal-loot",
    source: "Synthetic item sources",
    reason: "Unpriced drop.",
    loot: { itemId: 251961, quantity: 1, sharing: "unknown", sourceNpcIds: [1, 2, 3] },
  };
}

describe("dungeon-specific personal loot sources", () => {
  it("excludes only a positively identified boss from another dungeon", () => {
    const rows = [objective()],
      before = structuredClone(rows);
    const result = filterDungeonLootSources(rows, context());
    expect(result[0]!.npcIds).toEqual([1, 3]);
    expect(result[0]!.loot).toBe(rows[0]!.loot);
    expect(result[0]!.requiredKills).toBeNull();
    expect(result[0]!.reason).toContain("Enemy 2");
    expect(rows).toEqual(before);
  });

  it.each([
    "missing-context",
    "no-local-boss",
    "missing-identity",
    "name",
    "id",
    "build",
    "source-build",
  ])("retains candidates when qualification fails: %s", (kind) => {
    const input = context(),
      rows = [objective()];
    const references = new Map(input.bosses);
    if (kind === "no-local-boss") references.delete(1);
    else if (kind === "missing-identity") references.delete(2);
    else if (kind === "name") references.set(2, { ...references.get(2)!, name: "Different enemy" });
    else if (kind === "id") references.set(2, { ...references.get(2)!, npcId: 99 });
    else if (kind === "build") references.set(2, { ...references.get(2)!, targetBuild: 70450 });
    else if (kind === "source-build")
      references.set(2, {
        ...references.get(2)!,
        source: { ...references.get(2)!.source, build: 70450 },
      });
    expect(
      filterDungeonLootSources(rows, {
        ...input,
        bosses: references,
        dungeonVisitIds: kind === "missing-context" ? [] : input.dungeonVisitIds,
      }),
    ).toBe(rows);
  });

  it.each(["shared-kills", "unknown", "non-combat"] as const)(
    "never removes explicit or unresolved %s objectives",
    (credit) => {
      const rows = [{ ...objective(), credit }];
      expect(filterDungeonLootSources(rows, context())).toBe(rows);
    },
  );

  it("preserves a second boss in the same visit and a missing NPC record", () => {
    const input = context(),
      rows = [objective()];
    const bosses = new Map(input.bosses).set(2, boss(2, "dalaran"));
    expect(filterDungeonLootSources(rows, { ...input, bosses })).toBe(rows);
    expect(filterDungeonLootSources(rows, { ...input, npcs: new Map([[1, npc(1)]]) })).toBe(rows);
  });

  it.each([false, true])(
    "applies the filter only to compiled dungeon work (inside=%s)",
    (inside) => {
      const ctx = context();
      const plan: CampaignPlan = {
        release: "loot-test",
        race: "human",
        leaderClass: "warrior",
        targetBuild: 70205,
        actions: [
          {
            id: "loot",
            legId: "visit",
            title: "Find the mote",
            instructions: [],
            positions: [],
            source: null,
            kind: "quests",
            leaderOnly: false,
            targetLevel: null,
            targetStopId: null,
            raidOnly: false,
            location: { zone: "Test", ...(inside ? { insideDungeon: "dalaran" } : {}) },
            questChanges: [
              { questId: 999990, title: "Mote", state: "objectives-complete", objectiveIndex: 1 },
            ],
          },
        ],
        legs: [
          {
            id: "visit",
            title: "Visit",
            kind: "preparation",
            from: 30,
            to: 33,
            stopId: null,
            actionIds: ["loot"],
            questIds: [999990],
            unresolvedQuestIds: [],
          },
        ],
      };
      const data: CombatDataset = {
        schema: "forever-combat-reference.v1",
        targetBuild: 70205,
        publication: "private-reference",
        authorizationNote: "Synthetic fixture",
        provider: {
          repository: "https://example.test/provider",
          revision: "a".repeat(40),
          layer: "forever-static-with-authored",
          npcSha256: "a".repeat(64),
          questSha256: "b".repeat(64),
          itemSha256: "c".repeat(64),
          limitations: [],
        },
        npcs: [...ctx.npcs.values()],
        bossReferences: [...ctx.bosses.values()],
        quests: [
          {
            questId: 999990,
            requiredClasses: 0,
            creatureIds: [],
            itemCreatureIds: [1, 2, 3],
            onlyCreatureObjectives: false,
            objectiveText: ["Collect the mote."],
            itemObjectives: [
              {
                objectiveIndex: 1,
                itemId: 251961,
                quantity: 1,
                npcIds: [1, 2, 3],
                sharing: "unknown",
              },
            ],
          },
        ],
        dungeons: [],
        killXpEvidence: [],
      };
      const before = structuredClone(data);
      const result = attachCampaignCombat(plan, [], data, "test");
      const activity = result.combat!.activities.find((entry) => entry.actionId === "loot")!;
      expect(activity.environment).toBe(inside ? "dungeon" : "outdoor");
      expect(activity.objectives[0]!.npcIds).toEqual(inside ? [1, 3] : [1, 2, 3]);
      expect(data).toEqual(before);
    },
  );
});
