"use client";

import { estimateCreatureKills, type CombatObjective, type CombatNpc } from "@wow-trader/leveling";
import styles from "./leveling-xp-budget.module.css";

export function LevelingCombatTargets({
  objectives,
  npcs,
  referenceLevel,
  partySize,
  environment = "outdoor",
}: {
  readonly objectives: readonly CombatObjective[];
  readonly npcs: readonly CombatNpc[];
  readonly referenceLevel: number;
  readonly partySize: number;
  readonly environment?: "outdoor" | "dungeon";
}): React.JSX.Element | null {
  const useful = objectives.filter((objective) => objective.npcIds.length > 0);
  if (!useful.length) return null;
  return (
    <details className={styles.budget} data-combat-targets="true">
      <summary>Target levels &amp; required combat XP</summary>
      <p>
        Level {referenceLevel} preview ·{" "}
        {partySize === 1 ? "Solo" : `${partySize} players · 1/${partySize} solo kill XP each`} · no
        rested XP. Objective estimates below are independent; overlapping kills are counted once in
        the route forecast.
      </p>
      <ul className={styles.rewards}>
        {useful.map((objective) => {
          const creatures = npcs.filter((npc) => objective.npcIds.includes(npc.id));
          const npc = creatures.length === 1 ? creatures[0] : undefined;
          const estimate =
            npc && objective.credit === "shared-kills" && objective.requiredKills !== null
              ? estimateCreatureKills({
                  npc,
                  kills: objective.requiredKills,
                  position: { level: referenceLevel, currentXp: 0 },
                  partySize,
                  environment,
                })
              : null;
          return (
            <li key={`${objective.questId}-${objective.objectiveIndex}`}>
              {creatures.map((creature, index) => (
                <span key={creature.id}>
                  {index > 0 && ", "}
                  <a
                    href={`https://www.wowhead.com/forever/npc=${creature.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {creature.name}
                  </a>
                  {" · "}
                  {creature.minimumLevel === null || creature.maximumLevel === null
                    ? "level unknown"
                    : `level ${creature.minimumLevel}${creature.maximumLevel !== creature.minimumLevel ? `–${creature.maximumLevel}` : ""}`}
                </span>
              ))}
              <small>
                {objective.requiredKills === null
                  ? "Required kills unresolved"
                  : `${objective.requiredKills} shared kills`}
                {" · "}
                {estimate?.xp === null || !estimate
                  ? "Combat XP unmeasured"
                  : `${estimate.xp.toLocaleString("en-US")}${estimate.maximumXp !== estimate.xp ? `–${estimate.maximumXp!.toLocaleString("en-US")}` : ""} XP per player · historical estimate`}
              </small>
              {(objective.reason || estimate?.reason) && (
                <small>{objective.reason ?? estimate?.reason}</small>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
