import { createDatabase } from "@wow-trader/db";

type DatabaseConnection = ReturnType<typeof createDatabase>;

const globalDatabase = globalThis as typeof globalThis & {
  wowTraderDatabase?: DatabaseConnection;
};

export function getDatabase(): DatabaseConnection["db"] {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  globalDatabase.wowTraderDatabase ??= createDatabase(databaseUrl);
  return globalDatabase.wowTraderDatabase.db;
}
