import { createHash } from "node:crypto";
import { readFile, stat, statfs } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import { createDatabase } from "../packages/db/dist/index.js";
import {
  importCommunityReferenceBundle,
  professionClientReviewSchema,
  professionReferenceBundleSchema,
} from "../packages/world-data/dist/index.js";

const { values } = parseArgs({
  strict: true,
  options: Object.fromEntries(
    ["bundle", "client", "expected-checksum", "expected-file-sha256", "mode"].map((key) => [
      key,
      { type: "string" },
    ]),
  ),
});
for (const key of ["bundle", "client", "expected-checksum", "expected-file-sha256", "mode"])
  if (!values[key]) throw new Error(`Missing --${key}`);
if (!["review", "publish", "withdraw"].includes(values.mode))
  throw new Error("Mode must be review, publish or withdraw");
if (!process.env.DATABASE_URL)
  throw new Error("Use the existing protected owner DATABASE_URL environment");
if ((await stat(values.bundle)).size > 64_000_000)
  throw new Error("Profession bundle exceeds its byte budget");
const bytes = await readFile(values.bundle);
if (createHash("sha256").update(bytes).digest("hex") !== values["expected-file-sha256"])
  throw new Error("Profession bundle file checksum mismatch");
const bundle = professionReferenceBundleSchema.parse(JSON.parse(bytes.toString("utf8")));
for (const artifact of bundle.artifacts) {
  if (basename(artifact.fileName) !== artifact.fileName)
    throw new Error("Unsafe profession artifact name");
  const contents = await readFile(resolve(dirname(values.bundle), artifact.fileName));
  if (
    contents.length !== artifact.byteSize ||
    createHash("sha256").update(contents).digest("hex") !== artifact.sha256
  )
    throw new Error("Profession relation artifact failed checksum validation");
}
const client = professionClientReviewSchema.parse(
  JSON.parse(
    gunzipSync(await readFile(values.client), { maxOutputLength: 32_000_000 }).toString("utf8"),
  ),
);
if (bundle.checksum !== values["expected-checksum"])
  throw new Error("Reviewed profession checksum mismatch");
if (values.mode !== "withdraw") {
  const disk = await statfs(values.bundle);
  if (disk.bavail * disk.bsize < 8 * 1024 ** 3)
    throw new Error("Publication stopped below the 8 GiB free-disk reserve");
  if (Date.parse(bundle.validUntil) <= Date.now())
    throw new Error("Profession reference evidence expired");
}
const source = {
  slug: "forever-profession-references",
  name: "Reviewed Forever profession sources",
  homepageUrl: "https://www.wowhead.com/forever",
  dataUrl: "https://www.wowhead.com/forever/spells/professions",
  attribution: "Wowhead and QuestieDB contributors; owner-authorized factual references",
};
const database = createDatabase(process.env.DATABASE_URL);
try {
  if (values.mode === "withdraw") {
    const rows =
      await database.client`UPDATE community_reference_snapshot s SET status='review_required' FROM external_data_source e WHERE s.source_id=e.id AND e.slug=${source.slug} AND s.source_revision=${bundle.sourceRevision} AND s.checksum=${bundle.checksum} AND s.build_id=${client.build.id} RETURNING s.id,s.status`;
    if (rows.length !== 1)
      throw new Error("Expected exactly one matching profession snapshot to withdraw");
    process.stdout.write(`${JSON.stringify({ mode: values.mode, snapshot: rows[0] })}\n`);
  } else {
    const [build] =
      await database.client`SELECT id,build_number FROM game_build WHERE product='wow_classic_beta' AND locale='enUS' AND status='published' ORDER BY published_at DESC LIMIT 1`;
    if (!build || build.id !== client.build.id || build.build_number !== client.build.buildNumber)
      throw new Error("Current client build changed after review");
    const result = await importCommunityReferenceBundle(
      database.db,
      bundle,
      {
        product: client.build.product,
        buildNumber: client.build.buildNumber,
        locale: client.build.locale,
        publish: values.mode === "publish",
        replacePublishedSource: true,
        licenseName:
          "Owner-confirmed factual-reference permission: Wowhead 2026-10-07; QuestieDB 2026-10-25",
      },
      source,
    );
    process.stdout.write(`${JSON.stringify({ mode: values.mode, ...result })}\n`);
  }
} finally {
  await database.close();
}
