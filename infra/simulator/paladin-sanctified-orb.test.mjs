import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { equipmentOwnership } from "./equipment-ownership.mjs";
import {
  extractPaladinSanctifiedOrb,
  extendPaladinOrbCatalog,
  renderPaladinSanctifiedOrb,
} from "./paladin-sanctified-orb.mjs";
import {
  assertPaladinOrbHealingJob,
  parsePaladinOrbHealingJobReply,
} from "./paladin-orb-protocol.mjs";

const source = JSON.parse(
    gunzipSync(
      readFileSync(new URL("./fixtures/paladin-sanctified-orb-source.v3.json.gz", import.meta.url)),
    ),
  ),
  template = readFileSync(new URL("./paladin-sanctified-orb.go", import.meta.url), "utf8"),
  sample = JSON.parse(
    readFileSync(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url)),
  );

test("current Orb is mana-only and item cooldown overrides the raw spell category", () => {
  const before = structuredClone(source),
    rules = extractPaladinSanctifiedOrb(source);
  assert.deepEqual(source, before);
  assert.deepEqual(rules.mana, { mean: 340, minimum: 318.75, maximum: 361.25 });
  assert.equal(rules.cooldownMs, 300000);
  assert.equal(rules.sharedCategory, 0);
  assert.equal(rules.sharedCooldownMs, 0);
  assert.deepEqual(rules.spellCategoryDefaults, { category: 30, recoveryMs: 60000 });
  assert.equal(rules.consumesCategory, 1153);
  assert.equal(rules.serverMechanicsVerified, false);
  assert.equal(rules.currentBaseStatsVerified, false);
});

test("source changes cannot silently import the old critical use or change target and cooldown semantics", () => {
  for (const change of [
    (s) => {
      s.tables.SpellEffect[0].Effect = 6;
    },
    (s) => {
      s.tables.ItemEffect[0].CoolDownMSec = 180000;
    },
    (s) => {
      s.tables.ItemEffect[0].SpellCategoryID = 30;
    },
    (s) => {
      s.tables.SpellEffect[0].ImplicitTarget = [21, 0];
    },
    (s) => {
      s.tables.SpellEffect[0].EffectBonusCoefficient = 1;
    },
    (s) => {
      s.tables.ItemSparse = [{ id: 20512 }];
    },
    (s) => {
      s.sharedCategoryEvidence.consumableItemEffects[0].SpellCategoryID = 30;
    },
    (s) => {
      s.cooldownInterpretation.id = "spell-category-only";
    },
  ]) {
    const copy = structuredClone(source);
    change(copy);
    assert.throws(() => extractPaladinSanctifiedOrb(copy));
  }
});

test("catalog addition preserves every parent record and enforces the three-way quest choice", () => {
  const parent = {
      items: structuredClone(source.historicalQuestAlternatives),
      enchants: [{ id: 1 }],
    },
    sources = parent.items.map((item) => ({
      id: item.id,
      sources: [{ kind: "dungeon-quest", questId: 8418 }],
    })),
    before = structuredClone({ parent, sources }),
    result = extendPaladinOrbCatalog(parent, sources, source);
  assert.deepEqual({ parent, sources }, before);
  assert.deepEqual(result.db.items.slice(0, -1), parent.items);
  assert.deepEqual(result.db.enchants, parent.enchants);
  assert.deepEqual(result.addedIds, [20512]);
  const orb = result.db.items.at(-1);
  assert.equal(orb.factionRestriction, 1);
  assert.deepEqual(orb.classAllowlist, [4]);
  for (const item of result.db.items) {
    const metadata = result.sources.find((row) => row.id === item.id);
    assert.deepEqual(equipmentOwnership(item, metadata), {
      questRewardOnce: true,
      questChoices: ["quest:8418"],
    });
  }
  assert.throws(() => extendPaladinOrbCatalog(result.db, result.sources, source));
});

test("derived integration removes only the historical use and retains owned cooldown admission", () => {
  const result = renderPaladinSanctifiedOrb(source, template);
  assert(result.items.includes("core.NewItemEffect(SanctifiedOrb, registerKFCSanctifiedOrb)"));
  assert(!result.items.includes("stats.MeleeCrit: 3"));
  assert(result.paladin.includes("kfcSanctifiedOrb *kfcSanctifiedOrbState"));
  assert(result.workload.includes("ConfigureKFCSanctifiedOrbArea"));
  assert(result.workload.includes("OrbArea: healer.KFCSanctifiedOrbArea()"));
  assert(result.cooldowns.includes("272438, 20512:"));
  assert(result.cooldowns.includes("healer.GetInitialMajorCooldown(actionID).Spell == nil"));
  assert.throws(() =>
    renderPaladinSanctifiedOrb(
      { ...source, integration: { ...source.integration, cooldowns: "" } },
      template,
    ),
  );
});

test("Orb area transport preserves old jobs and rejects unsupported area values before JSON normalization", () => {
  assertPaladinOrbHealingJob(sample.request);
  parsePaladinOrbHealingJobReply(
    JSON.stringify(sample.reply),
    sample.reply.id,
    sample.request.detail,
  );
  for (const orbArea of ["neutral", "haunted", "wasteland"]) {
    assertPaladinOrbHealingJob({
      ...sample.request,
      workload: { ...sample.request.workload, orbArea },
    });
    const reply = structuredClone(sample.reply);
    reply.result.orbArea = orbArea;
    assert.equal(
      parsePaladinOrbHealingJobReply(JSON.stringify(reply), reply.id, sample.request.detail).result
        .orbArea,
      orbArea,
    );
  }
  for (const orbArea of ["", null, 0, Number.NaN, {}, "raid"]) {
    assert.throws(() =>
      assertPaladinOrbHealingJob({
        ...sample.request,
        workload: { ...sample.request.workload, orbArea },
      }),
    );
    const reply = structuredClone(sample.reply);
    reply.result.orbArea = orbArea;
    assert.throws(() =>
      parsePaladinOrbHealingJobReply(JSON.stringify(reply), reply.id, sample.request.detail),
    );
  }
});
