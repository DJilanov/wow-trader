import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export type WowTraderDatabase = ReturnType<typeof createDatabase>["db"];

export function createDatabase(databaseUrl: string) {
  if (databaseUrl.trim().length === 0) {
    throw new Error("A non-empty database URL is required");
  }

  const client = postgres(databaseUrl, {
    max: 10,
    prepare: false,
    transform: {
      undefined: null,
    },
  });
  const db = drizzle(client, { schema });

  return {
    client,
    db,
    async close(): Promise<void> {
      await client.end({ timeout: 5 });
    },
  };
}
