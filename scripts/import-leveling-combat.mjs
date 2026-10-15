import { readFile, stat, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import console from "node:console";
import { Buffer } from "node:buffer";
import {
  importQuestieCombatData,
  dungeonCombatProfileSchema,
  killXpEvidenceSchema,
} from "../packages/leveling/dist/index.js";

const { values } = parseArgs({
  options: {
    "provider-root": { type: "string" },
    revision: { type: "string" },
    destination: { type: "string" },
    "target-build": { type: "string", default: "70205" },
    "authorization-note": { type: "string" },
    "dungeon-profiles": { type: "string" },
    "kill-xp-evidence": { type: "string" },
  },
});
if (!values["provider-root"] || !values.revision || !/^[a-f0-9]{40}$/.test(values.revision))
  throw new Error(
    "Pass --provider-root=<trusted QuestieDB static export root> --revision=<producing git SHA> [--destination=...] [--authorization-note=...]. Generate provider exports with --include-authored first.",
  );
const targetBuild = Number(values["target-build"]);
if (!Number.isSafeInteger(targetBuild) || targetBuild < 1) throw new Error("Invalid target build.");
async function bounded(path, maximum) {
  if ((await stat(path)).size > maximum) throw new Error("Combat input exceeds its size budget.");
  const raw = await readFile(path, "utf8");
  if (Buffer.byteLength(raw) > maximum) throw new Error("Combat input exceeds its size budget.");
  return raw;
}
const providerRoot = resolve(values["provider-root"]);
const [npcExport, questExport, itemExport] = await Promise.all(
  ["Npc", "Quest", "Item"].map((kind) =>
    bounded(join(providerRoot, `forever${kind}DB.lua`), 32_000_000),
  ),
);
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
const dungeons = values["dungeon-profiles"]
  ? dungeonCombatProfileSchema
      .array()
      .max(100)
      .parse(JSON.parse(await bounded(resolve(values["dungeon-profiles"]), 4_000_000)))
  : [];
const authorizationNote = values["authorization-note"]?.trim() ?? "";
const killXpEvidence = values["kill-xp-evidence"]
  ? killXpEvidenceSchema
      .array()
      .max(10000)
      .parse(JSON.parse(await bounded(resolve(values["kill-xp-evidence"]), 4_000_000)))
  : [];
const dataset = importQuestieCombatData({
  npcExport,
  questExport,
  itemExport,
  targetBuild,
  dungeons,
  killXpEvidence,
  publication: authorizationNote ? "authorized" : "private-reference",
  authorizationNote,
  provider: {
    repository: "https://github.com/Questie/QuestieDB",
    revision: values.revision,
    layer: "forever-static-with-authored",
    npcSha256: hash(npcExport),
    questSha256: hash(questExport),
    itemSha256: hash(itemExport),
    limitations: [
      "Includes inherited, generated, trace and authored Static corrections; excludes character-specific Dynamic corrections, derived passes and localization.",
      "References are not live-game verification. Spawn coordinates do not establish dungeon path populations.",
      "Creature XP eligibility and outdoor rates are historical planning assumptions; suspected credit proxies stay unresolved, and current dungeon tuning requires a sourced profile.",
    ],
  },
});
const root = resolve(values.destination ?? "artifacts/leveling/combat");
await mkdir(root, { recursive: true });
const raw = `${JSON.stringify(dataset)}\n`,
  sha256 = hash(raw),
  file = `combat-${sha256}.json`;
try {
  await writeFile(join(root, file), raw, { flag: "wx", mode: 0o600 });
} catch (error) {
  if (!error || typeof error !== "object" || error.code !== "EEXIST") throw error;
  if (hash(await bounded(join(root, file), 16_000_000)) !== sha256)
    throw new Error("Existing combat artifact is corrupt.");
}
const temporary = join(root, `manifest-${randomUUID()}.tmp`);
await writeFile(
  temporary,
  `${JSON.stringify({ schema: "forever-combat-manifest.v1", file, sha256, targetBuild })}\n`,
  { flag: "wx", mode: 0o600 },
);
await rename(temporary, join(root, "manifest.json"));
console.log(
  JSON.stringify({
    root,
    revision: sha256,
    publication: dataset.publication,
    npcs: dataset.npcs.length,
    quests: dataset.quests.length,
    dungeonProfiles: dataset.dungeons.length,
  }),
);
