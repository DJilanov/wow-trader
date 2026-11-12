import { combatBossReferenceSchema, type CombatBossReference } from "./combat-boss-reference.js";
import type { CombatDataset } from "./combat-model.js";

interface ClientBossIdentity {
  readonly creatureId: number;
  readonly aliases: readonly string[];
  readonly encounterIds: readonly number[];
  readonly mapIds: readonly number[];
  readonly identityEvidence: "criteria_type_0";
  readonly criteriaIds?: readonly number[];
  readonly contextNames?: readonly string[];
  readonly achievementIds?: readonly number[];
}

interface ClientEncounter {
  readonly encounterId: number;
  readonly mapId: number;
  readonly name: string;
}

export interface CombatBossInstanceContext {
  readonly mapId: number;
  readonly dungeonVisitIds: readonly string[];
  readonly mapName?: string;
}

interface ClientBossStatisticLocation {
  readonly creatureId: number;
  readonly mapId: number | null;
  readonly mapName: string;
  readonly precision: string;
  readonly evidenceKind: string;
  readonly evidenceLabel: string;
  readonly requiresReview: boolean;
}

function identity(name: string): string {
  return name.normalize("NFKC").trim().toLowerCase();
}

/** Bind validated static client records; ambiguous names never become boss exemptions. */
export function qualifyCombatBossReferences(input: {
  readonly combat: Pick<CombatDataset, "targetBuild" | "npcs">;
  readonly source: CombatBossReference["source"];
  readonly bosses: readonly ClientBossIdentity[];
  readonly encounters: readonly ClientEncounter[];
  readonly instances: readonly CombatBossInstanceContext[];
  readonly bossLocations?: readonly ClientBossStatisticLocation[];
  readonly bossLocationsSha256?: string;
}): readonly CombatBossReference[] {
  if (input.combat.targetBuild !== input.source.build)
    throw new Error("Boss encounter records belong to a different client build.");
  const instances = new Map(input.instances.map((instance) => [instance.mapId, instance]));
  if (instances.size !== input.instances.length)
    throw new Error("Duplicate boss instance context.");
  const npcNames = new Map<string, number>();
  const npcIds = new Set<number>();
  for (const npc of input.combat.npcs) {
    if (npcIds.has(npc.id)) throw new Error("Duplicate boss candidate creature identity.");
    npcIds.add(npc.id);
    const name = identity(npc.name);
    npcNames.set(name, (npcNames.get(name) ?? 0) + 1);
  }
  const bosses = new Map<number, ClientBossIdentity>();
  for (const boss of input.bosses) {
    if (bosses.has(boss.creatureId)) throw new Error("Duplicate client boss creature identity.");
    bosses.set(boss.creatureId, boss);
  }
  const byName = new Map<string, ClientEncounter[]>();
  const byId = new Map<number, ClientEncounter>();
  for (const encounter of input.encounters) {
    if (byId.has(encounter.encounterId)) throw new Error("Duplicate client encounter identity.");
    byId.set(encounter.encounterId, encounter);
    const name = identity(encounter.name);
    byName.set(name, [...(byName.get(name) ?? []), encounter]);
  }
  return input.combat.npcs.flatMap((npc): readonly CombatBossReference[] => {
    const name = identity(npc.name);
    const direct = bosses.get(npc.id);
    // Some client completion criteria use the instance name as their alias and
    // expose the named creature only in an instance kill statistic.
    if (direct?.identityEvidence === "criteria_type_0" && direct.encounterIds.length === 0 &&
      direct.mapIds.length === 0 && npcNames.get(name) === 1 && direct.criteriaIds?.length &&
      direct.achievementIds?.length && direct.contextNames?.some((label) =>
        identity(label) === "complete the following dungeons.") && input.bossLocationsSha256) {
      const locations = input.bossLocations?.filter((location) => location.creatureId === npc.id) ?? [];
      const location = locations.length === 1 ? locations[0] : undefined;
      const context = location?.mapId ? instances.get(location.mapId) : undefined;
      if (location && context?.mapName && location.precision === "map" &&
        location.evidenceKind === "achievement_instance_map" && !location.requiresReview &&
        identity(location.mapName) === identity(context.mapName) &&
        direct.aliases.some((alias) => identity(alias) === identity(context.mapName!) ||
          identity(alias).startsWith(`${identity(context.mapName!)}:`)) &&
        identity(location.evidenceLabel) === identity(`${npc.name} kills (${context.mapName})`)) {
        return [combatBossReferenceSchema.parse({
          npcId: npc.id, name: npc.name, targetBuild: input.combat.targetBuild,
          instanceMapId: context.mapId, dungeonVisitIds: [...context.dungeonVisitIds],
          encounterIds: [], identityEvidence: "client-instance-kill-statistic",
          source: input.source,
          killStatistic: { criteriaIds: [...direct.criteriaIds].sort((a, b) => a - b),
            completionAchievementIds: [...direct.achievementIds].sort((a, b) => a - b),
            evidenceLabel: location.evidenceLabel, mapName: context.mapName,
            bossLocationsSha256: input.bossLocationsSha256 },
        })];
      }
    }
    if (direct && !direct.aliases.some((alias) => identity(alias) === name)) return [];
    if (!direct && npcNames.get(name) !== 1) return [];
    const encounters = direct
      ? direct.encounterIds.flatMap((id) => {
          const encounter = byId.get(id);
          return encounter && direct.mapIds.includes(encounter.mapId) ? [encounter] : [];
        })
      : (byName.get(name) ?? []);
    const mapIds = new Set(encounters.map((encounter) => encounter.mapId));
    if (mapIds.size !== 1) return [];
    const mapId = [...mapIds][0]!;
    const context = instances.get(mapId);
    if (!context) return [];
    return [
      combatBossReferenceSchema.parse({
        npcId: npc.id,
        name: npc.name,
        targetBuild: input.combat.targetBuild,
        instanceMapId: mapId,
        dungeonVisitIds: [...context.dungeonVisitIds],
        encounterIds: encounters.map((encounter) => encounter.encounterId).sort((a, b) => a - b),
        identityEvidence: direct ? "client-creature-id" : "unique-exact-name",
        source: input.source,
      }),
    ];
  });
}
