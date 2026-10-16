import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { resolve } from "node:path";
import process from "node:process";
import console from "node:console";

const controller = new globalThis.AbortController();
process.on("SIGTERM", () => controller.abort());
process.on("SIGINT", () => controller.abort());

async function main() {
  if (
    !process.env.DATABASE_URL ||
    !process.env.FOREVER_UPDATES_ROOT ||
    !process.env.FOREVER_ASSET_RELEASES_ROOT
  )
    throw new Error(
      "Daily updates require DATABASE_URL, FOREVER_UPDATES_ROOT and FOREVER_ASSET_RELEASES_ROOT",
    );
  do {
    await new Promise((resolve_, reject) => {
      const child = spawn(
        process.execPath,
        ["packages/forever-data/dist/updates-cli.js", "--talents"],
        {
          cwd: resolve(import.meta.dirname, ".."),
          env: process.env,
          stdio: "inherit",
          signal: controller.signal,
        },
      );
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code)
          console.error("Official updates retained the last good publication; inspect health.json");
        resolve_();
      });
    });
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(6, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    await setTimeout(next - now, undefined, { signal: controller.signal });
  } while (!controller.signal.aborted);
}
main().catch((error) => {
  if (!controller.signal.aborted) {
    console.error(error.message);
    process.exitCode = 1;
  }
});
