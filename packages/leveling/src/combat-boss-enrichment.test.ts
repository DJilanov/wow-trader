import { describe, expect, it } from "vitest";
import { qualifyCombatBossReferences } from "./combat-boss-enrichment.js";
import { combatBossReferenceSchema } from "./combat-boss-reference.js";
import type { CombatNpc } from "./combat-model.js";

const npc: CombatNpc = {
  id: 3654,
  name: "Mutanus the Devourer",
  minimumLevel: 22,
  maximumLevel: 22,
  rank: 1,
  zoneIds: [718],
  xpEligibility: "assumed",
};
const input: Parameters<typeof qualifyCombatBossReferences>[0] = {
  combat: { targetBuild: 70205, npcs: [npc] },
  source: {
    build: 70205,
    manifestSha256: "a".repeat(64),
    encountersSha256: "b".repeat(64),
    bossesSha256: "c".repeat(64),
    mapsSha256: "d".repeat(64),
  },
  bosses: [
    {
      creatureId: 3654,
      aliases: ["Mutanus the Devourer"],
      encounterIds: [592],
      mapIds: [43],
      identityEvidence: "criteria_type_0",
    },
  ],
  encounters: [{ encounterId: 592, mapId: 43, name: "Mutanus the Devourer" }],
  instances: [{ mapId: 43, dungeonVisitIds: ["wailing-caverns"] }],
};

describe("client boss encounter qualification", () => {
  it("preserves direct creature identity, map, encounter and content provenance", () => {
    const before = JSON.stringify(input);
    expect(qualifyCombatBossReferences(input)).toEqual([
      {
        npcId: 3654,
        name: npc.name,
        targetBuild: 70205,
        instanceMapId: 43,
        dungeonVisitIds: ["wailing-caverns"],
        encounterIds: [592],
        identityEvidence: "client-creature-id",
        source: input.source,
      },
    ]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("can bind a unique exact encounter name when direct criteria are unavailable", () => {
    expect(qualifyCombatBossReferences({ ...input, bosses: [] })[0]?.identityEvidence).toBe(
      "unique-exact-name",
    );
  });

  it("does not promote dungeon trash merely because it is elite", () => {
    expect(
      qualifyCombatBossReferences({
        ...input,
        combat: { ...input.combat, npcs: [{ ...npc, id: 5056, name: "Deviate Dreadfang" }] },
      }),
    ).toEqual([]);
  });

  it("does not use fuzzy names", () => {
    expect(
      qualifyCombatBossReferences({
        ...input,
        bosses: [],
        encounters: [{ ...input.encounters[0]!, name: "Mutanus" }],
      }),
    ).toEqual([]);
  });

  it("refuses ambiguous creature names while retaining positively identified creatures", () => {
    const combat = { ...input.combat, npcs: [npc, { ...npc, id: 999 }] };
    expect(qualifyCombatBossReferences({ ...input, combat, bosses: [] })).toEqual([]);
    expect(qualifyCombatBossReferences({ ...input, combat }).map((row) => row.npcId)).toEqual([
      3654,
    ]);
  });

  it("refuses same-name encounters across different instances", () => {
    expect(
      qualifyCombatBossReferences({
        ...input,
        bosses: [],
        encounters: [...input.encounters, { encounterId: 999, mapId: 48, name: npc.name }],
      }),
    ).toEqual([]);
  });

  it("refuses direct IDs with contradictory names or map records", () => {
    expect(
      qualifyCombatBossReferences({
        ...input,
        bosses: [{ ...input.bosses[0]!, aliases: ["Different boss"] }],
      }),
    ).toEqual([]);
    expect(
      qualifyCombatBossReferences({ ...input, bosses: [{ ...input.bosses[0]!, mapIds: [48] }] }),
    ).toEqual([]);
  });

  it("requires an explicit instance-to-visit mapping", () => {
    expect(qualifyCombatBossReferences({ ...input, instances: [] })).toEqual([]);
  });

  it("refuses foreign builds and duplicate client identities", () => {
    expect(() =>
      qualifyCombatBossReferences({ ...input, source: { ...input.source, build: 70450 } }),
    ).toThrow("different client build");
    expect(() =>
      qualifyCombatBossReferences({
        ...input,
        encounters: [...input.encounters, ...input.encounters],
      }),
    ).toThrow("Duplicate client encounter");
    expect(() =>
      qualifyCombatBossReferences({ ...input, bosses: [...input.bosses, ...input.bosses] }),
    ).toThrow("Duplicate client boss");
    expect(() =>
      qualifyCombatBossReferences({
        ...input,
        instances: [...input.instances, ...input.instances],
      }),
    ).toThrow("Duplicate boss instance");
    expect(() =>
      qualifyCombatBossReferences({ ...input, combat: { ...input.combat, npcs: [npc, npc] } }),
    ).toThrow("Duplicate boss candidate");
  });

  it("rejects repeated contexts and source-build mismatches at the data boundary", () => {
    const reference = qualifyCombatBossReferences(input)[0]!;
    expect(combatBossReferenceSchema.safeParse({ ...reference, targetBuild: 70450 }).success).toBe(
      false,
    );
    expect(
      combatBossReferenceSchema.safeParse({
        ...reference,
        dungeonVisitIds: ["wailing-caverns", "wailing-caverns"],
      }).success,
    ).toBe(false);
    expect(
      combatBossReferenceSchema.safeParse({ ...reference, encounterIds: [592, 592] }).success,
    ).toBe(false);
  });
});
