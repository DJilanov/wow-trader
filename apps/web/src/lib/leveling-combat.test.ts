import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { readLevelingCombatSnapshot } from "./leveling-combat";

const directories: string[] = [];
async function root(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "kfc-combat-reader-"));
  directories.push(directory);
  return directory;
}
async function fixture(directory: string, authorized = false): Promise<void> {
  const data = {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: authorized ? "authorized" : "private-reference",
    authorizationNote: authorized ? "Synthetic test authorization" : "",
    provider: {
      repository: "https://github.com/Questie/QuestieDB",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "a".repeat(64),
      questSha256: "b".repeat(64),
      itemSha256: "c".repeat(64),
      limitations: ["Synthetic test, no live game claims"],
    },
    npcs: [],
    quests: [],
    dungeons: [],
  };
  const raw = JSON.stringify(data),
    sha256 = createHash("sha256").update(raw).digest("hex"),
    file = `combat-${sha256}.json`;
  await writeFile(join(directory, file), raw);
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify({ schema: "forever-combat-manifest.v1", targetBuild: 70205, file, sha256 }),
  );
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
describe("combat reference publication boundary", () => {
  it("allows private local previews but holds the same cached data in production", async () => {
    const directory = await root();
    await fixture(directory);
    expect((await readLevelingCombatSnapshot(directory, false)).data?.publication).toBe(
      "private-reference",
    );
    expect(await readLevelingCombatSnapshot(directory, true)).toMatchObject({
      data: null,
      revision: "publication-held",
    });
  });
  it("serves explicitly authorized, checksum-verified data", async () => {
    const directory = await root();
    await fixture(directory, true);
    expect((await readLevelingCombatSnapshot(directory, true)).data?.targetBuild).toBe(70205);
  });
  it("returns a useful empty state for an absent import", async () => {
    expect(await readLevelingCombatSnapshot(await root(), false)).toMatchObject({
      data: null,
      revision: "not-imported",
    });
  });
  it("fails closed on checksum errors", async () => {
    const directory = await root();
    await fixture(directory, true);
    const { readFile } = await import("node:fs/promises");
    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as {
      file: string;
    };
    await writeFile(join(directory, manifest.file), "{}");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await readLevelingCombatSnapshot(directory, true)).toMatchObject({
      data: null,
      revision: "validation-failed",
    });
  });
  it("rejects traversal filenames and missing artifact files instead of silently loading other data", async () => {
    const directory = await root();
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify({
        schema: "forever-combat-manifest.v1",
        targetBuild: 70205,
        file: "../private.json",
        sha256: "a".repeat(64),
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await readLevelingCombatSnapshot(directory, false)).revision).toBe("validation-failed");
    const other = await root();
    await writeFile(
      join(other, "manifest.json"),
      JSON.stringify({
        schema: "forever-combat-manifest.v1",
        targetBuild: 70205,
        file: `combat-${"a".repeat(64)}.json`,
        sha256: "a".repeat(64),
      }),
    );
    expect((await readLevelingCombatSnapshot(other, false)).revision).toBe("validation-failed");
  });
});
