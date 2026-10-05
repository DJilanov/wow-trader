import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { URL } from "node:url";

// Parse data declarations; never execute an addon or any of its runtime Lua.
const require = createRequire(new URL("../packages/companion-core/package.json", import.meta.url));
const { parse } = require("luaparse");
const root = process.argv[2];
if (!root) throw new Error("Usage: node scripts/import-leveling-dungeons.mjs <addon-directory>");
const tables = {};
const sources = [];
const constants = { ALBA_FAIRMOON_LOCATION: "Alba Fairmoon, Sentinel Hill inn, Westfall" };
function literal(node) {
  if (node.type === "StringLiteral") return Buffer.from(node.value, "latin1").toString("utf8");
  if (["NumericLiteral", "BooleanLiteral"].includes(node.type)) return node.value;
  if (node.type === "NilLiteral") return null;
  if (node.type === "Identifier" && Object.hasOwn(constants, node.name))
    return constants[node.name];
  if (node.type === "BinaryExpression" && node.operator === "..")
    return String(literal(node.left)) + String(literal(node.right));
  if (node.type !== "TableConstructorExpression") throw new Error(`Nonliteral data: ${node.type}`);
  const values = {};
  let index = 1;
  for (const field of node.fields) {
    const key =
      field.type === "TableValue"
        ? index++
        : field.type === "TableKeyString"
          ? field.key.name
          : literal(field.key);
    values[key] = literal(field.value);
  }
  const keys = Object.keys(values);
  return keys.every((key, position) => key === String(position + 1))
    ? Object.values(values)
    : values;
}
function path(node) {
  if (node.type === "Identifier") return node.name === "DB" ? ["DB"] : [];
  if (node.type === "MemberExpression") return [node.identifier.name];
  if (node.type === "IndexExpression") return [...path(node.base), literal(node.index)];
  return [];
}
for (const file of [
  "Dungeons.lua",
  "QuestChains.lua",
  "QuestMaps.lua",
  "QuestRewards.lua",
  "QuestShareability.lua",
  "QuestUpdates.lua",
]) {
  const raw = await readFile(resolve(root, "Data", file), "utf8");
  sources.push({ file, sha256: createHash("sha256").update(raw).digest("hex") });
  const ast = parse(Buffer.from(raw).toString("latin1"), {
    comments: false,
    encodingMode: "pseudo-latin1",
    luaVersion: "5.1",
  });
  for (const statement of ast.body) {
    if (statement.type !== "AssignmentStatement") continue;
    statement.variables.forEach((variable, index) => {
      const keys = path(variable);
      if (
        !keys.length ||
        ![
          "DB",
          "QUEST_PREREQ_CHAINS",
          "QUEST_PREREQ_DETAILS",
          "QUEST_START_MAPS",
          "FOREVER_QUEST_XP_FALLBACK",
          "PREREQ_REWARD_ITEMS_FALLBACK",
          "QUEST_SHAREABILITY_AUDIT",
        ].includes(keys[0])
      )
        return;
      const value = literal(statement.init[index]);
      let target = tables;
      for (const key of keys.slice(0, -1)) target = target[key] ??= {};
      target[keys.at(-1)] = value;
    });
  }
}
const names = new Map();
const associations = [];
const originals = new Map();
for (const [dungeon, data] of Object.entries(tables.DB)) {
  for (const quest of data.quests) {
    if (!Number.isSafeInteger(quest.id)) throw new Error(`Invalid quest in ${dungeon}`);
    associations.push({ dungeon, questId: quest.id });
    originals.set(quest.id, quest);
    names.set(quest.id, quest.name);
  }
}
for (const chain of Object.values(tables.QUEST_PREREQ_CHAINS))
  for (const quest of chain) if (!quest.itemStep) names.set(quest.id, quest.name);
const itemNodeIds = new Set(
  Object.values(tables.QUEST_PREREQ_CHAINS)
    .flat()
    .filter((entry) => entry.itemStep)
    .map((entry) => entry.id),
);
const ids = new Set(
  [...names.keys(), ...Object.keys(tables.QUEST_PREREQ_DETAILS).map(Number)].filter(
    (id) => !itemNodeIds.has(id),
  ),
);
const quests = [...ids]
  .sort((a, b) => a - b)
  .map((id) => {
    const original = originals.get(id) ?? {};
    const details = tables.QUEST_PREREQ_DETAILS[id] ?? {};
    const data = { ...original, ...details };
    const fallback = tables.PREREQ_REWARD_ITEMS_FALLBACK[id];
    const items = data.rewardItems ?? fallback?.items ?? [];
    const map = details.map ?? tables.QUEST_START_MAPS[id] ?? null;
    return {
      id,
      title: names.get(id) ?? `Quest ${id}`,
      faction: (data.faction ?? "Both").toLowerCase(),
      classSlug: data.classOnly?.toLowerCase() ?? null,
      minimumLevel: data.requires ?? null,
      questLevel: data.level ?? null,
      pickup: data.pickup ?? null,
      turnin: data.turnin ?? null,
      objective: data.objective ?? null,
      position: map ? { mapId: map.mapID, x: map.x * 100, y: map.y * 100 } : null,
      referenceXp: tables.FOREVER_QUEST_XP_FALLBACK[id] ?? data.liveXPFallback ?? null,
      shareable: tables.QUEST_SHAREABILITY_AUDIT?.[id] ?? null,
      rewards: {
        fixed:
          (data.rewardChoice ?? fallback?.choice)
            ? []
            : items.map((item) => ({ id: item[0], title: item[1] })),
        choices:
          (data.rewardChoice ?? fallback?.choice)
            ? items.map((item) => ({ id: item[0], title: item[1] }))
            : [],
      },
      requiredItems: (data.requiredItems ?? []).map((item) => ({ id: item[0], title: item[1] })),
      chain: (tables.QUEST_PREREQ_CHAINS[id] ?? [])
        .filter((quest) => !quest.itemStep)
        .map((quest) => quest.id),
    };
  });
if (associations.length !== 94 || new Set(associations.map((entry) => entry.questId)).size !== 92)
  throw new Error("Supplemental source changed: review association coverage before publishing.");
process.stdout.write(
  JSON.stringify(
    {
      schemaVersion: 1,
      targetBuild: 70205,
      source: "ForeverDungeonJournal 1.4.4 reference; runtime unconfirmed",
      sources,
      associations,
      quests,
    },
    null,
    2,
  ) + "\n",
);
