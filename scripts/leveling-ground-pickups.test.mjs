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

test("matches a known named source zone to its canonical object map", () => {
  const f = fixture();
  const numeric = derive(f).proofs.get(125);
  f.chapters[0].steps[0].directives.find((row) => row.position).position.zone = "Redridge Mountains";
  const named = derive(f).proofs.get(125);
  assert.deepEqual(named, numeric);
  assert.equal(named.objectId, 32);
});

test("rejects a known named zone that differs from the object map", () => {
  const f = fixture();
  f.chapters[0].steps[0].directives.find((row) => row.position).position.zone = "Elwynn Forest";
  assert.equal(derive(f).proofs.size, 0);
});

test("rejects an unknown source-zone name without inferring a map", () => {
  const f = fixture();
  f.chapters[0].steps[0].directives.find((row) => row.position).position.zone = "Unmapped Test Zone";
  assert.equal(derive(f).proofs.size, 0);
});

test("derives an unlabeled single pickup only with the provider's object relation", () => {
  const f = fixture();
  f.combat.quests[0].itemObjectives[0].objectIds = [32];
  f.chapters[0].steps[0].directives.find((row) => row.tag === ".complete").text = "";
  const result = derive(f);
  assert.equal(result.proofs.get(125)?.objectId, 32);
  assert.equal(result.proofs.get(125)?.quantity ?? 1, 1);
  delete f.combat.quests[0].itemObjectives[0].objectIds;
  assert.equal(derive(f).proofs.size, 0);
});

test("does not generalize an unlabeled source restricted to a class at step level", () => {
  const f = fixture();
  f.combat.quests[0].itemObjectives[0].objectIds = [32];
  const step = f.chapters[0].steps[0];
  step.directives.find((row) => row.tag === ".complete").text = "";
  step.condition = "Mage";
  assert.equal(derive(f).proofs.size, 0);
});

test("does not generalize an unlabeled source restricted at directive level", () => {
  const f = fixture();
  f.combat.quests[0].itemObjectives[0].objectIds = [32];
  const complete = f.chapters[0].steps[0].directives.find((row) => row.tag === ".complete");
  complete.text = "";
  complete.condition = "Mage";
  assert.equal(derive(f).proofs.size, 0);
});

test("does not bind an unlabeled opening instruction to a different provider object", () => {
  const f = fixture();
  f.combat.quests[0].itemObjectives[0].objectIds = [32];
  f.chapters[0].steps[0].directives.find((row) => row.tag === ".complete").text = "";
  f.objects.get(32).name = "Unrelated Chest";
  assert.equal(derive(f).proofs.size, 0);
});

function collectionFixture() {
  const f = fixture();
  f.catalog.quests[0].questId = 99127;
  f.combat.quests[0] = {
    questId: 99127,
    creatureIds: [],
    itemCreatureIds: [],
    onlyCreatureObjectives: false,
    objectiveText: ["Check the fishing traps in Crystal Lake."],
    itemObjectives: [
      {
        objectiveIndex: 1,
        itemId: 286205,
        itemName: "Half-Eaten Fish",
        quantity: 7,
        npcIds: [],
        sharing: "unknown",
      },
    ],
  };
  f.chapters = [
    parseGuideChapter(
      "step\n#loop\n.goto 1429,48.5,58.3\n>>Loot the Fishing Nets in the water for the Half-Eaten Fish\n.complete 99127,1 >>Half-Eaten Fish (7)",
      "chapter-test",
      "a".repeat(64),
      70205,
    ),
  ];
  f.items = new Map([
    [286205, { id: 286205, name: "Half-Eaten Fish", data: { objectDrops: [694772] } }],
  ]);
  f.objects = new Map([
    [694772, { id: 694772, name: "Fishing Trap", data: { spawns: { 12: [[48.3, 58.7]] } } }],
  ]);
  f.areaMap = new Map([[12, "1429"]]);
  return f;
}

function multiObjectiveFixture() {
  const f = fixture(),
    first = f.combat.quests[0].itemObjectives[0];
  first.objectIds = [32];
  f.combat.quests[0].itemObjectives.push({
    ...first,
    objectiveIndex: 2,
    itemId: 1310,
    itemName: "Second Toolbox",
    objectIds: [33],
  });
  f.items.set(1310, { id: 1310, name: "Second Toolbox", data: { objectDrops: [33] } });
  f.objects.set(33, { id: 33, name: "Second Chest", data: { spawns: { 44: [[37, 55]] } } });
  f.chapters = [
    parseGuideChapter(
      [
        "step",
        ".goto 1433,36,54",
        ">>On the arrow location, press your Interact key to loot Oslow's Toolbox from outside the boat",
        ".complete 125,1 >>Oslow's Toolbox (1)",
        "step",
        ".goto 1433,37,55",
        ">>Loot the Second Toolbox inside the second boat",
        ".complete 125,2 >>Second Toolbox (1)",
      ].join("\n"),
      "chapter-test",
      "a".repeat(64),
      70205,
    ),
  ];
  return f;
}

test("proves each item/object counter of a complete two-objective pickup", () => {
  const f = multiObjectiveFixture(),
    before = JSON.stringify({ ...f, items: [...f.items], objects: [...f.objects] });
  const result = derive(f);
  assert.equal(result.proofs.size, 0);
  assert.deepEqual(
    result.multiProofs.get(125).map((p) => [p.objectiveIndex, p.itemId, p.objectId]),
    [
      [1, 1309, 32],
      [2, 1310, 33],
    ],
  );
  assert.equal(JSON.stringify({ ...f, items: [...f.items], objects: [...f.objects] }), before);
});

test("does not publish the first counter as a complete quest when the second proof is missing", () => {
  const f = multiObjectiveFixture();
  f.objects.delete(33);
  const result = derive(f);
  assert.equal(result.proofs.size, 0);
  assert.equal(result.multiProofs.size, 0);
});

test("does not reuse the first object's instruction or location for the second item", () => {
  const f = multiObjectiveFixture();
  f.chapters[0].steps[1].directives.find((d) => d.tag === "text").text =
    "Loot Oslow's Toolbox inside the boat";
  const result = derive(f);
  assert.equal(result.proofs.size, 0);
  assert.equal(result.multiProofs.size, 0);
});

test("recognizes a plural collection and selects a corroborated same-name variant without merging its positions", () => {
  const f = collectionFixture(),
    item = f.combat.quests[0].itemObjectives[0];
  Object.assign(item, {
    itemId: 5273,
    itemName: "Mathystra Relic",
    quantity: 6,
    objectIds: [12654, 13872],
  });
  f.combat.quests[0].objectiveText = ["Bring six Mathystra Relics to the captain."];
  f.items = new Map([
    [5273, { id: 5273, name: "Mathystra Relic", data: { objectDrops: [12654, 13872] } }],
  ]);
  f.objects = new Map([
    [12654, { id: 12654, name: "Mathystra Relic", data: { spawns: { 12: [[50, 50]] } } }],
    [
      13872,
      {
        id: 13872,
        name: "Mathystra Relic",
        data: {
          spawns: {
            12: [
              [51, 51],
              [52, 52],
            ],
          },
        },
      },
    ],
  ]);
  f.chapters = [
    parseGuideChapter(
      "step\n.goto 1429,50,50\n>>Loot the Mathystra Relics on the ground\n.complete 99127,1 >>Mathystra Relics (6)",
      "chapter-test",
      "a".repeat(64),
      70205,
    ),
  ];
  const result = derive(f),
    proof = result.proofs.get(99127);
  assert.equal(proof.quantity, 6);
  assert.equal(proof.objectId, 13872);
  assert.deepEqual(proof.positions, [
    { zone: "1429", x: 51, y: 51 },
    { zone: "1429", x: 52, y: 52 },
  ]);
  assert.deepEqual(item.objectIds, [12654, 13872]);
});

test("corroborates a bounded multi-item quota through its actual object source and captured counter", () => {
  const f = collectionFixture();
  const result = derive(f);
  assert.equal(result.proofs.size, 1);
  assert.equal(result.proofs.get(99127).quantity, 7);
  assert.equal(result.proofs.get(99127).objectId, 694772);
  assert.equal(result.proofs.get(99127).itemId, 286205);
  assert.deepEqual(result.conflicts, []);
});

test("derives eight ground crates when the captured object and item have the same exact name", () => {
  const f = collectionFixture();
  f.catalog.quests[0].questId = 3904;
  f.combat.quests[0] = {
    ...f.combat.quests[0],
    questId: 3904,
    objectiveText: ["Bring 8 crates of Milly's Harvest to Milly Osworth at Northshire Abbey."],
    itemObjectives: [
      {
        ...f.combat.quests[0].itemObjectives[0],
        itemId: 11119,
        itemName: "Milly's Harvest",
        quantity: 8,
      },
    ],
  };
  f.chapters = [
    parseGuideChapter(
      "step << Priest/Mage\n#loop\n.goto 1429/0,-288.51,-9068.87\n>>Loot Milly's Harvest on the ground\n.complete 3904,1 >>Collect Milly's Harvest (x8)",
      "chapter-test",
      "a".repeat(64),
      70205,
    ),
  ];
  f.items = new Map([
    [11119, { id: 11119, name: "Milly's Harvest", data: { objectDrops: [161557] } }],
  ]);
  f.objects = new Map([
    [161557, { id: 161557, name: "Milly's Harvest", data: { spawns: { 12: [[54, 49]] } } }],
  ]);
  const before = JSON.stringify({ ...f, items: [...f.items], objects: [...f.objects] });
  const result = derive(f);
  assert.equal(result.proofs.size, 1);
  assert.equal(result.proofs.get(3904).quantity, 8);
  assert.equal(result.proofs.get(3904).itemId, 11119);
  assert.equal(result.proofs.get(3904).objectId, 161557);
  assert.equal(JSON.stringify({ ...f, items: [...f.items], objects: [...f.objects] }), before);
  f.objects.get(161557).name = "Another Harvest";
  assert.equal(derive(f).proofs.size, 0);
});

test("does not infer an object source, quantity or instant collection from a loot instruction", () => {
  for (const change of [
    (f) => (f.items.get(286205).data.objectDrops = []),
    (f) => (f.objects.get(694772).name = "Other Trap"),
    (f) => (f.combat.quests[0].itemObjectives[0].quantity = 6),
    (f) => (f.combat.quests[0].itemObjectives[0].quantity = 21),
    (f) => (f.combat.quests[0].itemObjectives[0].npcIds = [735]),
    (f) => (f.combat.quests[0].objectiveText = ["Check the fishing trapsmith's crates."]),
    (f) => (f.combat.quests[0].objectiveText = ["Check the fishing traps and defeat a guardian."]),
    (f) => {
      f.items.get(286205).data.objectDrops.push(694773);
      f.objects.set(694773, { ...f.objects.get(694772), id: 694773 });
    },
  ]) {
    const f = collectionFixture();
    change(f);
    assert.equal(derive(f).proofs.size, 0);
  }
});

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
