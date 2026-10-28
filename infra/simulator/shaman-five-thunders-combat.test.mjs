import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  prepareShamanFiveThundersCombatCatalog,
  renderShamanFiveThundersCombat,
  shamanFiveThundersCombatReference,
} from "./shaman-five-thunders-combat.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture(name, expected) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(sha(bytes), expected);
  return JSON.parse(gunzipSync(bytes, { maxOutputLength: 4_000_000 }));
}
const evidence = fixture(
  "shaman-five-thunders-source.v1.json.gz",
  "2d8c648bbe99a8d5a63a6e704448dcf8ed98c7f65ffb10623ba2e7e74c9ebb5a",
);
const parent = fixture(
  "shaman-five-thunders-combat-parent.v1.json.gz",
  "55077709a95bb64220e5611d6f023e9d22b6d480a5b332d323565e3f9f2e9899",
);
assert.equal(sha(parent.itemSets), parent.source.sha256);
const implementation = readFileSync(
  new URL("./shaman-five-thunders-combat.go", import.meta.url),
  "utf8",
);
const routing = "completed-owner-magic-casts-reference";

test("combat Five Thunders declares cast routing without borrowing the alternate's bonuses", () => {
  const before = structuredClone(evidence);
  const reference = shamanFiveThundersCombatReference(evidence, routing);
  assert.equal(reference.setId, 519);
  assert.equal(reference.excludedVariantSetId, 1679);
  assert.deepEqual(
    reference.itemIds,
    Array.from({ length: 8 }, (_, index) => 22095 + index),
  );
  assert.equal(reference.proc.parentSpellId, 27774);
  assert.equal(reference.proc.childSpellId, 27775);
  assert.equal(reference.proc.chancePercent, 4);
  assert.equal(reference.proc.durationMs, 10000);
  assert.equal(reference.proc.cooldownMs, 0);
  assert.equal(reference.proc.attemptsPerCompletedCast, 1);
  assert.equal(reference.proc.checksHitOutcome, false);
  assert.equal(reference.proc.serverRoutingVerified, false);
  assert.equal(reference.rawWearClassMask, -1);
  assert.equal(reference.acquisitionFaction, "Horde");
  assert.equal(reference.healingModelUnchanged, true);
  assert.equal(reference.acquisitionAdmitted, false);
  assert.equal(reference.numericalOptimizationAllowed, false);
  assert.equal(reference.publicationAllowed, false);
  assert.deepEqual(evidence, before);
});

test("combat routing and current payload drift are refused", () => {
  for (const value of [undefined, "", "verified", "all-periodic-events"])
    assert.throws(() => shamanFiveThundersCombatReference(evidence, value), /Explicit/);
  for (const change of [
    (data) => {
      data.source.hotfixSha256 = "0".repeat(64);
    },
    (data) => {
      data.tables.SpellAuraOptions.find((row) => row.SpellID === 27774).ProcChance = 100;
    },
    (data) => {
      data.tables.ItemSetSpell.find((row) => row.ItemSetID === 519 && row.Threshold === 4).SpellID =
        450626;
    },
    (data) => {
      data.tables.SpellDuration.find((row) => row.Duration === 10000).Duration = 5000;
    },
  ]) {
    const changed = structuredClone(evidence);
    change(changed);
    assert.throws(() => shamanFiveThundersCombatReference(changed, routing));
  }
});

test("exact base-ID integration preserves every unrelated dispatcher byte", () => {
  const result = renderShamanFiveThundersCombat({
    itemSets: parent.itemSets,
    implementation,
    evidence,
    routing,
  });
  const restored = result.itemSets
    .replace(
      "\n\t\tactiveBonuses = append(activeBonuses, character.kfcCombatFiveThundersBonuses()...)",
      "",
    )
    .replace(" || item.SetID == kfcCombatFiveThundersSetID", "");
  assert.equal(restored, parent.itemSets);
  assert(result.implementation.includes("kfcCombatFiveThundersProcPower = 65"));
  assert(result.implementation.includes("kfcCombatFiveThundersStaticPower = 23"));
  assert(!result.implementation.includes("KFC_COMBAT_FIVE_THUNDERS_CONSTANTS"));
  assert.throws(() =>
    renderShamanFiveThundersCombat({
      itemSets: result.itemSets,
      implementation,
      evidence,
      routing,
    }),
  );
  assert.throws(
    () =>
      renderShamanFiveThundersCombat({
        itemSets: parent.itemSets + "\n// KFCOwnedShamanHealingSet",
        implementation,
        evidence,
        routing,
      }),
    /reconciliation/,
  );
  assert.throws(
    () =>
      renderShamanFiveThundersCombat({
        itemSets: "package core",
        implementation,
        evidence,
        routing,
      }),
    /anchor/,
  );
});

test("component catalog keeps raw wear unrestricted and leaves quest access unadmitted", () => {
  const catalog = {
    items: [{ id: 100, name: "Existing" }],
    enchants: [{ id: 1 }],
    extra: ["preserved"],
  };
  const sources = [{ id: 100, sources: [{ drop: { npcId: 1 } }] }];
  const before = structuredClone({ catalog, sources });
  const prepared = prepareShamanFiveThundersCombatCatalog(catalog, sources, evidence);
  assert.equal(prepared.db.items.length, 9);
  assert.deepEqual(prepared.db.items[0], catalog.items[0]);
  assert.deepEqual(prepared.db.enchants, catalog.enchants);
  assert.deepEqual(prepared.db.extra, catalog.extra);
  for (const item of prepared.db.items.slice(1)) {
    assert.equal(item.setId, 519);
    assert.equal(item.classAllowlist, undefined);
  }
  for (const source of prepared.sources.slice(1)) {
    assert.equal(source.rawWearClassMask, -1);
    assert.equal(source.acquisitionAdmitted, false);
    assert.equal(source.serverAccessVerified, false);
    assert.deepEqual(source.sources, []);
  }
  assert.deepEqual({ catalog, sources }, before);
  assert.equal(prepared.numericalQualification, false);
  assert.equal(prepared.publicationAllowed, false);
  assert.throws(
    () => prepareShamanFiveThundersCombatCatalog(prepared.db, prepared.sources, evidence),
    /already present/,
  );
});
