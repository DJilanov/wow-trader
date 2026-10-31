import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ProductConfiguration } from "@wow-trader/companion-core";

import { desktopSettingsSchema, type DesktopSettings } from "../shared/contracts.js";

const DEFAULT_ENDPOINT = "https://helper.kfcguild.online";

export async function readDesktopSettings(
  userDataPath: string,
  detectedProducts: readonly ProductConfiguration[],
): Promise<DesktopSettings> {
  const filePath = settingsPath(userDataPath);
  try {
    const settings = desktopSettingsSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
    const products = await Promise.all(
      settings.products.map(async (product): Promise<ProductConfiguration> => {
        const replacement = detectedProducts.find(
          (candidate) =>
            candidate.kind === "forever" &&
            path.basename(candidate.rootPath) === "_forever_" &&
            path.dirname(candidate.rootPath) === path.dirname(product.rootPath),
        );
        if (
          product.kind !== "forever" ||
          path.basename(product.rootPath) !== "_classic_beta_" ||
          !replacement
        )
          return product;
        try {
          await stat(product.rootPath);
          return product;
        } catch (error: unknown) {
          if (!isMissingFileError(error)) throw error;
        }
        return { ...product, rootPath: replacement.rootPath };
      }),
    );
    for (const product of detectedProducts) {
      if (!products.some((existing) => existing.kind === product.kind)) products.push(product);
    }
    return withEndpointOverride({ ...settings, products });
  } catch (error: unknown) {
    if (!isMissingFileError(error)) throw error;
    return withEndpointOverride(
      desktopSettingsSchema.parse({
        schemaVersion: 1,
        endpoint: DEFAULT_ENDPOINT,
        automaticUploads: true,
        startAtLogin: false,
        notificationsEnabled: true,
        products: detectedProducts,
      }),
    );
  }
}

export async function writeDesktopSettings(
  userDataPath: string,
  settings: DesktopSettings,
): Promise<void> {
  const validated = desktopSettingsSchema.parse(settings);
  const filePath = settingsPath(userDataPath);
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await mkdir(userDataPath, { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

export function settingsPath(userDataPath: string): string {
  return path.join(userDataPath, "settings.json");
}

export function companionStatePath(userDataPath: string): string {
  return path.join(userDataPath, "state.json");
}

function withEndpointOverride(settings: DesktopSettings): DesktopSettings {
  const endpoint = process.env.WOW_TRADER_ENDPOINT;
  return endpoint ? desktopSettingsSchema.parse({ ...settings, endpoint }) : settings;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
