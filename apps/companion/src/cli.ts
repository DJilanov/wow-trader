#!/usr/bin/env node
import path from "node:path";

import {
  DefaultCompanionService,
  createAuctionScanUpload,
  discoverCollectorSavedVariables,
  readCollectorSavedVariables,
  readCompanionState,
  uploadAuctionScan,
  waitForAuctionScanProcessed,
  writeCompanionState,
  type CompanionSnapshot,
} from "@wow-trader/companion-core";

import { resolveIngestionApiKey } from "./credentials.js";

type CompanionCommand = "inspect" | "upload" | "discover" | "watch";

interface CliOptions {
  readonly command: CompanionCommand;
  readonly savedVariablesPath: string | null;
  readonly wowRootPath: string | null;
  readonly statePath: string;
  readonly endpoint: URL | null;
  readonly apiKeyFilePath: string | null;
  readonly pollIntervalMilliseconds: number;
}

interface UploadResult {
  readonly pendingCount: number;
  readonly uploadedCount: number;
}

const validCommands: readonly CompanionCommand[] = ["inspect", "upload", "discover", "watch"];

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  if (options.command === "inspect") {
    const savedVariables = await readCollectorSavedVariables(options.savedVariablesPath!);
    process.stdout.write(
      `${JSON.stringify(
        {
          schemaVersion: savedVariables.schemaVersion,
          installationId: savedVariables.installationId,
          scans: savedVariables.scans.map((scan) => ({
            scanId: scan.scanId,
            build: scan.clientBuild,
            region: scan.region,
            realmId: scan.realmId,
            auctionHouseType: scan.auctionHouseType,
            capturedAt: new Date(scan.capturedAt * 1_000).toISOString(),
            marketCount: scan.itemSnapshots.length,
          })),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (options.command === "discover") {
    const matches = await discoverCollectorSavedVariables(options.wowRootPath!);
    if (matches.length === 0) {
      process.stdout.write("No account-wide WowTraderCollector SavedVariables files found.\n");
      return;
    }
    process.stdout.write(`${matches.join("\n")}\n`);
    return;
  }

  const apiKey = await resolveIngestionApiKey(options.apiKeyFilePath);
  assertSecureEndpoint(options.endpoint!);
  if (options.command === "upload") {
    const result = await uploadSavedVariables(
      options.savedVariablesPath!,
      options.statePath,
      options.endpoint!,
      apiKey,
    );
    if (result.pendingCount === 0) process.stdout.write("No pending scans.\n");
    return;
  }

  await runWatcher(options, apiKey);
}

async function runWatcher(options: CliOptions, apiKey: string): Promise<void> {
  process.stdout.write(
    `Watching ${options.wowRootPath!} for collector data flushed by /reload or logout.\n`,
  );
  const service = new DefaultCompanionService({
    endpoint: options.endpoint!,
    statePath: options.statePath,
    products: [
      {
        id: "configured-product",
        kind: "tbc",
        label: "Configured WoW product",
        rootPath: options.wowRootPath!,
        enabled: true,
      },
    ],
    apiKey,
    automaticUploads: true,
    pollIntervalMilliseconds: options.pollIntervalMilliseconds,
  });
  let previousSummary = "";
  service.subscribe((snapshot) => {
    const summary = formatSnapshot(snapshot);
    if (summary !== previousSummary) process.stdout.write(`${summary}\n`);
    previousSummary = summary;
  });
  await service.start();
  await waitForShutdown();
  await service.stop();
}

async function uploadSavedVariables(
  savedVariablesPath: string,
  statePath: string,
  endpoint: URL,
  apiKey: string,
): Promise<UploadResult> {
  const savedVariables = await readCollectorSavedVariables(savedVariablesPath);
  const state = await readCompanionState(statePath);
  const uploadedScanIds = new Set(state.uploadedScanIds);
  const pendingScans = savedVariables.scans.filter((scan) => !uploadedScanIds.has(scan.scanId));

  for (const scan of pendingScans) {
    const characterLabel = scan.sourceCharacter
      ? `${scan.sourceCharacter.name}-${scan.sourceCharacter.realmId}`
      : "unknown character";
    process.stdout.write(`Uploading scan ${scan.scanId} from ${characterLabel}...\n`);
    const upload = createAuctionScanUpload(savedVariables, scan);
    const receipt = await uploadAuctionScan(endpoint, apiKey, upload);
    if (receipt.status === "accepted") {
      process.stdout.write(`Scan ${scan.scanId} was accepted; waiting for processing...\n`);
      await waitForAuctionScanProcessed(endpoint, apiKey, receipt.payloadId);
    }
    uploadedScanIds.add(scan.scanId);
    await writeCompanionState(statePath, {
      ...state,
      schemaVersion: 2,
      uploadedScanIds: [...uploadedScanIds],
    });
    process.stdout.write(
      receipt.duplicate
        ? `Scan ${scan.scanId} already exists as payload ${receipt.payloadId}; recorded locally.\n`
        : `Uploaded scan ${scan.scanId} as payload ${receipt.payloadId}.\n`,
    );
  }
  return { pendingCount: pendingScans.length, uploadedCount: pendingScans.length };
}

function parseOptions(arguments_: readonly string[]): CliOptions {
  const commandArgument = arguments_[0];
  const command = validCommands.includes(commandArgument as CompanionCommand)
    ? (commandArgument as CompanionCommand)
    : commandArgument === undefined && process.env.WOW_TRADER_WOW_ROOT
      ? "watch"
      : null;
  if (!command) {
    throw new Error(
      "Usage: wow-trader-companion <inspect|upload|discover|watch> [--saved-variables <path>] [--wow-root <product-path>] [--endpoint <url>] [--state <path>] [--api-key-file <path>] [--poll-ms <milliseconds>]",
    );
  }

  let savedVariablesPath: string | null = null;
  let wowRootPath = process.env.WOW_TRADER_WOW_ROOT
    ? path.resolve(process.env.WOW_TRADER_WOW_ROOT)
    : null;
  let statePath = path.resolve(
    process.env.WOW_TRADER_STATE_PATH ?? ".wow-trader-companion-state.json",
  );
  let endpoint = process.env.WOW_TRADER_ENDPOINT ? new URL(process.env.WOW_TRADER_ENDPOINT) : null;
  let apiKeyFilePath = process.env.WOW_TRADER_API_KEY_FILE
    ? path.resolve(process.env.WOW_TRADER_API_KEY_FILE)
    : null;
  let pollIntervalMilliseconds = 2_000;
  const optionStart = commandArgument === undefined ? 0 : 1;
  for (let index = optionStart; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!value) throw new Error(`Missing value for ${flag ?? "option"}`);
    if (flag === "--saved-variables") savedVariablesPath = path.resolve(value);
    else if (flag === "--wow-root") wowRootPath = path.resolve(value);
    else if (flag === "--state") statePath = path.resolve(value);
    else if (flag === "--endpoint") endpoint = new URL(value);
    else if (flag === "--api-key-file") apiKeyFilePath = path.resolve(value);
    else if (flag === "--poll-ms") pollIntervalMilliseconds = Number(value);
    else throw new Error(`Unknown option: ${flag}`);
  }

  if ((command === "inspect" || command === "upload") && !savedVariablesPath) {
    throw new Error(`The ${command} command requires --saved-variables`);
  }
  if ((command === "discover" || command === "watch") && !wowRootPath) {
    throw new Error(`The ${command} command requires --wow-root`);
  }
  if ((command === "upload" || command === "watch") && !endpoint) {
    throw new Error(`The ${command} command requires --endpoint`);
  }
  if (
    !Number.isSafeInteger(pollIntervalMilliseconds) ||
    pollIntervalMilliseconds < 500 ||
    pollIntervalMilliseconds > 60_000
  ) {
    throw new Error("--poll-ms must be an integer between 500 and 60000");
  }
  return {
    command,
    savedVariablesPath,
    wowRootPath,
    statePath,
    endpoint,
    apiKeyFilePath,
    pollIntervalMilliseconds,
  };
}

function assertSecureEndpoint(endpoint: URL): void {
  const isLoopback = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1";
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && isLoopback)) {
    throw new Error("The endpoint must use HTTPS unless it is a localhost development server");
  }
}

function formatSnapshot(snapshot: CompanionSnapshot): string {
  const character = snapshot.activeCharacterLabel ? ` · ${snapshot.activeCharacterLabel}` : "";
  return `[${snapshot.phase}] ${snapshot.message}${character}`;
}

function waitForShutdown(): Promise<void> {
  return new Promise((resolvePromise) => {
    process.once("SIGINT", resolvePromise);
    process.once("SIGTERM", resolvePromise);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown companion error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
