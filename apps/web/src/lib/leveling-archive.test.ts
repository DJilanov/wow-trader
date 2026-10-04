import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { parseGuideChapter } from "@wow-trader/leveling";
import { getImportedLevelingChapter, getLevelingArchiveManifest } from "./leveling-archive";

describe("full guide publication boundary", () => {
  it("rejects private, corrupted and mismatched archives and serves only authorized validated chapters", async () => {
    const root = await mkdtemp(join(tmpdir(), "kfc-leveling-archive-"));
    const previous = process.env.LEVELING_ARCHIVE_ROOT;
    process.env.LEVELING_ARCHIVE_ROOT = root;
    try {
      expect(await getLevelingArchiveManifest()).toBeNull();
      const chapter = parseGuideChapter(
        "#forever\nstep\n .accept 783 >>Accept example",
        "chapter-115-1-6-northshire",
        "a".repeat(64),
        70205,
      );
      const body = JSON.stringify(chapter);
      const manifest = {
        schemaVersion: 1,
        parserVersion: "forever-guide-v2",
        publication: "private-reference",
        authorizationNote: "Not approved",
        sourceSha256: "a".repeat(64),
        inventorySha256: "b".repeat(64),
        targetBuild: 70205,
        chapters: [
          {
            chapterId: chapter.chapterId,
            version: chapter.version,
            file: "chapter.json",
            sha256: createHash("sha256").update(body).digest("hex"),
            sourceSha256: chapter.sourceSha256,
            stepCount: 1,
            questIds: [783],
          },
        ],
      };
      await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
      await writeFile(join(root, "chapter.json"), body);
      expect(await getImportedLevelingChapter(chapter.chapterId)).toBeNull();
      await writeFile(
        join(root, "manifest.json"),
        JSON.stringify({
          ...manifest,
          publication: "authorized",
          authorizationNote: "Fixture authorization",
        }),
      );
      expect(await getImportedLevelingChapter(chapter.chapterId)).toEqual(chapter);
      expect(await getImportedLevelingChapter("../../outside")).toBeNull();
      await writeFile(
        join(root, "chapter.json"),
        (await readFile(join(root, "chapter.json"), "utf8")) + " ",
      );
      await expect(getImportedLevelingChapter(chapter.chapterId)).rejects.toThrow("checksum");
    } finally {
      if (previous === undefined) delete process.env.LEVELING_ARCHIVE_ROOT;
      else process.env.LEVELING_ARCHIVE_ROOT = previous;
      await rm(root, { recursive: true, force: true });
    }
  });
});
