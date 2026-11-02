import assert from "node:assert/strict";
import test from "node:test";
import { parseGuideChapter } from "../packages/leveling/dist/index.js";
import { deriveGroundPickupReferences } from "./leveling-ground-pickups.mjs";

function fixture() {
  const chapter = parseGuideChapter(
    "step\n.goto 1433/0,-2472.16,-9366.72\n>>Open the Sunken Chest. Loot it for Oslow's Toolbox\n.complete 125,1 >>Oslow's Toolbox (1)",
    "chapter-test",
    "a".repeat(64),
    70205,
  );
  return {
    catalog: {
      sourceArchiveSha256: "a".repeat(64),
      quests: [
        { questId: 125, category: "unsupported", objectives: [], unsupportedRequirements: [] },
      ],
    },
    combat: {
      quests: [
        {
          questId: 125,
          onlyCreatureObjectives: false,
          creatureIds: [],
          itemCreatureIds: [],
          objectiveText: ["Recover Oslow's Toolbox."],
          itemObjectives: [
            {
              objectiveIndex: 1,
              itemId: 1309,
              itemName: "Oslow's Toolbox",
              quantity: 1,
              npcIds: [],
              sharing: "pooled",
            },
          ],
        },
      ],
    },
    chapters: [chapter],
    items: new Map([[1309, { id: 1309, name: "Oslow's Toolbox", data: { objectDrops: [32] } }]]),
    objects: new Map([
      [32, { id: 32, name: "Sunken Chest", data: { spawns: { 44: [[36.43, 54.66]] } } }],
    ]),
    areaMap: new Map([[44, "1433"]]),
  };
}
function derive(f) {
  return deriveGroundPickupReferences(
    f.catalog,
    f.combat,
    f.chapters,
    f.items,
    f.objects,
    f.areaMap,
  );
}

test("corroborates item/object identity and map positions without converting or rewriting source world coordinates", () => {
  const f = fixture(),
    before = JSON.stringify({ ...f, items: [...f.items], objects: [...f.objects] });
  const { proofs, conflicts } = derive(f);
  assert.deepEqual(conflicts, []);
  assert.equal(proofs.size, 1);
  assert.deepEqual(proofs.get(125).positions, [{ zone: "1433", x: 36.43, y: 54.66 }]);
  assert.equal(proofs.get(125).objectId, 32);
  assert.equal(proofs.get(125).itemId, 1309);
  assert.equal(JSON.stringify({ ...f, items: [...f.items], objects: [...f.objects] }), before);
});

test("holds missing or inconsistent source, item and object evidence", () => {
  for (const change of [
    (f) => f.items.clear(),
    (f) => f.objects.clear(),
    (f) => (f.items.get(1309).name = "Other Tool"),
    (f) => (f.items.get(1309).data.objectDrops = [33]),
    (f) => (f.objects.get(32).name = "Other Chest"),
    (f) => (f.objects.get(32).data.spawns = { 45: [[36, 54]] }),
    (f) => (f.objects.get(32).data.spawns = { 44: [[101, 54]] }),
    (f) => (f.combat.quests[0].itemObjectives[0].quantity = 2),
    (f) => (f.combat.quests[0].itemObjectives[0].npcIds = [10]),
    (f) => (f.combat.quests[0].creatureIds = [10]),
    (f) => (f.catalog.quests[0].providedItem = { itemId: 10, name: "Key" }),
    (f) =>
      f.chapters[0].steps[0].directives.push({
        tag: ".use",
        arguments: "10",
        text: "",
        condition: "",
        questId: null,
        position: null,
        sourceLine: 99,
      }),
  ]) {
    const f = fixture();
    change(f);
    assert.equal(derive(f).proofs.size, 0);
  }
});

test("corroborates a ground pickup's possible locations without treating location text as a combat spawn", () => {
  const f = fixture();
  const body =
    "step\n.goto 1433,36,54\n>>Open the Sunken Chest. Loot it for Oslow's Toolbox\n>>It has multiple spawn locations in the Lake\n.complete 125,1 >>Oslow's Toolbox (1)";
  f.chapters = [parseGuideChapter(body, "chapter-test", "a".repeat(64), 70205)];
  f.objects.get(32).data.spawns = {
    44: [
      [36, 54],
      [37, 55],
    ],
  };
  const result = derive(f);
  assert.equal(result.proofs.size, 1);
  assert.deepEqual(result.proofs.get(125).positions, [
    { zone: "1433", x: 36, y: 54 },
    { zone: "1433", x: 37, y: 55 },
  ]);
  assert.equal(result.proofs.get(125).objectId, 32);
  assert.equal(f.combat.quests[0].itemObjectives[0].quantity, 1);
});

test("does not pick one of several same-name objects or conflicting source targets", () => {
  const f = fixture();
  f.items.get(1309).data.objectDrops = [32, 33];
  f.objects.set(33, { id: 33, name: "Sunken Chest", data: { spawns: { 44: [[37, 55]] } } });
  assert.equal(derive(f).proofs.size, 0);
  f.objects.get(33).name = "Second Chest";
  const raw =
    "step\n.goto 1433,37,55\n>>Open the Second Chest. Loot it for Oslow's Toolbox\n.complete 125,1 >>Oslow's Toolbox (1)";
  f.chapters.push(parseGuideChapter(raw, "second", "b".repeat(64), 70205));
  const result = derive(f);
  assert.equal(result.proofs.size, 0);
  assert.deepEqual(result.conflicts, [125]);
});

test("retains eligibility holds instead of silently declaring a source task unrestricted", () => {
  const f = fixture();
  f.catalog.quests[0].unsupportedRequirements = ["requiredMinRep"];
  assert.equal(derive(f).proofs.size, 1);
  assert.deepEqual(f.catalog.quests[0].unsupportedRequirements, ["requiredMinRep"]);
});

test("does not drop source quest predicates, timers, skill checks or skipped objectives", () => {
  for (const [tag, args] of [
    [".isOnQuest", "999"],
    [".isQuestComplete", "125"],
    [".timer", "9,Wait"],
    [".skill", "164,100"],
  ]) {
    const f = fixture();
    f.chapters[0].steps[0].directives.push({
      tag,
      arguments: args,
      text: "",
      condition: "",
      questId: null,
      position: null,
      sourceLine: 99,
    });
    assert.equal(derive(f).proofs.size, 0);
  }
  const f = fixture();
  f.chapters[0].steps[0].condition = "skip";
  assert.equal(derive(f).proofs.size, 0);
  const own = fixture();
  own.chapters[0].steps[0].directives.push({
    tag: ".isOnQuest",
    arguments: "125",
    text: "",
    condition: "",
    questId: null,
    position: null,
    sourceLine: 99,
  });
  assert.equal(derive(own).proofs.size, 1);
});
