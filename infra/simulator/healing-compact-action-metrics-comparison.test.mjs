import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { canonicalizeHealingActionMetrics } from "./healing-action-metrics-comparison.mjs";
import { canonicalizeCompactHealingActionMetrics } from "./healing-compact-action-metrics-comparison.mjs";

const bytes = readFileSync(
  new URL("fixtures/healing-compact-action-metrics.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "95d0c786da1e7e8a857b4de5741cdec9e9a0312a48fa8bece3f384dd139cd06e",
);
const source = JSON.parse(gunzipSync(bytes));
assert.equal(source.schema, "kfc-compact-healing-metrics-source.v1");

test("actual compact Go measurement preserves omitted fields and the complete numerical payload", () => {
  const input = structuredClone(source.metrics),
    before = structuredClone(input);
  assert.throws(() => canonicalizeHealingActionMetrics(input), /Invalid unit metrics/);
  const result = canonicalizeCompactHealingActionMetrics(input);
  assert.deepEqual(input, before);
  assert.equal(Object.hasOwn(input.parties[0].players[0], "pets"), false);
  assert.equal(Object.hasOwn(result.parties[0].players[0], "pets"), false);
  for (const party of result.parties)
    for (const player of party.players) {
      const original =
        input.parties[result.parties.indexOf(party)].players[party.players.indexOf(player)];
      assert.deepEqual(Object.keys(player), Object.keys(original));
      for (const action of player.actions ?? [])
        assert(original.actions.some((row) => JSON.stringify(row) === JSON.stringify(action)));
    }
});

test("action map order is canonical while unit target and metric differences remain observable", () => {
  const original = canonicalizeCompactHealingActionMetrics(source.metrics),
    reordered = structuredClone(source.metrics);
  for (const party of reordered.parties)
    for (const player of party.players) player.actions?.reverse();
  assert.deepEqual(canonicalizeCompactHealingActionMetrics(reordered), original);
  const target = reordered.parties[0].players[0].actions[0].targets.find((row) =>
    Number.isFinite(row.healing),
  );
  assert(target);
  target.healing += 1;
  assert.notDeepEqual(canonicalizeCompactHealingActionMetrics(reordered), original);
  const shifted = structuredClone(source.metrics);
  shifted.parties[0].players.reverse();
  assert.notDeepEqual(canonicalizeCompactHealingActionMetrics(shifted), original);
});

test("duplicate identities and malformed present arrays remain errors", () => {
  const duplicate = structuredClone(source.metrics),
    player = duplicate.parties[0].players[0];
  player.actions.push(structuredClone(player.actions[0]));
  assert.throws(
    () => canonicalizeCompactHealingActionMetrics(duplicate),
    /Duplicate compact action ID/,
  );
  for (const key of ["actions", "pets"]) {
    const bad = structuredClone(source.metrics);
    bad.parties[0].players[0][key] = null;
    assert.throws(() => canonicalizeCompactHealingActionMetrics(bad));
  }
  assert.throws(() => canonicalizeCompactHealingActionMetrics({ parties: [{ players: null }] }));
});
