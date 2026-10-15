import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import console from "node:console";
import {
  parseGuideChapter,
  CHAPTER_REFERENCES,
  combatDatasetSchema,
} from "../packages/leveling/dist/index.js";

// Owned synthetic content only. Never copies or authorizes a private provider/source archive.
const root = await mkdtemp(join(tmpdir(), "kfc-owned-combat-fixture-")),
  archive = join(root, "archive"),
  combat = join(root, "combat");
await mkdir(archive);
await mkdir(combat);
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
const source =
  "step\n.accept 300001 >>Accept synthetic QA quest\nstep\n>>Kill Synthetic Training Targets\n.complete 300001,1 --Synthetic Training Target (10)\n.mob Synthetic Training Target\nstep\n.turnin 300001 >>Hand in synthetic QA quest\n";
const sourceSha256 = hash(source),
  chapters = [];
for (const reference of CHAPTER_REFERENCES) {
  const guide = parseGuideChapter(source, reference.id, sourceSha256, 70205),
    raw = JSON.stringify(guide),
    file = `${reference.id}.json`;
  await writeFile(join(archive, file), raw, { flag: "wx", mode: 0o600 });
  chapters.push({
    chapterId: guide.chapterId,
    version: guide.version,
    file,
    sha256: hash(raw),
    sourceSha256,
    stepCount: guide.steps.length,
    questIds: [300001],
  });
}
await writeFile(
  join(archive, "manifest.json"),
  JSON.stringify({
    schemaVersion: 1,
    parserVersion: "forever-guide-v2",
    publication: "authorized",
    authorizationNote:
      "Owned synthetic local-browser test fixture; not imported RestedXP content or a leveling guide for players.",
    sourceSha256,
    inventorySha256: hash("owned synthetic fixture"),
    targetBuild: 70205,
    chapters,
  }),
  { flag: "wx", mode: 0o600 },
);
const data = combatDatasetSchema.parse({
  schema: "forever-combat-reference.v1",
  targetBuild: 70205,
  publication: "authorized",
  authorizationNote:
    "Owned synthetic local-only QA data, not licensed provider data or live-game measurements.",
  provider: {
    repository: "https://example.invalid/owned-combat-fixture",
    revision: "a".repeat(40),
    layer: "forever-static-with-authored",
    npcSha256: hash("synthetic NPC"),
    questSha256: hash("synthetic quest"),
    itemSha256: hash("synthetic item"),
    limitations: ["Synthetic test-only records; do not deploy as game data."],
  },
  npcs: [
    {
      id: 900001,
      name: "Synthetic Training Target",
      minimumLevel: 20,
      maximumLevel: 21,
      rank: 0,
      zoneIds: [12],
      xpEligibility: "assumed",
    },
  ],
  quests: [
    {
      questId: 300001,
      creatureIds: [900001],
      itemCreatureIds: [],
      objectiveText: ["Kill 10 Synthetic Training Targets."],
      onlyCreatureObjectives: true,
    },
  ],
  dungeons: [],
  killXpEvidence: [],
});
const raw = JSON.stringify(data),
  sha256 = hash(raw),
  file = `combat-${sha256}.json`;
await writeFile(join(combat, file), raw, { flag: "wx", mode: 0o600 });
await writeFile(
  join(combat, "manifest.json"),
  JSON.stringify({ schema: "forever-combat-manifest.v1", targetBuild: 70205, file, sha256 }),
  { flag: "wx", mode: 0o600 },
);
console.log(JSON.stringify({ root, archive, combat, synthetic: true }));
