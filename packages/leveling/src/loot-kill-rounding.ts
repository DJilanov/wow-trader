/** Ignore only arithmetic noise near an integer; this is not a drop-rate uncertainty allowance. */
export function ceilLootKillMean(mean: number): number {
  if (!Number.isFinite(mean) || mean < 0) throw new Error("Invalid mean loot kill count.");
  const nearest = Math.round(mean);
  const tolerance = 8 * Number.EPSILON * Math.max(1, mean);
  return Math.abs(mean - nearest) <= tolerance ? nearest : Math.ceil(mean);
}
