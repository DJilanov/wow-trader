import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import {
  classicPreRaidEvidence,
  classicReferenceRevision,
  classicReferenceSha256,
} from "../infra/simulator/classic-acquisition.mjs";
import { mergeClassicPrebis } from "../infra/simulator/prebis-pool.mjs";

const load = async (name) =>
  JSON.parse(await readFile(new URL(`../infra/simulator/${name}`, import.meta.url), "utf8"));
const reference = await load("classic-prebis-equipment.json");
const accessories = await load("classic-prebis-reference.json");
const fixture = (sources = []) => ({ id: 1234, type: 1, ilvl: 60, sources });

test("raid drops, bosses, reputation and vendors override explicit pre-raid claims", () => {
  for (const source of [
    { drop: { zoneId: 2717 } },
    { drop: { zoneId: 2677 } },
    { drop: { zoneId: 3429 } },
    { drop: { npcId: 6109 } },
    { drop: { npcId: 14889 } },
    { rep: { repFactionId: 749 } },
    { rep: { repFactionId: 270 } },
    { soldBy: { zoneId: 3428 } },
  ])
    assert.equal(
      classicPreRaidEvidence(fixture([source]), ["ui/warrior/gear_sets/p0.bis.gear.json"]).allowed,
      false,
    );
  assert.equal(classicPreRaidEvidence(fixture()).allowed, false);
  assert.equal(classicPreRaidEvidence(fixture([{ crafted: { profession: 1 } }])).allowed, false);
  assert.equal(classicPreRaidEvidence(fixture([{ drop: { zoneId: 1584 } }])).allowed, true);
});

test("pinned reference provides revalidated non-raid evidence for every equipment type", () => {
  assert.equal(reference.revision, classicReferenceRevision);
  assert.equal(reference.sourceSha256, classicReferenceSha256);
  assert.equal(reference.items.length, 839);
  assert.deepEqual(
    [...new Set(reference.items.map((entry) => entry.item.type))].sort((a, b) => a - b),
    Array.from({ length: 14 }, (_, i) => i + 1),
  );
  assert.equal(new Set(reference.items.map((entry) => entry.item.id)).size, reference.items.length);
  for (const entry of reference.items) {
    const paths = reference.presets
      .filter((preset) => preset.ids.includes(entry.item.id))
      .map((preset) => preset.resource);
    assert.deepEqual(
      classicPreRaidEvidence(entry.item, paths),
      entry.evidence,
      String(entry.item.id),
    );
    assert.equal(entry.item.stats.length, 44);
    assert(entry.item.stats.every(Number.isFinite));
  }
  for (const id of [17182, 19019, 19364, 18832, 16963, 21329])
    assert(!reference.items.some((entry) => entry.item.id === id), `Raid item ${id}`);
});

test("full import preserves current stats and refuses tampered acquisition evidence", () => {
  const first = reference.items[0].item;
  const current = { ...first, name: "Current Forever values", stats: Array(44).fill(7) };
  const merged = mergeClassicPrebis({ items: [current] }, accessories, new Set(), reference);
  assert.deepEqual(
    merged.equipment.items.find((item) => item.id === current.id),
    current,
  );
  assert.deepEqual(
    [
      ...new Set(
        merged.manifest.items.map(
          (entry) => merged.equipment.items.find((item) => item.id === entry.id).type,
        ),
      ),
    ].sort((a, b) => a - b),
    Array.from({ length: 14 }, (_, i) => i + 1),
  );
  const tampered = globalThis.structuredClone(reference);
  tampered.items[0].item.sources = [{ drop: { zoneId: 2717 } }];
  assert.throws(
    () => mergeClassicPrebis({ items: [] }, accessories, new Set(), tampered),
    /Invalid|Unreviewed/,
  );
  assert.throws(
    () =>
      mergeClassicPrebis({ items: [] }, accessories, new Set(), {
        ...reference,
        revision: "latest",
      }),
    /Unreviewed/,
  );
});
