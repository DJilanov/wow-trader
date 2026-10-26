import assert from "node:assert/strict";
import { extractDormantHeartFamily } from "./dormant-heart-family.mjs";
import { extractDruidItemResources } from "./druid-item-resources.mjs";
import { extractDruidStudyCooldownRules } from "./druid-study-cooldowns.mjs";

/** Bind already captured shared payloads to Shaman's actual owned spell families.
 * @param {object} input @returns {object}
 */
export function extractShamanHealingItems(input) {
  const heart = extractDormantHeartFamily(input.heartEvidence);
  const resources = extractDruidItemResources(input.resourceEvidence);
  const serenity = extractDruidStudyCooldownRules(input.serenityEvidence, input.common);
  assert.equal(input.sharedEvidence.schema, "kfc-shaman-shared-equipment-source.v1");
  assert.equal(input.sharedEvidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(heart.families.shaman, "healing-wave");
  const waveIds = input.sharedEvidence.ownedActions
    .filter((row) => row.family === "healing-wave")
    .map((row) => row.id)
    .sort((a, b) => a - b);
  assert.deepEqual(waveIds, [331, 332, 547, 913, 939, 959, 8005, 10395, 10396]);
  for (const source of [input.heartEvidence, input.resourceEvidence, input.serenityEvidence]) {
    for (const [name, rows] of Object.entries(source.tables)) {
      const actual = input.sharedEvidence.tables[name] ?? input.sharedEvidence.lookups[name];
      assert(actual, "Missing Shaman source table " + name);
      for (const row of rows) {
        const found = actual.filter((candidate) => candidate.id === row.id);
        assert.equal(found.length, 1, "Missing or duplicate shared source " + name + "/" + row.id);
        assert.deepEqual(found[0], row, "Cross-class source disagreement " + name + "/" + row.id);
      }
    }
  }
  const second = input.resourceEvidence.tables.ItemEffect.find((row) => row.SpellID === 15604);
  assert(second);
  return {
    schema: "kfc-shaman-healing-items-rules.v1",
    sourceBuild: 70532,
    dormantHeart: heart,
    healingWaveIds: waveIds,
    mindtap: resources.mindtap,
    secondWind: {
      itemId: 11819,
      spellId: 15604,
      manaPerTick: 63,
      ticks: 10,
      tickMs: 1000,
      cooldownMs: second.CoolDownMSec,
      sharedCategory: second.SpellCategoryID,
      sharedCooldownMs: second.CategoryCoolDownMSec,
      areaReference: "neutral-area",
    },
    serenity,
    energeticRod: resources.energeticRod,
    scope:
      "Shaman-owned Healing Wave trigger and explicit mana/spirit item uses. Neutral-area amounts; alternate area behavior, remaining equipment and consumes require separate admission.",
    serverProcChanceVerified: false,
    baseStatsRemainProvisionalItemIds: resources.baseStatsRemainProvisionalItemIds,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Compose owned item behavior without changing shared registrations or other classes.
 * @param {object} input @returns {object}
 */
export function renderShamanHealingItems(input) {
  const rules = extractShamanHealingItems(input);
  const once = (text, before, after) => {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  };
  const values = [
    `const kfcShamanHeartItemID int32 = ${rules.dormantHeart.itemId}`,
    `const kfcShamanHeartHealingPower = ${rules.dormantHeart.healingPower}`,
    `const kfcShamanHeartSpellDamage = ${rules.dormantHeart.spellDamage}`,
    `const kfcShamanHeartDurationMS = ${rules.dormantHeart.durationMs}`,
    `var kfcShamanHeartWaveIDs = map[int32]bool{${rules.healingWaveIds.map((id) => id + ":true").join(",")}}`,
  ].join("\n");
  const implementation = once(input.implementation, "// KFC_SHAMAN_HEALING_ITEM_VALUES", values);
  let actor = once(
    input.actor,
    "type RestorationShaman struct {",
    "type RestorationShaman struct {\n\tkfcHealingItems *kfcShamanHealingItems",
  );
  actor = once(
    actor,
    "\tresto.registerKFCShamanFlatItemRegeneration()",
    "\tresto.registerKFCShamanFlatItemRegeneration()\n\tresto.registerKFCShamanHealingItems()",
  );
  const start = "\tif !owned[18371] {";
  assert.equal(input.resourceImplementation.split(start).length, 2);
  let tail = input.resourceImplementation
    .slice(input.resourceImplementation.indexOf(start))
    .replaceAll("*RestorationDruid", "*RestorationShaman")
    .replaceAll("resto.itemEffects", "resto.kfcHealingItems")
    .replaceAll("resto.kfcSelfEffectsAlive()", "resto.kfcShamanItemsAlive()")
    .replaceAll("kfcRegisterSecondWind", "kfcShamanRegisterSecondWind")
    .replaceAll("Druid Tapped Mind", "Shaman Tapped Mind");
  tail = once(
    tail,
    "\t\t\tstate.started = true\n",
    "\t\t\tstate.started = true\n\t\t\tgeneration := state.generation\n",
  );
  tail = once(
    tail,
    "\t\t\tresto.kfcHealingItems.started = true\n",
    "\t\t\tresto.kfcHealingItems.started = true\n\t\t\tgeneration := resto.kfcHealingItems.generation\n",
  );
  assert.equal(tail.split("if resto.kfcShamanItemsAlive() {").length, 3);
  tail = tail.replaceAll(
    "if resto.kfcShamanItemsAlive() {",
    "if generation == resto.kfcHealingItems.generation && resto.kfcShamanItemsAlive() {",
  );
  tail = once(
    tail,
    "mana := resto.NewManaMetrics(action)",
    "mana := resto.NewManaMetrics(action)\n state.mindtapMana = mana",
  );
  tail = once(
    tail,
    "mana := resto.NewManaMetrics(core.ActionID{SpellID: 15604})",
    "mana := resto.NewManaMetrics(core.ActionID{SpellID: 15604})\n resto.kfcHealingItems.secondWindMana = mana",
  );
  const resources = `package restoration
import (
 "time"
 "github.com/wowsims/classic/sim/core"
 "github.com/wowsims/classic/sim/core/stats"
)
func (resto *RestorationShaman) registerKFCShamanManaItems() {
 state := resto.kfcHealingItems
 owned := map[int32]bool{}
 for _, item := range resto.Equipment { owned[item.ID] = true }
${tail}`;
  return { rules, implementation, resources, actor };
}

/** @returns {ReadonlyArray<Readonly<object>>} */
export function shamanHealingItemPolicies() {
  return Object.freeze(
    [
      ...[1, 0, 0.02, 0.05, 0.1].map((chance) => ({
        schema: "kfc-shaman-item-effects-policy.v1",
        id: chance === 1 ? "heart-client-literal" : "heart-rate-" + chance,
        dormantHeartProcChance: chance,
        dormantHeartHealingEvents: "completed-casts",
      })),
      {
        schema: "kfc-shaman-item-effects-policy.v1",
        id: "heart-direct-heals",
        dormantHeartProcChance: 1,
        dormantHeartHealingEvents: "direct-heals",
      },
    ].map((policy) => Object.freeze(policy)),
  );
}
