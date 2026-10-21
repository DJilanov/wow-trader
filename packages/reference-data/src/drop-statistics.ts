import { dropStatisticsSchema, type DropStatistics } from "./contracts.js";

/** Source-style sample ratios are estimates, not quest-conditioned or current-build rates. */
export function normalizeDropStatistics(statistics: DropStatistics): DropStatistics {
  const stats = dropStatisticsSchema.parse(statistics);
  if (
    stats.percent !== null ||
    stats.drops === null ||
    stats.attempts === null ||
    stats.drops <= 0 ||
    stats.drops > stats.attempts ||
    (stats.minimumQuantity !== null && stats.minimumQuantity !== 1) ||
    (stats.maximumQuantity !== null && stats.maximumQuantity !== 1) ||
    stats.quantityDistribution?.some((entry) => entry.percent > 0 && entry.quantity !== 1)
  )
    return stats;
  return { ...stats, percent: (stats.drops / stats.attempts) * 100, percentBasis: "sample-ratio" };
}

export function parseDropStatistics(
  row: Readonly<Record<string, unknown>>,
): DropStatistics | undefined {
  if (
    !["percent", "percentOverride", "count", "outof", "stack", "pctstack"].some((key) =>
      Object.hasOwn(row, key),
    )
  )
    return undefined;
  const integer = (value: unknown, minimum: number): number | null =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= minimum ? value : null;
  for (const value of [row.percent, row.percentOverride])
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100)
    )
      throw new Error("Invalid reported drop percentage");
  const stack = Array.isArray(row.stack) && row.stack.length === 2 ? row.stack : [];
  let quantityDistribution: DropStatistics["quantityDistribution"];
  if (row.pctstack !== undefined && row.pctstack !== null) {
    if (typeof row.pctstack !== "string" || row.pctstack.length > 16000)
      throw new Error("Unsupported drop stack distribution");
    const parsed: unknown = JSON.parse(row.pctstack);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Invalid drop stack distribution");
    quantityDistribution = dropStatisticsSchema.shape.quantityDistribution.unwrap().parse(
      Object.entries(parsed).map(([quantity, percent]) => ({
        quantity: Number(quantity),
        percent,
      })),
    );
  }
  const quantities = quantityDistribution
    ?.filter((entry) => entry.percent > 0)
    .map((entry) => entry.quantity);
  const minimumQuantity =
    integer(stack[0], 1) ?? (quantities?.length ? Math.min(...quantities) : null);
  const maximumQuantity =
    integer(stack[1], 1) ?? (quantities?.length ? Math.max(...quantities) : null);
  if (quantities?.some((quantity) => quantity < minimumQuantity! || quantity > maximumQuantity!))
    throw new Error("Drop stack bounds conflict with the quantity distribution");
  // The source renderer overloads count as a percentage only with an explicit zero denominator.
  const encodedPercent =
    row.outof === 0 &&
    typeof row.count === "number" &&
    Number.isFinite(row.count) &&
    row.count >= 0 &&
    row.count <= 100
      ? row.count
      : null;
  return normalizeDropStatistics(
    dropStatisticsSchema.parse({
      percent: row.percentOverride ?? row.percent ?? encodedPercent,
      ...(row.percentOverride == null ? {} : { percentBasis: "reported-override" }),
      ...(row.percentOverride == null && row.percent == null && encodedPercent !== null
        ? { percentBasis: "reported" }
        : {}),
      ...(quantityDistribution ? { quantityDistribution } : {}),
      drops: row.outof === 0 ? null : integer(row.count, 0),
      attempts: integer(row.outof, 1),
      minimumQuantity,
      maximumQuantity,
    }),
  );
}
