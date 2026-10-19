"use client";

import { useState, type FormEvent } from "react";
import {
  dungeonBundleSchema,
  forecastDungeonBundle,
  resolveQuestReward,
  updateDungeonBundleSlot,
  type DungeonBundle,
  type QuestRewardFact,
} from "@wow-trader/leveling";
import { LevelingEntityLinks } from "./leveling-entity-links";
import styles from "./leveling-premade.module.css";

interface DungeonBundleProps {
  readonly bundle: DungeonBundle;
  readonly dungeonName: string;
  readonly disabled: boolean;
  readonly rewardFacts?: readonly QuestRewardFact[];
  readonly onChange: (bundle: DungeonBundle) => void;
}

export function LevelingDungeonBundle({
  bundle,
  dungeonName,
  disabled,
  rewardFacts = [],
  onChange,
}: DungeonBundleProps): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const forecast = forecastDungeonBundle(bundle, null, {}, (questId, level) =>
    resolveQuestReward(questId, level, rewardFacts),
  );
  function saveLevel(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("planningQuestLevel");
    const parsed = dungeonBundleSchema.safeParse({
      ...bundle,
      planningQuestLevel: typeof value === "string" && value.trim() ? Number(value) : Number.NaN,
    });
    if (!parsed.success) {
      setError("Planning quest level must be a whole number from 1 to 60.");
      return;
    }
    setError(null);
    onChange(parsed.data);
  }
  return (
    <section className={styles.party} aria-label={`${dungeonName} guaranteed quest bundle`}>
      <h3>Four guaranteed quests · {bundle.faction}</h3>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={bundle.included}
          disabled={disabled}
          onChange={(event) =>
            onChange(dungeonBundleSchema.parse({ ...bundle, included: event.target.checked }))
          }
        />
        <span>Include {dungeonName} in the planning route</span>
      </label>
      <p>
        All four are selected by default. Their availability is owner-confirmed; unidentified IDs,
        pickups and objectives remain pending. Uncheck any slot to skip it. Planning rewards never
        change actual XP or mark a quest complete.
      </p>
      <form key={bundle.planningQuestLevel} onSubmit={saveLevel} className={styles.xpRow}>
        <label>
          Planning quest level
          <input
            type="number"
            name="planningQuestLevel"
            min={1}
            max={60}
            step={1}
            defaultValue={bundle.planningQuestLevel}
            required
            disabled={disabled || !bundle.included}
            aria-label={`${dungeonName} planning quest level`}
          />
        </label>
        <button type="submit" disabled={disabled || !bundle.included}>
          Update planning level
        </button>
      </form>
      {error && (
        <p role="alert" className={styles.warning}>
          {error}
        </p>
      )}
      <p>
        Quest level is not a pickup minimum or entry requirement. Estimated XP uses the extracted
        Dalaran reward tier × 2.375 once, with hand-in-level reductions. Collected real quest
        rewards replace estimates without another multiplier.
      </p>
      <ul>
        {bundle.slots.map((slot) => {
          const row = forecast.rows.find((entry) =>
            entry.slotKey.endsWith(`:quest-${slot.index}`),
          )!;
          return (
            <li key={slot.index} data-bundle-slot={row.slotKey}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={slot.selected}
                  disabled={disabled || !bundle.included}
                  onChange={(event) =>
                    onChange(
                      updateDungeonBundleSlot(bundle, slot.index, {
                        selected: event.target.checked,
                      }),
                    )
                  }
                />
                <span>
                  Quest slot {slot.index} ·{" "}
                  {slot.questId === null ? "ID pending" : `Quest ${slot.questId}`}
                  {" · "}
                  {!slot.selected
                    ? "skipped"
                    : row.xp === null
                      ? "XP unresolved"
                      : `${row.xp.toLocaleString("en-US")} ${row.basis === "base-estimate" ? "estimated" : "reference"} XP`}
                </span>
              </label>
              {slot.questId !== null && <LevelingEntityLinks kind="quest" id={slot.questId} />}
            </li>
          );
        })}
      </ul>
      <strong>
        {bundle.included ? bundle.slots.filter((slot) => slot.selected).length : 0}/4 selected ·{" "}
        {(forecast.referenceXp + forecast.estimatedXp).toLocaleString("en-US")} planning quest XP /
        player
        {forecast.unknownSlotKeys.length > 0 ? " + unresolved real rewards" : ""}
      </strong>
      <p>
        No fake quest IDs or completion instructions are generated. You may skip the entire dungeon
        and continue using your actual XP bar.
      </p>
    </section>
  );
}
