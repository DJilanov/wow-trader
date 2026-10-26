import assert from "node:assert/strict";
import { equipmentOwnership } from "./equipment-ownership.mjs";
import { prebisSlotTypes } from "./prebis-pool.mjs";
import {
  collectShamanHealingEquipment,
  legalShamanHealingGear,
} from "./shaman-healing-equipment.mjs";

function contextFor(profile) {
  return {
    profile: "restoration-shaman",
    playerClass: 7,
    requireCraftAudit: true,
    faction: profile.faction,
    factionName: profile.faction === 1 ? "Alliance" : "Horde",
    professions: [...profile.professions],
    originalItems: Array(17).fill(undefined),
    currentIds: new Set(),
  };
}

function ownershipFor(item, source) {
  const ownership = equipmentOwnership(item, source);
  assert(
    !source.limitCategory ||
      (Number.isSafeInteger(source.limitCategory) && source.limitCategory > 0),
    "Unreviewed equipment limit category",
  );
  return {
    singleCopy: Boolean(
      item.unique || source.uniqueEquipped || source.maxCount === 1 || ownership.questRewardOnce,
    ),
    limitCategory: source.limitCategory || 0,
    questChoices: [...ownership.questChoices].sort(),
  };
}

function exactKeys(value, allowed, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), label);
  assert(
    Object.keys(value).every((key) => allowed.includes(key)),
    label,
  );
}

/** Compile the reviewed acquisition and enchant domains into an embeddable loadout contract.
 * @param {{database:object,sources:object[],accessDomain:object,enchantDomain:object}} input
 * @returns {object}
 */
export function prepareShamanEquippedDomain(input) {
  const { database, accessDomain, enchantDomain } = input;
  assert.equal(accessDomain.schema, "kfc-shaman-five-thunders-access-domain.v1");
  assert.equal(accessDomain.statPruning, false);
  assert.equal(accessDomain.qualityPruning, false);
  assert.equal(enchantDomain.schema, "kfc-shaman-healing-enchant-domain.v1");
  const items = new Map(database.items.map((item) => [item.id, item]));
  const sources = new Map(input.sources.map((source) => [source.id, source]));
  assert.equal(items.size, database.items.length);
  assert.equal(sources.size, input.sources.length);
  const eligibleIds = new Set(accessDomain.profiles.flatMap((profile) => profile.slots.flat()));
  const enchants = new Map(enchantDomain.enchants.map((row) => [row.key, row]));
  assert.equal(enchants.size, enchantDomain.enchants.length);
  const pairs = new Map();
  for (const row of enchantDomain.itemSlots) {
    const key = `${row.slot}/${row.itemId}`;
    assert(!pairs.has(key), "Duplicate enchant item/slot pair");
    assert.equal(row.noEnchantAllowed, true);
    assert(eligibleIds.has(row.itemId));
    const effects = new Map();
    for (const enchantKey of row.enchantKeys) {
      const enchant = enchants.get(enchantKey);
      assert(enchant, "Unknown enchant recipe");
      assert(Number.isSafeInteger(enchant.effectId) && enchant.effectId > 0);
      const previous = effects.get(enchant.effectId);
      if (previous) {
        assert.equal(previous.status, enchant.status, "Conflicting recipe statuses");
        assert.deepEqual(previous.stats, enchant.stats, "Conflicting recipe stat vectors");
      }
      effects.set(enchant.effectId, enchant);
    }
    pairs.set(key, {
      slot: row.slot,
      itemId: row.itemId,
      effectIds: [...effects.keys()].sort((a, b) => a - b),
      recipeKeys: [...row.enchantKeys],
    });
  }
  const profileIds = new Set();
  const profiles = accessDomain.profiles.map((profile) => {
    assert(!profileIds.has(profile.id), "Duplicate acquisition profile");
    profileIds.add(profile.id);
    const resolved = new Map(sources);
    for (const source of profile.sourceOverrides) {
      assert(sources.has(source.id), "Unknown acquisition override");
      resolved.set(source.id, source);
    }
    const context = contextFor(profile);
    assert.deepEqual(
      collectShamanHealingEquipment(items, resolved, context).slots,
      profile.slots,
      "Acquisition pool changed",
    );
    assert(legalShamanHealingGear(profile.seed, items, resolved, context));
    for (const [slot, ids] of profile.slots.entries()) {
      assert.equal(ids.length, new Set(ids).size);
      for (const id of ids) {
        assert.equal(items.get(id)?.type, prebisSlotTypes[slot]);
        assert(pairs.has(`${slot}/${id}`), "Missing enchant item/slot contract");
      }
    }
    return {
      id: profile.id,
      faction: profile.faction,
      professions: [...profile.professions],
      accessPolicy: structuredClone(profile.accessPolicy),
      availableRewardIds: [...profile.availableRewardIds],
      slots: structuredClone(profile.slots),
      ownershipOverrides: profile.sourceOverrides.map((source) => ({
        id: source.id,
        ...ownershipFor(items.get(source.id), source),
      })),
    };
  });
  const representedPairs = new Set(
    profiles.flatMap((profile) =>
      profile.slots.flatMap((ids, slot) => ids.map((id) => `${slot}/${id}`)),
    ),
  );
  assert.equal(representedPairs.size, pairs.size, "Unowned enchant item/slot contract");
  return {
    schema: "kfc-shaman-equipped-domain.v1",
    profiles,
    items: [...eligibleIds]
      .sort((a, b) => a - b)
      .map((id) => {
        const item = items.get(id),
          source = sources.get(id);
        assert(item && source);
        return {
          id,
          type: item.type,
          handType: item.handType || 0,
          setId: item.setId || 0,
          ...ownershipFor(item, source),
          sourceStatus: source.status || "unspecified",
        };
      }),
    enchants: [...pairs.values()],
    enchantRecipes: enchantDomain.enchants.map((row) => ({
      key: row.key,
      effectId: row.effectId,
      status: row.status,
    })),
    statPruning: false,
    qualityPruning: false,
    wholeEquippedWorkloadAdmissionRequired: true,
    liveServerAccessVerified: false,
    fullClassAdmission: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Validate all seventeen slots together; recipe aliases apply an effect only once.
 * @param {{domain:object,profileId:string,race:number,professions:number[],equipment:object}} input
 * @returns {object}
 */
export function assertShamanEquippedLoadout(input) {
  const { domain, equipment } = input;
  assert.equal(domain.schema, "kfc-shaman-equipped-domain.v1");
  const profile = domain.profiles.find((row) => row.id === input.profileId);
  assert(profile, "Unknown acquisition profile");
  assert(Number.isInteger(input.race) && input.race >= 1 && input.race <= 10);
  const faction = [1, 2, 3, 4, 9].includes(input.race) ? 1 : 2;
  assert.equal(profile.faction, faction, "Race and acquisition faction differ");
  assert(Array.isArray(input.professions) && input.professions.length === 2);
  assert(input.professions.every(Number.isSafeInteger));
  assert.deepEqual(
    input.professions.toSorted((a, b) => a - b),
    profile.professions,
    "Profession profile differs",
  );
  exactKeys(equipment, ["items"], "Unsupported equipment fields");
  assert(Array.isArray(equipment.items) && equipment.items.length === 17);
  const items = new Map(domain.items.map((row) => [row.id, row]));
  const ownership = new Map(profile.ownershipOverrides.map((row) => [row.id, row]));
  const enchants = new Map(domain.enchants.map((row) => [`${row.slot}/${row.itemId}`, row]));
  const ids = new Set(),
    categories = new Set(),
    quests = new Set();
  const result = equipment.items.map((spec, slot) => {
    exactKeys(spec, ["id", "enchant", "randomSuffix"], "Unsupported item fields");
    assert(Number.isSafeInteger(spec.id) && spec.id >= 0, "Invalid item ID");
    const enchant = spec.enchant ?? 0;
    assert(Number.isSafeInteger(enchant) && enchant >= 0, "Invalid enchant effect");
    assert((spec.randomSuffix ?? 0) === 0, "Random suffixes need separate admission");
    if (!spec.id) {
      assert(slot === 15 && !enchant, "Only the unenchanted offhand can be empty");
      return { id: 0 };
    }
    assert(profile.slots[slot].includes(spec.id), "Item outside acquisition/slot profile");
    const item = items.get(spec.id),
      rules = ownership.get(spec.id) ?? item;
    assert(item && item.type === prebisSlotTypes[slot]);
    assert(!enchant || enchants.get(`${slot}/${spec.id}`)?.effectIds.includes(enchant));
    assert(!rules.singleCopy || !ids.has(spec.id), "Duplicate restricted item");
    assert(!rules.limitCategory || !categories.has(rules.limitCategory), "Shared item category");
    assert(!rules.questChoices.some((quest) => quests.has(quest)), "Exclusive quest rewards");
    ids.add(spec.id);
    if (rules.limitCategory) categories.add(rules.limitCategory);
    for (const quest of rules.questChoices) quests.add(quest);
    return { id: spec.id, ...(enchant ? { enchant } : {}) };
  });
  assert(
    items.get(result[14].id).handType !== 4 || result[15].id === 0,
    "A two-hand weapon requires an empty offhand",
  );
  return {
    profileId: profile.id,
    race: input.race,
    faction,
    professions: [...profile.professions],
    accessPolicy: structuredClone(profile.accessPolicy),
    conditionalItemIds: [...ids].filter((id) => profile.availableRewardIds.includes(id)),
    equipment: { items: result },
    wholeEquippedWorkloadAdmissionRequired: true,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
