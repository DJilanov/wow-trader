import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { eligiblePrebis } from "./prebis-pool.mjs";
import { prepareShamanFiveThundersCatalog } from "./shaman-five-thunders.mjs";

const bytes = readFileSync(
  new URL("fixtures/shaman-five-thunders-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "2d8c648bbe99a8d5a63a6e704448dcf8ed98c7f65ffb10623ba2e7e74c9ebb5a",
);
const evidence = JSON.parse(gunzipSync(bytes));
const existing = JSON.parse(
  gunzipSync(
    readFileSync(new URL("fixtures/paladin-healing-equipment-source.v1.json.gz", import.meta.url)),
  ),
);

test("append all eight current rows without altering parent records or inventing wearer restrictions", () => {
  const parent = { items: existing.items, enchants: [{ id: 1 }] },
    sources = existing.sources;
  const original = structuredClone({ parent, sources });
  const result = prepareShamanFiveThundersCatalog(parent, sources, evidence);
  assert.deepEqual({ parent, sources }, original);
  assert.deepEqual(result.db.items.slice(0, parent.items.length), parent.items);
  assert.deepEqual(result.sources.slice(0, sources.length), sources);
  assert.deepEqual(result.db.enchants, parent.enchants);
  assert.deepEqual(result.addedIds, [22095, 22096, 22097, 22098, 22099, 22100, 22101, 22102]);
  for (const item of result.db.items.slice(parent.items.length)) {
    assert.equal(item.setId, 519);
    assert.equal(item.stats.length, 44);
    assert.equal(item.classAllowlist, undefined);
    assert.equal(item.factionRestriction, undefined);
  }
  result.db.items[0].stats[0] += 1;
  result.sources[0].id = -1;
  assert.deepEqual({ parent, sources }, original);
});

test("mechanics rows cannot become acquisition-approved optimizer candidates", () => {
  const result = prepareShamanFiveThundersCatalog(
    { items: existing.items },
    existing.sources,
    evidence,
  );
  for (const id of result.addedIds) {
    const item = result.db.items.find((row) => row.id === id),
      source = result.sources.find((row) => row.id === id);
    assert.deepEqual(source.sources, []);
    assert.equal(source.rawWearClassMask, -1);
    assert.equal(source.acquisitionAdmitted, false);
    assert.equal(source.serverAccessVerified, false);
    assert.equal(source.referenceAcquisition.classMask, 64);
    assert.equal(source.referenceAcquisition.faction, "Horde");
    for (const faction of [1, 2])
      for (let slot = 0; slot < 17; slot++) {
        assert.equal(
          eligiblePrebis(
            item,
            source,
            {
              playerClass: 7,
              faction,
              factionName: faction === 1 ? "Alliance" : "Horde",
              professions: [4, 11],
              originalItems: Array(17).fill(undefined),
              currentIds: new Set(),
              requireCraftAudit: true,
            },
            slot,
          ),
          false,
        );
      }
  }
  assert.equal(result.acquisitionAdmitted, false);
  assert.equal(result.publicationAllowed, false);
});

test("duplicate catalog identities and alternate set substitution fail closed", () => {
  assert.throws(() => prepareShamanFiveThundersCatalog({ items: [{ id: 22095 }] }, [], evidence));
  assert.throws(() => prepareShamanFiveThundersCatalog({ items: [] }, [{ id: 22095 }], evidence));
  const altered = structuredClone(evidence);
  altered.normalized.items[0].setId = 1679;
  assert.throws(() => prepareShamanFiveThundersCatalog({ items: [] }, [], altered));
});
