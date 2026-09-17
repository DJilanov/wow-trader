import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  discoverCollectorSavedVariables,
  readFileSignature,
  signaturesMatch,
} from "./discovery.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("collector discovery", () => {
  it("finds only account-wide collector SavedVariables", async () => {
    const root = await makeTemporaryRoot();
    const first = path.join(root, "WTF/Account/100#1/SavedVariables/WowTraderCollector.lua");
    const second = path.join(root, "WTF/Account/200#1/SavedVariables/WowTraderCollector.lua");
    const character = path.join(
      root,
      "WTF/Account/100#1/Realm/Character/SavedVariables/WowTraderCollector.lua",
    );
    for (const filePath of [first, second, character]) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, "WOW_TRADER_SAVED = {}\n");
    }

    expect(await discoverCollectorSavedVariables(root)).toEqual([first, second]);
  });

  it("returns no matches when the client has not written an account folder", async () => {
    const root = await makeTemporaryRoot();
    expect(await discoverCollectorSavedVariables(root)).toEqual([]);
  });

  it("detects when a SavedVariables write has stabilized", async () => {
    const root = await makeTemporaryRoot();
    const filePath = path.join(root, "collector.lua");
    await writeFile(filePath, "first");
    const initial = await readFileSignature(filePath);
    expect(signaturesMatch(initial, await readFileSignature(filePath))).toBe(true);

    await writeFile(filePath, "a larger second value");
    expect(signaturesMatch(initial, await readFileSignature(filePath))).toBe(false);
  });
});

async function makeTemporaryRoot(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "wow-trader-companion-"));
  temporaryDirectories.push(directory);
  return directory;
}
