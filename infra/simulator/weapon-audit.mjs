import assert from "node:assert/strict";

/** @typedef {{ id?: number, enchant?: number }} EquippedItem */
/**
 * @typedef {{ id: number, name: string, type: number, stats: number[],
 * handType?: number, weaponType?: number, rangedWeaponType?: number,
 * classAllowlist?: number[], weaponSkills?: number[] }} WeaponItem
 */

const casterSchools = {
  balance_druid: [6, 10],
  mage: [6, 7, 8],
  warlock: [7, 11],
  shadow_priest: [11],
  smite_priest: [9],
  elemental_shaman: [7, 8, 10],
};

/**
 * This is a review flag, not a gear-pool filter or a DPS ranking. Universal item
 * hit/crit and scripted effects can make a weapon useful without spell power.
 * @param {{profile: string, variant?: string, playerClass: number, gear: {items: EquippedItem[]},
 * items: WeaponItem[]}} input
 * @returns {{weapons: object[], findings: {code: string, slot: number, itemId: number}[]}}
 */
export function auditWeaponLoadout({ profile, variant, playerClass, gear, items }) {
  assert.equal(gear.items.length, 17, "Expected the complete 17-slot loadout");
  assert(Number.isSafeInteger(playerClass) && playerClass >= 1 && playerClass <= 9);
  const catalog = new Map(items.map((item) => [item.id, item]));
  assert.equal(catalog.size, items.length, "Duplicate catalog item identity");
  const mageSchool = { arcane: 6, fire: 7, frost: 8 };
  const schools =
    profile === "mage" && Object.hasOwn(mageSchool, variant ?? "")
      ? [mageSchool[variant]]
      : Object.hasOwn(casterSchools, profile)
        ? casterSchools[profile]
        : null;
  const findings = [];
  const weapons = [14, 15, 16].map((slot) => {
    const equipped = gear.items[slot];
    assert(equipped && Number.isSafeInteger(equipped.id ?? 0) && (equipped.id ?? 0) >= 0);
    const itemId = equipped.id ?? 0;
    if (!itemId) {
      if (slot === 14) findings.push({ code: "missing-main-hand", slot, itemId });
      return { slot, id: 0, enchant: equipped.enchant ?? 0 };
    }
    const item = catalog.get(itemId);
    assert(item, "Weapon missing from the selected catalog: " + itemId);
    assert.equal(item.stats.length, 44, "Expected the pinned 44-stat contract");
    assert(item.stats.every(Number.isFinite), "Non-finite weapon stat");
    const flag = (code) => findings.push({ code, slot, itemId });
    if (item.classAllowlist?.length && !item.classAllowlist.includes(playerClass))
      flag("explicit-class-restriction");
    if (item.type !== (slot === 16 ? 14 : 13)) flag("wrong-equipment-slot-type");
    if (slot === 14 && item.handType === 3) flag("off-hand-only-in-main-hand");
    if (slot === 15 && [1, 4].includes(item.handType)) flag("invalid-off-hand-type");
    if (slot === 14 && item.handType === 4 && gear.items[15].id) flag("two-hand-plus-off-hand");
    if (item.weaponSkills?.some((value) => value !== 0)) flag("item-weapon-skill-not-zeroed");
    const genericSpellPower = item.stats[5] + item.stats[42];
    const relevantSchoolPower = schools
      ? Math.max(...schools.map((index) => item.stats[index]))
      : 0;
    if (schools && slot === 14 && genericSpellPower + relevantSchoolPower <= 0)
      flag("caster-main-hand-needs-explicit-comparison");
    return {
      slot,
      id: itemId,
      enchant: equipped.enchant ?? 0,
      name: item.name,
      handType: item.handType ?? 0,
      weaponType: item.weaponType ?? 0,
      rangedWeaponType: item.rangedWeaponType ?? 0,
      stats: {
        strength: item.stats[0],
        agility: item.stats[1],
        intellect: item.stats[3],
        spirit: item.stats[4],
        genericSpellPower,
        relevantSchoolPower,
        mp5: item.stats[12],
        universalItemHit: item.stats[13] + item.stats[18],
        universalItemCrit: item.stats[14] + item.stats[19],
        attackPower: item.stats[17],
        rangedAttackPower: item.stats[27],
        feralAttackPower: item.stats[43],
      },
    };
  });
  return { weapons, findings };
}
