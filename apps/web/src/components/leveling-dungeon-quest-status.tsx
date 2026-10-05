"use client";

import { useState } from "react";
import { dungeonQuestStates, type DungeonQuestState } from "@wow-trader/leveling";
import styles from "./leveling-dungeon-alternative.module.css";

interface QuestStatusProps {
  readonly title: string;
  readonly state: DungeonQuestState;
  readonly action: "prepare" | "clear" | "reward";
  readonly disabled: boolean;
  readonly onChange: (state: DungeonQuestState) => void;
}
const labels: Readonly<Record<DungeonQuestState, string>> = {
  unknown: "Not confirmed",
  "not-started": "Not started",
  accepted: "In my quest log",
  "objectives-complete": "Objectives complete · not handed in",
  rewarded: "Handed in",
  abandoned: "Abandoned",
};
export function LevelingDungeonQuestStatus({
  title,
  state,
  action,
  disabled,
  onChange,
}: QuestStatusProps): React.JSX.Element {
  const [undo, setUndo] = useState<{
    readonly previous: DungeonQuestState;
    readonly next: DungeonQuestState;
  } | null>(null);
  const target =
    action === "reward"
      ? "rewarded"
      : action === "clear" && state === "accepted"
        ? "objectives-complete"
        : "accepted";
  const canAct =
    state !== "rewarded" &&
    (action === "reward" ||
      (action === "clear"
        ? state !== "objectives-complete"
        : state !== "accepted" && state !== "objectives-complete"));
  function change(next: DungeonQuestState): void {
    setUndo({ previous: state, next });
    onChange(next);
  }
  return (
    <div className={styles.questStatus}>
      <span className={styles.badge}>{labels[state]}</span>
      {canAct && (
        <div className={styles.actions}>
          <button
            type="button"
            disabled={disabled}
            aria-label={`${target === "rewarded" ? "Confirm hand-in" : target === "objectives-complete" ? "Confirm objectives complete" : "Confirm acceptance"}: ${title}`}
            onClick={() => change(target)}
          >
            {target === "rewarded"
              ? "I handed it in"
              : target === "objectives-complete"
                ? "Objectives complete"
                : "I accepted it"}
          </button>
        </div>
      )}
      {undo && state === undo.next && (
        <button
          type="button"
          disabled={disabled}
          className={styles.undoAction}
          aria-label={`Undo quest status: ${title}`}
          onClick={() => {
            onChange(undo.previous);
            setUndo(null);
          }}
        >
          Undo status change
        </button>
      )}
      <details>
        <summary>Change status</summary>
        <label>
          {title} game state
          <select
            value={state}
            disabled={disabled}
            onChange={(event) => {
              const next = dungeonQuestStates.find((value) => value === event.target.value);
              if (next) change(next);
            }}
          >
            {dungeonQuestStates.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
        </label>
      </details>
    </div>
  );
}
