import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { auditChapterCatalog, extractChapterReferences } from "./chapter-catalog.js";

async function main(): Promise<void> {
  const [path, option] = process.argv.slice(2);
  if (!path || (option !== undefined && option !== "--json"))
    throw new Error(
      "Usage: pnpm --filter @wow-trader/leveling catalog <guide_inventory.csv> [--json]",
    );
  const input = await readFile(path, "utf8");
  const chapters = extractChapterReferences(input);
  const audit = auditChapterCatalog(chapters);
  if (audit.cycles.length > 0)
    throw new Error(`Chapter graph contains ${audit.cycles.length} cycle(s)`);
  if (option === "--json") console.log(JSON.stringify(chapters));
  else
    console.log(
      JSON.stringify(
        {
          chapterCount: chapters.length,
          inventorySha256: createHash("sha256").update(input).digest("hex"),
          matchesCheckedInCatalog: JSON.stringify(chapters) === JSON.stringify(CHAPTER_REFERENCES),
          ...audit,
        },
        null,
        2,
      ),
    );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Chapter audit failed");
  process.exitCode = 1;
});
