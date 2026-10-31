import type * as FileSystem from "node:fs/promises";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
const disk = vi.hoisted(() => ({ available: 1024 ** 3 }));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof FileSystem>()),
  statfs: async () => ({ bsize: 1, bavail: disk.available }),
}));
import { FileRawPayloadStore } from "./raw-payload-store.js";
const directories: string[] = [];
afterEach(async (): Promise<void> => {
  disk.available = 1024 ** 3;
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
describe("raw upload storage reserve", () => {
  it("preserves a 512 MiB reserve instead of filling the origin disk", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "trader-storage-"));
    directories.push(root);
    const store = new FileRawPayloadStore(root);
    disk.available = 512 * 1024 * 1024;
    await expect(store.put("ab-fixture", "hash", "{}")).rejects.toMatchObject({
      name: "UploadStorageUnavailableError",
    });
    await expect(readFile(path.join(root, "ab/ab-fixture-hash.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("keeps immutable idempotent files when sufficient space is available", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "trader-storage-"));
    directories.push(root);
    const store = new FileRawPayloadStore(root);
    expect(await store.put("ab-fixture", "hash", "{}")).toBe(
      await store.put("ab-fixture", "hash", "{}"),
    );
    await expect(store.put("ab-fixture", "hash", "changed")).rejects.toThrow("different data");
  });
});
