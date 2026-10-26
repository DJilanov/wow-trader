import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractShamanHealingItems,
  renderShamanHealingItems,
  shamanHealingItemPolicies,
} from "./shaman-healing-items.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name + ".json.gz", import.meta.url))));
const input = {
  heartEvidence: fixture("dormant-heart-family-source.v1"),
  resourceEvidence: fixture("druid-item-resources-source.v1"),
  serenityEvidence: fixture("druid-study-cooldown-source.v1"),
  sharedEvidence: fixture("shaman-shared-equipment-source.v1"),
  common:
    "core.NewSimpleStatOffensiveTrinketEffect(272439,\n\t\tstats.Stats{stats.Spirit: 72}, 15*time.Second, 90*time.Second)",
};

test("binds all four shared effects to the actual current Shaman source graph", () => {
  const rules = extractShamanHealingItems(input);
  assert.deepEqual(rules.healingWaveIds, [331, 332, 547, 913, 939, 959, 8005, 10395, 10396]);
  assert.equal(rules.dormantHeart.healingPower, 40);
  assert.equal(rules.dormantHeart.spellDamage, 13);
  assert.equal(rules.mindtap.manaPerTick * rules.mindtap.ticks, 1250);
  assert.equal(rules.mindtap.intellectPenalty, 60);
  assert.equal(rules.secondWind.manaPerTick * rules.secondWind.ticks, 630);
  assert.equal(rules.secondWind.sharedCategory, 2554);
  assert.equal(rules.mindtap.sharedCategory, rules.secondWind.sharedCategory);
  assert.equal(rules.serenity.sharedCategory, 1141);
  assert.equal(rules.serenity.spirit, 72);
  assert.equal(rules.energeticRod.offensiveWeavingAdmitted, false);
  assert.equal(rules.fullClassAdmission, false);
  assert.equal(rules.startsNewClassClock, false);
});

test("rejects another family, lost ranks, changed source payloads or an unverified common handler", () => {
  for (const edit of [
    (value) => {
      value.sharedEvidence.ownedActions.find((row) => row.family === "healing-wave").family =
        "chain-heal";
    },
    (value) => {
      value.sharedEvidence.tables.ItemEffect.find((row) => row.SpellID === 15604).CoolDownMSec = 1;
    },
    (value) => {
      value.resourceEvidence.tables.SpellEffect.find(
        (row) => row.SpellID === 1302205,
      ).EffectBasePointsF = 150;
    },
    (value) => {
      value.common = "";
    },
  ]) {
    const changed = structuredClone(input);
    edit(changed);
    assert.throws(() => extractShamanHealingItems(changed));
  }
});

test("renders owned integration, source-limited Heart and epoch-bound resource ticks", () => {
  const actor =
    "type RestorationShaman struct {\n}\nfunc init() {\n\tresto.registerKFCShamanFlatItemRegeneration()\n}\n";
  const implementation = readFileSync(
    new URL("./shaman-healing-items.go", import.meta.url),
    "utf8",
  );
  const resourceImplementation = readFileSync(
    new URL("./druid-item-resources.go", import.meta.url),
    "utf8",
  );
  const result = renderShamanHealingItems({
    ...input,
    actor,
    implementation,
    resourceImplementation,
  });
  assert(result.actor.includes("resto.registerKFCShamanHealingItems()"));
  assert(result.implementation.includes("331:true"));
  assert(result.implementation.includes("resto.GetSpell(spell.ActionID) == spell"));
  assert(!result.implementation.includes("KFC_SHAMAN_HEALING_ITEM_VALUES"));
  assert.equal(result.resources.split("generation == resto.kfcHealingItems.generation").length, 3);
  assert(!result.resources.includes("RestorationDruid"));
  assert(!result.resources.includes("kfcSelfEffectsAlive"));
  assert.throws(() =>
    renderShamanHealingItems({
      ...input,
      actor: actor + actor,
      implementation,
      resourceImplementation,
    }),
  );
});

test("keeps proc rates and event routing explicit rather than asserting a server rate", () => {
  const policies = shamanHealingItemPolicies();
  assert.equal(policies.length, 6);
  assert.deepEqual(
    policies.slice(0, 5).map((row) => row.dormantHeartProcChance),
    [1, 0, 0.02, 0.05, 0.1],
  );
  assert.equal(policies.at(-1).dormantHeartHealingEvents, "direct-heals");
  assert(policies.every(Object.isFrozen));
  assert(Object.isFrozen(policies));
});
