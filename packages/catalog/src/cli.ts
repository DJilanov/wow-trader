#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

import { createDatabase } from "@wow-trader/db";

import { auditCatalogSnapshot } from "./audit.js";
import { diffCatalogs } from "./diff.js";
import { importCatalog } from "./import.js";
import { loadCatalogSnapshot } from "./snapshot.js";
import { validateCatalog } from "./validation.js";

loadRootEnvironment();

async function main(args: readonly string[]): Promise<void> {
  const [command, ...commandArgs] = args;
  switch (command) {
    case "audit":
      await auditCommand(commandArgs);
      return;
    case "validate":
      await validateCommand(commandArgs);
      return;
    case "diff":
      await diffCommand(commandArgs);
      return;
    case "import":
      await importCommand(commandArgs);
      return;
    default:
      throw new Error(
        "Usage: catalog <audit manifest | validate manifest [--tbc-golden] | diff from-manifest to-manifest [--output file] | import manifest [--publish]>",
      );
  }
}

async function auditCommand(args: readonly string[]): Promise<void> {
  const manifestPath = requiredPositional(args, 0, "manifest path");
  const report = await auditCatalogSnapshot(manifestPath);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 2;
}

async function validateCommand(args: readonly string[]): Promise<void> {
  const manifestPath = requiredPositional(args, 0, "manifest path");
  const bundle = await loadCatalogSnapshot(manifestPath);
  const report = validateCatalog(bundle, { requireTbcGoldenRecipe: args.includes("--tbc-golden") });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 2;
}

async function diffCommand(args: readonly string[]): Promise<void> {
  const fromPath = requiredPositional(args, 0, "source manifest path");
  const toPath = requiredPositional(args, 1, "target manifest path");
  const diff = diffCatalogs(await loadCatalogSnapshot(fromPath), await loadCatalogSnapshot(toPath));
  const output = `${JSON.stringify(diff, null, 2)}\n`;
  const outputIndex = args.indexOf("--output");
  if (outputIndex >= 0) {
    const outputPath = args[outputIndex + 1];
    if (!outputPath) throw new Error("--output requires a file path");
    await writeFile(resolve(outputPath), output, { encoding: "utf8", flag: "wx" });
  } else {
    process.stdout.write(output);
  }
}

async function importCommand(args: readonly string[]): Promise<void> {
  const manifestPath = requiredPositional(args, 0, "manifest path");
  const bundle = await loadCatalogSnapshot(manifestPath);
  const report = validateCatalog(bundle, { requireTbcGoldenRecipe: args.includes("--tbc-golden") });
  if (!report.valid) {
    throw new Error(`Catalog failed validation with ${report.issues.length} issue(s)`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for catalog import");
  const database = createDatabase(databaseUrl);
  try {
    const result = await importCatalog(database.db, bundle, {
      publish: args.includes("--publish"),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await database.close();
  }
}

function requiredPositional(args: readonly string[], index: number, label: string): string {
  const positionals = args.filter((arg, currentIndex) => {
    if (arg.startsWith("--")) return false;
    return currentIndex === 0 || args[currentIndex - 1] !== "--output";
  });
  const value = positionals[index];
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function loadRootEnvironment(): void {
  try {
    loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = summarizeError(error);
  process.stderr.write(`catalog: ${message}\n`);
  process.exitCode = 1;
});

function summarizeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const messages: string[] = [];
  let current: Error | undefined = error;
  while (current) {
    const firstLine = current.message.split("\n", 1)[0]?.trim();
    if (firstLine && messages.at(-1) !== firstLine) messages.push(firstLine);
    current = current.cause instanceof Error ? current.cause : undefined;
  }
  return messages.join(": ") || error.name;
}
