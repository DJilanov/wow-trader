import { setTimeout as delay } from "node:timers/promises";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { marketIntelligencePackSchema, type MarketIntelligencePack } from "@wow-trader/contracts";

import type { CollectorScan } from "./collector-schema.js";

interface RequestOptions {
  readonly signal?: AbortSignal | undefined;
}

const GENERATED_FILE_NAME = "MarketData.lua";

export async function downloadMarketIntelligence(
  endpoint: URL,
  apiKey: string,
  scan: CollectorScan,
  options: RequestOptions = {},
): Promise<MarketIntelligencePack | null> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(5 * 60_000),
    ...(options.signal ? [options.signal] : []),
  ]);
  let first: MarketIntelligencePack | null = null;
  const items: MarketIntelligencePack["items"] = [];
  const seen = new Set<number>();
  let afterItemId: number | null = null;
  for (;;) {
    const url = new URL("/v1/market-intelligence", endpoint);
    url.search = new URLSearchParams({
      clientProduct: scan.clientProduct,
      clientBuild: String(scan.clientBuild),
      region: scan.region,
      realmId: scan.realmId,
      auctionHouseType: scan.auctionHouseType,
      pageSize: "500",
      ...(afterItemId !== null
        ? { afterItemId: String(afterItemId), asOfScanId: first!.sourceScanId! }
        : {}),
    }).toString();
    const request = (): Promise<Response> =>
      fetch(url, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
      });
    let response = await request();
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after") ?? "1");
      await response.body?.cancel();
      await delay(
        Number.isFinite(seconds) ? Math.min(60_000, Math.max(0, seconds * 1000)) : 1000,
        undefined,
        { signal },
      );
      response = await request();
    }
    const body: unknown = await response.json().catch(() => null);
    if (response.status === 404 && readErrorCode(body) === "not_found" && first === null)
      return null;
    if (!response.ok)
      throw new Error(
        `Market intelligence download failed: ${readErrorMessage(body) ?? `HTTP ${response.status}`}`,
      );
    const pack = marketIntelligencePackSchema.parse(body);
    for (const field of [
      "clientProduct",
      "clientBuild",
      "region",
      "realmId",
      "auctionHouseType",
    ] as const) {
      if (pack[field] !== scan[field])
        throw new Error("Market history scope does not match the requested scan.");
    }
    if (first) {
      for (const field of [
        "sourceScanId",
        "sourceScanAt",
        "modelVersion",
        "historyRevision",
      ] as const) {
        if (pack[field] !== first[field])
          throw new Error("Market history changed during synchronization. Check for scans again.");
      }
    } else first = pack;
    for (const item of pack.items) {
      if (seen.has(item.itemId) || (afterItemId !== null && item.itemId <= afterItemId))
        throw new Error("Market history contains duplicate or out-of-order pages.");
      seen.add(item.itemId);
      items.push(item);
    }
    if (items.length > 250_000) throw new Error("Market history exceeds the supported item limit.");
    const next = pack.nextAfterItemId;
    if (next === undefined || next === null) return { ...first, items, nextAfterItemId: null };
    if (
      !pack.sourceScanId ||
      !pack.historyRevision ||
      next !== pack.items.at(-1)?.itemId ||
      next <= (afterItemId ?? 0)
    ) {
      throw new Error("Market history returned an invalid page cursor.");
    }
    afterItemId = next;
  }
}

export async function installMarketIntelligence(
  wowProductRoot: string,
  pack: MarketIntelligencePack,
): Promise<string> {
  const addonRoot = path.join(
    path.resolve(wowProductRoot),
    "Interface",
    "AddOns",
    "WowTraderCollector",
  );
  await mkdir(addonRoot, { recursive: true });
  const destination = path.join(addonRoot, GENERATED_FILE_NAME);
  const temporary = path.join(addonRoot, `.${GENERATED_FILE_NAME}.${process.pid}.tmp`);
  await writeFile(temporary, serializeMarketIntelligence(pack), { encoding: "utf8", mode: 0o644 });
  try {
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return destination;
}

export function serializeMarketIntelligence(pack: MarketIntelligencePack): string {
  const validated = marketIntelligencePackSchema.parse(pack);
  const items = validated.items
    .map(
      (item) => `  [${item.itemId}] = {
    name = ${luaString(item.name)}, signal = ${luaString(item.signal)}, observations = ${item.observationCount}, minimum = ${item.minimumObservationCount},
    current = ${luaString(item.currentPriceCopper)}, normal = ${luaString(item.normalPriceCopper)}, low = ${luaString(item.lowerPriceCopper)}, high = ${luaString(item.upperPriceCopper)},
    differenceBP = ${luaNumber(item.differenceBasisPoints)}, quantity = ${luaNumber(item.currentQuantity)}, normalQuantity = ${luaNumber(item.normalQuantity)}, supplyBP = ${luaNumber(item.supplyRatioBasisPoints)},
    listings = ${luaNumber(item.currentListingCount)}, confidenceBP = ${luaNumber(item.confidenceBasisPoints)}, direction = ${luaString(item.direction)},
    history = { ${(item.history ?? []).map((row) => `{${Date.parse(row.observedAt) / 1000},${luaString(row.priceCopper)},${row.availableQuantity},${row.listingCount},${row.completeness}}`).join(",")} },
    levels = { ${(item.levels ?? []).map((row) => `{unitPriceCopper=${luaString(row.unitPriceCopper)},quantity=${row.quantity},listingCount=${row.listingCount}}`).join(",")} },
  },`,
    )
    .join("\n");
  return `-- Generated by WoW Trader Companion. Do not edit.
WOW_TRADER_MARKET_DATA = {
  schemaVersion = 2,
  historyPolicy = ${luaString(validated.historyPolicy ?? null)},
  modelVersion = ${luaString(validated.modelVersion)},
  clientProduct = ${luaString(validated.clientProduct)},
  clientBuild = ${validated.clientBuild},
  region = ${luaString(validated.region)},
  realmId = ${luaString(validated.realmId)},
  auctionHouseType = ${luaString(validated.auctionHouseType)},
  generatedAt = ${luaString(validated.generatedAt)},
  sourceScanAt = ${luaString(validated.sourceScanAt)},
  sourceScanEpoch = ${Date.parse(validated.sourceScanAt) / 1000},
  items = {
${items}
  },
}
`;
}

function luaString(value: string | null): string {
  if (value === null) return "nil";
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")}"`;
}

function luaNumber(value: number | null): string {
  return value === null ? "nil" : String(value);
}

function readErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("message" in value)) return null;
  return typeof value.message === "string" ? value.message : null;
}

function readErrorCode(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("error" in value)) return null;
  return typeof value.error === "string" ? value.error : null;
}
