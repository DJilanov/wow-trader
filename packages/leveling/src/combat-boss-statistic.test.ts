import { describe, expect, it } from "vitest";
import { qualifyCombatBossReferences } from "./combat-boss-enrichment.js";
import { combatBossReferenceSchema, matchesCombatBossIdentity } from "./combat-boss-reference.js";
import { combatNpcSchema } from "./combat-model.js";
import fixture from "./fixtures/mograine-client-statistic-70205.json" with { type: "json" };

function input(): Parameters<typeof qualifyCombatBossReferences>[0] {
  return { combat: { targetBuild: 70205, npcs: [combatNpcSchema.parse(fixture.npc)] },
    source: fixture.source,
    bosses: [{ ...fixture.boss, identityEvidence: "criteria_type_0" }], encounters: [],
    instances: [{ mapId: fixture.map.mapId, mapName: fixture.map.name,
      dungeonVisitIds: ["sm-cathedral", "sm-all-wings"] }],
    bossLocations: [fixture.bossLocation], bossLocationsSha256: fixture.bossLocationsSha256 };
}

describe("client dungeon-completion and named kill-statistic identity", () => {
  it("binds the actual Mograine records without inventing an encounter", () => {
    const captured = input(), before = structuredClone(captured);
    const rows = qualifyCombatBossReferences(captured);
    expect(rows).toHaveLength(1);
    const reference = rows[0]!;
    expect(reference.identityEvidence).toBe("client-instance-kill-statistic");
    expect(reference.encounterIds).toEqual([]);
    expect(reference.npcId).toBe(3976);
    expect(reference.instanceMapId).toBe(189);
    expect(reference.name).toBe("Scarlet Commander Mograine");
    if (reference.identityEvidence !== "client-instance-kill-statistic") throw new Error("Missing statistic identity");
    expect(reference.killStatistic).toEqual({ criteriaIds: [3264, 117743],
      completionAchievementIds: [62032, 64017],
      evidenceLabel: fixture.bossLocation.evidenceLabel, mapName: "Scarlet Monastery",
      bossLocationsSha256: fixture.bossLocationsSha256 });
    expect(matchesCombatBossIdentity(captured.combat.npcs[0], reference, 70205)).toBe(true);
    expect(matchesCombatBossIdentity(captured.combat.npcs[0], reference, 70450)).toBe(false);
    expect(captured).toEqual(before);
  });

  it.each(["name", "map-name", "map-id", "precision", "review", "kind", "duplicate-location", "duplicate-name",
    "criteria", "achievement", "completion-context", "alias", "conflicting-encounter", "missing-provenance", "missing-instance-name"])(
    "does not qualify an incomplete or contradictory %s", (reason) => {
      const original = input(), boss = original.bosses[0]!, location = original.bossLocations![0]!;
      let candidate = original;
      if (reason === "name") candidate = { ...original, bossLocations: [{ ...location, evidenceLabel: "Mograine kills (Scarlet Monastery)" }] };
      if (reason === "map-name") candidate = { ...original, bossLocations: [{ ...location, mapName: "Other dungeon" }] };
      if (reason === "map-id") candidate = { ...original, bossLocations: [{ ...location, mapId: 43 }] };
      if (reason === "precision") candidate = { ...original, bossLocations: [{ ...location, precision: "area" }] };
      if (reason === "review") candidate = { ...original, bossLocations: [{ ...location, requiresReview: true }] };
      if (reason === "kind") candidate = { ...original, bossLocations: [{ ...location, evidenceKind: "spawn" }] };
      if (reason === "duplicate-location") candidate = { ...original, bossLocations: [location, location] };
      if (reason === "duplicate-name") candidate = { ...original, combat: { ...original.combat,
        npcs: [...original.combat.npcs, { ...original.combat.npcs[0]!, id: 999999 }] } };
      if (reason === "criteria") candidate = { ...original, bosses: [{ ...boss, criteriaIds: [] }] };
      if (reason === "achievement") candidate = { ...original, bosses: [{ ...boss, achievementIds: [] }] };
      if (reason === "completion-context") candidate = { ...original, bosses: [{ ...boss, contextNames: ["Kill a named creature"] }] };
      if (reason === "alias") candidate = { ...original, bosses: [{ ...boss, aliases: ["Another instance"] }] };
      if (reason === "conflicting-encounter") candidate = { ...original, bosses: [{ ...boss, encounterIds: [450] }] };
      if (reason === "missing-provenance") candidate = { ...original, bossLocationsSha256: "" };
      if (reason === "missing-instance-name") candidate = { ...original,
        instances: [{ mapId: 189, dungeonVisitIds: ["sm-cathedral"] }] };
      expect(qualifyCombatBossReferences(candidate)).toEqual([]);
    },
  );

  it("requires complete provenance and separates statistic evidence from encounter evidence", () => {
    const reference = qualifyCombatBossReferences(input())[0]!;
    if (reference.identityEvidence !== "client-instance-kill-statistic") throw new Error("Missing statistic identity");
    expect(combatBossReferenceSchema.safeParse({ ...reference, encounterIds: [450] }).success).toBe(false);
    expect(combatBossReferenceSchema.safeParse({ ...reference, identityEvidence: "client-creature-id" }).success).toBe(false);
    expect(combatBossReferenceSchema.safeParse({ ...reference, killStatistic: {
      ...reference.killStatistic, criteriaIds: [3264, 3264] } }).success).toBe(false);
    expect(combatBossReferenceSchema.safeParse({ ...reference, killStatistic: {
      ...reference.killStatistic, completionAchievementIds: [62032, 62032] } }).success).toBe(false);
    expect(combatBossReferenceSchema.safeParse({ ...reference, killStatistic: {
      ...reference.killStatistic, bossLocationsSha256: "" } }).success).toBe(false);
    expect(combatBossReferenceSchema.safeParse({ ...reference, killStatistic: {
      ...reference.killStatistic, evidenceLabel: "Other boss kills (Scarlet Monastery)" } }).success).toBe(false);
    expect(combatBossReferenceSchema.safeParse({ ...reference, targetBuild: 70450 }).success).toBe(false);
  });
});
