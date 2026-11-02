import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import console from "node:console";
import {
  combatDatasetSchema,
  combatManifestSchema,
  importQuestieCombatData,
  supplementCombatItemStarts,
} from "../packages/leveling/dist/index.js";

const { values } = parseArgs({
  options: {
    combat: { type: "string" },
    "provider-root": { type: "string" },
    destination: { type: "string" },
  },
});
assert.ok(
  values.combat && values["provider-root"] && values.destination,
  "Pass --combat=EXISTING_ROOT --provider-root=EXACT_STATIC_EXPORT_ROOT --destination=NEW_ROOT.",
);
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
async function bounded(file, maximum) {
  assert.ok((await stat(file)).size <= maximum, `Oversized item-start input: ${file}`);
  const raw = await readFile(file);
  assert.ok(raw.length <= maximum, `Oversized item-start input: ${file}`);
  return raw;
}
const inputRoot = path.resolve(values.combat),
  destination = path.resolve(values.destination);
assert.notEqual(destination, inputRoot, "Use a new output root; preserve existing references.");
const manifest = combatManifestSchema.parse(
  JSON.parse(await bounded(path.join(inputRoot, "manifest.json"), 4000)),
);
const raw = await bounded(path.join(inputRoot, manifest.file), 16_000_000);
assert.equal(hash(raw), manifest.sha256, "Input combat checksum differs.");
const current = combatDatasetSchema.parse(JSON.parse(raw));
assert.equal(current.targetBuild, manifest.targetBuild, "Input combat build differs.");
const providerRoot = path.resolve(values["provider-root"]);
const exports = {};
for (const kind of ["Npc", "Quest", "Item"]) {
  const bytes = await bounded(path.join(providerRoot, `forever${kind}DB.lua`), 32_000_000);
  assert.equal(
    hash(bytes),
    current.provider[`${kind.toLowerCase()}Sha256`],
    `${kind} export differs.`,
  );
  exports[`${kind.toLowerCase()}Export`] = bytes.toString("utf8");
}
const imported = importQuestieCombatData({
  ...exports,
  targetBuild: current.targetBuild,
  publication: current.publication,
  authorizationNote: current.authorizationNote,
  provider: current.provider,
});
const prepared = supplementCombatItemStarts(current, imported);
const beforeWithoutStarts = current.quests.map(({ startItem: _start, ...quest }) => quest);
const afterWithoutStarts = prepared.quests.map(({ startItem: _start, ...quest }) => quest);
assert.deepEqual(afterWithoutStarts, beforeWithoutStarts, "Existing quest facts changed.");
assert.deepEqual(
  { ...prepared, quests: [] },
  { ...current, quests: [] },
  "Other combat facts changed.",
);
const preparedRaw = `${JSON.stringify(prepared)}\n`,
  sha256 = hash(preparedRaw),
  file = `combat-${sha256}.json`;
await mkdir(destination, { recursive: true });
try {
  await writeFile(path.join(destination, file), preparedRaw, { flag: "wx", mode: 0o600 });
} catch (error) {
  if (error?.code !== "EEXIST") throw error;
  assert.equal(
    hash(await bounded(path.join(destination, file), 16_000_000)),
    sha256,
    "Existing prepared artifact differs.",
  );
}
const result = combatManifestSchema.parse({
  schema: manifest.schema,
  targetBuild: current.targetBuild,
  file,
  sha256,
});
const temp = path.join(destination, `manifest-${randomUUID()}.tmp`);
await writeFile(temp, JSON.stringify(result) + "\n", { flag: "wx", mode: 0o600 });
await rename(temp, path.join(destination, "manifest.json"));
const report = {
  scope:
    "Reciprocal item/quest start identities from the exact input provider. Existing quantities, rewards, NPCs, loot, sharing, probabilities, XP evidence and dungeon profiles are unchanged. This is not live-game acquisition or item-consumption calibration.",
  inputCombat: manifest.sha256,
  provider: current.provider.revision,
  questExport: current.provider.questSha256,
  itemExport: current.provider.itemSha256,
  outputCombat: sha256,
  starts: prepared.quests
    .filter((quest) => quest.startItem)
    .map((quest) => ({ questId: quest.questId, ...quest.startItem })),
};
await writeFile(
  path.join(destination, "item-start-review.json"),
  JSON.stringify(report, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    inputCombat: manifest.sha256,
    outputCombat: sha256,
    startItems: report.starts.length,
    destination,
  }),
);
