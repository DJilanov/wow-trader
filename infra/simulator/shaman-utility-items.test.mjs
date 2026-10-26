import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { extractShamanUtilityItemRules } from "./shaman-utility-items.mjs";

const evidence = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/shaman-shared-equipment-source.v1.json.gz", import.meta.url)),
  ),
);

test("all nine utility items retain current targets, resource payloads and explicit behavior uncertainty", () => {
  const rules = extractShamanUtilityItemRules(evidence);
  const ids = [
    ...rules.directHeals,
    ...rules.recombobulators,
    rules.circle,
    rules.headmaster,
    rules.mark,
    rules.baron,
    rules.grace,
  ]
    .map((row) => row.itemId)
    .sort((a, b) => a - b);
  assert.deepEqual(ids, [4262, 4381, 6323, 8346, 11808, 11923, 13143, 13937, 18637]);
  assert.deepEqual(
    rules.directHeals.map((row) => [row.target, row.amount.minimum, row.amount.maximum]),
    [
      ["self", 225, 375],
      ["friendly", 300, 500],
    ],
  );
  assert.equal(rules.circle.mana.mean, 79);
  assert.equal(rules.circle.health.mean, 79);
  assert.equal(rules.circle.ticks, 10);
  assert.equal(rules.headmaster.stackingWithRaidIntellectVerified, false);
  assert.equal(rules.mark.manaRequiresShield, true);
  assert.equal(rules.baron.regenerationNotHealing, true);
  assert.equal(rules.grace.scope, "living-party-members-on-owner-death");
});

test("both Recombobulators require Engineering and couple healing/mana to one friendly recipient", () => {
  const { recombobulators } = extractShamanUtilityItemRules(evidence);
  assert.deepEqual(
    recombobulators.map((row) => [
      row.engineeringSkill,
      row.healing.mean,
      row.mana.mean,
      row.charges,
    ]),
    [
      [140, 270, 128, 10],
      [275, 666, 304, 10],
    ],
  );
  for (const row of recombobulators) {
    assert.equal(row.recipient, "same-friendly-for-health-and-mana");
    assert.equal(row.sharedCategory, 1153);
    assert.equal(row.sharedCooldownMs, 120000);
    assert.equal(row.healingPowerCoefficient, 0);
    assert.equal(row.criticalBehaviorVerified, false);
    assert.equal(row.healthManaRollCorrelationVerified, false);
  }
});

test("legacy equip effects never relabel missing current base stats or grant demon-only damage to healing", () => {
  const rules = extractShamanUtilityItemRules(evidence);
  assert.equal(rules.briarwood.neutralEquipPower, 15);
  assert.equal(rules.briarwood.marshAdditionalEquipPower, 15);
  assert.equal(rules.briarwood.compiledSpellPower, 29);
  assert.equal(rules.royalSeal.equipMagicalDamageAndHealing, 18);
  assert.equal(rules.royalSeal.compiledSpellPower, 23);
  assert.equal(rules.royalSeal.additionalHealingAgainstDemons, 0);
  for (const row of rules.legacy) assert.equal(row.currentBaseStatsVerified, false);
  assert.equal(rules.eye.spellCriticalPercentagePoints, 1);
  assert.equal(rules.eye.activeSpellHitPercentagePoints, 7);
  assert.equal(rules.eye.scriptedBehaviorVerified, false);
});

test("changed coefficients, targets, trigger routing and additional effects require fresh review", () => {
  for (const edit of [
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 9163).EffectBonusCoefficient = 1;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 9163).ImplicitTarget = [21, 0];
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 17447).Variance = 0;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 1300890).EffectTriggerSpell = 0;
    },
    (value) => {
      value.tables.SpellEffect.find(
        (row) => row.SpellID === 1318476 && row.EffectIndex === 2,
      ).EffectAura = 135;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 1318956).EffectBasePointsF = 2;
    },
    (value) => {
      value.tables.SpellEffect.push({
        ...value.tables.SpellEffect.find((row) => row.SpellID === 18805),
        id: 9999999,
        EffectIndex: 3,
      });
    },
  ]) {
    const changed = structuredClone(evidence);
    edit(changed);
    assert.throws(() => extractShamanUtilityItemRules(changed));
  }
});

test("cooldown, charges, profession, range, radius and expiry drift cannot reuse the captured rules", () => {
  for (const edit of [
    (value) => {
      value.tables.SpellMisc.find((row) => row.SpellID === 17447).SchoolMask = 1;
    },
    (value) => {
      value.tables.SpellPower.push({ SpellID: 10577, ManaCost: 100 });
    },
    (value) => {
      value.lookups.SpellCastTimes.find((row) => row.id === 1).Base = 1500;
    },
    (value) => {
      value.tables.ItemEffect.find((row) => row.SpellID === 18805).Charges = 0;
    },
    (value) => {
      value.tables.ItemEffect.find((row) => row.SpellID === 23064).SpellCategoryID = 0;
    },
    (value) => {
      value.tables.ItemSparse.find((row) => row.id === 4381).RequiredSkill = 0;
    },
    (value) => {
      value.tables.SpellCooldowns.find((row) => row.SpellID === 10577).StartRecoveryTime = 0;
    },
    (value) => {
      value.lookups.SpellRange.find((row) => row.id === 4).RangeMax = [100, 100];
    },
    (value) => {
      value.lookups.SpellRadius.find((row) => row.id === 10).RadiusMax = 40;
    },
    (value) => {
      value.lookups.SpellDuration.find((row) => row.id === 347).Duration = 600000;
    },
  ]) {
    const changed = structuredClone(evidence);
    edit(changed);
    assert.throws(() => extractShamanUtilityItemRules(changed));
  }
});

test("caller evidence and independently returned legacy rows remain immutable", () => {
  const before = structuredClone(evidence);
  const first = extractShamanUtilityItemRules(evidence);
  first.legacy[0].compiledStats[5] = 1000;
  first.recombobulators[0].healing.mean = 1000;
  const second = extractShamanUtilityItemRules(evidence);
  assert.equal(second.legacy[0].compiledStats[5], 29);
  assert.equal(second.recombobulators[0].healing.mean, 270);
  assert.deepEqual(evidence, before);
  for (const key of [
    "runtimeComponentAdmission",
    "serverMechanicsVerified",
    "fullClassAdmission",
    "startsNewClassClock",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(second[key], false);
  assert.equal(second.workloadIntegrationRequired, true);
});
