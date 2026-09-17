#!/usr/bin/env node

import { execFile } from "node:child_process";
import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const label = "online.kfcguild.wow-trader-companion";
const repositoryRoot = resolve(import.meta.dirname, "..");

await main(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

async function main(arguments_) {
  if (process.platform !== "darwin") throw new Error("This installer supports macOS only");
  const options = parseOptions(arguments_);
  const apiKey = process.env.WOW_TRADER_INGEST_API_KEY?.trim();
  if (!apiKey || apiKey.length < 16) {
    throw new Error("Set WOW_TRADER_INGEST_API_KEY before installing the watcher");
  }

  const companionEntry = join(repositoryRoot, "apps/companion/dist/cli.js");
  await access(companionEntry);
  await access(options.wowRoot);

  const supportDirectory = join(homedir(), "Library/Application Support/WowTraderCompanion");
  const logDirectory = join(homedir(), "Library/Logs/WowTraderCompanion");
  const launchAgentPath = join(homedir(), `Library/LaunchAgents/${label}.plist`);
  const apiKeyPath = join(supportDirectory, "ingest-api-key");
  const statePath = join(supportDirectory, "state.json");
  await Promise.all([
    mkdir(supportDirectory, { recursive: true, mode: 0o700 }),
    mkdir(logDirectory, { recursive: true, mode: 0o700 }),
    mkdir(dirname(launchAgentPath), { recursive: true }),
  ]);
  await writeFile(apiKeyPath, `${apiKey}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(apiKeyPath, 0o600);

  const programArguments = [
    process.execPath,
    companionEntry,
    "watch",
    "--wow-root",
    options.wowRoot,
    "--endpoint",
    options.endpoint.toString(),
    "--state",
    statePath,
    "--api-key-file",
    apiKeyPath,
  ];
  const plist = makeLaunchAgentPlist(programArguments, logDirectory);
  await writeFile(launchAgentPath, plist, { encoding: "utf8", mode: 0o600 });
  await chmod(launchAgentPath, 0o600);

  const domain = `gui/${process.getuid()}`;
  await executeAllowFailure("launchctl", ["bootout", domain, launchAgentPath]);
  await execute("launchctl", ["bootstrap", domain, launchAgentPath]);
  await execute("launchctl", ["kickstart", "-k", `${domain}/${label}`]);

  process.stdout.write(
    `Installed and started ${label}. Logs: ${join(logDirectory, "watcher.log")}\n`,
  );
}

function parseOptions(arguments_) {
  let wowRoot = "/Applications/World of Warcraft/_anniversary_";
  let endpoint = new URL("https://helper.kfcguild.online");
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!value) throw new Error(`Missing value for ${flag ?? "option"}`);
    if (flag === "--wow-root") wowRoot = resolve(value);
    else if (flag === "--endpoint") endpoint = new URL(value);
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (endpoint.protocol !== "https:")
    throw new Error("The installed watcher endpoint must use HTTPS");
  return { wowRoot, endpoint };
}

function makeLaunchAgentPlist(programArguments, logDirectory) {
  const argumentsXml = programArguments
    .map((argument) => `      <string>${escapeXml(argument)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
${argumentsXml}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Background</string>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>${escapeXml(join(logDirectory, "watcher.log"))}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(join(logDirectory, "watcher-error.log"))}</string>
  </dict>
</plist>
`;
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function executeAllowFailure(command, arguments_) {
  try {
    await execute(command, arguments_);
  } catch {
    // A first installation has no service to unload.
  }
}
