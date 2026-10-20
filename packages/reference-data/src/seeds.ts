import { readFile } from "node:fs/promises";
import { load } from "cheerio";
import { referenceKey, type ReferenceTask } from "./contracts.js";

export async function seedFromHelperSitemaps(
  paths: readonly string[],
  game: "tbc" | "forever",
): Promise<ReferenceTask[]> {
  const tasks = new Map<string, ReferenceTask>();
  for (const path of paths) {
    const xml = await readFile(path, "utf8");
    if (Buffer.byteLength(xml) > 16_000_000 || /<!ENTITY|<!DOCTYPE/i.test(xml))
      throw new Error("Unsupported Helper sitemap");
    const $ = load(xml, { xmlMode: true });
    for (const element of $("url > loc").toArray()) {
      const url = new URL($(element).text());
      const legacy = url.origin === "https://helper.kfcguild.online";
      const consolidated =
        url.origin === "https://kfcguild.online" && url.pathname.startsWith("/tools/");
      if ((!legacy && !consolidated) || url.search || url.hash)
        throw new Error("Unexpected Helper sitemap URL");
      const helperPath = consolidated ? url.pathname.slice("/tools".length) : url.pathname;
      const match = helperPath.match(new RegExp(`^/${game}/encyclopedia/(items|quests)/(\\d+)$`));
      if (!match) continue;
      const task: ReferenceTask = {
        game,
        kind: match[1] === "items" ? "item" : "quest",
        id: Number(match[2]),
      };
      tasks.set(referenceKey(task), task);
    }
  }
  return [...tasks.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id);
}
