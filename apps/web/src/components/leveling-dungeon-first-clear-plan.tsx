"use client";

import { DUNGEON_FIRST_CLEAR_CIRCUIT, type DungeonFinishId } from "@wow-trader/leveling";
import styles from "./leveling-dungeon-finish.module.css";

interface FirstClearPlanProps {
  readonly selected: DungeonFinishId;
  readonly disabled: boolean;
  readonly onSelect: (id: DungeonFinishId) => void;
}

export function DungeonFirstClearPlan({
  selected,
  disabled,
  onSelect,
}: FirstClearPlanProps): React.JSX.Element {
  return (
    <section className={styles.firstClear} aria-label="55–60 first-clear circuit">
      <h3>8 first clears · 55 → 60</h3>
      <p>
        Clear each dungeon once with its eligible quests. The BRD run from the previous chapter
        counts. Continue with the remaining wings; extra outdoor questing and repeat runs are
        optional.
      </p>
      <ol className={styles.circuit}>
        {DUNGEON_FIRST_CLEAR_CIRCUIT.map((option) => (
          <li key={option.id} data-first-clear={option.id}>
            <button
              type="button"
              disabled={disabled}
              aria-pressed={selected === option.id}
              onClick={() => onSelect(option.id)}
            >
              {option.name}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
