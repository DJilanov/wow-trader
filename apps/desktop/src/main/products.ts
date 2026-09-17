import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import {
  discoverCollectorSavedVariables,
  type ProductConfiguration,
  type ProductKind,
} from "@wow-trader/companion-core";

import type { DesktopProductStatus } from "../shared/contracts.js";

const COLLECTOR_VERSION = "0.4.0";
const ADDON_FILES: Readonly<Record<string, string>> = {
  "Collector.lua": "818391fb97eee164057ffa03a181225b14af4ddd741a42f8f613b72020ed6849",
  "ForeverBossSample.lua": "be390cc46660988fc0ddb819b92f87ccd212d01acfc68b80fb7a96e9d646feb7",
  "ForeverQuestSample.lua": "29f3adcbefd51d20de049a3d6c017f948c837e9d69da396b9e500091490a1268",
  "WowTraderCollector.toc": "2f34ee7283e672bbf77fcb1025e4edec4228f427223e00128734644d0313de93",
};

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
      collectorHealth: "unavailable",
      collectorVersion: null,
      collectorFileCount: 0,
      latestFileModifiedAt: null,
    };
  }
  const addonsRoot = path.join(product.rootPath, "Interface", "AddOns");
  const collectorToc = path.join(addonsRoot, "WowTraderCollector", "WowTraderCollector.toc");
  const collectorVersion = await readAddonVersion(collectorToc);
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
    auctionatorInstalled: await pathExists(path.join(addonsRoot, "Auctionator")),
    collectorHealth:
      collectorVersion === null
        ? "missing"
        : collectorVersion === COLLECTOR_VERSION
          ? "ready"
          : "outdated",
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
    const contents = await readFile(path.join(directory, fileName));
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

function defaultProductCandidates(): readonly ProductConfiguration[] {
  if (process.platform === "win32") {
    const programFiles =
      process.env["ProgramFiles(x86)"] ?? process.env.ProgramFiles ?? "C:\\Program Files (x86)";
    const wowRoot = path.join(programFiles, "World of Warcraft");
    return [
      createProductConfiguration("tbc", path.join(wowRoot, "_anniversary_")),
      createProductConfiguration("forever", path.join(wowRoot, "_forever_")),
      createProductConfiguration("forever", path.join(wowRoot, "_classic_beta_")),
    ];
  }
  const wowRoot = "/Applications/World of Warcraft";
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
