"use client";

import { useState } from "react";
import {
  FOREVER_XP_CURVE,
  type CampaignGuideSection,
  type PremadeProgress,
} from "@wow-trader/leveling";
import { guideBarLabel, guideMembers } from "../lib/leveling-guide-presentation";
import styles from "./leveling-guide.module.css";

export function LevelingStepProjection({
  guide,
  actionId,
}: {
  readonly guide: CampaignGuideSection;
  readonly actionId: string;
}): React.JSX.Element {
  const rows = guideMembers(guide).map((member) => {
    const current = member.steps.filter((step) => step.actionId === actionId);
    const historical =
      guide.planned.members
        .find((row) => row.player === member.player)
        ?.steps.filter((step) => step.actionId === actionId) ?? [];
    const steps = current.length ? current : historical;
    return {
      player: member.player,
      steps,
      endpoint: steps.at(-1)?.after ?? null,
      historical: !current.length && historical.length > 0,
    };
  });
  return (
    <section
      className={styles.step}
      data-step-projection="true"
      aria-label="Expected progress after this step"
    >
      <strong>After this step</strong>
      {rows.map((row) => (
        <div key={row.player}>
          <span>
            {guide.audience === "personal" ? "" : `Player ${row.player} · `}
            {guideBarLabel(row.endpoint)}
          </span>
          {row.endpoint && row.endpoint.level < 60 && (
            <progress
              aria-label={`Player ${row.player} expected progress toward level ${row.endpoint.level + 1}`}
              value={row.endpoint.currentXp}
              max={FOREVER_XP_CURVE[row.endpoint.level]}
            />
          )}
          {row.historical && (
            <small>Route estimate for this earlier step, not your current saved bar.</small>
          )}
        </div>
      ))}
      <details className={styles.details}>
        <summary>Step XP details</summary>
        <p>
          {guide.basis === "saved-update"
            ? "Estimated from your last progress update."
            : "Estimated from your route's starting level."}{" "}
          Recorded XP stays unchanged.
        </p>
        {rows.map((row) => (
          <p key={row.player}>
            {guide.audience === "personal" ? "You" : `Player ${row.player}`}:{" "}
            {row.steps.reduce((sum, step) => sum + step.questXp, 0).toLocaleString("en-US")} quest
            XP
            {guide.missingCombat
              ? " · some kill XP is not available"
              : ` + ${row.steps.reduce((sum, step) => sum + step.combatXp, 0).toLocaleString("en-US")} estimated kill XP`}
            {row.endpoint &&
              ` · ${row.endpoint.currentXp.toLocaleString("en-US")} XP into level ${row.endpoint.level}`}
            .
          </p>
        ))}
      </details>
    </section>
  );
}

interface PlanningSettingsProps {
  readonly progress: PremadeProgress;
  readonly disabled: boolean;
  readonly onChange: (progress: PremadeProgress) => void;
}
export function LevelingCombatPlanningSettings({
  progress,
  disabled,
  onChange,
}: PlanningSettingsProps): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      aria-label="Theoretical combat XP settings"
      onSubmit={(event) => {
        event.preventDefault();
        const raw = new FormData(event.currentTarget).get("multiplier");
        const multiplier = typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
        if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 100) {
          setError("Enter a kill XP multiplier from 0 to 100.");
          return;
        }
        onChange({ ...progress, combatPlanning: { outdoorXpMultiplier: multiplier } });
        setError(null);
      }}
    >
      <label>
        Outdoor kill XP multiplier
        <input
          key={progress.combatPlanning?.outdoorXpMultiplier ?? 1}
          name="multiplier"
          type="number"
          min="0"
          max="100"
          step="any"
          defaultValue={progress.combatPlanning?.outdoorXpMultiplier ?? 1}
          disabled={disabled}
          required
        />
      </label>
      <p>
        Adjust this if your server awards different outdoor kill XP. It does not change quest
        rewards or your recorded progress.
      </p>
      {error && <p role="alert">{error}</p>}
      <button className={styles.button} type="submit" disabled={disabled}>
        Save combat planning settings
      </button>
    </form>
  );
}
