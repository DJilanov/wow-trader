import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";
import { setTimeout } from "node:timers/promises";
import { createDatabase } from "../packages/db/dist/index.js";
import { loadWorldQuestSnapshot } from "../packages/world-data/dist/index.js";
import {
  referenceClientConflicts,
  referenceIndexGaps,
  referenceTaskSchema,
  runReferencePublicationCycle,
  publishQuestXpCycle,
} from "../packages/reference-data/dist/index.js";
import {
  referenceNonItemClientConflicts,
  referenceQuestXpClientConflicts,
} from "./reference-publication-identity.mjs";

const root = "/home/wow-trader-reference-worker/shared";
const products = { forever: "wow_classic_beta", tbc: "wow_anniversary" };

export async function readLevelingQuestAllowlist(path, expectedSignature) {
  if (!path) {
    if (expectedSignature) throw new Error("Leveling quest queue path is missing");
    return { ids: new Set(), signature: null };
  }
  const info = await stat(path);
  if (info.size > 4_000_000) throw new Error("Leveling quest queue is too large");
  const raw = await readFile(path, "utf8");
  const tasks = referenceTaskSchema.array().min(1).max(10_000).parse(JSON.parse(raw));
  if (tasks.some((task) => task.game !== "forever" || task.kind !== "quest"))
    throw new Error("Leveling quest queue contains a non-Forever quest");
  const ids = new Set(tasks.map((task) => task.id));
  if (ids.size !== tasks.length) throw new Error("Leveling quest queue contains duplicate IDs");
  const signature = createHash("sha256").update(JSON.stringify(tasks)).digest("hex");
  if (expectedSignature && signature !== expectedSignature)
    throw new Error("Leveling quest queue checksum mismatch");
  return {
    ids,
    signature,
  };
}

async function readPublicationClientItems(sql, tasks, builds) {
  const items = new Map();
  for (const [game, product] of Object.entries(products)) {
    const ids = tasks
      .filter((task) => task.game === game && task.kind === "item")
      .map((task) => task.id);
    const build = builds.find((entry) => entry.product === product);
    if (!ids.length || !build) continue;
    const rows = await sql`
      SELECT i.item_id AS "itemId", i.name, i.class_id AS "classId",
        i.subclass_id AS "subclassId", i.required_level AS "requiredLevel", i.delay_ms AS "delayMs",
        COALESCE((SELECT json_agg(json_build_object('statType', s.stat_type, 'value', s.value))
          FROM item_stat s WHERE s.build_id = i.build_id AND s.item_id = i.item_id), '[]'::json) AS stats,
        COALESCE((SELECT json_agg(json_build_object('slot', d.slot, 'minimum', d.minimum, 'maximum', d.maximum))
          FROM item_damage d WHERE d.build_id = i.build_id AND d.item_id = i.item_id), '[]'::json) AS damages
      FROM item_version i WHERE i.build_id = ${build.id} AND i.item_id IN ${sql(ids)}
    `;
    for (const item of rows) items.set(`${game}-item-${item.itemId}`, item);
  }
  return items;
}

async function readPublicationClientRecipes(sql, tasks, builds) {
  const recipes = new Map();
  for (const [game, product] of Object.entries(products)) {
    const ids = tasks
      .filter((task) => task.game === game && task.kind === "spell")
      .map((task) => task.id);
    const build = builds.find((entry) => entry.product === product);
    if (!ids.length || !build) continue;
    const rows = await sql`
      SELECT r.recipe_spell_id AS "spellId", s.name
      FROM recipe_version r
      INNER JOIN spell_version s
        ON s.build_id = r.build_id AND s.spell_id = r.recipe_spell_id
      WHERE r.build_id = ${build.id} AND r.recipe_spell_id IN ${sql(ids)}
    `;
    for (const recipe of rows) recipes.set(`${game}-spell-${recipe.spellId}`, recipe.name);
  }
  return recipes;
}

async function main() {
  if (process.argv.slice(2).some((argument) => argument !== "--once"))
    throw new Error("Usage: reference-publisher.mjs [--once]");
  if (!process.env.DATABASE_URL || !process.env.WOW_TRADER_WORLD_SNAPSHOT)
    throw new Error("Publication needs the existing read-only Helper database and quest artifact");
  const database = createDatabase(process.env.DATABASE_URL);
  const staging = process.env.WOW_TRADER_REFERENCE_STAGING ?? resolve(root, "staging");
  const destination = process.env.WOW_TRADER_REFERENCE_DIRECTORY ?? resolve(root, "published");
  const statusPath =
    process.env.WOW_TRADER_REFERENCE_PUBLICATION_STATUS ?? resolve(root, "publication-status.json");
  const levelingQuestAllowlist = await readLevelingQuestAllowlist(
    process.env.WOW_TRADER_LEVELING_QUEST_QUEUE,
    process.env.WOW_TRADER_LEVELING_QUEST_QUEUE_SHA256,
  );
  const once = process.argv.includes("--once");
  let stop = false;
  process.on("SIGTERM", () => {
    stop = true;
  });
  process.on("SIGINT", () => {
    stop = true;
  });
  let worldCache;
  try {
    do {
      try {
        const info = await stat(process.env.WOW_TRADER_WORLD_SNAPSHOT);
        const worldSignature = `${info.ino}:${info.mtimeMs}:${info.size}`;
        if (worldCache?.signature !== worldSignature)
          worldCache = {
            signature: worldSignature,
            bundle: await loadWorldQuestSnapshot(process.env.WOW_TRADER_WORLD_SNAPSHOT),
          };
        if (
          worldCache.bundle.manifest.product !== products.forever ||
          worldCache.bundle.manifest.locale !== "enUS"
        )
          throw new Error("Publication quest artifact edition or locale mismatch");
        const quests = new Map(
          worldCache.bundle.quests.map((quest) => [quest.questId, quest.title]),
        );
        const result = await database.client.begin("read only", async (sql) => {
          await sql`SET LOCAL statement_timeout = '30s'`;
          const builds = await sql`
            SELECT DISTINCT ON (product) id, product FROM game_build
            WHERE status = 'published' AND locale = 'enUS' AND product IN ('wow_anniversary','wow_classic_beta')
            ORDER BY product, published_at DESC
          `;
          if (builds.length !== 2) throw new Error("Both published client builds are required");
          const revision = JSON.stringify({
            builds,
            worldSignature,
            levelingQuestQueue: levelingQuestAllowlist.signature,
          });
          const validator = async (tasks) => {
            const [items, recipes] = await Promise.all([
              readPublicationClientItems(sql, tasks, builds),
              readPublicationClientRecipes(sql, tasks, builds),
            ]);
            return (record) => {
              if (record.kind === "item") {
                const item = items.get(`${record.game}-item-${record.id}`);
                return item
                  ? {
                      conflicts: referenceClientConflicts(record, item),
                      indexGaps: referenceIndexGaps(record, item),
                    }
                  : { conflicts: ["missing_current_client_item"], indexGaps: [] };
              }
              const conflicts = referenceNonItemClientConflicts(record, recipes, quests);
              return { conflicts, indexGaps: referenceIndexGaps(record) };
            };
          };
          const display = await runReferencePublicationCycle({
            staging,
            destination,
            statusPath,
            revision,
            validator,
          });
          const questXp = await publishQuestXpCycle({
            staging,
            destination,
            revision,
            validate: async (task) => {
              const validate = await validator([task]);
              return (record) => {
                const result = validate(record);
                return {
                  ...result,
                  conflicts: referenceQuestXpClientConflicts(
                    record,
                    result.conflicts,
                    levelingQuestAllowlist.ids,
                  ),
                };
              };
            },
          });
          return { ...display, questXp };
        });
        console.log(JSON.stringify({ updatedAt: new Date().toISOString(), ...result }));
      } catch (error) {
        console.error(
          `Publication cycle failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "unknown_error"}`,
        );
        if (once) throw error;
      }
      if (!once && !stop)
        for (let seconds = 0; seconds < 60 && !stop; seconds++) await setTimeout(1000);
    } while (!once && !stop);
  } finally {
    await database.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(
      error instanceof Error ? `${error.name}: ${error.message}` : "Publication failed",
    );
    process.exitCode = 1;
  });
