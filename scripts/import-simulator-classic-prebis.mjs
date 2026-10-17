import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import console from "node:console";
import {
  classicPreRaidEvidence,
  classicReferenceRevision,
  classicReferenceSha256,
} from "../infra/simulator/classic-acquisition.mjs";

const root = resolve(import.meta.dirname, "..");
const directory = join(root, "artifacts/forever-simulator/classic-reference");
const base = `https://raw.githubusercontent.com/wowsims/classic/${classicReferenceRevision}/`;
const paths = [
  "balance_druid/p0.bis",
  "feral_druid/p0.bis",
  "hunter/p0.bis",
  "mage/p0.bis",
  "rogue/combat_backstab_prebis",
  "rogue/combat_sinister_strike_prebis",
  "shadow_priest/p0.bis",
  "tank_warrior/p0.bis",
  "warlock/prebis",
  "warrior/p0.bis",
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(directory, { recursive: true });
let raw;
try {
  raw = await readFile(join(directory, "db.json"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!raw) {
  const response = await globalThis.fetch(base + "assets/database/db.json", {
    signal: globalThis.AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Classic reference HTTP ${response.status}`);
  raw = globalThis.Buffer.from(await response.arrayBuffer());
}
if (digest(raw) !== classicReferenceSha256) throw new Error("Classic reference checksum mismatch");
await writeFile(join(directory, "db.json"), raw);
const db = JSON.parse(raw.toString("utf8"));
const presets = await Promise.all(
  paths.map(async (path) => {
    const [profile, name] = path.split("/");
    const resource = `ui/${profile}/gear_sets/${name}.gear.json`;
    const response = await globalThis.fetch(base + resource, {
      signal: globalThis.AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(`Classic pre-raid preset HTTP ${response.status}: ${resource}`);
    const text = await response.text(),
      gear = JSON.parse(text);
    if (!Array.isArray(gear.items) || gear.items.length > 17)
      throw new Error("Invalid Classic pre-raid preset");
    return {
      resource,
      sha256: digest(text),
      ids: gear.items.map((item) => item.id).filter(Number.isInteger),
    };
  }),
);
const items = [],
  excluded = {};
for (const item of db.items) {
  const evidence = classicPreRaidEvidence(
    item,
    presets.filter((preset) => preset.ids.includes(item.id)).map((preset) => preset.resource),
  );
  if (!evidence.allowed) {
    excluded[evidence.reason] = (excluded[evidence.reason] || 0) + 1;
    continue;
  }
  if (
    item.stats?.length !== 44 ||
    item.stats.some((value) => !Number.isFinite(value)) ||
    !/^[a-z0-9_]+$/i.test(item.icon || "")
  )
    throw new Error(`Invalid Classic candidate stats/icon ${item.id}`);
  items.push({ item, evidence });
}
items.sort((a, b) => a.item.id - b.item.id);
const result = {
  schema: "kfc-classic-pre-raid-equipment.v1",
  revision: classicReferenceRevision,
  source: base + "assets/database/db.json",
  sourceSha256: classicReferenceSha256,
  notice:
    "Provisional historical Classic equipment. No raid acquisition, phase/quality shortcuts, unresolved suffixes, or current Forever stat overrides. Missing current-client records do not prove removal or continued availability.",
  presets,
  excluded,
  items,
};
await writeFile(join(directory, "equipment.json"), JSON.stringify(result));
console.log(
  JSON.stringify({
    total: items.length,
    byType: items.reduce((counts, entry) => {
      counts[entry.item.type] = (counts[entry.item.type] || 0) + 1;
      return counts;
    }, {}),
    excluded,
    output: join(directory, "equipment.json"),
  }),
);
