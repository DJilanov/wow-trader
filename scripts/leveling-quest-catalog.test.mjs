import assert from "node:assert/strict";
import test from "node:test";
import { questCatalogSchema } from "../packages/leveling/dist/index.js";
import {
  catalogNpcGiver,
  normalizeCatalogQuest,
  isSharedCatalogQuest,
  applyCatalogSourceConstraints,
  applyCatalogKillQuotaClaims,
} from "./leveling-quest-catalog.mjs";

const areaMap = new Map([[40, "1436"]]);
const giver = {
  id: 234,
  name: "Gryan Stoutmantle",
  data: { friendlyToFaction: "A", spawns: { 40: [[56.3, 47.5]] } },
};
const npcs = new Map([
  [234, giver],
  [590, { id: 590, name: "Defias Trapper", data: { spawns: { 40: [[44, 60]] } } }],
]);

test("merges captured kill quotas without mutating input or ignoring conflicts", () => {
  const original = normalizeCatalogQuest(
    quest({ objectivesText: ["Kill the Defias."] }),
    npcs,
    areaMap,
  );
  const before = JSON.stringify(original);
  const agreed = applyCatalogKillQuotaClaims(
    [original],
    new Map([["12:1", new Map([[15, "page checksum"]])]]),
  );
  assert.equal(agreed.quests[0].objectives[0].count, 15);
  assert.deepEqual(agreed.conflicts, []);
  assert.equal(JSON.stringify(original), before);
  const explicit = normalizeCatalogQuest(quest(), npcs, areaMap);
  const conflicts = applyCatalogKillQuotaClaims(
    [explicit],
    new Map([["12:1", new Map([[10, "page checksum"]])]]),
  );
  assert.equal(conflicts.quests[0].objectives[0].count, null);
  assert.deepEqual(conflicts.conflicts[0].counts, [10, 15]);
  assert.ok(conflicts.quests[0].unsupportedRequirements.includes("kill-quota-conflict"));
  assert.equal(isSharedCatalogQuest(conflicts.quests[0]), false);
  const held = applyCatalogKillQuotaClaims(
    [explicit],
    new Map(),
    new Map([["12:1", ["Incompatible captured title"]]]),
  );
  assert.equal(held.quests[0].objectives[0].count, null);
  const ambiguous = applyCatalogKillQuotaClaims(
    [original],
    new Map([
      [
        "12:1",
        new Map([
          [10, "first page"],
          [15, "second page"],
        ]),
      ],
    ]),
  );
  assert.equal(ambiguous.quests[0].objectives[0].count, null);
});
function quest(data = {}) {
  return {
    id: 12,
    name: "The People's Militia",
    data: {
      name: "The People's Militia",
      startedBy: [[234]],
      finishedBy: [[234]],
      requiredLevel: 9,
      questLevel: 12,
      requiredRaces: 4294967373,
      requiredClasses: 0,
      zoneOrSort: 40,
      objectives: [[[590, "Defias Trapper"]]],
      objectivesText: ["Kill 15 Defias Trappers."],
      ...data,
    },
  };
}

test("normalizes exact kill quotas, faction access, pickup levels and map coordinates", () => {
  const result = normalizeCatalogQuest(quest(), npcs, areaMap);
  assert.equal(result.minimumLevel, 9);
  assert.deepEqual(result.objectives, [
    { index: 1, npcId: 590, count: 15, positions: [{ zone: "1436", x: 44, y: 60 }] },
  ]);
  assert.deepEqual(result.starts[0].positions, [{ zone: "1436", x: 56.3, y: 47.5 }]);
  assert.equal(result.category, "shared-kills");
  assert.equal(isSharedCatalogQuest(result), true);
});

test("retains verified provided-item identity without lifting interaction restrictions", () => {
  const input = quest({
    sourceItemId: 957,
    objectives: [],
    objectivesText: ["Deliver the shipment."],
  });
  const items = new Map([[957, { id: 957, name: "William's Shipment", data: {} }]]);
  const result = normalizeCatalogQuest(input, npcs, areaMap, items);
  assert.deepEqual(result.providedItem, { itemId: 957, name: "William's Shipment" });
  assert.ok(result.unsupportedRequirements.includes("provided-item-interaction"));
  assert.ok(result.unsupportedRequirements.includes("unresolved-objective-text"));
  assert.equal(isSharedCatalogQuest(result), false);
  assert.equal(normalizeCatalogQuest(input, npcs, areaMap).providedItem, undefined);
  const catalog = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic regression fixture",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    areaMapSha256: "d".repeat(64),
    includesAuthoredCorrections: false,
    sourceArchiveSha256: "e".repeat(64),
    quests: [result],
  };
  assert.equal(questCatalogSchema.safeParse(catalog).success, false);
  assert.equal(
    questCatalogSchema.safeParse({ ...catalog, itemSha256: "f".repeat(64) }).success,
    true,
  );
});

test("rejects mixed and sparse item-only objective groups as shared-kill filler", () => {
  for (const objectives of [
    { [3]: [[729, "Okra"]] },
    [[[590, "Defias Trapper"]], null, [[729, "Okra"]]],
  ]) {
    const result = normalizeCatalogQuest(quest({ objectives }), npcs, areaMap);
    assert.equal(result.category, "unsupported");
    assert.equal(isSharedCatalogQuest(result), false);
  }
});

test("does not manufacture a quota when objective text is ambiguous", () => {
  const result = normalizeCatalogQuest(
    quest({ objectivesText: ["Defeat the Defias."] }),
    npcs,
    areaMap,
  );
  assert.equal(result.objectives[0].count, null);
  assert.equal(isSharedCatalogQuest(result), false);
});

test("holds recurring, restricted, item-use and class-specific quests", () => {
  for (const data of [
    { specialFlags: 1 },
    { questFlags: 0x40 },
    { questFlags: 0x1000 },
    { questFlags: 0x8000 },
    { requiredClasses: 1 },
    { requiredRaces: 1 },
    { requiredRaces: 77 },
    { sourceItemId: 123 },
    { requiredSkill: [164, 100] },
    { requiredMinRep: [72, 100] },
    { availableUntilCompleted: 123 },
    { parentQuest: 123 },
  ])
    assert.equal(
      isSharedCatalogQuest(normalizeCatalogQuest(quest(data), npcs, areaMap)),
      false,
      JSON.stringify(data),
    );
});

test("never turns unknown pickup levels, phased points or missing coordinates into a usable batch", () => {
  assert.equal(
    isSharedCatalogQuest(normalizeCatalogQuest(quest({ requiredLevel: null }), npcs, areaMap)),
    false,
  );
  const phased = {
    ...giver,
    data: {
      ...giver.data,
      spawns: {
        40: [
          [56.3, 47.5, 1],
          [101, 50],
          [-1, 40],
          [30, "bad"],
        ],
        999: [[20, 20]],
      },
    },
  };
  assert.deepEqual(catalogNpcGiver(phased, areaMap).positions, []);
  assert.equal(
    isSharedCatalogQuest(normalizeCatalogQuest(quest(), new Map([[234, phased]]), areaMap)),
    false,
  );
  assert.equal(
    isSharedCatalogQuest(
      normalizeCatalogQuest(
        quest(),
        new Map([
          [234, giver],
          [590, { id: 590, name: "Defias Trapper", data: {} }],
        ]),
        areaMap,
      ),
    ),
    false,
  );
});

test("preserves both prerequisite groups and excludes Horde-only quest givers", () => {
  const result = normalizeCatalogQuest(
    quest({ preQuestGroup: [109], preQuestSingle: [12, 13], exclusiveTo: [14] }),
    npcs,
    areaMap,
  );
  assert.deepEqual(result.prerequisites, { allOf: [109], anyOf: [12, 13] });
  assert.deepEqual(result.exclusiveWith, [14]);
  const horde = { ...giver, data: { ...giver.data, friendlyToFaction: "H" } };
  assert.equal(
    isSharedCatalogQuest(normalizeCatalogQuest(quest(), new Map([[234, horde]]), areaMap)),
    false,
  );
});

test("handles a dense Lua spawn map whose first key is AreaID 1", () => {
  const dense = { ...giver, data: { ...giver.data, spawns: [[[46.7, 53.8]]] } };
  assert.deepEqual(catalogNpcGiver(dense, new Map([[1, "1426"]])).positions, [
    { zone: "1426", x: 46.7, y: 53.8 },
  ]);
});

test("preserves source exclusions, missing chain prerequisites and unmodeled completion steps", () => {
  const base = normalizeCatalogQuest(quest({ objectives: [], objectivesText: [] }), npcs, areaMap);
  const directives = [
    { tag: ".turnin", questId: 11, condition: "", arguments: "11" },
    { tag: ".accept", questId: 12, condition: "", arguments: "12" },
    { tag: ".complete", questId: 12, condition: "", arguments: "12,1" },
  ];
  const chapters = [{ steps: [{ condition: "skip", directives }] }];
  const [result] = applyCatalogSourceConstraints([base], chapters);
  assert.deepEqual(result.prerequisites, { allOf: [], anyOf: [] });
  assert.deepEqual(result.unsupportedRequirements, [
    "unresolved-source-prerequisite",
    "source-held-pickup",
    "source-completion-objective",
  ]);
  assert.equal(isSharedCatalogQuest(result), false);
  assert.deepEqual(base.prerequisites, { allOf: [], anyOf: [] });
  const [available] = applyCatalogSourceConstraints(
    [base],
    [{ steps: [...chapters[0].steps, { condition: "", directives: [directives[1]] }] }],
  );
  assert.equal(available.unsupportedRequirements.includes("source-held-pickup"), false);
  const known = { ...base, prerequisites: { allOf: [9], anyOf: [10] } };
  assert.deepEqual(
    applyCatalogSourceConstraints([known], chapters)[0].prerequisites,
    known.prerequisites,
  );
});

test("does not treat missing structured objectives as proof of a delivery quest", () => {
  const result = normalizeCatalogQuest(
    quest({ objectives: [], objectivesText: ["Help the fisherman."] }),
    npcs,
    areaMap,
  );
  assert.equal(isSharedCatalogQuest(result), false);
  assert.ok(result.unsupportedRequirements.includes("unresolved-objective-text"));
});

test("distinguishes a shared visit from a prerequisite when an unconditional direct pickup exists", () => {
  const base = normalizeCatalogQuest(quest(), npcs, areaMap);
  const accept = { tag: ".accept", questId: 12, condition: "", arguments: "12" };
  const visit = {
    condition: "",
    directives: [{ tag: ".turnin", questId: 109, condition: "", arguments: "109" }, accept],
  };
  const chapters = [{ steps: [visit] }, { steps: [{ condition: "", directives: [accept] }] }];
  const before = JSON.stringify({ base, chapters });
  const [result] = applyCatalogSourceConstraints([base], chapters);
  assert.equal(result.unsupportedRequirements.includes("unresolved-source-prerequisite"), false);
  assert.equal(isSharedCatalogQuest(result), true);
  assert.deepEqual(result.prerequisites, { allOf: [], anyOf: [] });
  assert.equal(JSON.stringify({ base, chapters }), before);
  assert.equal(
    applyCatalogSourceConstraints([base], [{ steps: [visit] }])[0].unsupportedRequirements.includes(
      "unresolved-source-prerequisite",
    ),
    true,
  );
});

test("does not clear explicit gates or use a conditional or held pickup to resolve visit ordering", () => {
  const base = normalizeCatalogQuest(quest(), npcs, areaMap);
  const accept = { tag: ".accept", questId: 12, condition: "", arguments: "12" };
  const visit = {
    condition: "",
    directives: [{ tag: ".turnin", questId: 109, condition: "", arguments: "109" }, accept],
  };
  for (const condition of ["skip", "NightElf", "Warrior"]) {
    const [result] = applyCatalogSourceConstraints(
      [base],
      [{ steps: [visit, { condition, directives: [accept] }] }],
    );
    assert.ok(result.unsupportedRequirements.includes("unresolved-source-prerequisite"));
  }
  for (const tag of [".isQuestTurnedIn", ".isOnQuest", ".maxlevel"]) {
    const guarded = {
      condition: "",
      directives: [{ tag, questId: null, condition: "", arguments: "109" }, accept],
    };
    const [result] = applyCatalogSourceConstraints([base], [{ steps: [visit, guarded] }]);
    assert.ok(result.unsupportedRequirements.includes("unresolved-source-prerequisite"));
  }
  const [explicit] = applyCatalogSourceConstraints(
    [base],
    [
      {
        steps: [
          {
            condition: "",
            directives: [
              { tag: ".isQuestTurnedIn", questId: null, condition: "", arguments: "109" },
              accept,
            ],
          },
          { condition: "", directives: [accept] },
        ],
      },
    ],
  );
  assert.ok(explicit.unsupportedRequirements.includes("unresolved-source-prerequisite"));
});
test("recognizes a plain delivery only when its text names the actual return NPC", () => {
  for (const text of [
    "Speak with Gryan Stoutmantle about the Defias.",
    "Return to Gryan Stoutmantle.",
  ])
    assert.equal(
      isSharedCatalogQuest(
        normalizeCatalogQuest(quest({ objectives: [], objectivesText: [text] }), npcs, areaMap),
      ),
      true,
    );
  for (const text of [
    "Speak with Unknown Person.",
    "Return to Gryan Stoutmantle and collect 10 claws.",
    "Return to Gryan Stoutmantle with the relic.",
  ])
    assert.equal(
      isSharedCatalogQuest(
        normalizeCatalogQuest(quest({ objectives: [], objectivesText: [text] }), npcs, areaMap),
      ),
      false,
    );
});
