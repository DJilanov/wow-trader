const TBC_ANNIVERSARY_BUILD = 69_795;

const TBC_AUDITED_REQUIRED_SKILL_OVERRIDES: ReadonlyMap<number, number> = new Map([[17_181, 250]]);

export function getAuditedRequiredSkillRank(
  product: string,
  buildNumber: number,
  recipeSpellId: number,
  extractedRank: number,
): number {
  if (product === "wow_anniversary" && buildNumber === TBC_ANNIVERSARY_BUILD) {
    return TBC_AUDITED_REQUIRED_SKILL_OVERRIDES.get(recipeSpellId) ?? extractedRank;
  }
  return extractedRank;
}
