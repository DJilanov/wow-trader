import {
  advanceCombatPosition,
  type CombatKillEstimate,
  type CombatXpPosition,
} from "./combat-xp.js";
import type { BoundedCombatKillEstimate } from "./campaign-xp-bounds.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

export const DEFAULT_INCIDENTAL_KILL_XP_PERCENT = 10;
export const DEFAULT_OUTDOOR_INCIDENTAL_KILL_XP_PERCENT = 30;

export interface IncidentalCombatEstimate extends CombatKillEstimate {
  readonly incidentalXp?: number;
  readonly maximumIncidentalXp?: number | null;
  readonly requiredBasis?: CombatKillEstimate["basis"];
}

export function validateIncidentalKillXpPercent(percent: number): void {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    throw new Error("Incidental kill XP percentage must be between 0 and 100.");
}

function allowance(xp: number, percent: number, exit?: CombatXpPosition | null): number {
  const extra = Math.floor((xp * percent) / 100);
  if (!exit) return extra;
  let remaining = -exit.currentXp;
  for (let level = exit.level; level < 60; level++) remaining += FOREVER_XP_CURVE[level]!;
  return Math.max(0, Math.min(extra, remaining));
}

export function addIncidentalCombatXp(
  estimate: BoundedCombatKillEstimate,
  percent: number,
): IncidentalCombatEstimate & { readonly maximumExit: CombatXpPosition | null };
export function addIncidentalCombatXp(
  estimate: CombatKillEstimate,
  percent: number,
): IncidentalCombatEstimate;
/** A planning allowance after a required kill batch; it supplies no objective or item credit. */
export function addIncidentalCombatXp(
  estimate: CombatKillEstimate & { readonly maximumExit?: CombatXpPosition | null },
  percent: number,
): IncidentalCombatEstimate & { readonly maximumExit?: CombatXpPosition | null } {
  validateIncidentalKillXpPercent(percent);
  if ("incidentalXp" in estimate)
    throw new Error("An incidental combat allowance cannot be applied twice.");
  if (
    !percent ||
    estimate.xp === null ||
    estimate.maximumXp === null ||
    estimate.maximumExit === null
  )
    return estimate;
  const maximumExit =
    estimate.maximumExit ?? advanceCombatPosition(estimate.exit, estimate.maximumXp - estimate.xp);
  const exitAllowance = allowance(estimate.xp, percent, estimate.exit);
  // Earned-XP and exit bounds are marginal. Cap room is smallest at the upper exit.
  const incidentalXp = allowance(estimate.xp, percent, maximumExit);
  const maximumIncidentalXp = allowance(estimate.maximumXp, percent, estimate.exit);
  if (!incidentalXp && !maximumIncidentalXp) return estimate;
  return {
    ...estimate,
    xp: estimate.xp + incidentalXp,
    maximumXp: estimate.maximumXp + maximumIncidentalXp,
    exit: advanceCombatPosition(estimate.exit, exitAllowance),
    ...(estimate.maximumExit !== undefined
      ? {
          maximumExit: advanceCombatPosition(estimate.maximumExit, maximumIncidentalXp),
        }
      : {}),
    basis: "reference-estimate",
    requiredBasis: estimate.basis,
    incidentalXp,
    maximumIncidentalXp,
  };
}

export function incidentalCombatRowFields(estimate: IncidentalCombatEstimate): {
  readonly incidentalXp?: number;
  readonly maximumIncidentalXp?: number | null;
  readonly requiredBasis?: CombatKillEstimate["basis"];
} {
  return estimate.incidentalXp === undefined
    ? {}
    : {
        incidentalXp: estimate.incidentalXp,
        maximumIncidentalXp: estimate.maximumIncidentalXp ?? null,
        ...(estimate.requiredBasis ? { requiredBasis: estimate.requiredBasis } : {}),
      };
}

export function incidentalCombatMessage(
  estimate: IncidentalCombatEstimate,
  percent: number,
): string | null {
  const minimum = estimate.incidentalXp ?? 0;
  const maximum = estimate.maximumIncidentalXp ?? minimum;
  if (!minimum && !maximum) return null;
  const amount = maximum === minimum ? String(minimum) : `${minimum}–${maximum}`;
  return `Includes ${amount} estimated incidental combat XP (${percent}% of required kill XP). This planning allowance gives no additional quest or item credit.`;
}
