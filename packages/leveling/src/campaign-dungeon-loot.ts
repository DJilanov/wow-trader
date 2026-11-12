import type { CombatNpc, CombatObjective } from "./combat-model.js";
import { matchesCombatBossIdentity, type CombatBossReference } from "./combat-boss-reference.js";

interface DungeonLootContext {
  readonly targetBuild: number;
  readonly dungeonVisitIds: readonly string[];
  readonly npcs: ReadonlyMap<number, CombatNpc>;
  readonly bosses: ReadonlyMap<number, CombatBossReference>;
}

/** Keep raw references intact; constrain only this dungeon's personal-loot alternatives. */
export function filterDungeonLootSources(
  objectives: readonly CombatObjective[],
  context: DungeonLootContext,
): readonly CombatObjective[] {
  if (!context.dungeonVisitIds.length) return objectives;
  let changed = false;
  const result = objectives.map((objective): CombatObjective => {
    if (objective.credit !== "personal-loot" || !objective.loot || objective.npcIds.length < 2)
      return objective;
    const qualified = new Map<number, CombatBossReference>();
    for (const npcId of objective.npcIds) {
      const reference = context.bosses.get(npcId);
      if (matchesCombatBossIdentity(context.npcs.get(npcId), reference, context.targetBuild))
        qualified.set(npcId, reference);
    }
    const matchesVisit = (reference: CombatBossReference): boolean =>
      reference.dungeonVisitIds.some((id) => context.dungeonVisitIds.includes(id));
    if (![...qualified.values()].some(matchesVisit)) return objective;
    const excluded = new Set(
      [...qualified]
        .filter(([, reference]) => reference.dungeonVisitIds.length > 0 && !matchesVisit(reference))
        .map(([npcId]) => npcId),
    );
    if (!excluded.size) return objective;
    changed = true;
    return {
      ...objective,
      npcIds: objective.npcIds.filter((npcId) => !excluded.has(npcId)),
      reason: [
        objective.reason,
        `Excluded confirmed bosses from other dungeons: ${[...excluded].map((id) => qualified.get(id)!.name).join(", ")}. Unknown source candidates remain.`,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });
  return changed ? result : objectives;
}
