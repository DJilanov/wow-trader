import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { renderPaladinCastCritItems } from "./paladin-cast-crit-items.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/paladin-cast-crit-items-source.v1.json.gz", import.meta.url)),
  ),
);

test("Paladin crit/cast projection preserves existing common effects and admits only the owned Analyzer", () => {
  const before = structuredClone(source),
    result = renderPaladinCastCritItems(source);
  assert.deepEqual(source, before);
  assert.equal(result.rules.blueDragon.spirit, 150);
  assert.equal(result.rules.blueDragon.procChance, 0.02);
  assert.equal(result.rules.analyzer.critPercentagePoints, 5);
  assert.equal(result.rules.analyzer.sharedCooldownMs, 20000);
  assert.equal(
    result.cooldowns,
    source.cooldowns.replace("13444, 272439:", "13444, 272439, 272438:"),
  );
  assert(result.cooldowns.includes("healer.GetInitialMajorCooldown(actionID).Spell == nil"));
  assert.equal(
    result.forever,
    source.forever.replace(
      "if result.DidCrit() {",
      "if result.DirectDamageOrHealing && result.DidCrit() {",
    ),
  );
  assert.equal(result.rules.publicationAllowed, false);
});

test("Paladin projection rejects changed source values, missing ownership checks and stale common effects", () => {
  const changes = [
    (s) => {
      s.tables.SpellAuraOptions.find((row) => row.SpellID === 23688).ProcChance = 100;
    },
    (s) => {
      s.tables.SpellEffect.find((row) => row.SpellID === 23684).EffectBasePointsF = 300;
    },
    (s) => {
      s.tables.ItemEffect.find((row) => row.SpellID === 1291101).CoolDownMSec = 30000;
    },
    (s) => {
      s.tables.SpellAuraOptions.find((row) => row.SpellID === 1291101).ProcCharges = 2;
    },
    (s) => {
      s.forever = s.forever.replace("aura.OnHealDealt = consume", "");
    },
    (s) => {
      s.common = s.common.replace("stats.Spirit: 150", "stats.Spirit: 0");
    },
    (s) => {
      s.cooldowns = "";
    },
    (s) => {
      s.cooldowns = s.cooldowns.replace(
        "healer.GetInitialMajorCooldown(actionID).Spell == nil",
        "false",
      );
    },
  ];
  for (const change of changes) {
    const copy = structuredClone(source);
    change(copy);
    assert.throws(() => renderPaladinCastCritItems(copy));
  }
});
