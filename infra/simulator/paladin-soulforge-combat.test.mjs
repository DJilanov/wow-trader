import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  paladinSoulforgeCombatReference,
  preparePaladinSoulforgeCombatCatalog,
  renderPaladinSoulforgeCombat,
} from "./paladin-soulforge-combat.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture(name, expected) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(sha(bytes), expected);
  return JSON.parse(gunzipSync(bytes, { maxOutputLength: 4_000_000 }));
}
const evidence = fixture(
  "paladin-soulforge-source.v1.json.gz",
  "711be40d0e53e5fd4e25843bc195200d4c121e65231bfb910b5e57ceb63d1e55",
);
const parent = fixture(
  "paladin-soulforge-combat-parent.v1.json.gz",
  "d14231055a8785da34b73f2a2497f3d0b1e2b643e4bf76997f70a1264d5d8fe1",
);
assert.equal(sha(parent.itemSets), parent.source.sha256);
const implementation = readFileSync(
    new URL("./paladin-soulforge-combat.go", import.meta.url),
    "utf8",
  ),
  cadence = "one-ppm-reference";

test("requires a declared cadence instead of treating the client 100% flag as a measured server rate", () => {
  for (const value of [undefined, "", "100%-verified", "one-ppm-verified"])
    assert.throws(() => paladinSoulforgeCombatReference(evidence, value), /Explicit/);
  const before = structuredClone(evidence),
    reference = paladinSoulforgeCombatReference(evidence, cadence);
  assert.equal(reference.proc.clientChancePercent, 100);
  assert.equal(reference.proc.referencePPM, 1);
  assert.equal(reference.proc.serverCadenceVerified, false);
  assert.equal(reference.proc.durationMs, 10000);
  assert.equal(reference.proc.spellPower, 65);
  assert.equal(reference.healingModelUnchanged, true);
  assert.equal(reference.serverMechanicsVerified, false);
  assert.equal(reference.serverAcquisitionVerified, false);
  assert.equal(reference.numericalOptimizationAllowed, false);
  assert.equal(reference.publicationAllowed, false);
  assert.deepEqual(evidence, before);
});

test("rejects changed cadence fields, hotfixes and child duration or targeting", () => {
  for (const change of [
    (data) => {
      data.source.hotfixSha256 = "0".repeat(64);
    },
    (data) => {
      data.tables.SpellAuraOptions.find((row) => row.SpellID === 27498).ProcChance = 50;
    },
    (data) => {
      data.tables.SpellAuraOptions.find((row) => row.SpellID === 27498).SpellProcsPerMinuteID = 1;
    },
    (data) => {
      data.tables.SpellAuraOptions.find((row) => row.SpellID === 27498).ProcCategoryRecovery = 1000;
    },
    (data) => {
      data.tables.SpellDuration.find((row) => row.id === 1).Duration = 5000;
    },
    (data) => {
      data.tables.SpellMisc.find((row) => row.SpellID === 27499).RangeIndex = 2;
    },
  ]) {
    const changed = structuredClone(evidence);
    change(changed);
    assert.throws(() => paladinSoulforgeCombatReference(changed, cadence));
  }
});

test("extends only exact-ID dispatch and sourced constants, preserving unrelated parent bytes", () => {
  const result = renderPaladinSoulforgeCombat({
    itemSets: parent.itemSets,
    implementation,
    evidence,
    cadence,
  });
  assert.equal(result.itemSets.split("character.kfcForeverSoulforgeBonuses()").length, 2);
  const restored = result.itemSets
    .replace(
      "\n\t\tactiveBonuses = append(activeBonuses, character.kfcForeverSoulforgeBonuses()...)",
      "",
    )
    .replace(" || item.SetID == kfcSoulforgeSetID", "");
  assert.equal(restored, parent.itemSets);
  assert(result.implementation.includes("kfcSoulforgeProcPower = 65"));
  assert(result.implementation.includes("kfcSoulforgeDurationMs = 10000"));
  assert(!result.implementation.includes("KFC_SOULFORGE_COMBAT_CONSTANTS"));
});

test("refuses duplicate integration or an owned healer dispatcher requiring reconciliation", () => {
  for (const itemSets of [
    "package core",
    parent.itemSets + parent.itemSets,
    parent.itemSets + "\n// KFCOwnedPaladinHealingSetID",
  ])
    assert.throws(() =>
      renderPaladinSoulforgeCombat({ itemSets, implementation, evidence, cadence }),
    );
  assert.throws(() =>
    renderPaladinSoulforgeCombat({
      itemSets: parent.itemSets,
      implementation: "package core",
      evidence,
      cadence,
    }),
  );
});

test("reuses the existing current-stat and Alliance acquisition adapter without changing parent records", () => {
  const initial = { items: [], enchants: [] },
    before = structuredClone(initial);
  const result = preparePaladinSoulforgeCombatCatalog(initial, evidence);
  assert.equal(result.db.items.length, 8);
  for (const item of result.db.items) {
    assert.equal(item.setId, 516);
    assert.deepEqual(item.classAllowlist, [4]);
    assert.equal(item.factionRestriction, 1);
  }
  assert.equal(result.publicationAllowed, false);
  assert.deepEqual(initial, before);
  assert.throws(
    () => preparePaladinSoulforgeCombatCatalog(result.db, evidence),
    /Refusing to replace/,
  );
});
