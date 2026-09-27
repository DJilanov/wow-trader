import "dotenv/config";

import { createDatabase } from "@wow-trader/db";

import { rebuildLatestMarketSignals } from "./postgres-upload-repository.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const database = createDatabase(databaseUrl);
try {
  const marketCount = await rebuildLatestMarketSignals(database.db);
  process.stdout.write(`Rebuilt market intelligence for ${marketCount} market(s).\n`);
} finally {
  await database.close();
}
