import { z } from "zod";

export const referenceTaskSchema = z
  .object({
    game: z.enum(["tbc", "forever"]),
    kind: z.enum(["item", "quest"]),
    id: z.number().int().positive().max(2_147_483_647),
  })
  .strict();
export type ReferenceTask = z.infer<typeof referenceTaskSchema>;

const relationSchema = z.object({
  relation: z.string().min(1).max(80),
  kind: z.enum(["npc", "quest", "spell", "item", "object"]),
  id: z.number().int().positive(),
  name: z.string().min(1).max(300),
});

export const referenceRecordSchema = referenceTaskSchema
  .extend({
    schema: z.literal("wowhead-reference.v1"),
    name: z.string().min(1).max(300),
    sourceUrl: z.url().refine((value) => new URL(value).origin === "https://www.wowhead.com"),
    capturedAt: z.iso.datetime(),
    permissionRef: z.string().min(1).max(300),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    tooltipLines: z.array(z.string().min(1).max(2000)).max(200),
    numericFacts: z.record(z.string().max(80), z.number().finite()),
    quickFacts: z.array(z.string().max(2000)).max(100),
    objectives: z.array(z.string().max(4000)).max(100),
    description: z.string().max(16000),
    rewards: z.array(z.string().max(4000)).max(100),
    relations: z.array(relationSchema).max(2000),
  })
  .strict()
  .superRefine((record, context) => {
    const url = new URL(record.sourceUrl);
    const expected = `/${record.game}/${record.kind}=${record.id}`;
    if (
      !(url.pathname === expected || url.pathname.startsWith(`${expected}/`)) ||
      url.search ||
      url.hash
    ) {
      context.addIssue({
        code: "custom",
        message: "Reference edition or entity identity mismatch",
      });
    }
  });
export type ReferenceRecord = z.infer<typeof referenceRecordSchema>;

export const referenceIndexSchema = z
  .object({
    schema: z.literal("wowhead-reference-index.v1"),
    publishedAt: z.iso.datetime(),
    records: z
      .array(
        referenceTaskSchema
          .extend({
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            capturedAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(100000),
  })
  .strict();
export type ReferenceIndex = z.infer<typeof referenceIndexSchema>;

export function referenceKey(task: ReferenceTask): string {
  return `${task.game}-${task.kind}-${task.id}`;
}

export function referenceUrl(task: ReferenceTask): string {
  return `https://www.wowhead.com/${task.game}/${task.kind}=${task.id}`;
}

export function referenceQualityGaps(record: ReferenceRecord): string[] {
  const gaps: string[] = [];
  if (/^(?:Item|Quest)\s*#?\d+$/i.test(record.name)) gaps.push("placeholder_name");
  if (record.kind === "item") {
    const itemClass = record.numericFacts.classId;
    if (itemClass === undefined) gaps.push("missing_item_classification");
    if (record.tooltipLines.length < ([2, 4].includes(itemClass ?? -1) ? 3 : 1))
      gaps.push("missing_item_tooltip");
    if (
      record.tooltipLines.some((line) =>
        /\$(?:s|m|d)\d|(?:stats|properties).*(?:hidden|unknown)/i.test(line),
      )
    )
      gaps.push("unresolved_item_details");
    if (!record.relations.length) gaps.push("missing_acquisition_or_use_context");
  } else {
    if (!record.objectives.length) gaps.push("missing_quest_objectives");
    if (!record.quickFacts.some((fact) => /(?:Requires level|Level:)/i.test(fact)))
      gaps.push("missing_quest_requirements");
    if (!record.relations.some((relation) => relation.relation === "start"))
      gaps.push("missing_quest_giver");
    if (!record.rewards.length) gaps.push("missing_quest_rewards");
  }
  return gaps;
}

export function referenceIsFresh(
  record: Pick<ReferenceRecord, "game" | "capturedAt">,
  now = Date.now(),
): boolean {
  const age = now - Date.parse(record.capturedAt);
  return age >= -300000 && age <= (record.game === "forever" ? 14 : 90) * 86400000;
}
