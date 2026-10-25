import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import {
  assertPaladinLegacyItemPolicy,
  extractPaladinLegacyItemRules,
  renderPaladinLegacyItems,
} from "./paladin-legacy-items.mjs";
import {
  assertPaladinLegacyHealingJob,
  parsePaladinLegacyHealingJobReply,
} from "./paladin-legacy-protocol.mjs";

const bytes = readFileSync(
  new URL("./fixtures/paladin-legacy-item-parent.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "1042ecb7bc03f4ebdb44f5a6c833c4f975e70fdfe46403b11f466c1b9612c6a6",
);
const fixture = JSON.parse(gunzipSync(bytes));

test("Paladin references distinguish observed equip effects from unknown historical stats", () => {
  const rules = extractPaladinLegacyItemRules(fixture.evidence);
  assert.equal(rules.briarwoodNeutralEquipSpellPower, 15);
  assert.equal(rules.briarwoodMarshEquipSpellPower, 30);
  assert.equal(rules.compiledBriarwoodSpellPower, 29);
  assert.equal(rules.compiledRoyalSealHealingPower, 22);
  assert.equal(rules.royalSealHauntedMp5, 9);
  assert.equal(rules.currentBaseStatsVerified, false);
  assert.equal(rules.zeroRoyalHealingIsSensitivityOnly, true);
  for (const mutate of [
    (value) => {
      value.compiled.find((item) => item.id === 12930).stats[5] = 44;
    },
    (value) => {
      value.compiled.find((item) => item.id === 18472).stats[41] = 44;
    },
    (value) => {
      value.briarwood.tables.SpellEffect.find(
        (effect) => effect.SpellID === 1318326,
      ).EffectBasePointsF = 29;
    },
    (value) => {
      value.regeneration.tables.SpellEffect.find(
        (effect) => effect.SpellID === 1318477,
      ).EffectBasePointsF = 22;
    },
  ]) {
    const changed = structuredClone(fixture.evidence);
    mutate(changed);
    assert.throws(() => extractPaladinLegacyItemRules(changed));
  }
});

test("Paladin sensitivity rendering preserves the actual parent outside explicit integration", () => {
  const result = renderPaladinLegacyItems(fixture.source);
  assert.equal(
    result.baseline
      .replace("; legacyItems *kfcPaladinLegacyItems", "")
      .replace("\n holy.registerKFCPaladinLegacyItems()", ""),
    fixture.source.baseline,
  );
  assert.equal(
    result.workload
      .replaceAll(
        '\n LegacyItemsPolicy *KFCPaladinLegacyItemPolicy `json:"legacyItemsPolicy,omitempty"`',
        "",
      )
      .replace(
        "\tif frame.LegacyItemsPolicy != nil { if err = healer.ConfigureKFCPaladinLegacyItems(sim, *frame.LegacyItemsPolicy); err != nil { return nil,err } }\n",
        "",
      )
      .replace("\toutput.LegacyItemsPolicy = healer.kfcPaladinLegacyItemPolicyEcho()\n", ""),
    fixture.source.workload,
  );
  assert.equal(result.workload.split('json:"legacyItemsPolicy,omitempty"').length, 3);
  assert.throws(() => renderPaladinLegacyItems(result));
  assert.throws(() => renderPaladinLegacyItems({ ...fixture.source, baseline: "" }));
  assert.throws(() => renderPaladinLegacyItems({ ...fixture.source, workload: "" }));
});

test("Paladin item policies reject unreviewed, nonfinite and empty numerical references", () => {
  const policy = {
    schema: "kfc-paladin-legacy-item-policy.v1",
    id: "declared",
    briarwoodSpellPower: 15,
    royalSealHealingPower: 0,
  };
  for (const power of [15, 29, 30])
    for (const healing of [0, 22])
      assertPaladinLegacyItemPolicy({
        ...policy,
        briarwoodSpellPower: power,
        royalSealHealingPower: healing,
      });
  assertPaladinLegacyItemPolicy({ schema: policy.schema, id: policy.id, briarwoodSpellPower: 29 });
  for (const invalid of [
    null,
    { ...policy, schema: "other" },
    { ...policy, id: "" },
    { ...policy, id: "x".repeat(101) },
    { ...policy, bonusStats: [44] },
    { ...policy, briarwoodSpellPower: NaN },
    { ...policy, briarwoodSpellPower: Infinity },
    { ...policy, briarwoodSpellPower: "15" },
    { ...policy, briarwoodSpellPower: 44 },
    { ...policy, royalSealHealingPower: null },
    { ...policy, royalSealHealingPower: 44 },
    { schema: policy.schema, id: policy.id },
  ])
    assert.throws(() => assertPaladinLegacyItemPolicy(invalid));
});

test("Paladin transport accepts the old real job and validates the optional policy before serialization", () => {
  const original = JSON.parse(
    gunzipSync(
      readFileSync(new URL("./fixtures/paladin-inactive-guardian-job.v1.json.gz", import.meta.url)),
    ),
  ).job;
  assertPaladinLegacyHealingJob(original);
  const changed = structuredClone(original);
  changed.workload.legacyItemsPolicy = {
    schema: "kfc-paladin-legacy-item-policy.v1",
    id: "briarwood-current-neutral",
    briarwoodSpellPower: 15,
  };
  assertPaladinLegacyHealingJob(changed);
  changed.workload.legacyItemsPolicy.briarwoodSpellPower = NaN;
  assert.throws(() => assertPaladinLegacyHealingJob(changed));
});

test("Paladin transport preserves complete native results and rejects an invalid item echo", () => {
  const saved = JSON.parse(
      readFileSync(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url)),
    ),
    reply = saved.reply;
  assert(reply?.result);
  const payload = structuredClone(reply);
  payload.result.legacyItemsPolicy = {
    schema: "kfc-paladin-legacy-item-policy.v1",
    id: "observed-reference",
    briarwoodSpellPower: 15,
  };
  assert.deepEqual(
    parsePaladinLegacyHealingJobReply(JSON.stringify(payload), payload.id, saved.request.detail),
    payload,
  );
  payload.result.legacyItemsPolicy.briarwoodSpellPower = 44;
  assert.throws(() =>
    parsePaladinLegacyHealingJobReply(JSON.stringify(payload), payload.id, saved.request.detail),
  );
});
