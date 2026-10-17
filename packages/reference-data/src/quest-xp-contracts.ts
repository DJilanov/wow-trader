import { z } from "zod";
import { referenceTaskSchema } from "./contracts.js";

export const QUEST_XP_PARSER_VERSION = "wowhead-quest-xp-20261017-v4";
const level = z.number().int().min(1).max(60);
const xp = z.number().int().min(0).max(1_000_000);
export const questXpRecordSchema = referenceTaskSchema
  .extend({
    kind: z.literal("quest"),
    schema: z.literal("quest-xp-evidence.v1"),
    parserVersion: z.enum([
      "wowhead-quest-xp-20261014-v1",
      "wowhead-quest-xp-20261015-v2",
      "wowhead-quest-xp-20261016-v3",
      QUEST_XP_PARSER_VERSION,
    ]),
    name: z.string().min(1).max(300),
    sourceUrl: z.url(),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: z.iso.datetime(),
    questLevel: level.nullable(),
    minimumLevel: level.nullable(),
    fullXp: xp.nullable(),
    referenceBaseXp: xp.nullable(),
    pageMultiplier: z.number().finite().min(0).max(20).nullable(),
    rendererRevision: z
      .enum([
        "quest-5f36c4ad-core-52d4f803",
        "quest-5f36c4ad-core-97211824",
        "quest-5f36c4ad-core-25318d8a",
        "quest-5f36c4ad-core-154e707b",
      ])
      .nullable(),
    xpByLevel: z.array(z.object({ level, xp }).strict()).max(60),
    status: z.enum(["available", "unknown", "conflict"]),
    issues: z.array(z.string().min(1).max(300)).max(30),
  })
  .strict()
  .superRefine((record, context): void => {
    const url = new URL(record.sourceUrl);
    const path = `/${record.game}/quest=${record.id}`;
    if (
      url.origin !== "https://www.wowhead.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !(url.pathname === path || url.pathname.startsWith(`${path}/`))
    )
      context.addIssue({ code: "custom", message: "Quest XP identity or edition mismatch" });
    if (new Set(record.xpByLevel.map((entry) => entry.level)).size !== record.xpByLevel.length)
      context.addIssue({ code: "custom", message: "Duplicate quest XP level" });
    if (record.status === "available" && record.fullXp === null && !record.xpByLevel.length)
      context.addIssue({ code: "custom", message: "Available XP record has no reward" });
    if (record.status !== "unknown" && record.rendererRevision === null)
      context.addIssue({ code: "custom", message: "Numeric XP requires a verified renderer" });
  });
export type QuestXpRecord = z.infer<typeof questXpRecordSchema>;

export const questXpIndexSchema = z
  .object({
    schema: z.literal("quest-xp-index.v1"),
    publishedAt: z.iso.datetime(),
    records: z
      .array(
        z
          .object({
            game: z.enum(["tbc", "forever"]),
            id: z.number().int().positive(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            capturedAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict()
  .superRefine((value, context): void => {
    if (
      new Set(value.records.map((entry) => `${entry.game}:${entry.id}`)).size !==
      value.records.length
    )
      context.addIssue({ code: "custom", message: "Duplicate quest XP record" });
  });
export type QuestXpIndex = z.infer<typeof questXpIndexSchema>;
