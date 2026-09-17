import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveIngestionApiKey } from "./credentials.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("companion credentials", () => {
  it("reads a protected API key without placing it in process arguments", async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = path.join(directory, "ingest-api-key");
    await writeFile(filePath, "a-secure-test-key\n", { mode: 0o600 });

    await expect(resolveIngestionApiKey(filePath)).resolves.toBe("a-secure-test-key");
  });

  it.runIf(process.platform !== "win32")("rejects a group-readable API key", async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = path.join(directory, "ingest-api-key");
    await writeFile(filePath, "a-secure-test-key\n", { mode: 0o640 });

    await expect(resolveIngestionApiKey(filePath)).rejects.toThrow("group or other users");
  });
});

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "wow-trader-credentials-"));
  temporaryDirectories.push(directory);
  return directory;
}
