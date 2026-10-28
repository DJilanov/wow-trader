import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  preparePriestVirtuousCombatCatalog,
  priestVirtuousCombatReference,
  renderPriestVirtuousCombat,
} from "./priest-virtuous-combat.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
function fixture(name, expected) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(sha(bytes), expected);
  return JSON.parse(gunzipSync(bytes, { maxOutputLength: 4_000_000 }));
}
const evidence = fixture(
    "priest-virtuous-source.v1.json.gz",
    "c4327cd064bd0f5d5aecc39c286639227a8d6d28a99e758c9630e75014802d53",
  ),
  healingEvidence = fixture(
    "priest-client-healing-source.v1.json.gz",
    "e4ed880f99c62ca8de42ee1f20e22800541df6849d90e56b15811b4d0e3940ab",
  ),
  parent = fixture(
    "priest-virtuous-combat-parent.v1.json.gz",
    "9067476db105564d817062d08ab19b1736ef14823c15976aaea7f3f70cbac64a",
  );
for (const source of Object.values(parent.source))
  assert.equal(sha(source.content), source.byteSha256);
const talentsParent = fixture(
  "priest-virtuous-talents-parent.v1.json.gz",
  "40cd4cb258fe3c48e477390652957eabfde290d5e4ae453072b1372093678649",
);
assert.equal(sha(talentsParent.content), talentsParent.byteSha256);
const input = {
  ...Object.fromEntries(Object.entries(parent.source).map(([key, row]) => [key, row.content])),
  talents: talentsParent.content,
  modelImplementation: readFileSync(new URL("./priest-virtuous-model.go", import.meta.url), "utf8"),
  referenceImplementation: readFileSync(
    new URL("./priest-virtuous-reference.go", import.meta.url),
    "utf8",
  ),
  familyImplementation: readFileSync(
    new URL("./priest-virtuous-combat-family.go", import.meta.url),
    "utf8",
  ),
  evidence,
  healingEvidence,
};

test("native DPS bridge preserves the captured shield curve and unverified source policies", () => {
  const before = structuredClone({ evidence, healingEvidence });
  const reference = priestVirtuousCombatReference(evidence, healingEvidence);
  assert.deepEqual(reference.actors, ["shadowPriest", "smitePriest"]);
  assert.deepEqual(reference.shieldCapacityMultipliers, [1, 1.07, 1.14, 1.2]);
  assert.deepEqual(reference.shieldClassMask, [1, 0, 0, 0]);
  for (const field of [
    "generalHealingModifiers",
    "ownedHealerRuntimeChanged",
    "nativePowerWordShieldImplemented",
    "serverMechanicsVerified",
    "serverAcquisitionVerified",
    "numericalOptimizationAllowed",
    "publicationAllowed",
  ])
    assert.equal(reference[field], false, field);
  assert.deepEqual({ evidence, healingEvidence }, before);
});

test("renders the native provider and exact base-ID dispatch without changing unrelated source", () => {
  const before = structuredClone(input),
    rendered = renderPriestVirtuousCombat(input);
  assert.deepEqual(input, before);
  assert(rendered.modelImplementation.includes("provider.KFCVirtuousShieldMultiplier()"));
  assert(rendered.modelImplementation.includes('panic("Virtuous combat reference requires'));
  assert(!rendered.modelImplementation.includes("FamilyMultiplier: 1,"));
  assert(rendered.referenceImplementation.includes("kfcVirtuousShieldAmount = 488"));
  assert(rendered.referenceImplementation.includes("kfcVirtuousICDMs = 60000"));
  assert(rendered.referenceImplementation.includes("kfcVirtuousShieldDurationMs = 30000"));
  assert(rendered.familyImplementation.includes("[...]float64{1, 1.07, 1.14, 1.2}"));
  assert(rendered.familyImplementation.includes("Invalid Improved Power Word Shield rank"));
  assert(!rendered.familyImplementation.includes("KFC_VIRTUOUS_COMBAT_FAMILY_CURVE"));
  assert(!rendered.referenceImplementation.includes("KFC_VIRTUOUS_CLIENT_CONSTANTS"));
  assert(!rendered.familyImplementation.includes("kfcClientHealingSpells"));
  assert.equal(
    rendered.itemSets.replace(
      "\n\t\tactiveBonuses = append(activeBonuses, character.kfcForeverVirtuousBonuses()...)",
      "",
    ),
    input.itemSets,
  );
  assert.equal(
    rendered.foreverSets
      .replace("\n\tif id == 514 { return kfcVirtuousBonusSupported(id, pieces) }", "")
      .replace("\n\tif id == 514 { return true }", "")
      .replace("\n\t\tif id == 514 { continue }", ""),
    input.foreverSets,
  );
  assert.equal(rendered.priest, input.priest);
  assert.equal(
    rendered.talents.replace(
      "\n  if priest.Env.IsForever() {\n    priest.AddStatDependency(stats.BonusArmor, stats.Armor, 1)\n  }",
      "",
    ),
    input.talents,
  );
});

test("refuses duplicate dispatch, armor dependencies, foreign factory flags and owned healer source", () => {
  const rendered = renderPriestVirtuousCombat(input);
  assert.throws(() => renderPriestVirtuousCombat({ ...input, ...rendered }), /already dispatched/);
  assert.throws(
    () =>
      renderPriestVirtuousCombat({ ...input, priest: input.priest + "\nkfcClientHealingSpells" }),
    /Owned healer/,
  );
  assert.throws(
    () =>
      renderPriestVirtuousCombat({
        ...input,
        priest: input.priest + "\nstats.BonusArmor, stats.Armor",
      }),
    /dependency already exists/,
  );
  assert.throws(() =>
    renderPriestVirtuousCombat({
      ...input,
      priest: input.priest.replace("SpellFlagAgentReserved1", "SpellFlagAgentReserved2"),
    }),
  );
  assert.throws(
    () =>
      renderPriestVirtuousCombat({ ...input, foreverSets: input.foreverSets + input.foreverSets }),
    /ambiguous/,
  );
});

test("preserves parent data and gives all eight current items the separate Priest acquisition restriction", () => {
  const catalog = { items: [{ id: 17 }], spells: [{ id: 18 }], enchants: [] },
    before = structuredClone(catalog),
    prepared = preparePriestVirtuousCombatCatalog(catalog, evidence, healingEvidence);
  assert.deepEqual(catalog, before);
  assert.deepEqual(prepared.catalog.items.slice(0, 1), before.items);
  assert.deepEqual(prepared.catalog.spells, before.spells);
  assert.deepEqual(
    prepared.additions.map((row) => row.id),
    Array.from({ length: 8 }, (_, i) => 22078 + i),
  );
  for (const item of prepared.additions) {
    assert.equal(item.setId, 514);
    assert.deepEqual(item.classAllowlist, [5]);
    assert.equal(item.stats.length, 44);
  }
  assert.equal(prepared.modelAdmissionAllowed, false);
  assert.throws(
    () => preparePriestVirtuousCombatCatalog(prepared.catalog, evidence, healingEvidence),
    /replace/,
  );
});

test("refuses changed snapshots or a shield curve without matching client evidence", () => {
  const changed = structuredClone(healingEvidence);
  changed.source.hotfixSha256 = "0".repeat(64);
  assert.throws(() => priestVirtuousCombatReference(evidence, changed), /hotfixes/);
  const changedParent = {
    ...input,
    modelImplementation: input.modelImplementation.replace(
      "FamilyMultiplier: 1,",
      "FamilyMultiplier: 2,",
    ),
  };
  assert.throws(() => renderPriestVirtuousCombat(changedParent), /ambiguous/);
});
