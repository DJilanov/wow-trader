import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { prepareShamanFiveThundersDrafts } from "./shaman-five-thunders-drafts.mjs";

const evidence = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/shaman-five-thunders-source.v1.json.gz", import.meta.url)),
  ),
);

test("all eight current stat drafts retain base membership, raw wear and conditional acquisition", () => {
  const prepared = prepareShamanFiveThundersDrafts(evidence);
  assert.equal(prepared.drafts.length, 8);
  for (const row of prepared.drafts) {
    assert.equal(row.statDraft.setId, 519);
    assert.equal(row.rawWearClassMask, -1);
    assert.equal(row.referenceAcquisitionClassMask, 64);
    assert.equal(row.referenceAcquisitionFaction, "Horde");
    assert.equal(row.rewardRelations.length, 1);
    assert(row.rewardRelations[0].rewardItemIds.includes(row.itemId));
    assert.equal(row.catalogAdmissionAllowed, false);
  }
  assert.equal(prepared.numericalOptimizationAllowed, false);
  assert.equal(prepared.publicationAllowed, false);
});

test("current stats survive historical stat changes and caller evidence is preserved", () => {
  const before = structuredClone(evidence),
    prepared = prepareShamanFiveThundersDrafts(evidence),
    altered = structuredClone(evidence);
  for (const item of altered.historical) item.stats = Array(44).fill(999999);
  const again = prepareShamanFiveThundersDrafts(altered);
  assert.deepEqual(
    again.drafts.map((row) => row.statDraft.stats),
    prepared.drafts.map((row) => row.statDraft.stats),
  );
  assert.deepEqual(evidence, before);
  prepared.drafts[0].rewardRelations[0].rewardItemIds[0] = 1;
  assert.deepEqual(evidence, before);
});

test("draft preparation refuses missing icon identities and unsupported current stats", () => {
  const missing = structuredClone(evidence);
  missing.historical[0].id = 1;
  assert.throws(() => prepareShamanFiveThundersDrafts(missing));
  const unsupported = structuredClone(evidence);
  unsupported.normalized.items[0].stats.push({ statType: 9999, value: 1 });
  assert.throws(() => prepareShamanFiveThundersDrafts(unsupported));
});
