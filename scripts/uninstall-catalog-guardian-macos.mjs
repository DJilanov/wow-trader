#!/usr/bin/env node

import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const label = "online.kfcguild.wow-trader-catalog-guardian";
const launchAgentPath = join(homedir(), `Library/LaunchAgents/${label}.plist`);

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

async function main() {
  if (process.platform !== "darwin") throw new Error("This uninstaller supports macOS only.");
  const domain = `gui/${process.getuid()}`;
  try {
    await execute("launchctl", ["bootout", domain, launchAgentPath]);
  } catch {
    // The service may already be unloaded.
  }
  await rm(launchAgentPath, { force: true });
  process.stdout.write(
    `Removed ${label}. Catalog snapshots, status, logs, and production releases were retained.\n`,
  );
}
