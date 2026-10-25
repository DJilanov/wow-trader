import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  applyDruidFeralheartDispatch,
  druidFeralheartItemIds,
  extractDruidFeralheartRules,
  extendDruidFeralheartCatalog,
} from "./druid-feralheart-model.mjs";
const evidence = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/druid-feralheart-source.v1.json.gz", import.meta.url)),
  ),
);

test("base Feralheart keeps both six-piece effects and excludes the alternate identity", () => {
  const rules = extractDruidFeralheartRules(evidence);
  assert.deepEqual(
    [rules.setId, rules.excludedVariant, rules.healingPowerAtSix, rules.attackPowerAtSix],
    [513, 1667, 15, 26],
  );
  assert.deepEqual(
    [rules.proc.mana, rules.proc.rage, rules.proc.energy, rules.proc.chance],
    [300, 10, 40, 0.02],
  );
  assert.equal(rules.foreverRewardRelations, 7);
  assert.equal(rules.historicalRewardRelations, 1);
  assert.equal(rules.currentServerAcquisitionVerified, false);
});
test("current Feralheart records preserve all parent rows and only acquire through Druid pickup quests", () => {
  const parent = { items: [], enchants: [], zones: [] },
    before = JSON.stringify(parent),
    result = extendDruidFeralheartCatalog(parent, evidence);
  assert.equal(JSON.stringify(parent), before);
  assert.deepEqual(
    result.additions.map((row) => row.id),
    [...druidFeralheartItemIds],
  );
  assert(
    result.additions.every(
      (row) =>
        row.classAllowlist.length === 1 &&
        row.classAllowlist[0] === 1 &&
        row.setId === 513 &&
        row.stats.length === 44,
    ),
  );
  assert(
    result.sources.every(
      (row) =>
        row.acquisition.obtainableClass === 1 && row.acquisition.currentServerVerified === false,
    ),
  );
  assert(
    result.sources
      .find((row) => row.id === 22108)
      .notes.some((note) => note.includes("historical")),
  );
  assert.equal(result.numericalReuseAllowed, false);
  assert.throws(() => extendDruidFeralheartCatalog(result.db, evidence));
});
test("historical item stats cannot override captured current stats", () => {
  const changed = JSON.parse(JSON.stringify(evidence));
  for (const row of changed.historical) {
    row.stats = Array(44).fill(9999);
    row.armor = 9999;
  }
  assert.deepEqual(
    extendDruidFeralheartCatalog({ items: [] }, changed).db,
    extendDruidFeralheartCatalog({ items: [] }, evidence).db,
  );
});
test("missing thresholds, wrong acquisition class or concealed historical provenance fail", () => {
  for (const kind of ["threshold", "class", "historical"]) {
    const changed = JSON.parse(JSON.stringify(evidence));
    if (kind === "threshold")
      changed.normalized.setEffects = changed.normalized.setEffects.filter(
        (row) => !(row.ItemSetID === 513 && row.SpellID === 9334),
      );
    if (kind === "class") changed.classQuestEvidence[0].requiredClasses = 8;
    if (kind === "historical")
      changed.acquisition.relations.find(
        (row) => row.questId === 8913,
      ).currentForeverRewardPageReviewed = true;
    assert.throws(() => extractDruidFeralheartRules(changed));
  }
});
test("base dispatch overrides all name-based fallback without changing alternate handlers", () => {
  const source = {
    itemSets: evidence.engine["sim/core/item_sets.go"],
    foreverSets: evidence.engine["sim/core/forever_equipment_sets.go"],
  };
  const result = applyDruidFeralheartDispatch(source);
  assert(result.itemSets.includes("character.kfcFeralheartBonuses()"));
  assert(result.foreverSets.includes("if id == 513 {return true}"));
  assert(result.foreverSets.includes("if id == 513 {continue}"));
  assert(!result.foreverSets.includes("if id == 1667"));
  assert.throws(() => applyDruidFeralheartDispatch(result));
});
