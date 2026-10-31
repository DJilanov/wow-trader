import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { eq } from "drizzle-orm";
import {
  createDatabase,
  startTraderPairing,
  approveTraderPairing,
  pollTraderPairing,
  traderPairings,
  traderInstallations,
  traderTrades,
  authenticateTraderInstallation,
  synchronizeTraderAccount,
  listTraderWatches,
  updateTraderWatch,
  importTraderWatches,
  clearTraderWatches,
  recordManualTraderEvent,
  traderSecretHash,
  consumeTraderRate,
} from "../packages/db/dist/index.js";
import { traderWatchSchema, traderTradeSchema } from "../packages/contracts/dist/index.js";
import {
  collectorSavedVariablesSchema,
  createProfessionSnapshotUpload,
} from "../packages/companion-core/dist/index.js";
import { buildApp } from "../apps/ingest-api/src/app.ts";
import { PostgresUploadRepository } from "../apps/ingest-api/src/postgres-upload-repository.ts";

const uri = process.env.TRADER_TEST_DATABASE_URL;
assert(
  uri && /^\/wow_trader_buy_test_[a-z0-9_]+$/.test(new URL(uri).pathname),
  "An explicitly isolated test database is required",
);
process.env.DATABASE_URL = uri;
await import("./verify-trader-market.mjs");
const database = createDatabase(uri),
  checks = [];
let app;
function check(value) {
  checks.push(value);
}
const owners = ["407839813769756693", "407839813769756694"];
const watch = traderWatchSchema.parse({
  product: "wow_classic_beta",
  market: "EU|TraderTestRealm|alliance",
  itemId: 1,
  name: "Test Copper Ore",
});
async function pairing(owner) {
  const start = await startTraderPairing(
    database.db,
    "Isolated test Companion",
    "https://kfcguild.online",
  );
  await approveTraderPairing(database.db, owner, start.userCode);
  return await pollTraderPairing(database.db, start.deviceCode);
}
try {
  const start = await startTraderPairing(
    database.db,
    "Isolated test Companion",
    "https://kfcguild.online",
  );
  assert.equal((await pollTraderPairing(database.db, start.deviceCode)).status, "pending");
  await approveTraderPairing(database.db, owners[0], start.userCode);
  await assert.rejects(
    () => pollTraderPairing(database.db, start.deviceCode),
    (error) => error.code === "slow_down",
  );
  await database.db
    .update(traderPairings)
    .set({ lastPollAt: null })
    .where(eq(traderPairings.deviceHash, traderSecretHash(start.deviceCode)));
  const first = await pollTraderPairing(database.db, start.deviceCode),
    second = await pairing(owners[1]);
  assert(first.status === "connected" && second.status === "connected");
  assert.equal((await pollTraderPairing(database.db, start.deviceCode)).status, "expired");
  const [installation] = await database.db
    .select()
    .from(traderInstallations)
    .where(eq(traderInstallations.id, first.installationId));
  assert(
    installation.tokenHash === traderSecretHash(first.credential) &&
      !JSON.stringify(installation).includes(first.credential),
  );
  check("explicit approval, hashed credentials, polling throttle and one-time consumption");
  const expired = await startTraderPairing(database.db, "Expired test", "https://kfcguild.online");
  await database.db
    .update(traderPairings)
    .set({ expiresAt: new Date(0) })
    .where(eq(traderPairings.deviceHash, traderSecretHash(expired.deviceCode)));
  assert.equal((await pollTraderPairing(database.db, expired.deviceCode)).status, "expired");
  await assert.rejects(() => approveTraderPairing(database.db, owners[0], expired.userCode));
  check("expired codes cannot approve or connect");
  const principal = await authenticateTraderInstallation(database.db, first.credential);
  assert(principal && principal.ownerId === owners[0]);
  const event = traderTradeSchema.parse({
    eventId: randomUUID(),
    sourceKey: "mail:" + randomUUID(),
    product: "wow_classic_beta",
    clientBuild: 69801,
    market: watch.market,
    characterName: "TestCrafter",
    itemId: 1,
    itemName: "Test Copper Ore",
    quantity: 5,
    kind: "purchase",
    amountCopper: "30000",
    auctionFeeCopper: "0",
    depositCopper: null,
    occurredAt: new Date().toISOString(),
    evidence: "mail_receipt",
  });
  const changeId = randomUUID(),
    payload = { trades: [event], watchChanges: [{ changeId, action: "watch", item: watch }] };
  assert.equal((await synchronizeTraderAccount(database.db, principal, payload)).tradesAccepted, 1);
  assert.equal((await synchronizeTraderAccount(database.db, principal, payload)).tradesAccepted, 0);
  assert.equal((await listTraderWatches(database.db, owners[1])).length, 0);
  assert.equal((await database.db.select().from(traderTrades)).length, 1);
  await clearTraderWatches(database.db, owners[0]);
  await synchronizeTraderAccount(database.db, principal, payload);
  assert.equal((await listTraderWatches(database.db, owners[0])).length, 0);
  check(
    "private trade idempotency, owner isolation and acknowledged watch changes do not resurrect",
  );
  await updateTraderWatch(database.db, owners[0], { ...watch, maximumUnits: 5 }, false);
  await importTraderWatches(database.db, owners[0], [watch]);
  assert.equal((await listTraderWatches(database.db, owners[0]))[0].maximumUnits, 5);
  await importTraderWatches(
    database.db,
    owners[0],
    Array.from({ length: 49 }, (_, index) => ({ ...watch, itemId: 1000 + index })),
  );
  await assert.rejects(
    () => updateTraderWatch(database.db, owners[0], { ...watch, itemId: 9999 }, false),
    (error) => error.code === "watch_limit",
  );
  assert.equal((await listTraderWatches(database.db, owners[0])).length, 50);
  await clearTraderWatches(database.db, owners[0]);
  check("watch merges preserve existing settings and enforce the atomic 50-item limit");
  await assert.rejects(
    () => recordManualTraderEvent(database.db, owners[1], event),
    (error) => error.code === "invalid_evidence",
  );
  const manual = { ...event, eventId: randomUUID(), evidence: "manual" };
  await recordManualTraderEvent(database.db, owners[1], manual);
  await recordManualTraderEvent(database.db, owners[1], manual);
  check("browser events cannot impersonate mailbox evidence and remain idempotent");
  const repository = new PostgresUploadRepository(database.db),
    maintainer = "isolated-test-maintainer-key";
  app = await buildApp({
    repository,
    rawPayloadStore: { put: async (id) => `memory://${id}` },
    apiKeys: [maintainer],
    webOrigin: "https://kfcguild.online",
    authenticateInstallation: (token) => authenticateTraderInstallation(database.db, token),
  });
  async function uploadCharacter(name, token) {
    const saved = collectorSavedVariablesSchema.parse({
      schemaVersion: 1,
      installationId: "isolated-test-installation",
      scans: [],
      professionSnapshots: [
        {
          snapshotID: randomUUID(),
          addonVersion: "0.14.0",
          clientProduct: "wow_classic_beta",
          clientBuild: 69801,
          locale: "enUS",
          region: "EU",
          realmID: "TraderTestRealm",
          sourceCharacter: { name, realmId: "TraderTestRealm", faction: "alliance" },
          capturedAt: Math.floor(Date.now() / 1000),
          completedAt: Math.floor(Date.now() / 1000),
          moneyCopper: 100000,
          inventoryScope: "bags",
          inventory: [{ itemID: 1, quantity: 5 }],
          professions: [
            {
              professionSkillLineID: 171,
              name: "Alchemy",
              skillLevel: 300,
              maximumSkillLevel: 300,
              skillModifier: 0,
              apiFlavor: "legacy_trade_skill",
              recipeListComplete: true,
              specializationSpellIDs: [],
              knownRecipes: [],
            },
          ],
        },
      ],
    });
    const value = createProfessionSnapshotUpload(saved, saved.professionSnapshots[0]);
    const response = await app.inject({
      method: "POST",
      url: "/v1/uploads/profession-snapshot",
      headers: { authorization: `Bearer ${token}` },
      payload: value,
    });
    assert.equal(response.statusCode, 202, response.body);
    return value;
  }
  const owned = await uploadCharacter("OwnerOne", first.credential);
  await uploadCharacter("OwnerTwo", second.credential);
  await uploadCharacter("UnownedLegacy", maintainer);
  const { loadTraderAccount } = await import("../apps/web/src/lib/trader-account-data.ts");
  const one = await loadTraderAccount(owners[0]),
    two = await loadTraderAccount(owners[1]);
  assert.deepEqual(
    one.characters.map((character) => character.name),
    ["OwnerOne"],
  );
  assert.deepEqual(
    two.characters.map((character) => character.name),
    ["OwnerTwo"],
  );
  assert(
    one.trades.every((trade) => trade.evidence === "mail_receipt") &&
      two.trades.every((trade) => trade.evidence === "manual"),
  );
  const hiddenReceipt = await app.inject({
    method: "GET",
    url: `/v1/uploads/${owned.payloadId}`,
    headers: { authorization: `Bearer ${second.credential}` },
  });
  assert.equal(hiddenReceipt.statusCode, 404);
  const stolen = await app.inject({
    method: "POST",
    url: "/v1/uploads/profession-snapshot",
    headers: { authorization: `Bearer ${second.credential}` },
    payload: owned,
  });
  assert.equal(stolen.statusCode, 409);
  check(
    "paired uploads and real account reads isolate two owners and exclude legacy unowned characters",
  );
  const { createTraderGoldPlan } = await import("../apps/web/src/lib/trader-gold-plan.ts");
  const plan = await createTraderGoldPlan(
    {
      product: "wow_classic_beta",
      market: watch.market,
      budget: "10",
      mode: "buy",
      useInventory: false,
    },
    owners[0],
  );
  assert.equal(plan.status, "ready");
  assert(
    plan.actions.length > 0 &&
      plan.actions.every((action) =>
        action.purchases.every((purchase) => purchase.stackSize === 5),
      ),
  );
  check("real persisted SQL history produces an executable shared-budget whole-stack web plan");
  await database.db
    .update(traderInstallations)
    .set({ revokedAt: new Date() })
    .where(eq(traderInstallations.id, first.installationId));
  assert.equal(await authenticateTraderInstallation(database.db, first.credential), null);
  await assert.rejects(
    () => synchronizeTraderAccount(database.db, principal, payload),
    (error) => error.code === "invalid_installation",
  );
  const denied = await app.inject({
    method: "GET",
    url: `/v1/uploads/${owned.payloadId}`,
    headers: { authorization: `Bearer ${first.credential}` },
  });
  assert.equal(denied.statusCode, 401);
  check("revocation rejects API access and an already authenticated stale sync principal");
  for (let index = 0; index < 4; index++) await pairing(owners[1]);
  const overflow = await startTraderPairing(
    database.db,
    "Sixth test device",
    "https://kfcguild.online",
  );
  await assert.rejects(
    () => approveTraderPairing(database.db, owners[1], overflow.userCode),
    (error) => error.code === "device_limit",
  );
  check("five-installation limit is enforced during approval and issuance");
  await consumeTraderRate(database.db, "isolated-limit", 1);
  await assert.rejects(
    () => consumeTraderRate(database.db, "isolated-limit", 1),
    (error) => error.code === "rate_limited",
  );
  check("persistent rate limiting rejects excess requests");
  const report = {
    status: "passed",
    database: new URL(uri).pathname.slice(1),
    checks,
    completedAt: new Date().toISOString(),
  };
  await writeFile(
    process.env.TRADER_ACCOUNT_TEST_REPORT ??
      path.join(path.dirname(process.env.TRADER_TEST_REPORT), "account-database.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  process.stdout.write(JSON.stringify(report) + "\n");
} finally {
  if (app) await app.close();
  await database.close();
  await globalThis.wowTraderDatabase?.close();
  delete globalThis.wowTraderDatabase;
}
