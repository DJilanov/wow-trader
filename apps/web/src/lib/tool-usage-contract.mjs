import { z } from "zod";

const action = z.enum([
  "leveling_setup_saved",
  "talent_build_saved",
  "market_item_watched",
  "crafting_calculation_loaded",
  "simulation_completed",
]);
const edition = z.enum(["forever", "tbc"]);
const device = z.enum(["mobile", "desktop"]);
export const toolUsageBuildSchema = z.string().regex(/^[A-Za-z0-9._-]{1,80}$/);
export const toolUsageDateSchema = z
  .string()
  .regex(/^20\d{2}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });

export const toolUsageEventSchema = z
  .object({
    schema: z.literal("tool-usage.v1"),
    build: toolUsageBuildSchema,
    action,
    edition,
    device,
  })
  .strict()
  .refine(
    (value) =>
      value.edition === "forever" ||
      ["market_item_watched", "crafting_calculation_loaded"].includes(value.action),
    "This action is not implemented for TBC.",
  );

const groupSchema = z
  .object({
    build: toolUsageBuildSchema,
    action,
    edition,
    device,
    count: z.number().int().positive().max(1_000_000),
  })
  .strict();

export const toolUsageAggregateSchema = z
  .object({
    schema: z.literal("tool-usage-aggregate.v1"),
    date: toolUsageDateSchema,
    updatedAt: z.iso.datetime(),
    groups: z.record(z.string().max(160), groupSchema),
  })
  .strict()
  .refine((value) => value.updatedAt.startsWith(value.date), "Aggregate date mismatch.")
  .refine((value) => Object.keys(value.groups).length <= 256, "Too many daily groups.")
  .refine(
    (value) =>
      Object.entries(value.groups).every(([key, group]) => key === toolUsageGroupKey(group)),
    "Invalid aggregate group key.",
  )
  .refine(
    (value) =>
      Object.values(value.groups).reduce((sum, group) => sum + group.count, 0) <= 1_000_000,
    "Daily action limit exceeded.",
  );

/**
 * @param {Pick<import('zod').infer<typeof groupSchema>, 'build'|'edition'|'action'|'device'>} group
 * @returns {string}
 */
export function toolUsageGroupKey(group) {
  return `${group.build}|${group.edition}|${group.action}|${group.device}`;
}

/**
 * @param {import('zod').infer<typeof toolUsageAggregateSchema> | null} existing
 * @param {import('zod').infer<typeof toolUsageEventSchema>} input
 * @param {Date} now
 * @returns {import('zod').infer<typeof toolUsageAggregateSchema>}
 */
export function addToolUsage(existing, input, now) {
  const event = toolUsageEventSchema.parse(input);
  const date = toolUsageDateSchema.parse(now.toISOString().slice(0, 10));
  const previous = existing ? toolUsageAggregateSchema.parse(existing) : null;
  if (previous && previous.date !== date) throw new Error("Aggregate date mismatch.");
  const key = toolUsageGroupKey(event);
  return toolUsageAggregateSchema.parse({
    schema: "tool-usage-aggregate.v1",
    date,
    updatedAt: `${now.toISOString().slice(0, 16)}:00.000Z`,
    groups: {
      ...previous?.groups,
      [key]: {
        build: event.build,
        action: event.action,
        edition: event.edition,
        device: event.device,
        count: (previous?.groups[key]?.count ?? 0) + 1,
      },
    },
  });
}
