"use client";

import type { ReactNode, MouseEvent } from "react";
import styles from "./leveling-experience.module.css";

interface LevelingQuestCardProps {
  readonly id: string;
  readonly title: string;
  readonly selectionLabel: string;
  readonly selected: boolean;
  readonly done: boolean;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
  readonly leading: ReactNode;
  readonly meta: ReactNode;
  readonly progress: ReactNode;
  readonly children: ReactNode;
}

export function LevelingQuestCard({
  id,
  title,
  selectionLabel,
  selected,
  done,
  disabled = false,
  onSelect,
  leading,
  meta,
  progress,
  children,
}: LevelingQuestCardProps): React.JSX.Element {
  function selectBackground(event: MouseEvent<HTMLLIElement>): void {
    if (disabled || !(event.target instanceof Element)) return;
    if (event.target.closest("a, button, input, select, textarea, label, summary, details")) return;
    if (window.getSelection()?.toString()) return;
    onSelect();
  }
  return (
    <li
      id={id}
      className={`${styles.questCard} ${selected ? styles.selectedStep : ""} ${done ? styles.doneStep : ""}`}
      data-reader-step={id}
      data-selected={selected}
      onClick={selectBackground}
    >
      {leading}
      <div className={styles.stepContent}>
        <div className={styles.stepMeta}>{meta}</div>
        <h3>
          <button
            className={styles.stepSelect}
            type="button"
            aria-label={`${selectionLabel}: ${title}`}
            aria-controls="leveling-zone-map"
            aria-pressed={selected}
            disabled={disabled}
            onClick={onSelect}
          >
            {title}
          </button>
        </h3>
        {children}
      </div>
      {progress}
    </li>
  );
}
