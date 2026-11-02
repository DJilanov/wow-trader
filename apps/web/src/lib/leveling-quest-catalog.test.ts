import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { readLevelingQuestCatalog } from "./leveling-quest-catalog";

const directories: string[] = [];
async function fixture(
  publication: "authorized" | "private-reference" = "authorized",
  manifestBuild = 70205,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "leveling-quest-catalog-"));
  directories.push(root);
  const data = {
    schema: "forever-quest-funding-catalog.v1",
    targetBuild: 70205,
    publication,
    authorizationNote: publication === "authorized" ? "Synthetic test authorization" : "",
    providerRevision: "a".repeat(40),
    questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64),
    areaMapSha256: "d".repeat(64),
    sourceArchiveSha256: "e".repeat(64),
    includesAuthoredCorrections: false,
    quests: [],
  };
  const raw = JSON.stringify(data),
    sha256 = createHash("sha256").update(raw).digest("hex"),
    file = `quest-catalog-${sha256}.json`;
  await writeFile(join(root, file), raw);
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify({
      schema: "forever-quest-funding-manifest.v1",
      targetBuild: manifestBuild,
      file,
      sha256,
    }),
  );
  return root;
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("quest funding catalog publication", () => {
  it("serves authorized checksummed data", async () => {
    expect((await readLevelingQuestCatalog(await fixture(), true)).data?.publication).toBe(
      "authorized",
    );
  });
  it("holds cached private preview data in production", async () => {
    const root = await fixture("private-reference");
    expect((await readLevelingQuestCatalog(root, false)).data?.publication).toBe(
      "private-reference",
    );
    expect(await readLevelingQuestCatalog(root, true)).toMatchObject({
      data: null,
      revision: "publication-held",
    });
  });
  it("keeps an absent optional catalog empty", async () => {
    const root = await mkdtemp(join(tmpdir(), "leveling-quest-catalog-"));
    directories.push(root);
    expect(await readLevelingQuestCatalog(root, true)).toMatchObject({
      data: null,
      revision: "not-imported",
    });
  });
  it("rejects tampered bytes and foreign-build artifacts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = await fixture(),
      manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as {
        file: string;
      };
    await writeFile(join(root, manifest.file), "{}");
    expect(await readLevelingQuestCatalog(root, true)).toMatchObject({
      data: null,
      revision: "validation-failed",
    });
    expect(await readLevelingQuestCatalog(await fixture("authorized", 70450), true)).toMatchObject({
      data: null,
      revision: "validation-failed",
    });
  });
  it("rejects traversal paths before reading an artifact", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = await fixture();
    await writeFile(
      join(root, "manifest.json"),
      JSON.stringify({
        schema: "forever-quest-funding-manifest.v1",
        file: "../private.json",
        targetBuild: 70205,
        sha256: "a".repeat(64),
      }),
    );
    expect(await readLevelingQuestCatalog(root, true)).toMatchObject({
      data: null,
      revision: "validation-failed",
    });
  });
});
