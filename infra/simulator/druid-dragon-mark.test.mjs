import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { extractDruidDragonMark, renderDruidDragonMark } from "./druid-dragon-mark.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-dragon-mark-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "b1dd4a750976f5d6456aa32215c9e3611dedc8be170c64a6c0c4edcae0ebc4ed",
);
const source = JSON.parse(gunzipSync(bytes));

test("Dragon Mark source links finite absorption to mana only while its shield holds", () => {
  const rules = extractDruidDragonMark(source);
  assert.deepEqual(
    [
      rules.itemId,
      rules.shield,
      rules.manaPerTick,
      rules.tickMs,
      rules.durationMs,
      rules.cooldownMs,
    ],
    [13143, 500, 22, 5000, 1800000, 1800000],
  );
  assert.equal(rules.manaRequiresActiveShield, true);
  assert.equal(rules.serverTimingVerified, false);
  assert.equal(rules.baseStatsRemainProvisional, true);
  assert.equal(rules.publicationAllowed, false);
});

test("changed ring ownership, shield, mana, cooldown or source linkage reject admission", () => {
  for (const mutate of [
    (row) => {
      row.tables.ItemXItemEffect[0].ItemID = 13144;
    },
    (row) => {
      row.tables.ItemEffect[0].CoolDownMSec = 120000;
    },
    (row) => {
      row.tables.SpellEffect[0].EffectBasePointsF = 1000;
    },
    (row) => {
      row.tables.SpellEffect[1].EffectAuraPeriod = 1000;
    },
    (row) => {
      row.tables.Spell[0].Description_lang = "unlinked permanent regeneration";
    },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => extractDruidDragonMark(changed));
  }
});

test("Dragon Mark derivation registers once and requires explicit owned cooldown policy", () => {
  const source = {
    baseline: "\tresto.registerKFCItemResources()",
    cooldowns: "policy.SpellID == 1302205 || policy.SpellID == 20554",
  };
  const result = renderDruidDragonMark(source);
  assert(result.baseline.includes("resto.registerKFCDragonMark()"));
  assert(result.cooldowns.includes("policy.SpellID == 17252"));
  assert.throws(() => renderDruidDragonMark(result));
});
