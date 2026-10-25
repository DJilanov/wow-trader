import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { URL } from "node:url";
import {
  extractHealingRacialRules,
  renderHealingRacialCooldowns,
} from "./healing-racial-cooldowns.mjs";

const bytes = await readFile(
  new URL("./fixtures/healing-racial-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "6b4298e33c78c98eb5cf4e2a85b697de26f758f3e053a5d1c55e2a5be35b54e4",
);
const source = JSON.parse(gunzipSync(bytes)),
  policy = await readFile(new URL("./healing-cooldowns.go", import.meta.url), "utf8");

test("current client racial has a fixed ten percent cast buff and a real three minute cooldown", () => {
  const rules = extractHealingRacialRules(source);
  assert.deepEqual(
    [rules.spellId, rules.castSpeedMultiplier, rules.durationMs, rules.cooldownMs],
    [20554, 1.1, 10000, 180000],
  );
  assert.equal(rules.implicitActivation, false);
  assert.equal(rules.publicationAllowed, false);
});
test("changed magnitude, duration, cost, race or cooldown evidence requires review", () => {
  for (const change of [
    (value) => {
      value.effects[2].EffectBasePointsF = 30;
    },
    (value) => {
      value.durations[0].Duration = 20000;
    },
    (value) => {
      value.cooldowns[0].RecoveryTime = 120000;
    },
    (value) => {
      value.abilities[0].RaceMasks = [1, 0];
    },
    (value) => {
      value.power.push({ PowerCost: 10 });
    },
  ]) {
    const altered = globalThis.structuredClone(source);
    change(altered);
    assert.throws(() => extractHealingRacialRules(altered));
  }
});
test("racial extension preserves explicit policy ownership, cooldown manager and cast boundaries", () => {
  const derived = renderHealingRacialCooldowns(policy, extractHealingRacialRules(source));
  assert.match(derived, /healer.Race != proto.Race_RaceTroll/);
  assert.match(derived, /policy.MinimumMissingMana != 0/);
  assert.match(derived, /healer.GetInitialMajorCooldown\(actionID\).Spell == nil/);
  assert.match(derived, /cooldown.TryActivate\(sim, &healer.Character\)/);
  assert.match(derived, /healer.IsCasting\(sim\)/);
  assert.match(derived, /policy.RequireHealingDemand/);
  assert.throws(() => renderHealingRacialCooldowns(derived, extractHealingRacialRules(source)));
  assert.throws(() =>
    renderHealingRacialCooldowns(policy + policy, extractHealingRacialRules(source)),
  );
});
