import { test } from "node:test";
import assert from "node:assert/strict";
import reviewedReference from "../packages/leveling/src/dungeon-reference.json" with { type: "json" };
import { parseDungeonReference } from "./leveling-dungeon-reference-parser.mjs";
const identities = {
  4768: { name_enus: "The Darkstone Tablet", _side: 2 },
  4974: { name_enus: "For The Horde!", _side: 2 },
};
const row = (id, side = "horde") =>
  `[tr][td][quest=${id}][/td][td]57[/td][td][icon name=side_${side}][/icon][/td][td][/td][td][/td][td][npc=9078][/td][/tr]`;
const parse = (markup) => parseDungeonReference(markup, identities, { requireComplete: false });
test("parses the real suffixed UBRS heading without evaluating markup", () => {
  const result = parse(
    `[h2]Upper Blackrock Spire - UBRS Dungeon Quests ([color=#ff0000]56[/color] 58 59)[/h2]${row(4768)}`,
  );
  assert.deepEqual(result.associations, [
    { dungeon: "Upper Blackrock Spire - UBRS", wing: null, questId: 4768 },
  ]);
});
test("normalizes whitespace, preserves wing identity and reuses shared quest IDs", () => {
  const result = parse(
    `[h2]Excavation Site:  Wetlands Dungeon Quests[/h2]${row(4768)}[h2]Scarlet Monastery Dungeon Quests[/h2][h3]All Wings[/h3]${row(4768)}[h3]Library[/h3]${row(4974)}`,
  );
  assert.equal(result.quests.length, 2);
  assert.equal(result.associations[0].dungeon, "Excavation Site: Wetlands");
  assert.equal(result.associations[2].wing, "Library");
});
test("fails closed for source changes, missing sections, identity omissions and duplicates", () => {
  assert.throws(() => parse(`[h2]Unreviewed Dungeon Quests[/h2]${row(4768)}`), /Unreviewed/);
  assert.throws(
    () => parse(`[h2]Scarlet Monastery Dungeon Quests[/h2][h3]New wing[/h3]${row(4768)}`),
    /Unreviewed wing/,
  );
  assert.throws(() => parse(`[h2]Ragefire Chasm Dungeon Quests[/h2]${row(9999)}`), /identities/);
  assert.throws(
    () => parse(`[h2]Ragefire Chasm Dungeon Quests[/h2]${row(4768)}${row(4768)}`),
    /Duplicate/,
  );
  assert.throws(
    () => parseDungeonReference(`[h2]Ragefire Chasm Dungeon Quests[/h2]${row(4768)}`, identities),
    /Missing quest section/,
  );
});
test("preserves a conflicting faction as unresolved, not unrestricted", () => {
  const result = parse(`[h2]Ragefire Chasm Dungeon Quests[/h2]${row(4768, "alliance")}`);
  assert.equal(result.quests[0].faction, null);
  assert.equal(result.quests[0].restrictionNotes.length, 1);
});
test("detects a lost reviewed row even when every section, wing and primary UBRS row remains", () => {
  const groups = new Map();
  for (const entry of reviewedReference.associations) {
    if (!groups.has(entry.dungeon)) groups.set(entry.dungeon, new Map());
    const wings = groups.get(entry.dungeon);
    if (!wings.has(entry.wing)) wings.set(entry.wing, []);
    wings.get(entry.wing).push(entry.questId);
  }
  const allIdentities = Object.fromEntries(
    reviewedReference.quests.map((q) => [q.id, { name_enus: q.title, _side: 2 }]),
  );
  const markup = [...groups]
    .map(
      ([name, wings]) =>
        `[h2]${name} Dungeon Quests[/h2]${[...wings].map(([wing, ids]) => `${wing ? `[h3]${wing}[/h3]` : ""}${ids.map((id) => row(id)).join("")}`).join("")}`,
    )
    .join("");
  assert.equal(
    parseDungeonReference(markup, allIdentities).associations.length,
    reviewedReference.associations.length,
  );
  assert.throws(
    () => parseDungeonReference(markup.replace(row(7761), ""), allIdentities),
    /Reviewed quest row disappeared/,
  );
  assert.throws(
    () => parseDungeonReference(markup.replace("[td][npc=9078][/td]", ""), allIdentities),
    /changed table columns/,
  );
});
