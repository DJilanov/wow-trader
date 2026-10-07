import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { link, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { parseArgs } from "node:util";
import { referenceTaskSchema } from "../dist/index.js";

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    env: { type: "string" },
    output: { type: "string" },
  },
});
if (!values.root || !values.env || !values.output)
  throw new Error("Use --root catalog-release --env web.env --output private-directory");
const output = resolve(values.output);
await mkdir(output, { recursive: true, mode: 0o700 });
delete process.env.DATABASE_URL;
process.loadEnvFile(resolve(values.env));
if (!process.env.DATABASE_URL) throw new Error("Readonly web database configuration is missing");
const postgres = createRequire(resolve(values.root, "packages/db/package.json"))("postgres");
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

async function persist(name, data) {
  const temporary = resolve(output, `${name}.tmp`);
  await writeFile(temporary, `${JSON.stringify(data)}\n`, { flag: "wx", mode: 0o600 });
  try {
    await link(temporary, resolve(output, name));
  } finally {
    await unlink(temporary);
  }
}

let operation = "begin_readonly";
try {
  const inventory = await sql.begin("read only", async (transaction) => {
    await transaction`SET LOCAL statement_timeout = '60s'`;
    const groups = [];
    const builds = [];
    for (const [game, product] of [
      ["forever", "wow_classic_beta"],
      ["tbc", "wow_anniversary"],
    ]) {
      operation = `${game}_item_build`;
      const [build] = await transaction`
        SELECT id, product, build_number, published_at FROM game_build
        WHERE product = ${product} AND status = 'published'
        ORDER BY published_at DESC LIMIT 1`;
      if (!build) throw new Error(`No published ${game} item build`);
      operation = `${game}_item_ids`;
      const rows =
        await transaction`SELECT item_id FROM item_version WHERE build_id = ${build.id} ORDER BY item_id`;
      const tasks = rows.map((row) =>
        referenceTaskSchema.parse({ game, kind: "item", id: row.item_id }),
      );
      if (!tasks.length) throw new Error(`Empty ${game} item inventory`);
      groups.push(tasks);
      builds.push({ game, kind: "item", ...build, count: tasks.length });
    }
    operation = "forever_world_snapshot";
    const [world] = await transaction`
      SELECT ws.build_id, gb.product, gb.build_number, ws.published_at
      FROM world_snapshot ws JOIN game_build gb ON gb.id = ws.build_id
      WHERE gb.product = 'wow_classic_beta' AND ws.status = 'published'
      ORDER BY ws.published_at DESC LIMIT 1`;
    if (world && !process.env.WOW_TRADER_WORLD_SNAPSHOT) {
      operation = "forever_quest_ids";
      const quests =
        await transaction`SELECT quest_id FROM world_quest_version WHERE build_id = ${world.build_id} ORDER BY quest_id`;
      groups.push(
        quests.map((row) =>
          referenceTaskSchema.parse({ game: "forever", kind: "quest", id: row.quest_id }),
        ),
      );
      builds.push({ game: "forever", kind: "quest", ...world, count: quests.length });
    }
    return { groups, builds };
  });
  if (process.env.WOW_TRADER_WORLD_SNAPSHOT) {
    operation = "forever_live_quest_artifact";
    const { worldSnapshotManifestSchema, worldQuestSchema } = await import(
      pathToFileURL(resolve(values.root, "packages/contracts/dist/index.js")).href
    );
    const manifestPath = resolve(process.env.WOW_TRADER_WORLD_SNAPSHOT);
    if ((await stat(manifestPath)).size > 5000000)
      throw new Error("World manifest exceeds size budget");
    const manifest = worldSnapshotManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, "utf8")),
    );
    if (manifest.product !== "wow_classic_beta") throw new Error("World manifest edition mismatch");
    const artifact = manifest.normalizedArtifacts.quests;
    if (!artifact) throw new Error("Quest artifact is absent from live world manifest");
    const artifactPath = resolve(dirname(manifestPath), artifact.path);
    const relativePath = relative(dirname(manifestPath), artifactPath);
    if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith("../"))
      throw new Error("Quest artifact escapes snapshot directory");
    if ((await stat(artifactPath)).size > 64000000)
      throw new Error("Quest artifact exceeds size budget");
    const contents = await readFile(artifactPath);
    if (createHash("sha256").update(contents).digest("hex") !== artifact.sha256)
      throw new Error("Quest artifact checksum mismatch");
    const text = (
      artifact.path.endsWith(".gz") ? gunzipSync(contents, { maxOutputLength: 64000000 }) : contents
    ).toString("utf8");
    const quests = text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => worldQuestSchema.parse(JSON.parse(line)));
    if (quests.length !== artifact.recordCount)
      throw new Error("Quest artifact record count mismatch");
    inventory.groups.push(
      quests
        .map((quest) =>
          referenceTaskSchema.parse({ game: "forever", kind: "quest", id: quest.questId }),
        )
        .sort((a, b) => a.id - b.id),
    );
    inventory.builds.push({
      game: "forever",
      kind: "quest",
      product: manifest.product,
      build_number: manifest.buildNumber,
      extracted_at: manifest.extractedAt,
      source: "live_world_artifact",
      sha256: artifact.sha256,
      count: quests.length,
      availability: "client_id_present_not_confirmed_obtainable",
    });
  }
  if (!inventory.builds.some((build) => build.kind === "quest"))
    throw new Error("No published Forever quest inventory");
  operation = "persist_inventory";
  const tasks = [];
  for (let index = 0; index < Math.max(...inventory.groups.map((group) => group.length)); index++)
    for (const group of inventory.groups) if (group[index]) tasks.push(group[index]);
  if (tasks.length > 250000) throw new Error("Client inventory exceeds full-job queue budget");
  await persist("all-catalog.json", tasks);
  await persist("inventory.json", {
    generatedAt: new Date().toISOString(),
    total: tasks.length,
    builds: inventory.builds,
    scope:
      "Published client item IDs in TBC and Forever plus known Forever quest IDs; presence is not an availability claim.",
  });
  console.log(JSON.stringify({ total: tasks.length, builds: inventory.builds }));
} catch (error) {
  console.error(
    JSON.stringify({
      operation,
      code:
        typeof error?.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
          ? error.code
          : "INVENTORY_FAILED",
      reason:
        error instanceof Error && error.message.startsWith("No published ") ? error.message : null,
    }),
  );
  // Database driver errors may contain connection details; keep operational failures credential-free.
  throw new Error("Readonly catalog inventory failed; no catalog rows were modified");
} finally {
  await sql.end({ timeout: 5 });
}
