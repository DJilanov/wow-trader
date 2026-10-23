export type TierBand = "S" | "A" | "B" | "C" | "D";

export function relativeTier(share: number): TierBand {
  if (share >= 95) return "S";
  if (share >= 85) return "A";
  if (share >= 70) return "B";
  if (share >= 55) return "C";
  return "D";
}
