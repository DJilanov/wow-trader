const raidWeaponConsumes = {
  ElementalSharpeningStone: { recipeItemId: 18264, source: "Molten Core boss recipes" },
  BrilliantWizardOil: { recipeItemId: 20756, source: "Zandalar Tribe Honored" },
  BrilliantManaOil: { recipeItemId: 20757, source: "Zandalar Tribe Friendly" },
};

function denseStoneFor(item) {
  if (!item || item.type !== 13 || ![1, 2, 3, 4, 6, 8, 9].includes(item.weaponType)) return null;
  // Proto WeaponType: Fist=3, Mace=4, Staff=8; Sword=9 is a blade.
  return [3, 4, 8].includes(item.weaponType) ? "DenseWeightstone" : "DenseSharpeningStone";
}

export function weaponConsumeProblem(settings, db) {
  for (const [field, slot] of [
    ["mainHandImbue", 14],
    ["offHandImbue", 15],
  ]) {
    const selected = settings.player.consumes[field];
    if (!["DenseSharpeningStone", "DenseWeightstone"].includes(selected)) continue;
    const item = db.items.find((item) => item.id === settings.player.equipment.items[slot]?.id);
    const expected = denseStoneFor(item);
    if (selected !== expected)
      return `${selected} does not fit ${item?.name ?? "the empty/unknown weapon"}; ${expected ? `select ${expected}` : "remove the weapon consume"} and recapture the controlled request.`;
  }
  return "";
}

export function preRaidConsumeSettings(baseline, db) {
  if (baseline.schema !== "kfc-optimization-baseline.v1" || !baseline.settings?.player?.consumes)
    throw new Error("Expected a controlled character baseline");
  const settings = globalThis.structuredClone(baseline.settings);
  const changes = [];
  for (const [field, slot] of [
    ["mainHandImbue", 14],
    ["offHandImbue", 15],
  ]) {
    const previous = settings.player.consumes[field];
    const evidence = raidWeaponConsumes[previous];
    if (!evidence) continue;
    const id = settings.player.equipment.items[slot]?.id;
    const item = db.items.find((item) => item.id === id);
    let replacement;
    if (!id) replacement = null;
    else if (!denseStoneFor(item))
      throw new Error(`Cannot resolve weapon-consume compatibility in slot ${slot}`);
    else if (previous === "ElementalSharpeningStone") replacement = denseStoneFor(item);
    else replacement = previous === "BrilliantWizardOil" ? "WizardOil" : "LesserManaOil";
    if (replacement) settings.player.consumes[field] = replacement;
    else delete settings.player.consumes[field];
    changes.push({ field, previous, replacement, ...evidence });
  }
  return {
    settings,
    changes,
    notice:
      "Known historical raid-recipe weapon consumes replaced with non-raid alternatives, using installed AtlasLoot Classic MC and Zandalar tables. This does not establish every seasonal, reputation or Forever release unlock. Changing consumes requires a new talent/gear feedback search; old DPS and optimality are not inherited.",
  };
}
