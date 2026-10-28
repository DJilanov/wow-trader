"use client";

import { useId, useState } from "react";
import {
  PREMADE_STOPS,
  ORDINARY_DUNGEON_XP_MULTIPLIER,
  getPremadeQuest,
  premadeEntryLevel,
  selectedPremadeQuests,
  setPremadeQuestPackage,
  resolveQuestReward,
  premadeQuestSelected,
  type PremadeProgress,
  type QuestRewardFact,
} from "@wow-trader/leveling";
import styles from "./leveling-experience.module.css";
import packageStyles from "./leveling-dungeon-quest-package.module.css";

interface QuestPackageProps {
  readonly stopId?: string;
  readonly progress: PremadeProgress;
  readonly rewardFacts: readonly QuestRewardFact[];
  readonly disabled: boolean;
  readonly onChange: (progress: PremadeProgress) => void;
}
export function LevelingDungeonQuestPackage({
  stopId,
  progress,
  rewardFacts,
  disabled,
  onChange,
}: QuestPackageProps): React.JSX.Element | null {
  const id = useId();
  const stops = PREMADE_STOPS.filter((stop) =>
    stop.quests.some((quest) => quest.role === "opportunistic"),
  );
  const [selected, setSelected] = useState("gnomeregan");
  const stop = PREMADE_STOPS.find((entry) => entry.id === (stopId ?? selected));
  if (!stop || !stop.quests.length) return null;
  const choices = selectedPremadeQuests(stop, progress);
  const optional = stop.quests.filter((quest) => quest.role === "opportunistic");
  const full =
    optional.length > 0 && optional.every((quest) => premadeQuestSelected(quest, progress));
  const core = optional.every((quest) => !premadeQuestSelected(quest, progress));
  const level = premadeEntryLevel(stop, progress, rewardFacts);
  return (
    <details className={packageStyles.package}>
      <summary>
        Dungeon quest package · {choices.length} selected
        {stopId ? "" : " · core or full quest plan"}
      </summary>
      {!stopId && (
        <div className={styles.field}>
          <label htmlFor={`${id}-dungeon`}>Dungeon quest package</label>
          <select
            id={`${id}-dungeon`}
            value={selected}
            onChange={(event): void => setSelected(event.target.value)}
          >
            {stops.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <h3>{stop.name}</h3>
      <p>
        {choices.length} selected quests;{" "}
        {optional.filter((quest) => !premadeQuestSelected(quest, progress)).length} separate /
        excluded quests. Ordinary collection quests are included by default. These rewards are per
        player and exclude dungeon kills.
      </p>
      {optional.length > 0 && (
        <div
          className={packageStyles.modes}
          role="group"
          aria-label={`${stop.name} quest selection`}
        >
          <button
            type="button"
            aria-pressed={core}
            disabled={disabled}
            onClick={(): void => onChange(setPremadeQuestPackage(stop, progress, false))}
          >
            Speed core
          </button>
          <button
            type="button"
            aria-pressed={full}
            disabled={disabled}
            onClick={(): void => onChange(setPremadeQuestPackage(stop, progress, true))}
          >
            Core + all listed optional quests
          </button>
        </div>
      )}
      <p className={styles.muted}>
        Some quests need prior hand-ins, personal drops or another visit. Deferred and raid-only
        goals remain separate.
      </p>
      <div className={packageStyles.rows} aria-label={`${stop.name} XP at level ${level}`}>
        {choices.map((choice) => {
          const quest = getPremadeQuest(choice.questId);
          const fact = rewardFacts.find((entry) => entry.questId === choice.questId);
          const reward = resolveQuestReward(choice.questId, level, rewardFacts);
          const base = fact?.referenceBaseXp ?? quest?.baseXp ?? quest?.referenceXp;
          const observed = fact?.evidenceKind === "observed-forever";
          const coefficient =
            reward.basis === "base-estimate"
              ? ORDINARY_DUNGEON_XP_MULTIPLIER
              : fact?.pageMultiplier && fact.pageMultiplier > 1
                ? fact.pageMultiplier
                : null;
          return (
            <div
              key={choice.questId}
              className={packageStyles.row}
              data-dungeon-reward={choice.questId}
            >
              <a
                href={`https://www.wowhead.com/forever/quest=${choice.questId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {quest?.title ?? `Quest ${choice.questId}`}
              </a>
              <span>
                {observed
                  ? "Observed reward"
                  : base != null && coefficient !== null
                    ? `${base.toLocaleString("en-US")} table XP × ${coefficient}`
                    : "See reward source"}
              </span>
              <strong>
                {reward.xp === null
                  ? "Unknown"
                  : `${reward.basis === "base-estimate" ? "≈" : ""}${reward.xp.toLocaleString("en-US")} XP`}
              </strong>
              <small>
                {reward.basis === "base-estimate"
                  ? "Planning estimate"
                  : observed
                    ? "In-game evidence"
                    : "Scaled page reference"}{" "}
                · hand-in level {level}
              </small>
            </div>
          );
        })}
      </div>
      <p className={styles.muted}>
        Unscaled table rewards use {ORDINARY_DUNGEON_XP_MULTIPLIER}× with rounding. Page-specific
        coefficients are retained; already-scaled and observed rewards are never boosted again.
        Overlevel reductions and eligibility still apply, and later hand-ins can give less XP.
      </p>
    </details>
  );
}
