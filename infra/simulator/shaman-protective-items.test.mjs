import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  assertShamanProtectiveItemPolicy,
  extractShamanProtectiveItemRules,
  renderShamanProtectiveItems,
  shamanProtectiveItemPolicies,
} from "./shaman-protective-items.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name + ".json.gz", import.meta.url))));
const source = fixture("shaman-active-item-source.v1"),
  parent = fixture("shaman-protective-parent-source.v1");
const ids = [8367, 10030, 10543, 10721, 13164, 18340, 18638, 18639, 272437];

test("extracts all nine actual source uses with school masks distinct from engine flags", () => {
  const rules = extractShamanProtectiveItemRules(source);
  assert.deepEqual(
    rules.items.map((row) => row.itemId),
    ids,
  );
  assert.deepEqual(
    rules.items
      .filter((row) => row.poolSchoolMask)
      .map((row) => [row.itemId, row.poolSchoolMask, row.amount, row.variance]),
    [
      [8367, 126, 600, 0],
      [10543, 4, 400, 0.5],
      [10721, 127, 500, 0],
      [18340, 32, 1176, 0],
      [272437, 127, 450, 0],
    ],
  );
  assert.equal(rules.serverMechanicsVerified, false);
  assert.equal(rules.startsNewClassClock, false);
});

test("retains exact item cooldown overrides and the explicitly named negative fallback", () => {
  const rows = extractShamanProtectiveItemRules(source).items;
  assert.deepEqual(
    rows.map((row) => [row.itemId, row.cooldownMs, row.sharedCategory, row.sharedCooldownMs]),
    [
      [8367, 300000, 99, 1000],
      [10030, 60000, 0, 0],
      [10543, 3600000, 0, 0],
      [10721, 3600000, 0, 0],
      [13164, 1800000, 0, 0],
      [18340, 360000, 2554, 30000],
      [18638, 300000, 0, 0],
      [18639, 300000, 0, 0],
      [272437, 90000, 1141, 15000],
    ],
  );
  assert.deepEqual(rows.find((row) => row.itemId === 272437).explosion, {
    spellId: 1291099,
    amount: 100,
    variance: 0.2,
    radius: 5,
  });
  assert.equal(rows.find((row) => row.itemId === 10721).overloadProcChanceInClient, 5);
  assert.equal(rows.find((row) => row.itemId === 10721).overloadPayloadVerified, false);
});

test("generates owned sensitivities without inventing a malfunction or reflection result", () => {
  assert.deepEqual(shamanProtectiveItemPolicies([0, 12930]), []);
  assert.equal(shamanProtectiveItemPolicies([8367]).length, 1);
  assert.equal(shamanProtectiveItemPolicies([10030]).length, 3);
  assert.equal(shamanProtectiveItemPolicies([10721]).length, 2);
  assert.equal(shamanProtectiveItemPolicies([272437]).length, 2);
  const values = shamanProtectiveItemPolicies(ids);
  assert.equal(values.length, 12);
  for (const policy of values) {
    assertShamanProtectiveItemPolicy(policy);
    assert(Object.isFrozen(policy));
    assert.equal(policy.selfReflection, "self-ineligible-reference");
  }
  assert(Object.isFrozen(values));
});

test("rejects unknown, inconsistent and fabricated reference values", () => {
  const valid = shamanProtectiveItemPolicies([10030, 10721, 272437])[0];
  for (const patch of [
    { schema: "wrong" },
    { id: "" },
    { cooldowns: "none" },
    { overloadChance: 0.05 },
    { harmBelt: "server-verified" },
    { selfReflection: "free-immunity" },
    { admiralStamina: "additive-reference", admiralHealth: undefined },
    { adaptiveOutcome: undefined },
    { adaptiveEnemyInMelee: "yes" },
  ])
    assert.throws(() => assertShamanProtectiveItemPolicy({ ...valid, ...patch }));
  assert.throws(() => shamanProtectiveItemPolicies([NaN]));
});

test("changed payload families, scaling, channels and unknown scripts require new review", () => {
  for (const edit of [
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 10618).EffectBonusCoefficient = 1;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 12561).EffectAuraPeriod = 1000;
    },
    (value) => {
      value.rows.find((row) => row.itemId === 10721).effect.Charges = 10;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 1291099).Effect = 10;
    },
    (value) => {
      value.tables.SpellAuraOptions.find((row) => row.SpellID === 13234).ProcChance = 100;
    },
  ]) {
    const changed = structuredClone(source);
    edit(changed);
    assert.throws(() => extractShamanProtectiveItemRules(changed));
  }
});

test("adds owned dispatch and per-recipient accounting without bypassing spell-only admission", () => {
  const result = renderShamanProtectiveItems(parent.sources);
  assert(result.actor.includes("registerKFCShamanProtectiveItems()"));
  assert(result.equipped.includes("protective references must match owned items"));
  assert(result.equipped.includes("8367,10030,10543,10721,13164,18340,18638,18639,272437"));
  assert(result.runner.includes("healthLossByRaidIndex[event.RaidIndex]+=loss"));
  assert(result.runner.includes("healed+=min(loss,max(0,net))"));
  assert(result.runner.includes("externalDeficitByRaidIndex[unit.Index]"));
  assert(result.definitions.includes("externalNonHealingDeficitAdjustmentMean,omitempty"));
  assert(result.runner.includes("validateKFCShamanWorkloadRequest(player, request.Raid)"));
  assert.throws(() => renderShamanProtectiveItems({ ...parent.sources, actor: result.actor }));
  assert.throws(() =>
    renderShamanProtectiveItems({
      ...parent.sources,
      runner: parent.sources.runner.replace("healthLoss += loss", "healthLoss += 0"),
    }),
  );
});

test("source extraction and rendering do not mutate or expose their inputs", () => {
  const input = structuredClone(source),
    before = JSON.stringify(input),
    parentBefore = JSON.stringify(parent.sources);
  const rules = extractShamanProtectiveItemRules(input);
  rules.items[0].amount = 999999;
  assert.equal(JSON.stringify(input), before);
  renderShamanProtectiveItems(parent.sources);
  assert.equal(JSON.stringify(parent.sources), parentBefore);
});
