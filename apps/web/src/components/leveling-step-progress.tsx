"use client";

import type { StepProgress } from "../lib/leveling-experience";
import styles from "./leveling-experience.module.css";

interface LevelingStepProgressProps {
  readonly label: string;
  readonly value: StepProgress;
  readonly disabled: boolean;
  readonly onChange: (value: StepProgress) => void;
}

export function LevelingStepProgress({
  label,
  value,
  disabled,
  onChange,
}: LevelingStepProgressProps): React.JSX.Element {
  return (
    <div className={styles.stepStatus}>
      <label className={styles.completionControl}>
        <input
          type="checkbox"
          checked={value === "done"}
          disabled={disabled}
          aria-label={`Mark ${label} complete`}
          onChange={(event) => onChange(event.target.checked ? "done" : "pending")}
        />
        <span>
          {value === "done" ? "Finished" : value === "skipped" ? "Skipped" : "Finish step"}
        </span>
      </label>
      <button
        className={styles.skipStep}
        type="button"
        aria-label={`Skip ${label}`}
        aria-pressed={value === "skipped"}
        disabled={disabled}
        onClick={() => onChange(value === "skipped" ? "pending" : "skipped")}
      >
        {value === "skipped" ? "Undo skip" : "Skip instead"}
      </button>
    </div>
  );
}
