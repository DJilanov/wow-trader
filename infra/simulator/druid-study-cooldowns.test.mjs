import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractDruidStudyCooldownRules,
  renderDruidStudyCooldowns,
} from "./druid-study-cooldowns.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-study-cooldown-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "07b2d766209396f25c9f5de0bba01620fc3c8cc3676546990724dcad6c24accc",
);
const fixture = JSON.parse(gunzipSync(bytes)),
  common =
    "core.NewSimpleStatOffensiveTrinketEffect(272439,\n\t\tstats.Stats{stats.Spirit: 72}, 15*time.Second, 90*time.Second)";

test("Serenity admission binds current payload, ownership and explicit item selector", () => {
  const rules = extractDruidStudyCooldownRules(fixture, common);
  assert.deepEqual(
    [rules.spirit, rules.durationMs, rules.cooldownMs, rules.sharedDurationMs],
    [72, 15000, 90000, 15000],
  );
  assert.equal(rules.implicitActivation, false);
  assert.equal(rules.actionSelector, "itemId");
  for (const mutate of [
    (value) => {
      value.tables.ItemEffect[0].CategoryCoolDownMSec = 0;
    },
    (value) => {
      value.tables.SpellEffect[0].EffectBasePointsF = 100;
    },
    (value) => {
      value.tables.SpellEffect[0].EffectTriggerSpell = 1;
    },
    (value) => {
      value.tables.ItemEffect[0].PlayerConditionID = 1;
    },
  ]) {
    const changed = structuredClone(fixture);
    mutate(changed);
    assert.throws(() => extractDruidStudyCooldownRules(changed, common));
  }
  assert.throws(() => extractDruidStudyCooldownRules(fixture, common.replace("72", "73")));
});

test("cooldown admission changes one reviewed selector and refuses ambiguous or repeated application", () => {
  const original = "case 3827, 6149, 4381, 12662, 13443, 13444:";
  assert.equal(
    renderDruidStudyCooldowns(original),
    "case 3827, 6149, 4381, 12662, 13443, 13444, 272439:",
  );
  assert.throws(() => renderDruidStudyCooldowns(original + original));
  assert.throws(() => renderDruidStudyCooldowns(renderDruidStudyCooldowns(original)));
});
