import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import {
  healingCooldownPolicy,
  renderHealingCooldownWorkload,
} from "./healing-cooldown-workload.mjs";

const source = readFileSync(new URL("./healing-workload.go", import.meta.url), "utf8");

test("resource policies are explicit and keep unreviewed/passive effects out", () => {
  assert.deepEqual(healingCooldownPolicy.manaItemIds, [3827, 6149, 4381, 12662, 13443, 13444]);
  assert.deepEqual(healingCooldownPolicy.manaSpellIds, [15604]);
  assert.equal(healingCooldownPolicy.implicitActivation, false);
  assert.equal(healingCooldownPolicy.midCastTimingSearch, false);
  assert.equal(healingCooldownPolicy.classMechanicsAdmission, false);
  assert.equal(healingCooldownPolicy.publicationAllowed, false);
  assert(Object.isFrozen(healingCooldownPolicy.manaItemIds));
});

test("the derived workload has one optional driver while preserving its original contract", () => {
  const derived = renderHealingCooldownWorkload(source);
  assert.equal(derived.split("healer.useKFCHealingCooldowns(sim, frame)").length, 2);
  assert(derived.includes('`json:"cooldowns,omitempty"`'));
  assert(derived.includes('frame.Schema != "kfc-healing-workload.v1"'));
  assert(!derived.includes("TryUseCooldowns("));
  assert.equal(renderHealingCooldownWorkload(source), derived);
  assert.equal(readFileSync(new URL("./healing-workload.go", import.meta.url), "utf8"), source);
});

test("changed or repeated integration anchors require an explicit source review", () => {
  assert.throws(
    () =>
      renderHealingCooldownWorkload(
        source.replace("type KFCHealingWorkload struct {", "type UnexpectedWorkload struct {"),
      ),
    /anchor/,
  );
  assert.throws(
    () => renderHealingCooldownWorkload(source + "\ntype KFCHealingWorkload struct {\n"),
    /anchor/,
  );
  assert.throws(
    () => renderHealingCooldownWorkload(renderHealingCooldownWorkload(source)),
    /anchor/,
  );
});
