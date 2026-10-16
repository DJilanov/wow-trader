import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { createDatabase } from "@wow-trader/db";
import { syncOfficialNotes } from "./updates-server.js";
import { syncTalentSnapshot } from "./talent-sync.js";

async function main(): Promise<void> {
  try {
    loadEnvFile(resolve(".env"));
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const args = process.argv.slice(2);
  const allowed = new Set(["--force", "--local-only", "--talents"]);
  if (args.some((argument) => !allowed.has(argument)))
    throw new Error("Usage: updates-cli [--force] [--local-only | --talents]");
  const directory = resolve(process.env.FOREVER_UPDATES_ROOT || "artifacts/forever-updates");
  if (!process.env.DATABASE_URL && !args.includes("--local-only"))
    throw new Error("Set DATABASE_URL or use --local-only for a local validated archive");
  const connection =
    process.env.DATABASE_URL && !args.includes("--local-only")
      ? createDatabase(process.env.DATABASE_URL)
      : null;
  try {
    if (args.includes("--talents") && (!connection || !process.env.FOREVER_ASSET_RELEASES_ROOT))
      throw new Error(
        "Talent synchronization requires the database and FOREVER_ASSET_RELEASES_ROOT",
      );
    const jobs: Promise<unknown>[] = [
      syncOfficialNotes({
        directory,
        force: args.includes("--force"),
        ...(connection ? { database: connection.db } : {}),
      }),
    ];
    if (args.includes("--talents") && connection && process.env.FOREVER_ASSET_RELEASES_ROOT)
      jobs.push(
        syncTalentSnapshot({
          database: connection.db,
          directory,
          assetsDirectory: resolve(process.env.FOREVER_ASSET_RELEASES_ROOT),
        }),
      );
    const results = await Promise.allSettled(jobs);
    process.stdout.write(
      `${JSON.stringify(results.map((result) => (result.status === "fulfilled" ? { state: "ok", result: result.value } : { state: "failed" })))}\n`,
    );
    if (results.some((result) => result.status === "rejected")) process.exitCode = 1;
  } finally {
    await connection?.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Official notes sync failed: ${error instanceof Error ? error.name : "unknown_error"}\n`,
  );
  process.exitCode = 1;
});
