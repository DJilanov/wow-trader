import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appendCompanionActivity,
  emptyCompanionState,
  readCompanionState,
  writeCompanionState,
} from "./state.js";

const temporaryDirectories: string[] = [];
const SCAN_ID = "95e8df52-8d38-4a3c-8aad-9fbe26ff8eb8";

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("companion state", () => {
  it("migrates the CLI v1 upload history without replaying scans", async () => {
    const filePath = await temporaryStatePath();
    await writeFile(
      filePath,
      JSON.stringify({ schemaVersion: 1, uploadedScanIds: [SCAN_ID] }),
      "utf8",
    );

    await expect(readCompanionState(filePath)).resolves.toEqual({
      schemaVersion: 2,
      uploadedScanIds: [SCAN_ID],
      activities: [],
    });
  });

  it("writes validated state atomically and bounds activity history", async () => {
    const filePath = await temporaryStatePath();
    let state = emptyCompanionState();
    for (let index = 0; index < 105; index += 1) {
      state = appendCompanionActivity(state, {
        scanId: SCAN_ID,
        productId: "tbc",
        status: "processed",
        occurredAt: new Date(1_789_468_200_000 + index).toISOString(),
        characterLabel: null,
        message: `Processed ${index}`,
      });
    }
    await writeCompanionState(filePath, { ...state, uploadedScanIds: [SCAN_ID] });

    const persisted = await readCompanionState(filePath);
    expect(persisted.activities).toHaveLength(100);
    expect(persisted.activities[0]?.message).toBe("Processed 104");
    expect(JSON.parse(await readFile(filePath, "utf8"))).toMatchObject({ schemaVersion: 2 });
  });
});

async function temporaryStatePath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "wow-trader-core-state-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "state.json");
}
