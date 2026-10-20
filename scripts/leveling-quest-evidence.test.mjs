import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const script = resolve("scripts/leveling-quest-evidence.mjs");

test("cross-checks current pages with historical lifecycle structure", async () => {
  const root = await mkdtemp(join(tmpdir(), "leveling-quest-evidence-"));
  try {
    const staging = join(root, "staging");
    await mkdir(staging);
    const plan = join(root, "plan.json");
    const questie = join(root, "questie.json");
    const output = join(root, "output.json");
    await writeFile(
      plan,
      JSON.stringify({
        schema: "leveling-evidence-crawl-plan.v1",
        targetBuild: 70205,
        quests: [
          {
            id: 1053,
            sourceUrl: "https://www.wowhead.com/forever/quest=1053",
            evidenceCodes: ["quest-lifecycle-unverified", "personal-eligibility-unverified"],
          },
        ],
      }),
    );
    await writeFile(
      questie,
      JSON.stringify({
        sourceKind: "questiedb_forever",
        sourceVersion: "1.0.4",
        sourceRevision: "revision",
        checksum: "a".repeat(64),
        artifacts: [],
        entities: [
          {
            kind: "quest",
            id: 1053,
            name: "In the Name of the Light",
            data: {
              requiredLevel: 34,
              questLevel: 40,
              startedBy: [[3980]],
              finishedBy: [[1449]],
              objectivesText: ["Defeat the Scarlet leaders."],
              preQuestSingle: [1052],
              questFlags: 8,
            },
          },
          {
            kind: "npc",
            id: 3980,
            name: "Raleigh the Devout",
            data: { spawns: { 267: [[51, 58]] } },
          },
        ],
      }),
    );
    await writeFile(
      join(staging, "forever-quest-1053.json"),
      JSON.stringify({
        schema: "wowhead-reference.v1",
        game: "forever",
        kind: "quest",
        id: 1053,
        name: "In the Name of the Light",
        sourceUrl: "https://www.wowhead.com/forever/quest=1053/in-the-name-of-the-light",
        capturedAt: new Date().toISOString(),
        permissionRef: "test",
        sourceSha256: "b".repeat(64),
        tooltipLines: [],
        numericFacts: {},
        quickFacts: ["Level: 40", "Requires level 34", "Side: Alliance", "Sharable"],
        objectives: ["Defeat the Scarlet leaders."],
        description: "",
        rewards: [],
        questContent: { objectives: "present", rewards: "none" },
        relations: [
          { relation: "start", kind: "npc", id: 3980, name: "Raleigh the Devout" },
          { relation: "end", kind: "npc", id: 1449, name: "Witch Doctor Unbagwa" },
        ],
      }),
    );
    const result = JSON.parse(
      (
        await exec(process.execPath, [
          script,
          `--plan=${plan}`,
          `--questie=${questie}`,
          `--staging=${staging}`,
          `--output=${output}`,
        ])
      ).stdout,
    );
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(result.states["source-ready"], 1);
    assert.deepEqual(report.quests[0].prerequisites.anyOf, [1052]);
    assert.equal(report.quests[0].pickup.stage, "before");
    assert.equal(report.quests[0].statuses["quest-lifecycle-unverified"], "source-ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps missing pages and item-start stages explicit", async () => {
  const root = await mkdtemp(join(tmpdir(), "leveling-quest-evidence-pending-"));
  try {
    const staging = join(root, "staging");
    await mkdir(staging);
    const plan = join(root, "plan.json");
    const questie = join(root, "questie.json");
    const output = join(root, "output.json");
    await writeFile(
      plan,
      JSON.stringify({
        schema: "leveling-evidence-crawl-plan.v1",
        quests: [
          {
            id: 3373,
            sourceUrl: "https://www.wowhead.com/forever/quest=3373",
            evidenceCodes: ["quest-lifecycle-unverified"],
          },
        ],
      }),
    );
    await writeFile(
      questie,
      JSON.stringify({
        sourceKind: "questiedb_forever",
        sourceVersion: "1.0.4",
        sourceRevision: "revision",
        checksum: "a".repeat(64),
        artifacts: [],
        entities: [
          {
            kind: "quest",
            id: 3373,
            name: "The Essence of Eranikus",
            data: { requiredLevel: 48, startedBy: { 3: [10454] } },
          },
          { kind: "item", id: 10454, name: "Essence of Eranikus", data: {} },
        ],
      }),
    );
    await exec(process.execPath, [
      script,
      `--plan=${plan}`,
      `--questie=${questie}`,
      `--staging=${staging}`,
      `--output=${output}`,
    ]);
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.quests[0].state, "pending-current-page");
    assert.equal(report.quests[0].pickup.stage, "unknown");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const id of [92744, 1144]) {
  test(`classifies captured quest ${id} without requesting its page again`, async () => {
    const root = await mkdtemp(join(tmpdir(), "leveling-quest-evidence-captured-"));
    try {
      const staging = join(root, "staging");
      await mkdir(staging);
      const plan = join(root, "plan.json");
      const questie = join(root, "questie.json");
      const output = join(root, "output.json");
      await writeFile(
        plan,
        JSON.stringify({
          schema: "leveling-evidence-crawl-plan.v1",
          quests: [
            {
              id,
              sourceUrl: `https://www.wowhead.com/forever/quest=${id}`,
              evidenceCodes: [id === 92744 ? "source-gate-conflict" : "quest-lifecycle-unverified"],
            },
          ],
        }),
      );
      await writeFile(
        questie,
        JSON.stringify({
          sourceKind: "questiedb_forever",
          sourceVersion: "1.0.4",
          sourceRevision: "test",
          checksum: "a".repeat(64),
          artifacts: [],
          entities:
            id === 92744
              ? []
              : [
                  {
                    kind: "quest",
                    id,
                    name: "Willix the Importer",
                    data: { requiredLevel: 23, startedBy: [[4508]] },
                  },
                  {
                    kind: "npc",
                    id: 4508,
                    name: "Willix the Importer",
                    data: { spawns: { 491: [[44, 38]] } },
                  },
                ],
        }),
      );
      await writeFile(
        join(staging, `forever-quest-${id}.json`),
        JSON.stringify({
          schema: "wowhead-reference.v1",
          game: "forever",
          kind: "quest",
          id,
          name: id === 92744 ? "Murloc Gills" : "Willix the Importer",
          sourceUrl: `https://www.wowhead.com/forever/quest=${id}`,
          capturedAt: new Date().toISOString(),
          permissionRef: "test",
          sourceSha256: "b".repeat(64),
          tooltipLines: [],
          numericFacts: {},
          quickFacts: ["Level: 26", "Requires level 23", "Side: Both"],
          objectives: ["Complete the objective."],
          description: "",
          rewards: [],
          questContent: { objectives: "present", rewards: "none" },
          relations: [
            { relation: "start", kind: "npc", id: 4508, name: "Willix the Importer" },
            { relation: "end", kind: "npc", id: 4508, name: "Willix the Importer" },
          ],
        }),
      );
      await exec(process.execPath, [
        script,
        `--plan=${plan}`,
        `--questie=${questie}`,
        `--staging=${staging}`,
        `--output=${output}`,
      ]);
      const report = JSON.parse(await readFile(output, "utf8"));
      assert.equal(report.summary.currentPages, 1);
      assert.equal(report.summary.states["pending-current-page"], 0);
      if (id === 92744) {
        assert.equal(report.quests[0].statuses["source-gate-conflict"], "manual-review");
      } else {
        assert.equal(report.quests[0].pickup.stage, "inside");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

const pickupCases = [
  {
    name: "uses the explicit zone for compact spawn arrays",
    id: 4126,
    startedBy: [[1267]],
    entities: [
      {
        kind: "npc",
        id: 1267,
        name: "Ragnar Thunderbrew",
        data: { spawns: [[[46.83, 52.36]]], zoneID: 1 },
      },
    ],
    expectedStage: "before",
    expectedAreas: [1],
  },
  {
    name: "does not infer a zone from an array index",
    id: 4126,
    startedBy: [[1267]],
    entities: [{ kind: "npc", id: 1267, data: { spawns: [[[46.83, 52.36]]] } }],
    expectedStage: "unknown",
    expectedAreas: [],
  },
  {
    name: "retains known direct item-drop origins without certifying a missing current starter",
    id: 3373,
    startedBy: { 3: [10454] },
    entities: [
      { kind: "item", id: 10454, data: { startQuest: 3373, npcDrops: [5709] } },
      { kind: "npc", id: 5709, name: "Shade of Eranikus", data: { zoneID: 1477 } },
    ],
    expectedStage: "inside",
    expectedAreas: [1477],
    expectedSources: [{ kind: "npc", id: 5709, name: "Shade of Eranikus", areaIds: [1477] }],
  },
  {
    name: "keeps mixed inside and outside origins unclassified",
    id: 3373,
    startedBy: { 3: [10454] },
    entities: [
      { kind: "item", id: 10454, data: { startQuest: 3373, npcDrops: [5709, 123] } },
      { kind: "npc", id: 5709, data: { zoneID: 1477 } },
      { kind: "npc", id: 123, data: { spawns: { 1: [[42, 52]] } } },
    ],
    expectedStage: "unknown",
    expectedAreas: [1, 1477],
  },
  {
    name: "does not hide missing drop-source locations behind a known one",
    id: 3373,
    startedBy: { 3: [10454] },
    entities: [
      { kind: "item", id: 10454, data: { startQuest: 3373, npcDrops: [5709, 123] } },
      { kind: "npc", id: 5709, data: { zoneID: 1477 } },
    ],
    expectedStage: "unknown",
    expectedAreas: [1477],
  },
  {
    name: "rejects a source item assigned to a different quest",
    id: 3373,
    startedBy: { 3: [10454] },
    entities: [
      { kind: "item", id: 10454, data: { startQuest: 999, npcDrops: [5709] } },
      { kind: "npc", id: 5709, data: { zoneID: 1477 } },
    ],
    expectedStage: "unknown",
    expectedAreas: [],
  },
];

for (const scenario of pickupCases) {
  test(scenario.name, async () => {
    const root = await mkdtemp(join(tmpdir(), "leveling-pickup-source-"));
    try {
      const staging = join(root, "staging");
      await mkdir(staging);
      const plan = join(root, "plan.json");
      const questie = join(root, "questie.json");
      const output = join(root, "output.json");
      await writeFile(
        plan,
        JSON.stringify({
          schema: "leveling-evidence-crawl-plan.v1",
          quests: [{ id: scenario.id, evidenceCodes: ["quest-lifecycle-unverified"] }],
        }),
      );
      await writeFile(
        questie,
        JSON.stringify({
          sourceKind: "questiedb_forever",
          artifacts: [],
          entities: [
            { kind: "quest", id: scenario.id, data: { startedBy: scenario.startedBy } },
            ...scenario.entities,
          ],
        }),
      );
      await writeFile(
        join(staging, `forever-quest-${scenario.id}.json`),
        JSON.stringify({
          schema: "wowhead-reference.v1",
          game: "forever",
          kind: "quest",
          id: scenario.id,
          name: scenario.id === 4126 ? "Hurley Blackbreath" : "The Essence of Eranikus",
          sourceUrl: `https://www.wowhead.com/forever/quest=${scenario.id}`,
          capturedAt: new Date().toISOString(),
          permissionRef: "test",
          sourceSha256: "b".repeat(64),
          tooltipLines: [],
          numericFacts: {},
          quickFacts: [
            "Level: 55",
            `Requires level ${scenario.id === 4126 ? 50 : 48}`,
            "Side: Alliance",
          ],
          objectives: ["Complete the objective."],
          description: "",
          rewards: [],
          questContent: { objectives: "present", rewards: "none" },
          relations: [
            ...(scenario.id === 4126
              ? [{ relation: "start", kind: "npc", id: 1267, name: "Ragnar Thunderbrew" }]
              : []),
            { relation: "end", kind: "npc", id: 1267, name: "Ragnar Thunderbrew" },
          ],
        }),
      );
      await exec(process.execPath, [
        script,
        `--plan=${plan}`,
        `--questie=${questie}`,
        `--staging=${staging}`,
        `--output=${output}`,
      ]);
      const report = JSON.parse(await readFile(output, "utf8"));
      const [quest] = report.quests;
      assert.equal(quest.pickup.stage, scenario.expectedStage);
      assert.deepEqual(quest.pickup.givers[0].areaIds, scenario.expectedAreas);
      if (scenario.expectedSources)
        assert.deepEqual(quest.pickup.givers[0].sources, scenario.expectedSources);
      const expectedStatus =
        scenario.id === 4126 && scenario.expectedStage === "before"
          ? "source-ready"
          : "manual-review";
      assert.equal(quest.state, expectedStatus);
      assert.equal(quest.statuses["quest-lifecycle-unverified"], expectedStatus);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
