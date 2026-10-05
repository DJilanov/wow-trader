"use client";

import Link from "next/link";
import type { DungeonCarryover, DungeonReplacementPlan } from "@wow-trader/leveling";
import { LevelingEntityLinks } from "./leveling-entity-links";
import styles from "./leveling-dungeon-alternative.module.css";

interface PreparationProps {
  readonly quests: readonly DungeonCarryover[];
  readonly reviewed: DungeonReplacementPlan["carryover"];
  readonly enabled: boolean;
  readonly outdoorHref: string;
  readonly unresolvedOnly?: boolean;
  readonly onChange: (value: DungeonReplacementPlan["carryover"]) => void;
}
export function LevelingDungeonPreparation({
  quests,
  reviewed,
  enabled,
  outdoorHref,
  unresolvedOnly = false,
  onChange,
}: PreparationProps): React.JSX.Element {
  const unresolved = quests.filter(
    (quest) =>
      reviewed[String(quest.questId)] !== "ready" &&
      !(quest.conditional && reviewed[String(quest.questId)] === "not-needed"),
  );
  const visible = unresolvedOnly ? unresolved : quests;
  return (
    <section aria-label="Outdoor quest preparation" className={styles.preparation}>
      <p className={styles.note}>
        {unresolved.length
          ? `${unresolved.length} outdoor quest checks remaining.`
          : "Outdoor quest checks reviewed."}{" "}
        These are source-derived carryovers, not a complete server prerequisite list.
      </p>
      {visible.map((quest) => {
        const state = reviewed[String(quest.questId)];
        const ready = state === "ready" || (quest.conditional && state === "not-needed");
        return (
          <div
            className={styles.carryover}
            key={quest.questId}
            data-carryover-quest={quest.questId}
          >
            <strong>
              {quest.title}{" "}
              <span className={styles.badge}>
                {quest.conditional
                  ? "Conditional · check applicability"
                  : "Next chapter uses this quest"}
              </span>
            </strong>
            <Link href={`${outdoorHref}#guide-${quest.sourceStepId}`}>
              Open original preparation step →
            </Link>
            {ready ? (
              <p className={styles.status}>
                {state === "ready"
                  ? "Reviewed · ready to continue in game"
                  : "Reviewed · does not apply to this character"}
              </p>
            ) : (
              <div className={styles.actions}>
                <button
                  type="button"
                  disabled={!enabled}
                  aria-label={`Confirm ${quest.title} carryover ready`}
                  onClick={() => onChange({ ...reviewed, [String(quest.questId)]: "ready" })}
                >
                  Checked · I can continue
                </button>
                {quest.conditional && (
                  <button
                    type="button"
                    disabled={!enabled}
                    aria-label={`Confirm ${quest.title} does not apply`}
                    onClick={() => onChange({ ...reviewed, [String(quest.questId)]: "not-needed" })}
                  >
                    Checked · does not apply
                  </button>
                )}
              </div>
            )}
            <details>
              <summary>{ready ? "Change review" : "Quest reference / review options"}</summary>
              <LevelingEntityLinks kind="quest" id={quest.questId} />
              <button
                type="button"
                disabled={!enabled}
                onClick={() => {
                  const next = { ...reviewed };
                  delete next[String(quest.questId)];
                  onChange(next);
                }}
              >
                Review again
              </button>
            </details>
          </div>
        );
      })}
    </section>
  );
}
