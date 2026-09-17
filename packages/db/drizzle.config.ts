import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

try {
  loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "../../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to generate or apply database migrations");
}

export default defineConfig({
  dialect: "postgresql",
  out: "./migrations",
  schema: "./src/schema.ts",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
