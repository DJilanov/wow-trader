import "dotenv/config";

import {
  authenticateTraderInstallation,
  consumeTraderRate,
  createDatabase,
  TraderAccountError,
} from "@wow-trader/db";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PostgresUploadRepository } from "./postgres-upload-repository.js";
import { FileRawPayloadStore } from "./raw-payload-store.js";
import { UploadRateLimitError } from "./errors.js";

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = await buildApp({
  repository: new PostgresUploadRepository(database.db),
  rawPayloadStore: new FileRawPayloadStore(config.rawUploadDirectory),
  apiKeys: config.apiKeys,
  marketReadApiKeys: config.marketReadApiKeys,
  webOrigin: config.webOrigin,
  logger: true,
  authenticateInstallation: async (token, uploadBytes) => {
    const principal = await authenticateTraderInstallation(database.db, token);
    if (principal && uploadBytes !== undefined) {
      try {
        await consumeTraderRate(database.db, "upload-count:" + principal.ownerId, 120, 3600);
        await consumeTraderRate(
          database.db,
          "upload-bytes:" + principal.ownerId,
          256 * 1024 * 1024,
          3600,
          uploadBytes,
        );
      } catch (error: unknown) {
        if (error instanceof TraderAccountError && error.status === 429)
          throw new UploadRateLimitError();
        throw error;
      }
    }
    return principal;
  },
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
