import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { parseArgs } from "node:util";
import { createDatabase } from "../packages/db/dist/index.js";
import {
  clientProfessionLinksEnvelopeSchema,
  importCommunityReferenceBundle,
} from "../packages/world-data/dist/index.js";

const { values } = parseArgs({
  options: { bundle: { type: "string" }, publish: { type: "boolean", default: false } },
  strict: true,
});
if (!values.bundle || !process.env.DATABASE_URL)
  throw new Error("Provide --bundle and DATABASE_URL.");
const raw = JSON.parse(await readFile(values.bundle, "utf8"));
const envelope = clientProfessionLinksEnvelopeSchema.parse(raw);
const { checksum, sourceRevision, ...payload } = raw.bundle;
const expected = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
if (checksum !== expected || sourceRevision !== `client-${expected}`)
  throw new Error("Client profession bundle checksum mismatch.");
const { db, client, close } = createDatabase(process.env.DATABASE_URL);
try {
  const [build] = await client.unsafe(
    "SELECT id, product, build_number, locale, hotfix_hash FROM game_build WHERE id=$1 AND status='published'",
    [envelope.report.baseBuildId],
  );
  if (
    !build ||
    build.hotfix_hash !== envelope.report.baseHotfix ||
    !envelope.bundle.relations.every(
      (relation) =>
        relation.evidence.catalogBuildId === build.id &&
        relation.evidence.catalogHotfix === build.hotfix_hash &&
        relation.evidence.clientBuild === build.build_number,
    )
  )
    throw new Error(
      "The reviewed catalog identity changed; requalify before publishing client relations.",
    );
  if (envelope.bundle.relations.length !== envelope.report.qualified)
    throw new Error("Qualified relationship count mismatch.");
  const result = await importCommunityReferenceBundle(
    db,
    envelope.bundle,
    {
      product: build.product,
      buildNumber: build.build_number,
      locale: build.locale,
      publish: values.publish,
      licenseName: "Installed game client factual interoperability data",
      replacePublishedSource: true,
    },
    {
      slug: "client-profession-links",
      name: "Verified game-client recipe links",
      homepageUrl: "https://worldofwarcraft.blizzard.com/",
      dataUrl: "https://kfcguild.online/tools/forever/encyclopedia",
      attribution: "Blizzard Entertainment · locally extracted client facts",
    },
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await close();
}
