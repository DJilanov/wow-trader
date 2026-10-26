import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  assertShamanPassiveDamageSetPolicy,
  extractShamanPassiveDamageSetRules,
  renderShamanPassiveDamageSets,
  shamanPassiveDamageSetPolicies,
} from "./shaman-passive-damage-sets.mjs";
const source = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("./fixtures/shaman-passive-damage-sets-source.v1.json.gz", import.meta.url),
    ),
  ),
);

test("all104set rows remain; two outdated exclusions become explicit owned references", () => {
  const rules = extractShamanPassiveDamageSetRules(source);
  assert.equal(rules.sourceBonusRows, 104);
  assert.equal(rules.unchangedInactiveRows, 22);
  assert.equal(rules.newlyConditionalRows, 2);
  assert(rules.decisions.every((row) => row.retainedInEquipmentDomain));
  assert.deepEqual(
    rules.decisions
      .filter((row) => row.classification === "owned-passive-damage-reference-required")
      .map((row) => row.spellId)
      .sort(),
    [1299737, 1302380],
  );
  assert.equal(rules.necropile.amount, 28);
  assert.equal(rules.necropile.recoveryMs, 10);
  assert.equal(rules.postmaster.durationMs, 6000);
  assert.equal(rules.postmaster.recoveryMs, 180000);
  assert.equal(rules.procChanceServerVerified, false);
  assert.equal(rules.procChainingServerVerified, false);
});

test("chance is an explicit sensitivity, with cast-only and no-ownership controls", () => {
  assert.deepEqual(
    shamanPassiveDamageSetPolicies({
      necropilePieces: 2,
      postmasterPieces: 3,
      adaptiveOwned: true,
    }),
    [],
  );
  const noAdaptive = shamanPassiveDamageSetPolicies({
    necropilePieces: 3,
    postmasterPieces: 0,
    adaptiveOwned: false,
  });
  assert.equal(noAdaptive.length, 1);
  assert.equal(noAdaptive[0].necropileChance, undefined);
  const all = shamanPassiveDamageSetPolicies({
    necropilePieces: 3,
    postmasterPieces: 4,
    adaptiveOwned: true,
  });
  assert.equal(all.length, 3);
  assert.deepEqual(
    all.slice(1).map((row) => row.necropileChance),
    [0, 1],
  );
  for (const row of all) assertShamanPassiveDamageSetPolicy(row);
  all[1].necropileChance = 0.5;
  assert.equal(
    shamanPassiveDamageSetPolicies({
      necropilePieces: 3,
      postmasterPieces: 0,
      adaptiveOwned: true,
    })[1].necropileChance,
    0,
  );
});

test("unknown, unpaired, nonfinite and out-of-range uncertainty cannot become defaults", () => {
  const [base] = shamanPassiveDamageSetPolicies({
    necropilePieces: 3,
    postmasterPieces: 0,
    adaptiveOwned: false,
  });
  for (const changes of [
    { extra: true },
    { timing: "guessed" },
    { necropileChance: 1 },
    { necropileTrigger: "adaptive-damage-reference" },
    {
      necropileTrigger: "adaptive-damage-reference",
      necropileChance: NaN,
      drainOutcome: "noncritical-hit-reference",
    },
    {
      necropileTrigger: "adaptive-damage-reference",
      necropileChance: 1.01,
      drainOutcome: "noncritical-hit-reference",
    },
    { postmaster: "reflect-self" },
  ])
    assert.throws(() => assertShamanPassiveDamageSetPolicy({ ...base, ...changes }));
});

test("changed school, amount, enemy target, threshold, cooldown and spell flags fail source review", () => {
  for (const edit of [
    (value) => {
      value.shared.tables.SpellEffect.find((row) => row.SpellID === 1299735).EffectBasePointsF =
        280;
    },
    (value) => {
      value.shared.tables.SpellEffect.find((row) => row.SpellID === 1299735).ImplicitTarget = [
        1, 0,
      ];
    },
    (value) => {
      value.shared.tables.SpellMisc.find((row) => row.SpellID === 1299735).SchoolMask = 4;
    },
    (value) => {
      value.shared.tables.SpellEffect.find((row) => row.SpellID === 1302380).EffectBasePointsF = 50;
    },
    (value) => {
      value.shared.tables.SpellAuraOptions.find(
        (row) => row.SpellID === 1302380,
      ).ProcCategoryRecovery = 180;
    },
    (value) => {
      value.durations[0].Duration = 60000;
    },
    (value) => {
      value.sources.protective = value.sources.protective.replace(
        "explosion.CalcAndDealDamage",
        "explosion.UnreviewedDamage",
      );
    },
  ]) {
    const changed = structuredClone(source);
    edit(changed);
    assert.throws(() => extractShamanPassiveDamageSetRules(changed));
  }
});

test("parent integration binds ownership, copied job policies and after-damage health timing", () => {
  const before = structuredClone(source.sources),
    rendered = renderShamanPassiveDamageSets(source.sources);
  assert(rendered.actor.includes("resto.registerKFCShamanPassiveDamageSets()"));
  assert(rendered.equipped.includes('json:"passiveDamage,omitempty"'));
  assert(
    rendered.definitions.indexOf("unit.RemoveHealth(sim, result.Damage)") <
      rendered.definitions.indexOf("resto.kfcShamanPassiveDamageAfterDamage"),
  );
  assert(
    rendered.equipped.includes("ConfigureKFCShamanPassiveDamageSets(sim,*effects.PassiveDamage)"),
  );
  assert(rendered.testHelpers.includes("sets[122]>=3 || sets[81]>=4"));
  assert.deepEqual(before, source.sources);
  assert.throws(() => renderShamanPassiveDamageSets(rendered));
});
