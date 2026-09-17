#!/usr/bin/env node

import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const label = "online.kfcguild.wow-trader-companion";
const launchAgentPath = join(homedir(), `Library/LaunchAgents/${label}.plist`);

if (process.platform !== "darwin") throw new Error("This uninstaller supports macOS only");
const domain = `gui/${process.getuid()}`;
try {
  await execute("launchctl", ["bootout", domain, launchAgentPath]);
} catch {
  // The service may already be stopped or absent.
}
await rm(launchAgentPath, { force: true });
process.stdout.write(
  `Removed ${label}. Saved scan state and the protected API key remain in Library/Application Support/WowTraderCompanion.\n`,
);
