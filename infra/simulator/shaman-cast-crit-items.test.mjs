import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { extractShamanCastCritItems } from "./shaman-cast-crit-items.mjs";

const evidence = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/shaman-shared-equipment-source.v1.json.gz", import.meta.url)),
  ),
);
const prior = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/paladin-cast-crit-items-source.v1.json.gz", import.meta.url)),
  ),
);
const input = {
  evidence,
  common: prior.common,
  forever: prior.forever.replace(
    "if result.DidCrit() {",
    "if result.DirectDamageOrHealing && result.DidCrit() {",
  ),
};

test("binds current Shaman cast/crit items without introducing another handler or server claim", () => {
  const rules = extractShamanCastCritItems(input);
  assert.equal(rules.blueDragon.spirit, 150);
  assert.equal(rules.blueDragon.spiritRegenWhileCastingOverride, false);
  assert.equal(rules.analyzer.critPercentagePoints, 5);
  assert.equal(rules.analyzer.consumedBy, "nonperiodic-critical-effect");
  assert.equal(rules.usesExistingCommonHandlers, true);
  assert.equal(rules.fullClassAdmission, false);
  assert.equal(rules.startsNewClassClock, false);
});

test("rejects stale proc payloads, shared categories and periodic critical consumption", () => {
  for (const edit of [
    (value) => {
      value.evidence.tables.SpellAuraOptions.find((row) => row.SpellID === 23688).ProcChance = 4;
    },
    (value) => {
      value.evidence.tables.SpellEffect.find((row) => row.SpellID === 23684).EffectBasePointsF =
        100;
    },
    (value) => {
      value.evidence.tables.ItemEffect.find((row) => row.SpellID === 1291101).SpellCategoryID =
        2554;
    },
    (value) => {
      value.forever = value.forever.replace("result.DirectDamageOrHealing && ", "");
    },
    (value) => {
      value.common = value.common.replace("ProcChance: .02", "ProcChance: .04");
    },
  ]) {
    const changed = structuredClone(input);
    edit(changed);
    assert.throws(() => extractShamanCastCritItems(changed));
  }
});
