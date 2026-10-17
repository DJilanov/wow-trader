import assert from "node:assert/strict";
import {
  prebisEnchantFits,
  prebisEnchantPolicy,
  provisionalPrebisEffectIds,
} from "./prebis-enchants.mjs";

export function provisionalWarriorWeaponSettings(baseline, db, inspection) {
  assert.equal(baseline.schema, "kfc-optimization-baseline.v1");
  assert.equal(baseline.profile, "warrior");
  assert.equal(baseline.playerClass, 9);
  assert(["fury", "arms"].includes(baseline.variant), "Unreviewed warrior proc scenario");
  assert.equal(
    prebisEnchantPolicy(baseline).provisionalEffectIds.length,
    0,
    "This baseline already enables provisional enchants; reuse its feedback case",
  );
  const settings = globalThis.structuredClone(baseline.settings);
  const gear = settings.player.equipment;
  assert.equal(gear.items.length, 17, "Invalid weapon scenario equipment slots");
  const arms = baseline.variant === "arms";
  if (arms) assert(!gear.items[15]?.id, "Arms proc scenario requires an empty off-hand");
  const enchantPolicy = {
    schema: "kfc-enchant-model-policy.v1",
    provisionalEffectIds: [...provisionalPrebisEffectIds],
    notice:
      "Explicit provisional weapon-proc models: Fiery Blaze, Fiery Weapon, Lifestealing and Crusader. Starts with Crusader (maintained engine 1 PPM, 100 Strength for 15 seconds per weapon at level 60); search may replace it. Not verified Forever proc behavior; public use requires explicit opt-in.",
  };
  for (const slot of arms ? [14] : [14, 15]) {
    const spec = gear.items[slot];
    const item = db.items.find((entry) => entry.id === spec?.id);
    assert(
      item?.type === 13 &&
        ![5, 7].includes(item.weaponType) &&
        (arms ? item.handType === 4 : [1, 2, 3].includes(item.handType)),
      "Proc scenario does not match the reviewed weapon style",
    );
    assert(
      Object.values(inspection.enchants).some(
        (entry) =>
          entry.effectId === 1900 &&
          prebisEnchantFits(entry, item, baseline.playerClass, slot, enchantPolicy),
      ),
      "No reviewed compatible Crusader model for the scenario weapon",
    );
    spec.enchant = 1900;
  }
  return { settings, enchantPolicy };
}
