"use client";

import { useMemo, useState } from "react";
import {
  forecastCampaignSteps,
  type CampaignPlan,
  type PremadeProgress,
  type XpPosition,
} from "@wow-trader/leveling";
import styles from "./leveling-xp-budget.module.css";

interface ProjectionProps {
  readonly plan: CampaignPlan;
  readonly progress: PremadeProgress;
  readonly actionId: string;
  readonly currentActionId: string;
}
function bar(value: XpPosition | null): string {
  return value
    ? `level ${value.level} + ${value.currentXp.toLocaleString("en-US")} XP`
    : "unresolved";
}

export function LevelingStepProjection({
  plan,
  progress,
  actionId,
  currentActionId,
}: ProjectionProps): React.JSX.Element {
  const [basis, setBasis] = useState<"route-start" | "actual">("route-start");
  const [open, setOpen] = useState(false);
  const order = plan.actions.map((action) => action.id);
  const currentIndex = order.indexOf(currentActionId),
    selectedIndex = order.indexOf(actionId);
  const canAnchor = currentIndex >= 0 && selectedIndex >= currentIndex;
  const projections = useMemo(
    () =>
      !open || (!canAnchor && basis === "actual")
        ? []
        : forecastCampaignSteps(plan, progress, {
            basis,
            throughActionId: actionId,
            ...(basis === "actual" ? { fromActionId: currentActionId } : {}),
          }),
    [plan, progress, basis, actionId, currentActionId, canAnchor, open],
  );
  const rows = projections.flatMap((player) =>
    player.steps
      .filter((step) => step.actionId === actionId)
      .map((step) => ({ ...step, player: player.player })),
  );
  return (
    <details
      className={styles.budget}
      data-step-projection="true"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Theoretical XP after this step</summary>
      <label>
        Projection starting point
        <select
          value={basis}
          onChange={(event) => setBasis(event.target.value === "actual" ? "actual" : "route-start")}
        >
          <option value="route-start">Route start · level 1, no bonus XP</option>
          <option value="actual">Saved actual XP · from current step</option>
        </select>
      </label>
      <p>
        Outdoor kill XP ×{progress.combatPlanning?.outdoorXpMultiplier ?? 1} · unrested historical
        model, not observed XP. No grinding XP is invented to pass a requirement. Saved bars are
        unchanged.
      </p>
      <p>
        Totals include only resolved inputs; missing kills can add XP. Page drop rates may not
        reflect the current build. Shared objective overlap uses deterministic kill-count scenarios,
        not a joint loot-inventory simulation.
      </p>
      <p>
        Group estimates use level-weighted shares without a party bonus. Other members' levels are
        held at the objective's starting snapshot; exact server tuning remains unverified.
      </p>
      {!plan.combat && (
        <p>
          Combat references are unavailable here. Kill XP is missing, not zero; a quest-only
          shortfall does not mean you need extra grinding.
        </p>
      )}
      {rows.length === 0 ? (
        <p>
          {basis === "actual"
            ? "Record fresh actual XP and select a current or later step."
            : "Earlier missing data or an unmet requirement prevents projecting this step. See the chapter XP breakdown."}
        </p>
      ) : (
        <ul className={styles.rewards}>
          {rows.map((row, index) => (
            <li key={`${row.player}-${row.questId}-${row.phase}-${index}`}>
              <strong>
                Player {row.player} · {row.title} ·{" "}
                {row.phase === "rewarded"
                  ? "hand-in"
                  : row.phase === "accepted"
                    ? "pickup"
                    : "objective"}
              </strong>
              <span>
                {bar(row.before)} → {bar(row.after)}
              </span>
              <small>
                {row.questXp.toLocaleString("en-US")} quest XP +{" "}
                {row.combatXp.toLocaleString("en-US")} modeled kill XP
              </small>
              <small>
                Fast-loot scenario: {bar(row.fastLoot)} · slow-loot scenario: {bar(row.slowLoot)}.
                These use per-objective P10/P90 kill counts, not a guaranteed or route-wide
                confidence interval.
              </small>
              {row.shortfallXp > 0 && (
                <small>
                  Modeled known-XP gap: {row.shortfallXp.toLocaleString("en-US")} XP. Check missing
                  combat/drop data and your actual bar before adding any grind.
                </small>
              )}
            </li>
          ))}
        </ul>
      )}
      {projections.some((player) => player.issues.length > 0) && (
        <p>
          Some inputs are unresolved or theoretical. Missing drop rates, loot sharing and server
          tuning remain explicit data limitations.
        </p>
      )}
    </details>
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
        Default 1× is a theoretical assumption, not the quest-reward multiplier. Dungeon tuning uses
        its separate combat profile. This setting never awards actual XP.
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={disabled}>
        Save combat planning settings
      </button>
    </form>
  );
}
