import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  assertShamanSupplementalConsumes,
  extractShamanSupplementalConsumeRules,
  renderShamanSupplementalConsumes,
  shamanSupplementalConsumeAxes,
} from "./shaman-supplemental-consumes.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("./fixtures/shaman-supplemental-consumes-source.v1.json.gz", import.meta.url),
    ),
  ),
);

test("current source preserves every supplemental consume and the distinct Fortitude ranks", () => {
  const rules = extractShamanSupplementalConsumeRules(source);
  assert.equal(rules.items.length, 23);
  assert.deepEqual(
    rules.items
      .filter((row) => row.field === "healthElixir")
      .map((row) => [row.value, row.itemId, row.stats.health]),
    [
      [2, 2458, 27],
      [1, 3825, 120],
      [3, 250334, 200],
      [4, 250335, 400],
    ],
  );
  assert.equal(rules.items.find((row) => row.itemId === 18284).stats.intellect, -5);
  assert.equal(rules.items.find((row) => row.itemId === 5342).stats.stamina, -5);
  assert.equal(rules.fullClassAdmission, false);
  assert.equal(rules.publicationAllowed, false);
});

test("current Holy elixir cannot silently keep the old forty Fire damage mapping", () => {
  const rules = extractShamanSupplementalConsumeRules(source);
  assert.deepEqual(
    rules.rejectedLegacyMappings.map((row) => [
      row.itemId,
      row.currentSpellId,
      row.currentSchoolMask,
    ]),
    [[21546, 1310077, 2]],
  );
  assert.throws(() => assertShamanSupplementalConsumes({ firePowerBuff: 2 }, 180));
});

test("all sixteen axes retain the previous values and mutually exclusive families", () => {
  const axes = shamanSupplementalConsumeAxes();
  assert.equal(Object.keys(axes).length, 16);
  assert.deepEqual(axes.zanzaBuff, [0, 4, 5, 6, 7, 8]);
  assert.deepEqual(axes.alcohol, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(axes.mainHandImbue, [0, 16, 20]);
  assert.deepEqual(axes.manaRegenElixir, [0, 2]);
  assert(!axes.food.includes(5));
  axes.healthElixir.push(99);
  assert(!shamanSupplementalConsumeAxes().healthElixir.includes(99));
});

test("sparse protobuf choices and independent nested flags are admitted without silent coercion", () => {
  assertShamanSupplementalConsumes({}, 180);
  assertShamanSupplementalConsumes(
    {
      healthElixir: 4,
      zanzaBuff: 6,
      alcohol: 5,
      spellPowerBuff: 3,
      miscConsumes: { raptorPunch: true, jujuEmber: true, jujuChill: false },
    },
    300,
  );
  for (const consumes of [
    { zanzaBuff: 1 },
    { mainHandImbue: 21 },
    { manaRegenElixir: 1 },
    { healthElixir: 5 },
    { alcohol: -1 },
    { healthElixir: "4" },
    { alcohol: NaN },
    { unknown: 0 },
    { miscConsumes: { jujuFlurry: false } },
    { miscConsumes: { raptorPunch: 1 } },
    { miscConsumes: null },
  ])
    assert.throws(() => assertShamanSupplementalConsumes(consumes, 180));
});

test("prepull effects cannot outlive their current source duration", () => {
  assertShamanSupplementalConsumes({ miscConsumes: { raptorPunch: true } }, 300);
  assert.throws(() =>
    assertShamanSupplementalConsumes({ miscConsumes: { raptorPunch: true } }, 300.001),
  );
  assertShamanSupplementalConsumes({ miscConsumes: { jujuEmber: true } }, 600);
  assert.throws(() => assertShamanSupplementalConsumes({ miscConsumes: { jujuEmber: true } }, 601));
  assertShamanSupplementalConsumes({ alcohol: 5 }, 900);
  assert.throws(() => assertShamanSupplementalConsumes({ alcohol: 5 }, 901));
  assertShamanSupplementalConsumes({ healthElixir: 4 }, 1800);
  for (const duration of [0, NaN, Infinity, 1801])
    assert.throws(() => assertShamanSupplementalConsumes({}, duration));
});

test("changed links, school, amount, duration, level and scaling fail source review", () => {
  for (const edit of [
    (value) => {
      value.tables.ItemEffect.find((row) => row.SpellID === 1250931).SpellID = 3593;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 1310077).EffectMiscValue[0] = 4;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 1250931).EffectBasePointsF = 120;
    },
    (value) => {
      value.tables.SpellDuration.find((row) => row.id === 5).Duration = 600000;
    },
    (value) => {
      value.tables.ItemSparse.find((row) => row.id === 250335).RequiredLevel = 61;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 10692).EffectBonusCoefficient = 1;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 10693).ImplicitTarget = [6, 0];
    },
    (value) => {
      value.tables.ItemSparse.push(structuredClone(value.tables.ItemSparse[0]));
    },
  ]) {
    const changed = structuredClone(source);
    edit(changed);
    assert.throws(() => extractShamanSupplementalConsumeRules(changed));
  }
});

test("parent integration replaces the exact old gate and adds one owned stat hook", () => {
  const before = structuredClone(source.sources);
  const rendered = renderShamanSupplementalConsumes(source.sources);
  assert(!rendered.equipped.includes("func validateKFCShamanEquippedConsumes("));
  assert.equal(rendered.equipped.split("validateKFCShamanSupplementalConsumeDuration(").length, 2);
  assert.equal(rendered.passives.split("resto.applyKFCShamanSupplementalConsumes()").length, 2);
  assert.deepEqual(source.sources, before);
  assert.throws(() => renderShamanSupplementalConsumes(rendered));
});
