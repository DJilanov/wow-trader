import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readDesktopSettings, writeDesktopSettings } from "./settings-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("desktop settings", () => {
  it("uses the configured endpoint override for existing settings", async () => {
    const userDataPath = await temporaryDirectory();
    await writeDesktopSettings(userDataPath, {
      schemaVersion: 1,
      endpoint: "http://127.0.0.1:4000",
      automaticUploads: true,
      startAtLogin: false,
      notificationsEnabled: true,
      products: [],
    });
    vi.stubEnv("WOW_TRADER_ENDPOINT", "https://helper.kfcguild.online");

    await expect(readDesktopSettings(userDataPath, [])).resolves.toMatchObject({
      endpoint: "https://helper.kfcguild.online",
    });
  });

  it("uses the production endpoint for a new installation", async () => {
    const userDataPath = await temporaryDirectory();

    await expect(readDesktopSettings(userDataPath, [])).resolves.toMatchObject({
      endpoint: "https://helper.kfcguild.online",
    });
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "wow-trader-desktop-settings-"));
  temporaryDirectories.push(directory);
  return directory;
}
