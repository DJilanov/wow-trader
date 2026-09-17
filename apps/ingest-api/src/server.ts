import "dotenv/config";

import { createDatabase } from "@wow-trader/db";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PostgresAuctionUploadRepository } from "./postgres-upload-repository.js";
import { FileRawPayloadStore } from "./raw-payload-store.js";

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = await buildApp({
  repository: new PostgresAuctionUploadRepository(database.db),
  rawPayloadStore: new FileRawPayloadStore(config.rawUploadDirectory),
  apiKeys: config.apiKeys,
  webOrigin: config.webOrigin,
  logger: true,
});

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await database.close();
  process.exitCode = 0;
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error: unknown) {
  app.log.error({ error }, "Failed to start ingestion API");
  await database.close();
  process.exitCode = 1;
}
