import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { reviewShamanActiveItemScope } from "./shaman-active-item-scope.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/shaman-active-item-source.v1.json.gz", import.meta.url)),
  ),
);
const find = (scope, id) => scope.decisions.find((row) => row.itemId === id);

test("accounts for all 72 current uses while retaining every equipment candidate", () => {
  const scope = reviewShamanActiveItemScope(source);
  assert.equal(scope.candidateItems, 2025);
  assert.equal(scope.currentUseItems, 72);
  assert.equal(scope.spellClosureCount, 75);
  assert.deepEqual(scope.counts, {
    "inactive-or-no-benefit-in-declared-assignment": 47,
    "existing-owned-controller": 12,
    "needs-runtime-or-reference-qualification": 9,
    "outside-declared-actor-scope": 4,
  });
  assert(scope.decisions.every((row) => row.retainedInEquipmentDomain));
  assert.equal(scope.allCandidateActiveChoicesAdmitted, false);
  assert.equal(scope.fullClassAdmission, false);
  assert.equal(scope.publicationAllowed, false);
});

test("keeps all nine resource-protection and health effects pending instead of assigning zero", () => {
  const scope = reviewShamanActiveItemScope(source);
  assert.deepEqual(
    scope.remainingRelevantItemIds,
    [8367, 10030, 10543, 10721, 13164, 18340, 18638, 18639, 272437],
  );
  for (const id of scope.remainingRelevantItemIds) {
    const row = find(scope, id);
    assert.equal(row.runtimeAdmitted, false);
    assert(row.clientEffects.length > 0);
    assert.equal(row.itemUse.TriggerType, 0);
    assert.equal(row.duration.Duration, row.duration.MaxDuration);
  }
});

test("preserves each shield's actual school, amount, variance, duration and cooldown", () => {
  const scope = reviewShamanActiveItemScope(source);
  const reference = [
    [8367, 126, 600, 0, 120000, 300000],
    [10543, 4, 400, 0.5, 60000, 3600000],
    [10721, 127, 500, 0, 600000, 3600000],
    [18340, 32, 1176, 0, 30000, 360000],
    [272437, 127, 450, 0, 15000, 90000],
  ];
  for (const [id, mask, amount, variance, duration, cooldown] of reference) {
    const row = find(scope, id),
      payload = row.clientEffects[0];
    assert.deepEqual(
      [
        payload.EffectMiscValue[0],
        payload.EffectBasePointsF,
        payload.Variance,
        row.duration.Duration,
        row.itemUse.CoolDownMSec,
      ],
      [mask, amount, variance, duration, cooldown],
    );
    assert.equal(payload.EffectBonusCoefficient, 0);
  }
  assert.equal(find(scope, 18340).itemUse.SpellCategoryID, 2554);
  assert.equal(find(scope, 18340).itemUse.CategoryCoolDownMSec, 30000);
  assert.equal(find(scope, 272437).itemUse.SpellCategoryID, 1141);
  assert.equal(find(scope, 272437).itemUse.CategoryCoolDownMSec, 15000);
  assert.equal(scope.schoolSpecificShieldSupportRequired, true);
});

test("uses Forever payloads rather than Classic names or remembered behavior", () => {
  const scope = reviewShamanActiveItemScope(source);
  assert.equal(find(scope, 1490).kind, "detection");
  assert.equal(find(scope, 13213).kind, "disarm-removal");
  assert.equal(find(scope, 11811).kind, "armor");
  assert.equal(find(scope, 18047).kind, "lava");
  assert.equal(find(scope, 18340).kind, "shadow-absorb");
  assert.equal(find(scope, 13965).kind, "hostile-critical-strike");
});

test("does not promote guardian equipment or encounter scripts into player-only support", () => {
  const scope = reviewShamanActiveItemScope(source);
  assert.deepEqual(scope.outsideActorItemIds, [12344, 13353, 13382, 16022]);
  assert(scope.outsideActorItemIds.every((id) => find(scope, id).retainedInEquipmentDomain));
  assert.equal(find(scope, 16022).classification, "outside-declared-actor-scope");
});

test("only scopes physical shields and Frost reflection away from the actual self-damage schools", () => {
  const scope = reviewShamanActiveItemScope(source);
  for (const id of [20071, 20072, 21115, 21116, 21117, 21118, 21119, 21120, 18634]) {
    assert.equal(find(scope, id).classification, "inactive-or-no-benefit-in-declared-assignment");
  }
  for (const id of [18638, 18639])
    assert.equal(find(scope, id).classification, "needs-runtime-or-reference-qualification");
});

test("rejects added, missing, duplicated, unknown and incorrectly inherited item roots", () => {
  for (const edit of [
    (value) => value.rows.pop(),
    (value) => value.rows.push(structuredClone(value.rows[0])),
    (value) => {
      value.rows[0].itemId = 999999;
    },
    (value) => {
      value.rows.find((row) => row.itemId === 8367).explicitUseControllerAdmitted = true;
    },
    (value) => {
      value.rows.find((row) => row.itemId === 11808).explicitUseControllerAdmitted = false;
    },
    (value) => {
      value.rows[0].link.ItemEffectID += 1;
    },
    (value) => {
      value.rows[0].effect.PlayerConditionID = 1;
    },
  ]) {
    const changed = structuredClone(source);
    edit(changed);
    assert.throws(() => reviewShamanActiveItemScope(changed));
  }
});

test("rejects newly helpful payloads or school changes behind an old inactive classification", () => {
  for (const [spellId, field, replacement] of [
    [23991, "EffectMiscValue", [127, 0]],
    [1300364, "EffectAura", 29],
    [1308917, "Effect", 10],
    [1249110, "EffectAura", 135],
    [1249113, "EffectAura", 29],
    [1302357, "ImplicitTarget", [21, 0]],
    [17512, "Effect", 10],
    [18374, "ImplicitTarget", [21, 0]],
    [22646, "EffectAura", 29],
    [1301625, "EffectBasePointsF", 1000],
  ]) {
    const changed = structuredClone(source);
    changed.tables.SpellEffect.find((row) => row.SpellID === spellId)[field] = replacement;
    assert.throws(() => reviewShamanActiveItemScope(changed), `${spellId}/${field}`);
  }
});

test("requires the complete triggered and descriptive closure without unknown spell evidence", () => {
  for (const edit of [
    (value) => {
      value.spellClosure = value.spellClosure.filter((id) => id !== 22646);
    },
    (value) => {
      value.tables.Spell = value.tables.Spell.filter((row) => row.id !== 13181);
    },
    (value) => {
      value.tables.SpellName.push(value.tables.SpellName[0]);
    },
    (value) => {
      value.unresolvedDescriptionSpellIds.push(13181);
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 17447).EffectTriggerSpell = 999999;
    },
  ]) {
    const changed = structuredClone(source);
    edit(changed);
    assert.throws(() => reviewShamanActiveItemScope(changed));
  }
});

test("assignment and self-damage source changes invalidate every scoped exclusion", () => {
  for (const [name, suffix] of [
    ["workload", "\n// New incoming caster damage\n"],
    ["consumes", "\n// New Frost self-damage resource\n"],
    ["utility", "\n// Changed Circle payload\n"],
    ["passives", "\n// Added attack-power conversion\n"],
    ["shield", "\n// Added school filtering\n"],
  ]) {
    const changed = structuredClone(source);
    changed.code[name] += suffix;
    assert.throws(() => reviewShamanActiveItemScope(changed), name);
  }
});

test("returns owned decisions without mutating or exposing the source review", () => {
  const input = structuredClone(source),
    before = JSON.stringify(input);
  const scope = reviewShamanActiveItemScope(input);
  assert.equal(JSON.stringify(input), before);
  const row = find(scope, 8367);
  row.clientEffects[0].EffectBasePointsF = 999999;
  row.itemUse.CoolDownMSec = 0;
  row.duration.Duration = 1;
  find(scope, 10030).radius[0].Radius = 10000;
  assert.equal(JSON.stringify(input), before);
});
