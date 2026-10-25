import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { auditDungeonUpgradeCatalogs } from "./dungeon-upgrade-catalog-audit.mjs";

const evidence = JSON.parse(
    gunzipSync(
      await readFile(
        new URL("./fixtures/dungeon-upgrade-set-definitions.v1.json.gz", import.meta.url),
      ),
    ),
  ),
  snapshot = evidence.snapshot,
  catalog = (items) => ({
    id: "isolated-test-catalog",
    release: "0".repeat(24),
    profiles: ["isolated-test-profile"],
    items,
  });

test("all nine source sets and 72 base items remain missing from an empty catalog without becoming unavailable claims", () => {
  const result = auditDungeonUpgradeCatalogs({ snapshot, catalogs: [catalog([])] });
  assert.equal(result.baseSetCount, 9);
  assert.equal(result.baseItemCount, 72);
  assert.equal(result.identityCoverageComplete, false);
  for (const set of result.sets) {
    assert.equal(set.clientDefinitionsComplete, true);
    assert.equal(set.coverage[0].missingItemIds.length, 8);
  }
  for (const key of [
    "statsCompared",
    "effectsCompared",
    "acquisitionVerified",
    "optimizationCompared",
    "publicationAllowed",
  ])
    assert.equal(result[key], false);
});

test("complete identity coverage does not claim acquisition, effect accuracy or a measured set comparison", () => {
  const items = snapshot.items
    .filter((row) => row.setId >= 511 && row.setId <= 519)
    .map((row) => ({ id: row.itemId, name: row.name, setId: row.setId }));
  const result = auditDungeonUpgradeCatalogs({ snapshot, catalogs: [catalog(items)] });
  assert.equal(result.identityCoverageComplete, true);
  assert.equal(result.effectsCompared, false);
  assert.equal(result.optimizationCompared, false);
  const feral = result.sets.find((row) => row.setId === 513);
  assert.deepEqual(
    feral.effects.filter((row) => row.threshold === 6).map((row) => row.spellId),
    [9334, 9344],
  );
});

test("same-name alternate sets and wrong set IDs never satisfy the base set", () => {
  const alternate = snapshot.items.find((row) => row.setId === 1778);
  assert(alternate);
  const result = auditDungeonUpgradeCatalogs({
      snapshot,
      catalogs: [
        catalog([
          {
            id: alternate.itemId,
            name: alternate.name,
            setId: 1778,
            setName: "Battlegear of Heroism",
          },
          { id: 900001, setId: 511 },
          { id: 21994, setId: 1778 },
        ]),
      ],
    }),
    heroism = result.sets.find((row) => row.setId === 511);
  assert.equal(heroism.coverage[0].identityCoverageComplete, false);
  assert.equal(heroism.coverage[0].missingItemIds.length, 7);
  assert.deepEqual(heroism.coverage[0].mismatchedSetItems, [{ id: 21994, runtimeSetId: 1778 }]);
  assert(heroism.coverage[0].relatedCatalogItems.some((row) => row.id === alternate.itemId));
  assert(heroism.coverage[0].relatedCatalogItems.some((row) => row.id === 900001));
});

test("missing or inconsistent client evidence remains incomplete even when all runtime IDs are present", () => {
  const changed = globalThis.structuredClone(snapshot),
    item = changed.items.find((row) => row.itemId === 21994);
  item.setId = 1778;
  const ids = changed.sets.find((row) => row.id === 511).ItemID.filter(Boolean),
    result = auditDungeonUpgradeCatalogs({
      snapshot: changed,
      catalogs: [catalog(ids.map((id) => ({ id, setId: 511 })))],
    }),
    set = result.sets.find((row) => row.setId === 511);
  assert.equal(set.clientDefinitionsComplete, false);
  assert.equal(set.coverage[0].identityCoverageComplete, false);
  assert.deepEqual(set.definitions.find((row) => row.id === 21994).issues, [
    "client-set-membership-mismatch",
  ]);
});

test("duplicate identities and missing required set metadata fail closed; inputs remain unchanged", () => {
  const before = globalThis.structuredClone(snapshot);
  auditDungeonUpgradeCatalogs({ snapshot, catalogs: [catalog([])] });
  assert.deepEqual(snapshot, before);
  assert.throws(() =>
    auditDungeonUpgradeCatalogs({ snapshot, catalogs: [catalog([{ id: 21994 }, { id: 21994 }])] }),
  );
  const changed = globalThis.structuredClone(snapshot);
  changed.sets = changed.sets.filter((row) => row.id !== 511);
  assert.throws(() => auditDungeonUpgradeCatalogs({ snapshot: changed, catalogs: [catalog([])] }));
});
