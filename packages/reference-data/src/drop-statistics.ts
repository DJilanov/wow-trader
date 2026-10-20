import { dropStatisticsSchema, type DropStatistics } from "./contracts.js";

/** Preserve explicit page values. Counts can include stacks, so count/outof is not a drop rate. */
export function parseDropStatistics(
  row: Readonly<Record<string, unknown>>,
): DropStatistics | undefined {
  if (!["percent", "count", "outof", "stack"].some((key) => Object.hasOwn(row, key)))
    return undefined;
  const integer = (value: unknown, minimum: number): number | null =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= minimum ? value : null;
  if (
    row.percent !== undefined &&
    (typeof row.percent !== "number" ||
      !Number.isFinite(row.percent) ||
      row.percent < 0 ||
      row.percent > 100)
  )
    throw new Error("Invalid reported drop percentage");
  const stack = Array.isArray(row.stack) && row.stack.length === 2 ? row.stack : [];
  return dropStatisticsSchema.parse({
    percent: row.percent ?? null,
    drops: integer(row.count, 0),
    attempts: integer(row.outof, 1),
    minimumQuantity: integer(stack[0], 1),
    maximumQuantity: integer(stack[1], 1),
  });
}
