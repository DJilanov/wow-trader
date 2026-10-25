import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { extractShamanHealingActiveSource } from "./shaman-healing-active-source.mjs";

const bytes = readFileSync(
  new URL("./fixtures/shaman-client-healing-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "3253264da0af56c7abeb9541e463751766140df618134508068d459fb6c2be13",
);
const evidence = JSON.parse(gunzipSync(bytes)),
  source = extractShamanHealingActiveSource(evidence);

test("all three current Riptide ranks retain separate direct, periodic and chain-bonus payloads", () => {
  assert.deepEqual(
    source.riptide.map((entry) => entry.id),
    [408521, 1239242, 1239243],
  );
  const highest = source.riptide[2];
  assert.equal(highest.mana, 385);
  assert.equal(highest.requiredLevel, 60);
  assert.equal(highest.direct.base, 841);
  assert.equal(highest.direct.coefficient, 0.214);
  assert.equal(highest.periodic.base, 161);
  assert.equal(highest.periodic.pointsPerLevel, 3.7);
  assert.equal(highest.periodic.coefficient, 0.1);
  assert.equal(highest.durationMs / highest.tickMs, 5);
  assert.equal(highest.sharedCooldownMs, 6000);
  assert.equal(highest.sharedCategory, 1228);
  assert.equal(highest.chainHealBonusPercent, 25);
  assert.equal(highest.hotConsumptionByChainVerified, false);
  assert.equal(highest.periodicCriticalRuleVerified, false);
});

test("Water Shield retains charge, critical-proc mask and actual maximum-mana resource semantics", () => {
  const shield = source.waterShield;
  assert.equal(shield.id, 408510);
  assert.equal(shield.triggeredSpellId, 408511);
  assert.equal(shield.charges, 3);
  assert.equal(shield.internalCooldownMs, 3500);
  assert.equal(shield.maximumManaPercent, 2);
  assert.deepEqual(shield.procTypeMask, [221864, 0]);
  assert.equal(shield.mana, 0);
  assert.equal(shield.gcdMs, 1500);
  assert.equal(shield.serverProcEligibilityVerified, false);
});

test("Nature's Swiftness source is a one-charge off-GCD three-minute cooldown", () => {
  const swiftness = source.naturesSwiftness;
  assert.equal(swiftness.id, 16188);
  assert.equal(swiftness.charges, 1);
  assert.equal(swiftness.mana, 0);
  assert.equal(swiftness.gcdMs, 0);
  assert.equal(swiftness.cooldownMs, 180000);
  assert.equal(swiftness.durationMs, -1);
  assert.equal(swiftness.castTimeReductionPercent, 100);
  assert.deepEqual(swiftness.mask, [2499, 0, 1048576, 65536]);
});

test("totem pulse links come from explicit current descriptions and preserve the fourth Mana Tide rank", () => {
  assert.equal(source.healingStream.length, 5);
  assert.equal(source.manaTide.length, 4);
  const stream = source.healingStream.at(-1),
    tide = source.manaTide.at(-1);
  assert.deepEqual([stream.id, stream.pulseId, stream.mana, stream.amount], [10463, 10461, 80, 11]);
  assert.equal(stream.coefficient, 0.022);
  assert.equal(stream.periodMs, 2000);
  assert.equal(stream.gcdMs, 1000);
  assert.deepEqual([tide.id, tide.pulseId, tide.mana, tide.amount], [1325256, 1325257, 60, 290]);
  assert.equal(tide.coefficient, 0);
  assert.equal(tide.durationMs, 13000);
  assert.equal(tide.periodMs, 3000);
  assert.equal(tide.sharedCooldownMs, 300000);
  assert.equal(tide.sharedCategory, 591);
  for (const totem of [...source.healingStream, ...source.manaTide]) {
    assert.equal(totem.pulseLink, "client-description-reference");
    assert.equal(totem.radius, 30);
    assert.equal(totem.serverNpcSpellBindingVerified, false);
    assert.equal(totem.firstPulseTimingVerified, false);
  }
});

test("changed ownership, costs, pulse periods, coefficients and description links fail closed", () => {
  for (const mutate of [
    (value) => {
      value.classTalents = value.classTalents.filter((entry) => entry.spellId !== 408521);
    },
    (value) => {
      value.rootAbilityRows = value.rootAbilityRows.filter((entry) => entry.Spell !== 1325256);
    },
    (value) => {
      value.rawTables.SpellPower.find((entry) => entry.SpellID === 1239243).PowerCostPct = 5;
    },
    (value) => {
      value.rawTables.SpellEffect.find((entry) => entry.SpellID === 10461).EffectAuraPeriod = 1000;
    },
    (value) => {
      value.rawTables.SpellEffect.find(
        (entry) => entry.SpellID === 1239243,
      ).EffectBonusCoefficient = 0.5;
    },
    (value) => {
      value.rawTables.SpellEffect.find((entry) => entry.SpellID === 408511).EffectMiscValue[0] = 1;
    },
    (value) => {
      value.rawTables.Spell.find((entry) => entry.id === 1325256).Description_lang =
        "Different pulse";
    },
    (value) => {
      value.lookupTables.SpellRadius.find((entry) => entry.id === 10).Radius = 40;
    },
    (value) => {
      value.rawTables.SpellAuraOptions.find(
        (entry) => entry.SpellID === 408510,
      ).ProcCategoryRecovery = 0;
    },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extractShamanHealingActiveSource(changed));
  }
});

test("active Shaman source is immutable preparation and does not qualify numerical builds", () => {
  const before = JSON.stringify(evidence),
    copy = extractShamanHealingActiveSource(evidence);
  copy.riptide[0].attributes[0] = -1;
  copy.waterShield.procTypeMask[0] = -1;
  copy.naturesSwiftness.mask[0] = -1;
  copy.manaTide[0].sourceTargetEncoding[0] = -1;
  assert.equal(JSON.stringify(evidence), before);
  assert.equal(source.sourceOnly, true);
  assert.equal(source.modelAdmission, false);
  assert.equal(source.startsNewClassClock, false);
  assert.equal(source.numericalQualification, false);
  assert.equal(source.publicationAllowed, false);
});
