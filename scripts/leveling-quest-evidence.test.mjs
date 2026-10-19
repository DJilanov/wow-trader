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
