// Historical acquisition evidence: installed AtlasLoot Classic raid tables,
// AQ_ENCHANTS, MC trash recipes, ZGEnchants and NAXSapphiron. Spell IDs matter:
// effect 2564 is shared by a raid-recipe glove enchant and a pre-raid weapon enchant.
const raidRecipeSpells = new Set([
  22749, 22750, 22779, 25072, 25073, 25074, 25078, 25079, 25080, 25083, 25084, 25086,
]);
const raidRewardEffects = new Set([
  2503, 2583, 2584, 2585, 2586, 2587, 2588, 2589, 2590, 2591, 2604, 2605, 2606, 2681, 2715, 2716,
  2717, 2721,
]);

export function prebisEnchantProblem(enchant) {
  return raidRecipeSpells.has(enchant.spellId) || raidRewardEffects.has(enchant.effectId)
    ? "Historical raid-only reward, reputation or recipe; excluded until an independent Forever pre-raid source is verified."
    : "";
}
