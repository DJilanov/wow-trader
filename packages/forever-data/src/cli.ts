#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { loadEnvFile } from "node:process";

import { createDatabase } from "@wow-trader/db";

import { syncForeverAssets } from "./assets.js";
import {
  createForeverCapture,
  fetchForeverCapture,
  importForeverCapture,
  parseSpellbookIconsScript,
  publishForeverSnapshot,
  TALENTS_FOREVER_SPELLBOOK_SCRIPT_URL,
} from "./server.js";

loadRootEnvironment();

async function main(args: readonly string[]): Promise<void> {
  const [command, ...commandArgs] = args;
  switch (command) {
    case "inspect":
      await inspectCommand(commandArgs);
      return;
    case "import":
      await importCommand(commandArgs);
      return;
    case "sync":
      await syncCommand(commandArgs);
      return;
    case "publish":
      await publishCommand(commandArgs);
      return;
    default:
      throw new Error(
        "Usage: forever-data <inspect [data-file] | import data-file [--publish] [--assets-dir path] | sync [--publish] [--assets-dir path] | publish snapshot-id-or-checksum>",
      );
  }
}

async function publishCommand(args: readonly string[]): Promise<void> {
  const identity = args.find((argument) => !argument.startsWith("--"));
  if (!identity) throw new Error("A snapshot UUID or checksum is required");
  const database = openDatabase();
  try {
    const result = await publishForeverSnapshot(database.db, identity);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await database.close();
  }
}

async function inspectCommand(args: readonly string[]): Promise<void> {
  const capture = args[0] ? await captureFromFile(args[0]) : await fetchForeverCapture();
  process.stdout.write(`${JSON.stringify(capture.validation, null, 2)}\n`);
  if (!capture.validation.valid) process.exitCode = 2;
}

async function importCommand(args: readonly string[]): Promise<void> {
  const filePath = args.find((argument) => !argument.startsWith("--"));
  if (!filePath) throw new Error("A data JSON file is required");
  const capture = await captureFromFile(filePath);
  const database = openDatabase();
  try {
    const result = await importForeverCapture(database.db, capture, {
      publish: args.includes("--publish"),
    });
    const assetsDirectory = optionValue(args, "--assets-dir");
    const assets = assetsDirectory
      ? await syncForeverAssets(
          capture.data,
          capture.supplemental,
          resolveAssetsDirectory(assetsDirectory),
          capture.checksum,
        )
      : null;
    process.stdout.write(`${JSON.stringify({ imported: result, assets }, null, 2)}\n`);
  } finally {
    await database.close();
  }
}

async function syncCommand(args: readonly string[]): Promise<void> {
  const capture = await fetchForeverCapture();
  const database = openDatabase();
  try {
    const imported = await importForeverCapture(database.db, capture, {
      publish: args.includes("--publish"),
    });
    const assetsDirectory = optionValue(args, "--assets-dir");
    const assets = assetsDirectory
      ? await syncForeverAssets(
          capture.data,
          capture.supplemental,
          resolveAssetsDirectory(assetsDirectory),
          capture.checksum,
        )
      : null;
    process.stdout.write(`${JSON.stringify({ imported, assets }, null, 2)}\n`);
  } finally {
    await database.close();
  }
}

function resolveAssetsDirectory(value: string): string {
  return isAbsolute(value) ? value : resolve(import.meta.dirname, "../../../", value);
}

async function captureFromFile(filePath: string) {
  const [rawPayload, spellbookScript] = await Promise.all([
    readFile(resolve(filePath), "utf8"),
    fetchScript(),
  ]);
  return createForeverCapture(rawPayload, parseSpellbookIconsScript(spellbookScript));
}

async function fetchScript(): Promise<string> {
  const response = await fetch(TALENTS_FOREVER_SPELLBOOK_SCRIPT_URL, {
    headers: { accept: "text/javascript", "user-agent": "KFC-Helper/1.0" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Spellbook script returned HTTP ${response.status}`);
  return response.text();
}

function openDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return createDatabase(databaseUrl);
}

function optionValue(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function loadRootEnvironment(): void {
  try {
    loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`forever-data: ${message}\n`);
  process.exitCode = 1;
});
