import { z } from "zod";

const buildSource = z
  .object({
    build: z.number().int().positive(),
    sourceUrl: z.string().url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const pageSource = z
  .object({
    kind: z.literal("wowhead-forever-reference"),
    sourceUrl: z.url().refine((value) => {
      try {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          ["wowhead.com", "www.wowhead.com"].includes(url.hostname) &&
          url.pathname.startsWith("/forever/") &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    }, "Creature page references must use Wowhead Forever."),
    extractSha256: z.string().regex(/^[a-f0-9]{64}$/),
    referencedAt: z.iso.datetime(),
    retrieval: z.literal("primary-page-search-extract"),
  })
  .strict();

const source = z.union([buildSource, pageSource]);

const ownerLevelSource = z
  .object({
    kind: z.literal("owner-confirmed-creature-level"),
    statement: z.string().trim().min(1).max(2000),
    confirmedOn: z.iso.date(),
  })
  .strict();

/** Static planning metadata from attributed creature records; never controlled kill-XP evidence. */
const sourcedMetadata = z
  .object({
    npcId: z.number().int().positive().max(10_000_000),
    name: z.string().trim().min(1).max(300),
    minimumLevel: z.number().int().min(1).max(100),
    maximumLevel: z.number().int().min(1).max(100),
    rank: z.number().int().min(0).max(5),
    levelSource: source,
    rankSource: source,
    attribution: z.string().trim().min(1).max(2000),
    limitation: z.string().trim().min(1).max(2000),
  })
  .strict()
  .refine(
    (reference) => reference.minimumLevel <= reference.maximumLevel,
    "Reversed creature metadata level range",
  );

const ownerLevelMetadata = z
  .object({
    npcId: z.number().int().positive().max(10_000_000),
    name: z.string().trim().min(1).max(300),
    minimumLevel: z.number().int().min(1).max(100),
    maximumLevel: z.number().int().min(1).max(100),
    rank: z.null(),
    levelSource: ownerLevelSource,
    rankSource: z.null(),
    attribution: z.string().trim().min(1).max(2000),
    limitation: z.string().trim().min(1).max(2000),
  })
  .strict()
  .refine(
    (reference) => reference.minimumLevel === reference.maximumLevel,
    "An owner level confirmation must name one exact level",
  );

export const combatNpcMetadataReferenceSchema = z.union([sourcedMetadata, ownerLevelMetadata]);

export type CombatNpcMetadataReference = z.infer<typeof combatNpcMetadataReferenceSchema>;
