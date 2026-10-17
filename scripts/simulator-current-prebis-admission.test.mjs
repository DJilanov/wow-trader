import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { mergeCurrentPrebisRecovery } from "../infra/simulator/current-prebis-admission.mjs";
import { prebisSources, eligiblePrebis } from "../infra/simulator/prebis-pool.mjs";

const reviewed = JSON.parse(
  await readFile(
    new URL("../infra/simulator/current-prebis-equipment.json", import.meta.url),
    "utf8",
  ),
);
function fixture() {
  const review = globalThis.structuredClone(reviewed);
  return {
    review,
    normalized: {
      candidates: globalThis.structuredClone(review.candidates),
      blocked: globalThis.structuredClone(review.blocked),
    },
  };
}

test("current recovery preserves exact client stats and metadata while separating provisional sources", () => {
  const { review, normalized } = fixture();
  const original = globalThis.structuredClone({ review, normalized });
  const result = mergeCurrentPrebisRecovery({ items: [] }, review, normalized);
  assert.equal(result.addedCount, 26);
  assert.equal(result.equipment.items.length, 26);
  for (const candidate of review.candidates) {
    const item = result.equipment.items.find((item) => item.id === candidate.item.id);
    const source = result.currentItems.find((source) => source.id === item.id);
    const comparable = globalThis.structuredClone(item);
    delete comparable.factionRestriction;
    assert.deepEqual(comparable, candidate.item);
    assert.equal(source.statsProvenance, "current-client");
    assert.equal(source.acquisitionProvenance, "historical-provisional");
    assert.equal(source.requiredLevel, candidate.currentMetadata.requiredLevel);
    assert(![9394, 9419, 18760].includes(item.id));
  }
  assert.deepEqual({ review, normalized }, original);
});

test("PvP recovery keeps Rogue locks and current sets while marking faction access as a model assumption", () => {
  const { review, normalized } = fixture();
  const result = mergeCurrentPrebisRecovery({ items: [] }, review, normalized);
  for (const [id, faction, setId] of [
    [22879, 2, 0],
    [23258, 2, 0],
    [23298, 1, 548],
    [23313, 1, 548],
  ]) {
    const item = result.equipment.items.find((item) => item.id === id);
    assert.deepEqual(item.classAllowlist, [6]);
    assert.equal(item.setId ?? 0, setId);
    assert.equal(item.factionRestriction, faction);
    const source = result.currentItems.find((source) => source.id === id);
    assert.equal(source.sources[0].faction, faction === 1 ? "Alliance" : "Horde");
    assert.match(source.note, /server access is unverified/);
    assert([12, 14].includes(source.requiredPvpRankRaw));
  }
});

test("unmodeled utility and partial set procs remain disclosed rather than converted to damage", () => {
  const { review, normalized } = fixture();
  const result = mergeCurrentPrebisRecovery({ items: [] }, review, normalized);
  assert.match(
    result.currentItems.find((source) => source.id === 10776).note,
    /Root\/snare-duration reduction is not simulated/,
  );
  assert.match(
    result.currentItems.find((source) => source.id === 16710).note,
    /five-piece proc is not modeled/,
  );
  assert.match(
    result.currentItems.find((source) => source.id === 23313).note,
    /Gouge cooldown reduction is not simulated/,
  );
});

test("merging is idempotent and existing current items cannot be silently overwritten", () => {
  const { review, normalized } = fixture();
  const first = mergeCurrentPrebisRecovery({ items: [] }, review, normalized);
  const second = mergeCurrentPrebisRecovery(first.equipment, review, normalized);
  assert.equal(second.addedCount, 0);
  assert.deepEqual(second.equipment, first.equipment);
  const changed = globalThis.structuredClone(first.equipment);
  changed.items[0].stats[0]++;
  assert.throws(
    () => mergeCurrentPrebisRecovery(changed, review, normalized),
    /Refusing to overwrite/,
  );
});

test("changed evidence, unsupported IDs and raid-derived acquisition fail closed", () => {
  for (const change of [
    (x) => x.normalized.candidates[0].item.stats[0]++,
    (x) => (x.review.clientVersion = "other"),
    (x) => x.review.candidates.pop(),
    (x) => x.normalized.blocked.pop(),
  ]) {
    const input = fixture();
    change(input);
    assert.throws(() => mergeCurrentPrebisRecovery({ items: [] }, input.review, input.normalized));
  }
  const input = fixture();
  for (const value of [input.review, input.normalized]) {
    value.candidates[0].historicalSources = [{ drop: { zoneId: 2717 } }];
    value.candidates[0].historicalAcquisition = { allowed: true, kind: "dungeon", zoneIds: [2717] };
  }
  assert.throws(
    () => mergeCurrentPrebisRecovery({ items: [] }, input.review, input.normalized),
    /Unreviewed recovery acquisition/,
  );
});

test("recovered source metadata participates in the actual profession/class/faction eligibility path", () => {
  const { review, normalized } = fixture();
  const result = mergeCurrentPrebisRecovery({ items: [] }, review, normalized);
  const items = new Map(result.equipment.items.map((item) => [item.id, item]));
  const sources = prebisSources(
    { items: [] },
    { items: [], currentItems: result.currentItems },
    { schema: "kfc-prebis-craft-acquisition.v1", items: [] },
    items,
  );
  const alliance = {
    profile: "rogue",
    playerClass: 6,
    faction: 1,
    factionName: "Alliance",
    professions: [],
    originalItems: [],
    currentIds: new Set(),
  };
  assert(eligiblePrebis(items.get(23298), sources.get(23298), alliance, 4));
  assert(!eligiblePrebis(items.get(22879), sources.get(22879), alliance, 4));
  assert(
    !eligiblePrebis(
      items.get(23298),
      sources.get(23298),
      { ...alliance, playerClass: 9, profile: "warrior" },
      4,
    ),
  );
  assert(
    eligiblePrebis(
      items.get(22879),
      sources.get(22879),
      { ...alliance, faction: 2, factionName: "Horde" },
      4,
    ),
  );
});
