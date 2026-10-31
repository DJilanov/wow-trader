import "dotenv/config";
import { parseArgs } from "node:util";
import { createDatabase, gameBuilds, itemVersions, marketHistoryLinks } from "@wow-trader/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { rebuildLatestMarketSignals } from "./postgres-upload-repository.js";

const { values } = parseArgs({
  options: {
    product: { type: "string" },
    region: { type: "string" },
    realm: { type: "string" },
    faction: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    since: { type: "string" },
    reason: { type: "string" },
    apply: { type: "boolean", default: false },
    "same-economy": { type: "boolean", default: false },
  },
});
const options = z
  .object({
    product: z.enum(["wow_classic_beta", "wow_anniversary"]),
    region: z.string().min(2).max(8),
    realm: z.string().min(1).max(128),
    faction: z.enum(["alliance", "horde", "neutral", "region"]),
    from: z.coerce.number().int().positive(),
    to: z.coerce.number().int().positive(),
    since: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(12).max(2000),
    apply: z.boolean(),
    "same-economy": z.boolean(),
  })
  .refine((value) => value.from < value.to, "The target build must be newer")
  .parse(values);
if (!options["same-economy"])
  throw new Error(
    "Declare --same-economy only after checking there was no realm reset, launch or economy wipe.",
  );
if (Date.parse(options.since) > Date.now())
  throw new Error("The history cutoff cannot be in the future");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const database = createDatabase(url);
try {
  const builds = await database.db
    .select({ id: gameBuilds.id, number: gameBuilds.buildNumber, status: gameBuilds.status })
    .from(gameBuilds)
    .where(
      and(
        eq(gameBuilds.product, options.product),
        eq(gameBuilds.locale, "enUS"),
        sql`${gameBuilds.buildNumber} IN (${options.from}, ${options.to})`,
      ),
    );
  const previous = builds.find((build) => build.number === options.from);
  const current = builds.find(
    (build) => build.number === options.to && build.status === "published",
  );
  if (!previous || !current)
    throw new Error("Both English catalogs must exist and the target must be published");
  const [counts] = await database.db
    .select({ items: sql<number>`count(*)::integer` })
    .from(itemVersions)
    .where(eq(itemVersions.buildId, current.id));
  if (!counts?.items) throw new Error("The target catalog is empty");
  const policy = {
    clientProduct: options.product,
    region: options.region,
    realmId: options.realm,
    auctionHouseType: options.faction,
    fromBuild: options.from,
    toBuild: options.to,
    notBefore: new Date(options.since),
    reason: options.reason,
  };
  if (options.apply) {
    await database.db
      .insert(marketHistoryLinks)
      .values(policy)
      .onConflictDoUpdate({
        target: [
          marketHistoryLinks.clientProduct,
          marketHistoryLinks.region,
          marketHistoryLinks.realmId,
          marketHistoryLinks.auctionHouseType,
          marketHistoryLinks.fromBuild,
          marketHistoryLinks.toBuild,
        ],
        set: { notBefore: policy.notBefore, reason: policy.reason, reviewedAt: new Date() },
      });
    await rebuildLatestMarketSignals(database.db);
  }
  process.stdout.write(
    `${JSON.stringify({
      status: options.apply ? "recorded" : "preview",
      ...policy,
      itemRule:
        "Only identical catalog records can inherit history. Applying also rebuilds derived signals.",
    })}\n`,
  );
} finally {
  await database.close();
}
