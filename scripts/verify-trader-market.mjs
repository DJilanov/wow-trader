import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL, URLSearchParams } from "node:url";
import { getTableColumns } from "drizzle-orm";
import {
  createDatabase,
  gameBuilds,
  items,
  itemVersions,
  marketItemSignals,
  loadMarketHistory,
  marketHistoryLinks,
} from "../packages/db/dist/index.js";
import { canonicalJson } from "../packages/contracts/dist/index.js";
import { analyzePriceHistory, quoteBuyOpportunity } from "../packages/market/dist/index.js";
import { buildApp } from "../apps/ingest-api/src/app.ts";
import { PostgresUploadRepository } from "../apps/ingest-api/src/postgres-upload-repository.ts";

const uri = process.env.TRADER_TEST_DATABASE_URL;
assert(uri, "TRADER_TEST_DATABASE_URL is required; production is never a default");
assert(
  /^\/wow_trader_buy_test_[a-z0-9_]+$/.test(new URL(uri).pathname),
  "Only an isolated task test database is allowed",
);
const database = createDatabase(uri);
const root = path.resolve(import.meta.dirname, "..");
const output =
  process.env.TRADER_TEST_REPORT ?? path.join(root, "artifacts/trader-buy-20261031/database.json");
const report = {
  status: "running",
  database: new URL(uri).pathname.slice(1),
  checks: [],
  completedAt: null,
};
const apiKey = "private-isolated-test-key-not-for-production";
let app;
const base = Math.floor(Date.now() / 1_800_000) * 1_800_000 - 60_000;
const itemIds = [1, 2, 3, ...Array.from({ length: 35 }, (_, index) => 100 + index)];
const scope = {
  clientProduct: "wow_classic_beta",
  clientBuild: 69801,
  region: "EU",
  realmId: "TraderTestRealm",
  auctionHouseType: "alliance",
};
function check(name) {
  report.checks.push(name);
}
try {
  const journal = JSON.parse(
    await readFile(path.join(root, "packages/db/migrations/meta/_journal.json"), "utf8"),
  );
  for (const entry of journal.entries) {
    await database.client.unsafe(
      await readFile(path.join(root, "packages/db/migrations", entry.tag + ".sql"), "utf8"),
    );
  }
  check("all migrations apply to a real empty PostgreSQL database");
  const builds = [];
  for (const number of [69800, 69801]) {
    const [build] = await database.db
      .insert(gameBuilds)
      .values({
        snapshotKey: "test-" + number,
        product: scope.clientProduct,
        clientVersion: "1.60.0",
        buildNumber: number,
        buildKey: "test",
        cdnKey: "test",
        locale: "enUS",
        hotfixStatus: "applied",
        definitionsRevision: "test",
        extractorVersion: "test",
        status: number === 69801 ? "published" : "review_required",
        extractedAt: new Date(base),
        publishedAt: new Date(base),
        manifest: {},
      })
      .returning();
    builds.push(build);
  }
  await database.db
    .insert(items)
    .values(itemIds.map((itemId) => ({ itemId, firstSeenBuildNumber: 69800 })));
  for (const build of builds) {
    for (const id of itemIds) {
      const row = Object.fromEntries(
        Object.entries(getTableColumns(itemVersions)).map(([key, column]) => [
          key,
          !column.notNull
            ? null
            : column.dataType === "bigint"
              ? 0n
              : column.dataType === "number"
                ? 0
                : column.dataType === "json"
                  ? {}
                  : "",
        ]),
      );
      await database.db.insert(itemVersions).values({
        ...row,
        buildId: build.id,
        itemId: id,
        name:
          id === 1
            ? "Test Copper Ore"
            : id === 2
              ? "Test Changed Reagent"
              : id === 3
                ? "Test Cloth Armor"
                : `Test Material ${id}`,
        description: "Private integration fixture",
        classId: id === 3 ? 4 : 7,
        quality: 1,
        itemLevel: 1,
        requiredLevel: 1,
        stackSize: 20,
        allowableRaceMask: [],
        rawRecord: { identity: id, revision: id === 2 && build.buildNumber === 69801 ? 2 : 1 },
      });
    }
  }
  const repository = new PostgresUploadRepository(database.db);
  app = await buildApp({
    repository,
    rawPayloadStore: { put: async (id) => `memory://${id}` },
    apiKeys: [apiKey],
    webOrigin: "https://test.invalid",
  });
  function upload(build, index, price, overrides = {}) {
    const completed = new Date(base - (10 - index) * 1_800_000).toISOString();
    const data = {
      scanId: randomUUID(),
      itemSnapshots: itemIds.map((itemId) => ({
        itemId,
        marketKey: String(itemId),
        itemLink: null,
        itemName:
          itemId === 1 ? "Scanned Copper Ore" : itemId === 2 ? "Scanned Reagent" : "Scanned Armor",
        itemClassId: itemId === 3 ? 4 : 7,
        priceLevels: [{ unitPriceCopper: String(price), quantity: 100, listingCount: 5 }],
      })),
    };
    return {
      schemaVersion: "auction-scan.v1",
      payloadType: "auction_scan",
      payloadId: randomUUID(),
      addonVersion: "0.13.0",
      ...scope,
      clientBuild: build,
      locale: "enUS",
      anonymousInstallationId: "isolated-integration-test",
      capturedAt: completed,
      completedAt: completed,
      completeness: 1,
      checksum: createHash("sha256").update(canonicalJson(data)).digest("hex"),
      data,
      ...overrides,
    };
  }
  async function accept(payload) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/uploads/auction-scan",
      headers: { authorization: `Bearer ${apiKey}` },
      payload,
    });
    assert.equal(response.statusCode, 202, response.body);
    return response.json();
  }
  async function pack() {
    const response = await app.inject({
      method: "GET",
      url:
        "/v1/market-intelligence?" +
        new URLSearchParams(Object.entries(scope).map(([key, value]) => [key, String(value)])),
      headers: { authorization: `Bearer ${apiKey}` },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  }
  for (let i = 0; i < 8; i++) await accept(upload(69800, i, 10000));
  let last;
  for (let i = 8; i < 11; i++) {
    last = upload(69801, i, 6000);
    await accept(last);
  }
  let current = await pack();
  assert(
    current.items.every((item) => item.signal === "collecting" && item.observationCount === 3),
  );
  check("unreviewed builds do not inherit history");
  const policy = {
    clientProduct: scope.clientProduct,
    region: scope.region,
    realmId: scope.realmId,
    auctionHouseType: scope.auctionHouseType,
    fromBuild: 69800,
    toBuild: 69801,
    notBefore: new Date(base - 7 * 86400000),
    reason: "Private fixture same-economy validation",
  };
  await database.db.insert(marketHistoryLinks).values(policy);
  current = await pack();
  const copper = current.items.find((item) => item.itemId === 1);
  assert.equal(copper.observationCount, 11);
  assert.equal(copper.signal, "bargain");
  assert.deepEqual(copper.levels, [{ unitPriceCopper: "6000", quantity: 100, listingCount: 5 }]);
  assert.equal(current.items.find((item) => item.itemId === 2).observationCount, 3);
  assert.equal(current.historyPolicy, "robust-market-history-v1");
  assert.deepEqual(current.historyBuilds, [69800, 69801]);
  check("reviewed unchanged items inherit history while changed item records remain isolated");
  const history = await loadMarketHistory(
    database.db,
    scope,
    new Date(last.completedAt),
    last.data.scanId,
    [1],
  );
  const intelligence = analyzePriceHistory(history.byItem.get(1));
  const quote = quoteBuyOpportunity({
    intelligence,
    levels: [{ unitPriceCopper: 6000n, quantity: 100, listingCount: 5 }],
    observedAt: new Date(last.completedAt),
    now: new Date(),
    auctionHouseType: "alliance",
  });
  assert.equal(quote.state, "opportunity");
  assert.equal(quote.quantity, 10);
  assert.equal(quote.profitCopper, 30250n);
  check("real persisted API observations produce the exact depth-aware after-fee quote");
  const duplicate = await accept(last);
  assert(duplicate.duplicate);
  assert.equal((await pack()).items.find((item) => item.itemId === 1).observationCount, 11);
  check("idempotent upload replay does not inflate history");
  await accept(
    upload(69801, 10, 6000, {
      completedAt: new Date(base + 500).toISOString(),
      capturedAt: new Date(base + 500).toISOString(),
    }),
  );
  current = await pack();
  assert.equal(current.items.find((item) => item.itemId === 1).observationCount, 11);
  check("multiple scans inside one half-hour do not inflate independent evidence");
  await accept(
    upload(69801, 10, 1, { completedAt: new Date(base + 1000).toISOString(), completeness: 0.97 }),
  );
  current = await pack();
  assert.equal(current.items.find((item) => item.itemId === 1).currentPriceCopper, "6000");
  check("rejected scan quality cannot poison the price baseline");
  await accept(upload(69800, 10, 1, { realmId: "OtherRealm" }));
  assert.equal((await pack()).items.find((item) => item.itemId === 1).observationCount, 11);
  check("another realm cannot enter the linked market");
  await database.db.update(marketHistoryLinks).set({ notBefore: new Date(base - 2 * 1_800_000) });
  assert.equal((await pack()).items.find((item) => item.itemId === 1).observationCount, 3);
  await database.db.update(marketHistoryLinks).set({ notBefore: policy.notBefore });
  check("reviewed reset cutoffs exclude earlier source observations");
  const beforeLate = await pack();
  await accept(upload(69801, 7, 9000));
  const afterLate = await pack();
  assert.equal(afterLate.sourceScanId, beforeLate.sourceScanId);
  const materialized = await database.db.select().from(marketItemSignals);
  assert(
    materialized
      .filter((row) => row.clientBuild === 69801 && row.realmId === scope.realmId)
      .every((row) => row.asOfScanId === afterLate.sourceScanId),
  );
  check("late uploads refresh history without replacing the latest materialized price");
  const beforeBackfill = afterLate.items.find((item) => item.itemId === 1).observationCount;
  await accept(upload(69800, -1, 10000));
  const afterBackfill = await pack();
  assert.equal(
    afterBackfill.items.find((item) => item.itemId === 1).observationCount,
    beforeBackfill + 1,
  );
  const refreshed = await database.db.select().from(marketItemSignals);
  assert.equal(
    refreshed.find(
      (row) => row.clientBuild === 69801 && row.realmId === scope.realmId && row.itemId === 1,
    ).observationCount,
    beforeBackfill + 1,
  );
  check("linked source-build backfills refresh current-build history and rankings");
  const query = new URLSearchParams(
    Object.entries(scope).map(([key, value]) => [key, String(value)]),
  );
  query.set("pageSize", "1");
  const pageOne = await app.inject({
    method: "GET",
    url: "/v1/market-intelligence?" + query,
    headers: { authorization: `Bearer ${apiKey}` },
  });
  assert.equal(pageOne.statusCode, 200);
  const firstPage = pageOne.json();
  assert.equal(firstPage.items.length, 1);
  assert.equal(firstPage.nextAfterItemId, 1);
  query.set("afterItemId", "1");
  query.set("asOfScanId", firstPage.sourceScanId);
  const pageTwo = await app.inject({
    method: "GET",
    url: "/v1/market-intelligence?" + query,
    headers: { authorization: `Bearer ${apiKey}` },
  });
  assert.equal(pageTwo.statusCode, 200);
  assert.equal(pageTwo.json().items[0].itemId, 2);
  assert.equal(pageTwo.json().historyRevision, firstPage.historyRevision);
  check("bounded history pages pin their scan and comparison policy");
  for (let index = 0; index < 11; index++)
    await accept(upload(69802, index, index < 8 ? 10000 : 6000, { realmId: "NewRealm" }));
  const uncataloged = await repository.getMarketIntelligence({
    ...scope,
    clientBuild: 69802,
    realmId: "NewRealm",
  });
  assert(uncataloged);
  assert.equal(uncataloged.items.find((item) => item.itemId === 1).name, "Scanned Copper Ore");
  assert.equal(uncataloged.items.find((item) => item.itemId === 1).signal, "bargain");
  assert.deepEqual(uncataloged.historyBuilds, [69802]);
  check("new-build price intelligence works from validated scan metadata without a recipe catalog");
  const unauthorized = await app.inject({
    method: "GET",
    url:
      "/v1/market-intelligence?" +
      new URLSearchParams(Object.entries(scope).map(([key, value]) => [key, String(value)])),
  });
  assert.equal(unauthorized.statusCode, 401);
  assert(!JSON.stringify(current).includes("isolated-integration-test"));
  check("market history remains authenticated and omits collector identity");
  report.status = "passed";
  report.completedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report) + "\n");
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  throw error;
} finally {
  if (app) await app.close();
  await database.close();
}
