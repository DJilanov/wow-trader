"use client";

import { useState } from "react";
import {
  LEVELING_RACES,
  classSlugs,
  recordPremadeMemberIdentity,
  type ClassSlug,
  type PremadeProgress,
  type RaceId,
} from "@wow-trader/leveling";
import styles from "./leveling-premade.module.css";

interface PartyIdentityProps {
  readonly progress: PremadeProgress;
  readonly disabled: boolean;
  readonly leader?: { readonly raceId: RaceId; readonly classSlug: ClassSlug | null };
  readonly onChange: (progress: PremadeProgress) => void;
}

export function LevelingPartyIdentity({
  progress,
  disabled,
  leader,
  onChange,
}: PartyIdentityProps): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const races = LEVELING_RACES.filter((race) => race.faction === "alliance");
  function change(index: number, raceId: RaceId | null, classSlug: ClassSlug | null): void {
    try {
      onChange(recordPremadeMemberIdentity(progress, index, { raceId, classSlug }));
      setError(null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Party identity could not be saved.");
    }
  }
  return (
    <section className={styles.party} aria-label="Party race and class context">
      <h3>Party race and class</h3>
      <p>
        Unknown members stay unverified. These settings match quest restrictions and reviewed
        evidence; they never change actual XP or quest progress.
      </p>
      {progress.members.map((member, index) => {
        if (index === 0 && leader)
          return (
            <p key={index}>
              Player 1 · {races.find((race) => race.id === leader.raceId)?.name ?? leader.raceId} ·{" "}
              {leader.classSlug ?? "class unknown"} (selected route edition)
            </p>
          );
        const race = races.find((candidate) => candidate.id === member.raceId);
        const classes = race?.classes ?? classSlugs;
        return (
          <fieldset key={index} className={styles.identityRow} disabled={disabled}>
            <legend>Player {index + 1}</legend>
            <label>
              Race
              <select
                aria-label={`Player ${index + 1} race`}
                value={member.raceId ?? ""}
                onChange={(event) => {
                  const nextRace = races.find((candidate) => candidate.id === event.target.value);
                  const nextClass =
                    member.classSlug && (!nextRace || nextRace.classes.includes(member.classSlug))
                      ? member.classSlug
                      : null;
                  change(index, nextRace?.id ?? null, nextClass);
                }}
              >
                <option value="">Unknown</option>
                {races.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Class
              <select
                aria-label={`Player ${index + 1} class`}
                value={member.classSlug ?? ""}
                onChange={(event) =>
                  change(
                    index,
                    member.raceId ?? null,
                    classes.find((value) => value === event.target.value) ?? null,
                  )
                }
              >
                <option value="">Unknown</option>
                {classes.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        );
      })}
      {error && (
        <p className={styles.warning} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
