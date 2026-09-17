import { z } from "zod";

const iconKeySchema = z.string().regex(/^[a-z0-9_]+$/i);
const abilityTupleSchema = z.tuple([z.string().min(1), z.string(), iconKeySchema]);
const spellTupleSchema = z.tuple([z.string().min(1), z.string()]);
const tooltipLineSchema = z.tuple([z.string(), z.string()]);

const classicTalentSchema = z
  .object({
    status: z.enum(["same", "changed", "new", "moved"]),
    tree: z.string().optional(),
    row: z.number().int().positive().optional(),
    col: z.number().int().positive().optional(),
    max: z.number().int().positive().optional(),
    text: z.string().optional(),
    moved: z.boolean().optional(),
    renamed: z.string().optional(),
  })
  .passthrough();

export const talentSchema = z
  .object({
    name: z.string().min(1),
    max: z.number().int().positive().max(20),
    row: z.number().int().positive().max(20),
    col: z.number().int().positive().max(8),
    passive: z.boolean(),
    icon: iconKeySchema,
    desc: z.union([z.array(z.string()), z.record(z.string(), z.string())]),
    complete: z.boolean(),
    confirmed: z.array(z.number().int().positive()).optional(),
    classic: classicTalentSchema,
    scaleIdx: z.array(z.number().int().nonnegative()).optional(),
    fixed: z.array(z.string()).optional(),
    est: z.record(z.string(), z.string()).optional(),
    cost: z.string().optional(),
    note: z.string().optional(),
    req: z.string().optional(),
    reqText: z.string().optional(),
  })
  .passthrough();

const removedTalentSchema = z
  .object({
    name: z.string().min(1),
    max: z.number().int().positive(),
    text: z.string(),
    row: z.number().int().positive(),
  })
  .passthrough();

export const talentTreeSchema = z
  .object({
    name: z.string().min(1),
    bg: z.number().int().nonnegative(),
    icon: iconKeySchema,
    talents: z.array(talentSchema),
    removed: z.array(removedTalentSchema),
  })
  .passthrough();

export const talentClassSchema = z
  .object({
    icon: iconKeySchema,
    source: z.string(),
    trees: z.array(talentTreeSchema).min(1),
  })
  .passthrough();

export const spellbookSchema = z
  .object({
    race: z.string().min(1),
    level: z.number().int().positive(),
    seen: z.string(),
    missing: z.array(z.string()),
    general: z.array(spellTupleSchema),
    tabs: z.array(
      z
        .object({
          name: z.string().min(1),
          spells: z.array(spellTupleSchema),
        })
        .passthrough(),
    ),
    notes: z.array(z.string()),
    levels: z.record(z.string(), z.array(z.number().int().positive().nullable())).optional(),
    levelsSource: z.string().optional(),
  })
  .passthrough();

export const spellDescriptionSchema = z
  .object({
    l: z.array(tooltipLineSchema),
    d: z.string(),
    s: z.enum(["demo", "classic"]),
    src: z.string(),
    r: z.string(),
    lv: z.string(),
    id: z.number().int().positive().nullable(),
    cs: z.string().optional(),
    cn: z.string().optional(),
    cl: z.array(tooltipLineSchema).optional(),
    cd: z.string().optional(),
  })
  .passthrough();

export const raceSchema = z
  .object({
    race: z.string().min(1),
    icon: iconKeySchema,
    classes: z.array(z.string().min(1)),
    abilities: z.array(abilityTupleSchema),
  })
  .passthrough();

const classRacialSchema = z
  .object({
    note: z.string(),
    races: z.record(z.string(), z.array(abilityTupleSchema)),
    sources: z.string(),
  })
  .passthrough();

const legacySchema = z
  .object({
    note: z.string(),
    trees: z.array(
      z
        .object({
          name: z.string().min(1),
          icon: iconKeySchema,
          perks: z.array(
            z.tuple([z.string().min(1), z.number().int().positive(), z.string(), iconKeySchema]),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const changelogEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    title: z.string().min(1),
    text: z.string(),
  })
  .passthrough();

export const foreverExportSchema = z
  .object({
    _readme: z.string(),
    license: z.literal("CC-BY-4.0"),
    attribution: z.string().min(1),
    generated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    talents: z.record(z.string(), talentClassSchema),
    spellbooks: z.record(z.string(), spellbookSchema),
    spell_desc: z.record(z.string(), spellDescriptionSchema),
    racials: z.record(z.string(), z.array(raceSchema)),
    class_racials: z.record(z.string(), classRacialSchema),
    class_abilities: z.record(z.string(), z.array(abilityTupleSchema)),
    legacy: legacySchema,
    changelog: z.array(changelogEntrySchema),
  })
  .passthrough();

export const foreverSupplementalSchema = z.object({
  spellbookIcons: z.record(z.string(), iconKeySchema),
});

export type ForeverExport = z.infer<typeof foreverExportSchema>;
export type ForeverSupplemental = z.infer<typeof foreverSupplementalSchema>;
export type Talent = z.infer<typeof talentSchema>;
export type TalentClass = z.infer<typeof talentClassSchema>;
export type TalentTree = z.infer<typeof talentTreeSchema>;
export type Spellbook = z.infer<typeof spellbookSchema>;
export type SpellDescription = z.infer<typeof spellDescriptionSchema>;
export type Race = z.infer<typeof raceSchema>;
