import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import {
  discoverCollectorSavedVariables,
  type ProductConfiguration,
  type ProductKind,
} from "@wow-trader/companion-core";

import type { DesktopProductStatus } from "../shared/contracts.js";

const COLLECTOR_VERSION = "0.15.10";
const ADDON_FILES: Readonly<Record<string, string>> = {
  "MarketData.lua": "fdc80bdca3aeccbe848183761c0d19497436f76f9e5d316cad5d96095f475e88",
  "AccountData.lua": "790f46d97fab43b8683ed628489d792cc242b12b208e88a97fd4bee09f2e05d8",
  "MarketPolicy.lua": "8f6bbb923c5cd72ad75311b9e650b2d1dcac30a6eb2a6f0ccf7404211bb1488f",
  "NativeItemCache.lua": "bd347018f79b0b4ce2666029a326289c389ed8468eb5d0eeb0a4fb2fc1715056",
  "NativePendingRows.lua": "a769236cc67ce257cfe97c9aad1cc085c9094a55a7689afde6d006e43a44c7df",
  "Collector.lua": "6214b8efd36cc27436978d879ca39052f50d1136ff7a41f38a0f63f60ee18f6d",
  "DisenchantData.lua": "63def1e77724018dff568067d63be224932f08d7b744be0c57e88d0de3ebbcc3",
  "ClientValuationData.lua": "8d31a098abef2997fe937863d80241a960ca17fa9b3dd73d84e58b7bfb2796ec",
  "Valuation.lua": "c96e88d93ef75ad99a7163333f73c2f08822727d14dbf7dd422d532bfd60db5d",
  "Professions.lua": "24ce92e0f6f78dcd2ab2fe6b7257e0ecaa7b0105b44c7774a630160d6cf6fc24",
  "Crafting.lua": "8698f0482153d39b1468a0b533f9504bbecc637c631a0ebbdb6a55ddbcace6a4",
  "ValuationUI.lua": "e50044243810eff5524f3bef1be26589946ab22dc28280ba36814764e3e3f28f",
  "Trades.lua": "a85f077ceaa9201f17f49e10f50c013f9d494b0e8dc18b41a884114bcad9128d",
  "WorldEvidence.lua": "a5e8ebe31c345ebb21e5892d75691f8e259b3fc46ea8ed16df15b449d135f006",
  "UI.lua": "ba7f0d9dc9a032c4904c362d06eb479207557dbe62fe6d6169b76448f7d30bf1",
  "WowTraderCollector.toc": "613df5b2edd91ebe0767f111be4aba1f1f5be48cf87deafc0cbc27b47e28fcef",
};
const GENERATED_DATA_FILES = ["MarketData.lua", "AccountData.lua"] as const;

export async function discoverDefaultProducts(): Promise<readonly ProductConfiguration[]> {
  const candidates = defaultProductCandidates();
  const products: ProductConfiguration[] = [];
  for (const candidate of candidates) {
    if (
      (await pathExists(candidate.rootPath)) &&
      !products.some((product) => product.kind === candidate.kind)
    ) {
      products.push(candidate);
    }
  }
  return products;
}

export async function inspectProducts(
  products: readonly ProductConfiguration[],
): Promise<readonly DesktopProductStatus[]> {
  return Promise.all(products.map(inspectProduct));
}

export async function inspectProduct(product: ProductConfiguration): Promise<DesktopProductStatus> {
  const rootExists = await pathExists(product.rootPath);
  if (!rootExists) {
    return {
      ...product,
      rootExists: false,
      auctionatorInstalled: false,
      scannerProvider: product.kind === "forever" ? "native" : "auctionator",
      scannerReady: false,
      collectorHealth: "unavailable",
      collectorVersion: null,
      collectorFileCount: 0,
      latestFileModifiedAt: null,
    };
  }
  const addonsRoot = path.join(product.rootPath, "Interface", "AddOns");
  const collectorToc = path.join(addonsRoot, "WowTraderCollector", "WowTraderCollector.toc");
  const collectorVersion = await readAddonVersion(collectorToc);
  const collectorHealth =
    collectorVersion === null
      ? "missing"
      : collectorVersion === COLLECTOR_VERSION
        ? "ready"
        : "outdated";
  const auctionatorInstalled = await pathExists(path.join(addonsRoot, "Auctionator"));
  const collectorFiles = await discoverCollectorSavedVariables(product.rootPath);
  const modifiedTimes = await Promise.all(
    collectorFiles.map(async (filePath) => {
      try {
        return (await stat(filePath)).mtime.toISOString();
      } catch (error: unknown) {
        if (isMissingFileError(error)) return null;
        throw error;
      }
    }),
  );
  return {
    ...product,
    rootExists: true,
    auctionatorInstalled,
    scannerProvider: product.kind === "forever" ? "native" : "auctionator",
    scannerReady: product.kind === "forever" ? collectorHealth === "ready" : auctionatorInstalled,
    collectorHealth,
    collectorVersion,
    collectorFileCount: collectorFiles.length,
    latestFileModifiedAt:
      modifiedTimes
        .filter((value): value is string => value !== null)
        .sort()
        .at(-1) ?? null,
  };
}

export async function installCollector(
  product: ProductConfiguration,
  sourceDirectory: string,
): Promise<void> {
  await validateCollectorDirectory(sourceDirectory);
  const addonsRoot = path.join(product.rootPath, "Interface", "AddOns");
  const destination = path.join(addonsRoot, "WowTraderCollector");
  const staging = path.join(addonsRoot, `.WowTraderCollector.staging-${process.pid}`);
  const backup = path.join(addonsRoot, `.WowTraderCollector.backup-${process.pid}`);
  await mkdir(addonsRoot, { recursive: true });
  await rm(staging, { recursive: true, force: true });
  await rm(backup, { recursive: true, force: true });
  await mkdir(staging, { mode: 0o755 });
  try {
    for (const fileName of Object.keys(ADDON_FILES)) {
      await copyFile(path.join(sourceDirectory, fileName), path.join(staging, fileName));
    }
    await validateCollectorDirectory(staging);
    const hadExisting = await pathExists(destination);
    if (hadExisting)
      for (const fileName of GENERATED_DATA_FILES) {
        const existing = path.join(destination, fileName);
        if (await pathExists(existing)) await copyFile(existing, path.join(staging, fileName));
      }
    if (hadExisting) await rename(destination, backup);
    try {
      await rename(staging, destination);
      await rm(backup, { recursive: true, force: true });
    } catch (error: unknown) {
      if (hadExisting && !(await pathExists(destination))) await rename(backup, destination);
      throw error;
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export function createProductConfiguration(
  kind: ProductKind,
  rootPath: string,
): ProductConfiguration {
  return {
    id: kind,
    kind,
    label: kind === "tbc" ? "The Burning Crusade" : "WoW Forever",
    rootPath: path.resolve(rootPath),
    enabled: true,
  };
}

async function validateCollectorDirectory(directory: string): Promise<void> {
  for (const [fileName, expectedChecksum] of Object.entries(ADDON_FILES)) {
    let contents: Buffer;
    try {
      contents = await readFile(path.join(directory, fileName));
    } catch (cause: unknown) {
      throw new Error(`Collector file failed verification: ${fileName}`, { cause });
    }
    const checksum = createHash("sha256").update(contents).digest("hex");
    if (checksum !== expectedChecksum)
      throw new Error(`Collector file failed verification: ${fileName}`);
  }
}

async function readAddonVersion(filePath: string): Promise<string | null> {
  try {
    const contents = await readFile(filePath, "utf8");
    return /^## Version:\s*(.+)$/m.exec(contents)?.[1]?.trim() ?? null;
  } catch (error: unknown) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

interface DefaultProductCandidateOptions {
  readonly platform?: NodeJS.Platform;
  readonly homeDirectory?: string;
  readonly environment?: NodeJS.ProcessEnv;
}

export function defaultProductCandidates(
  options: DefaultProductCandidateOptions = {},
): readonly ProductConfiguration[] {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  if (platform === "win32") {
    const programFiles =
      environment["ProgramFiles(x86)"] ?? environment.ProgramFiles ?? "C:\\Program Files (x86)";
    const wowRoot = path.join(programFiles, "World of Warcraft");
    return productCandidatesForRoot(wowRoot);
  }
  if (platform === "darwin") return productCandidatesForRoot("/Applications/World of Warcraft");

  const homeDirectory = options.homeDirectory ?? homedir();
  const winePrefixes = [
    environment.WINEPREFIX,
    path.join(homeDirectory, ".wine"),
    path.join(homeDirectory, "Games", "battlenet"),
    path.join(homeDirectory, "Games", "world-of-warcraft"),
  ].filter((value): value is string => Boolean(value?.trim()));
  const roots = winePrefixes.map((prefix) =>
    path.join(prefix, "drive_c", "Program Files (x86)", "World of Warcraft"),
  );
  return roots.flatMap(productCandidatesForRoot);
}

function productCandidatesForRoot(wowRoot: string): readonly ProductConfiguration[] {
  return [
    createProductConfiguration("tbc", path.join(wowRoot, "_anniversary_")),
    createProductConfiguration("forever", path.join(wowRoot, "_forever_")),
    createProductConfiguration("forever", path.join(wowRoot, "_classic_beta_")),
  ];
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    const details = await stat(filePath);
    return details.isDirectory() || details.isFile();
  } catch (error: unknown) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
