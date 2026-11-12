import { z } from "zod";

const integer = z.number().int().nonnegative().max(65_535);
const abilitySchema = z.object({
  MinSkillLineRank: integer,
  TrivialSkillLineRankLow: integer,
  TrivialSkillLineRankHigh: integer,
  NumSkillUps: integer,
  ClassMask: integer.optional(),
  RaceMask: z.number().int().optional(),
  RaceMasks: z.array(z.number().int()).optional(),
});

export interface RecipeSkillBands {
  readonly required: number;
  readonly yellow: number;
  readonly gray: number;
  readonly skillUps: number;
  readonly restricted: boolean;
  readonly requirementKnown: boolean;
}

export interface RecipePatternEligibility {
  readonly classId: number;
  readonly binding: number;
  readonly ability: number | null;
  readonly faction: number | null;
  readonly reputation: number;
  readonly classMask: number;
  readonly raceMask: readonly number[];
}

export function isPurchasableRecipePattern(item: RecipePatternEligibility): boolean {
  return (
    item.classId === 9 &&
    item.binding !== 1 &&
    item.binding !== 4 &&
    !item.ability &&
    !item.faction &&
    item.reputation === 0 &&
    [0, -1, 4_294_967_295].includes(item.classMask) &&
    item.raceMask.every((mask) => [0, -1, 4_294_967_295].includes(mask))
  );
}

export function readRecipeSkillBands(raw: unknown, requiredSkill: number): RecipeSkillBands | null {
  const record = z.object({ skillLineAbility: abilitySchema }).safeParse(raw);
  if (!record.success) return null;
  const ability = record.data.skillLineAbility;
  const required = Math.max(requiredSkill, ability.MinSkillLineRank, 1);
  const yellow = ability.TrivialSkillLineRankLow;
  const gray = ability.TrivialSkillLineRankHigh;
  if (
    gray <= required ||
    yellow < required ||
    yellow > gray ||
    ability.NumSkillUps < 1 ||
    ability.NumSkillUps > 10
  )
    return null;
  return {
    required,
    yellow,
    gray,
    skillUps: ability.NumSkillUps,
    requirementKnown: requiredSkill > 0 || ability.MinSkillLineRank > 0,
    restricted:
      (ability.ClassMask ?? 0) !== 0 ||
      (ability.RaceMask ?? 0) !== 0 ||
      (ability.RaceMasks ?? []).some((mask) => mask !== 0),
  };
}
