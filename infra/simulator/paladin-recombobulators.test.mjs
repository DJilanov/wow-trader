import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinRecombobulators,
  renderPaladinRecombobulators,
} from "./paladin-recombobulators.mjs";
import {
  assertPaladinRecombobulatorHealingJob,
  parsePaladinRecombobulatorHealingJobReply,
} from "./paladin-recombobulator-protocol.mjs";

const source = JSON.parse(
    gunzipSync(
      readFileSync(new URL("./fixtures/paladin-recombobulator-source.v1.json.gz", import.meta.url)),
    ),
  ),
  template = readFileSync(new URL("./paladin-recombobulators.go", import.meta.url), "utf8"),
  sample = JSON.parse(
    readFileSync(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url)),
  );

test("Recombobulator payloads retain current amounts, Engineering and effective item categories", () => {
  const before = structuredClone(source),
    rules = extractPaladinRecombobulators(source);
  assert.deepEqual(source, before);
  assert.deepEqual(
    rules.items.map((row) => [row.itemId, row.engineeringSkill, row.healing.mean, row.mana.mean]),
    [
      [4381, 140, 270, 128],
      [18637, 275, 666, 304],
    ],
  );
  for (const row of rules.items) {
    assert.equal(row.sharedCategory, 1153);
    assert.equal(row.cooldownMs, 300000);
    assert.equal(row.sharedCooldownMs, 120000);
    assert.equal(row.charges, 10);
    assert.equal(row.range, 30);
  }
  assert.equal(rules.criticalReference, false);
  assert.equal(rules.criticalSensitivitySupported, true);
});

test("changed healing, mana, target, profession or cooldown records require a fresh review", () => {
  for (const change of [
    (s) => {
      s.tables.ItemSparse[0].RequiredSkill = 0;
    },
    (s) => {
      s.tables.ItemEffect[0].Charges = 0;
    },
    (s) => {
      s.tables.ItemEffect[0].SpellCategoryID = 30;
    },
    (s) => {
      s.tables.SpellEffect[1].EffectBasePointsF++;
    },
    (s) => {
      s.tables.SpellEffect[0].ImplicitTarget = [1, 0];
    },
    (s) => {
      s.tables.SpellEffect[2].EffectBonusCoefficient = 1;
    },
    (s) => {
      s.tables.SpellRange[0].RangeMax = [40, 40];
    },
  ]) {
    const copy = structuredClone(source);
    change(copy);
    assert.throws(() => extractPaladinRecombobulators(copy));
  }
});

test("derived integration removes only the marker controller's free consumable and preserves unrelated source", () => {
  const rendered = renderPaladinRecombobulators(source, template);
  assert(rendered.consumes.includes("owner.UsesKFCOwnedRecombobulators()"));
  assert(rendered.actor.includes("holy.registerKFCPaladinRecombobulators()"));
  assert(rendered.cooldowns.includes("TargetRaidIndex *int32"));
  assert(rendered.cooldowns.includes("tryKFCPaladinRecombobulator"));
  assert(rendered.cooldowns.includes("20512, 18637:"));
  assert(rendered.requestRules.includes("validateKFCPaladinRecombobulatorSelection(player)"));
  assert(rendered.orbTests.includes("other=4381"));
  assert(rendered.orbTests.includes("kfcPaladinRecombFixture"));
  assert.throws(() =>
    renderPaladinRecombobulators(
      { ...source, integration: { ...source.integration, consumes: "" } },
      template,
    ),
  );
});

test("friendly resource targeting is explicit and remains scoped to owned item actions", () => {
  for (const targetRaidIndex of [-1, 0, 1])
    assertPaladinRecombobulatorHealingJob({
      ...sample.request,
      workload: {
        ...sample.request.workload,
        recombobulatorCanCrit: true,
        cooldowns: [
          { itemId: 18637, targetRaidIndex, minimumMissingHealth: 100, minimumMissingMana: 200 },
        ],
      },
    });
  for (const change of [
    { targetRaidIndex: 1.2 },
    { targetRaidIndex: 39 },
    { targetRaidIndex: null },
    { minimumMissingHealth: Number.NaN },
    { minimumMissingHealth: -1 },
    { minimumMissingHealth: 1000001 },
  ])
    assert.throws(() =>
      assertPaladinRecombobulatorHealingJob({
        ...sample.request,
        workload: { ...sample.request.workload, cooldowns: [{ itemId: 4381, ...change }] },
      }),
    );
  assert.throws(() =>
    assertPaladinRecombobulatorHealingJob({
      ...sample.request,
      workload: { ...sample.request.workload, cooldowns: [{ itemId: 13444, targetRaidIndex: 0 }] },
    }),
  );
});

test("critical sensitivity preserves old jobs and rejects null or coerced policies", () => {
  assertPaladinRecombobulatorHealingJob(sample.request);
  parsePaladinRecombobulatorHealingJobReply(
    JSON.stringify(sample.reply),
    sample.reply.id,
    sample.request.detail,
  );
  for (const value of [false, true]) {
    assertPaladinRecombobulatorHealingJob({
      ...sample.request,
      workload: { ...sample.request.workload, recombobulatorCanCrit: value },
    });
    const reply = structuredClone(sample.reply);
    reply.result.recombobulatorCanCrit = value;
    assert.equal(
      parsePaladinRecombobulatorHealingJobReply(
        JSON.stringify(reply),
        reply.id,
        sample.request.detail,
      ).result.recombobulatorCanCrit,
      value,
    );
  }
  for (const value of [null, 0, "false", {}]) {
    assert.throws(() =>
      assertPaladinRecombobulatorHealingJob({
        ...sample.request,
        workload: { ...sample.request.workload, recombobulatorCanCrit: value },
      }),
    );
    const reply = structuredClone(sample.reply);
    reply.result.recombobulatorCanCrit = value;
    assert.throws(() =>
      parsePaladinRecombobulatorHealingJobReply(
        JSON.stringify(reply),
        reply.id,
        sample.request.detail,
      ),
    );
  }
});
