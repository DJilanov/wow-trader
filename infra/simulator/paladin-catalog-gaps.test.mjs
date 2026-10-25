import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinCatalogGapRules,
  recoverPaladinCatalogGaps,
  renderPaladinCatalogGaps,
} from "./paladin-catalog-gaps.mjs";
import { eligiblePaladinHealingItem } from "./paladin-healing-equipment.mjs";
import {
  assertPaladinCatalogHealingJob,
  parsePaladinCatalogHealingJobReply,
} from "./paladin-catalog-protocol.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/paladin-catalog-gaps-source.v1.json.gz", import.meta.url)),
  ),
);
const implementation = readFileSync(
  new URL("./paladin-item-health-regen.go", import.meta.url),
  "utf8",
);
const parent = { items: source.items },
  sources = source.sources;
const sample = JSON.parse(
  readFileSync(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url)),
);

test("all remaining explicit stat disagreements are corrected without overwriting observed stats", () => {
  const before = structuredClone(parent),
    beforeSources = structuredClone(sources);
  const result = recoverPaladinCatalogGaps(parent, sources, source);
  assert.equal(result.changes.length, 16);
  assert.deepEqual(result.addedIds, [20504, 20505]);
  for (const row of result.changes) {
    assert.deepEqual({ ...row.after, stats: row.before.stats }, row.before);
    assert.equal(
      result.sources.find((s) => s.id === row.id).statReview.historicalAcquisitionPreserved,
      true,
    );
  }
  const item = (id) => result.db.items.find((row) => row.id === id);
  assert.equal(item(872).stats[0], 7);
  assert.equal(item(872).stats[38], 7);
  assert.equal(item(250490).stats[28], 3);
  assert.equal(item(250497).stats[0], 3);
  assert.equal(item(2816).stats[11], 28);
  assert.deepEqual(
    item(272681),
    parent.items.find((row) => row.id === 272681),
  );
  assert.deepEqual(parent, before);
  assert.deepEqual(sources, beforeSources);
  assert.equal(result.numericalReuseAllowed, false);
});

test("eight health regeneration modifiers are modeled and eleven inactive modifiers retain their items", () => {
  const rules = extractPaladinCatalogGapRules(source);
  assert.equal(rules.healthRegen.length, 8);
  assert.equal(rules.inactiveModifiers.length, 11);
  assert(rules.inactiveModifiers.every((row) => row.retainedInEquipmentDomain && row.reason));
  assert.deepEqual(rules.healthRegenTickReferences, [2000, 5000]);
  assert.equal(rules.defaultHealthRegenTickMs, 2000);
  assert.equal(rules.healthRegenIsSpellHealing, false);
  assert.equal(rules.absentChannelsAssumedZero, false);
  assert.equal(rules.regenTimingVerified, false);
});

test("missing quest alternatives keep Paladin/Alliance and shared reward ownership restrictions", () => {
  const result = recoverPaladinCatalogGaps(parent, sources, source);
  const context = {
    profile: "holy-paladin",
    playerClass: 4,
    faction: 1,
    factionName: "Alliance",
    professions: [4, 11],
    originalItems: Array(17).fill(undefined),
    currentIds: new Set(),
    requireCraftAudit: true,
  };
  for (const [id, slot] of [
    [20504, 14],
    [20505, 10],
  ]) {
    const item = result.db.items.find((row) => row.id === id),
      origin = result.sources.find((row) => row.id === id);
    assert.equal(origin.questChoice, "quest:8418");
    assert.equal(origin.status, "classic-provisional");
    assert.deepEqual(item.classAllowlist, [4]);
    assert.equal(item.factionRestriction, 1);
    assert(eligiblePaladinHealingItem(item, origin, context, slot));
    assert(
      !eligiblePaladinHealingItem(
        item,
        origin,
        { ...context, faction: 2, factionName: "Horde" },
        slot,
      ),
    );
  }
  assert.equal(result.sources.find((row) => row.id === 20512).questChoice, "quest:8418");
  assert.equal(result.rules.newQuestBaseStatsVerified, false);
});

test("changed raw identifiers, rates, labels, diagnostics and current evidence fail closed", () => {
  for (const mutate of [
    (s) => {
      s.diagnostic.pop();
    },
    (s) => {
      s.unsupportedModifiers[0].value++;
    },
    (s) => {
      s.statTypeNames[46] = "SPELL_POWER";
    },
    (s) => {
      s.tables.GlobalStrings.find((row) => row.BaseTag === "ITEM_MOD_HEALTH_REGEN").TagText_lang =
        "Increases healing";
    },
    (s) => {
      s.currentItems.find((row) => row.itemId === 872).stats.find((row) => row.statType === 4)
        .value++;
    },
    (s) => {
      s.tables.ItemXItemEffect.push({ ItemID: 20505, ItemEffectID: 1 });
    },
    (s) => {
      s.historicalQuestEvidence.questId++;
    },
  ]) {
    const copy = structuredClone(source);
    mutate(copy);
    assert.throws(() => recoverPaladinCatalogGaps(parent, sources, copy));
  }
});

test("stale, duplicate, missing and already amended catalog inputs cannot be reused", () => {
  const changed = structuredClone(parent);
  changed.items.find((row) => row.id === 872).stats[0]++;
  assert.throws(() => recoverPaladinCatalogGaps(changed, sources, source));
  assert.throws(() =>
    recoverPaladinCatalogGaps({ items: [...parent.items, parent.items[0]] }, sources, source),
  );
  assert.throws(() =>
    recoverPaladinCatalogGaps(
      { items: parent.items.filter((row) => row.id !== 272681) },
      sources,
      source,
    ),
  );
  const recovered = recoverPaladinCatalogGaps(parent, sources, source);
  assert.throws(() => recoverPaladinCatalogGaps(recovered.db, recovered.sources, source));
});

test("derived owned regeneration adds only the actor hook and timing contract", () => {
  const result = renderPaladinCatalogGaps(source, implementation);
  assert(result.actor.includes("holy.registerKFCPaladinItemHealthRegen()"));
  assert(result.workload.includes('json:"itemHealthRegenTickMs,omitempty"'));
  assert(result.implementation.includes("2816:12"));
  assert(!result.implementation.includes("KFC_PALADIN_HEALTH_REGEN_VALUES"));
  assert.throws(() =>
    renderPaladinCatalogGaps(
      { ...source, integration: { ...source.integration, actor: "" } },
      implementation,
    ),
  );
});

test("timing transport keeps old jobs and accepts only the two explicit references", () => {
  assertPaladinCatalogHealingJob(sample.request);
  for (const itemHealthRegenTickMs of [2000, 5000]) {
    assertPaladinCatalogHealingJob({
      ...sample.request,
      workload: { ...sample.request.workload, itemHealthRegenTickMs },
    });
    const reply = structuredClone(sample.reply);
    reply.result.itemHealthRegenTickMs = itemHealthRegenTickMs;
    assert.equal(
      parsePaladinCatalogHealingJobReply(
        JSON.stringify(reply),
        sample.request.id,
        sample.request.detail,
      ).result.itemHealthRegenTickMs,
      itemHealthRegenTickMs,
    );
  }
  for (const value of [null, 0, 1000, 5000.1, "2000", true, NaN, {}]) {
    assert.throws(() =>
      assertPaladinCatalogHealingJob({
        ...sample.request,
        workload: { ...sample.request.workload, itemHealthRegenTickMs: value },
      }),
    );
    const reply = structuredClone(sample.reply);
    reply.result.itemHealthRegenTickMs = value;
    assert.throws(() =>
      parsePaladinCatalogHealingJobReply(
        JSON.stringify(reply),
        sample.request.id,
        sample.request.detail,
      ),
    );
  }
});
