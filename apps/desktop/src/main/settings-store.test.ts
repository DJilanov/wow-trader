import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readDesktopSettings, writeDesktopSettings } from "./settings-store.js";
import { createProductConfiguration } from "./products.js";

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
  it("moves a missing beta installation to the detected Forever sibling and preserves preferences", async () => {
    const root = await temporaryDirectory();
    const current = createProductConfiguration("forever", path.join(root, "_forever_"));
    await mkdir(current.rootPath);
    await writeDesktopSettings(root, {
      schemaVersion: 1,
      endpoint: "https://helper.kfcguild.online",
      automaticUploads: false,
      startAtLogin: false,
      notificationsEnabled: true,
      products: [
        {
          ...createProductConfiguration("forever", path.join(root, "_classic_beta_")),
          enabled: false,
        },
      ],
    });
    expect((await readDesktopSettings(root, [current])).products).toEqual([
      { ...current, enabled: false },
    ]);
  });
  it("preserves an existing beta installation explicitly configured by the user", async () => {
    const root = await temporaryDirectory();
    const beta = createProductConfiguration("forever", path.join(root, "_classic_beta_"));
    await mkdir(beta.rootPath);
    await writeDesktopSettings(root, {
      schemaVersion: 1,
      endpoint: "https://helper.kfcguild.online",
      automaticUploads: true,
      startAtLogin: false,
      notificationsEnabled: true,
      products: [beta],
    });
    expect(
      (
        await readDesktopSettings(root, [
          createProductConfiguration("forever", path.join(root, "_forever_")),
        ])
      ).products,
    ).toEqual([beta]);
  });
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
