import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseQuestXpPage, parseWowheadPage } from "./parser.js";
import { crawlReferences } from "./crawler.js";
import {
  publishQuestXpCycle,
  readPublishedQuestXp,
  readQuestXpIndex,
  readStagedQuestXp,
} from "./quest-xp-store.js";
import type { ReferenceRecord, ReferenceTask } from "./contracts.js";
import type { ReferenceValidation } from "./client-validation.js";

function page(id = 9, base = 1050, multiplier = 1, level = 15): string {
  return `<link rel="canonical" href="https://www.wowhead.com/forever/quest=${id}"><div><h1>Quest ${id}</h1><h2>Gains</h2><div id="quest-reward-xp"></div></div>
  <script src="https://wow.zamimg.com/js/quest.js?5f36c4ad"></script><script src="https://wow.zamimg.com/js/global-core.js?52d4f803"></script>
  <script>WH.Gatherer.addData(5,16,{"${id}":{"name_enus":"Quest ${id}"}});$.extend(g_quests[${id}],{id:${id},name:"Quest ${id}",level:${level},reqlevel:8,xp:${base}});WH.Wow.Quest.setupScalingRewards({minLevel:${level},maxLevel:${level},xp:{multiplier:${multiplier},levels:{"${level}":${base}}}});</script>`;
}
function reference(html: string, id = 9): ReferenceRecord {
  return parseWowheadPage(
    html,
    { game: "forever", kind: "quest", id },
    {
      url: `https://www.wowhead.com/forever/quest=${id}`,
      capturedAt: new Date().toISOString(),
      permissionRef: "test",
    },
  );
}
function parse(html: string, id = 9): ReturnType<typeof parseQuestXpPage> {
  return parseQuestXpPage(html, reference(html, id));
}
const task: ReferenceTask = { game: "forever", kind: "quest", id: 9 };
const validate =
  async (): Promise<(record: ReferenceRecord) => ReferenceValidation> =>
  (): ReferenceValidation => ({ conflicts: [], indexGaps: [] });

describe("typed quest reward evidence", () => {
  it("extracts hidden primary world XP and the verified renderer's overlevel table", () => {
    const reward = parse(page());
    expect(reward).toMatchObject({
      fullXp: 1050,
      referenceBaseXp: 1050,
      pageMultiplier: 1,
      questLevel: 15,
      minimumLevel: 8,
      status: "available",
    });
    expect(reward.xpByLevel.find((row) => row.level === 20)?.xp).toBe(1050);
    expect(reward.xpByLevel.find((row) => row.level === 21)?.xp).toBe(840);
    expect(reward.xpByLevel.find((row) => row.level === 25)?.xp).toBe(110);
    expect(reward.xpByLevel.some((row) => row.level === 60)).toBe(false);
  });
  it("applies the page's dungeon coefficient once with its rounding, not an inferred double bonus", () => {
    const reward = parse(page(214, 1250, 2.375, 17), 214);
    expect(reward.fullXp).toBe(2950);
    expect(reward.xpByLevel.find((row) => row.level === 23)?.xp).toBe(2400);
  });
  it("keeps zero distinct from absent XP and holds changed renderer revisions", () => {
    expect(parse(page(9, 0))).toMatchObject({ fullXp: 0, status: "available" });
    expect(parse(page().replace("quest.js?5f36c4ad", "quest.js?new"))).toMatchObject({
      fullXp: null,
      status: "unknown",
    });
    expect(parse(page().replace(/WH\.Wow\.Quest\.setupScalingRewards\([^;]+;/, ""))).toMatchObject({
      fullXp: null,
      status: "unknown",
    });
  });
  it("ignores comments, historical tables and unrelated/foreign primary data", () => {
    const html = page().replace(
      "<h2>Gains</h2>",
      '<div class="comments">90000 experience</div><table>Experience: 75000</table><h2>Gains</h2>',
    );
    expect(parse(html).fullXp).toBe(1050);
    expect(parse(page().replace("addData(5,16", "addData(5,5")).status).toBe("unknown");
    expect(() => parse(page().replace("id:9,name", "id:10,name"))).toThrow(/identity/);
    expect(() => parse(page().replace("multiplier:1", "multiplier:steal()"))).toThrow(/Nonliteral/);
    expect(() =>
      parseQuestXpPage(page(), { ...reference(page()), sourceSha256: "a".repeat(64) }),
    ).toThrow(/checksum/);
  });
  it("refreshes a fresh display cache once for missing XP capability and then resumes without refetch", async () => {
    const root = await mkdtemp(join(tmpdir(), "quest-xp-cache-"));
    let requests = 0;
    const html = page();
    try {
      await writeFile(join(root, "forever-quest-9.json"), JSON.stringify(reference(html)));
      const options = {
        directory: root,
        permissionRef: "test",
        questXp: true,
        sleep: async (): Promise<void> => {},
        fetcher: async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
          requests++;
          return String(input).endsWith("robots.txt")
            ? new Response("User-agent: *\nAllow: /")
            : new Response(html, { headers: { "content-type": "text/html" } });
        },
      };
      expect(await crawlReferences([task], options)).toMatchObject({ crawled: 1 });
      expect((await readStagedQuestXp(root, task))?.fullXp).toBe(1050);
      expect(await crawlReferences([task], options)).toMatchObject({ cached: 1 });
      expect(requests).toBe(3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("publishes checksummed XP independently of SEO completeness and detects changed claims", async () => {
    const root = await mkdtemp(join(tmpdir(), "quest-xp-publish-"));
    const options = {
      staging: root,
      destination: join(root, "published"),
      revision: "client-test",
      validate,
    };
    const stage = async (html: string): Promise<void> => {
      const record = reference(html);
      await writeFile(join(root, "forever-quest-9.json"), JSON.stringify(record));
      await writeFile(
        join(root, "forever-quest-9.xp.json"),
        JSON.stringify(parseQuestXpPage(html, record)),
      );
    };
    try {
      await stage(page());
      expect(await publishQuestXpCycle(options)).toMatchObject({ published: 1, held: 0 });
      const first = (await readQuestXpIndex(options.destination))!.records[0]!;
      expect((await readPublishedQuestXp(options.destination, first))?.fullXp).toBe(1050);
      expect(await publishQuestXpCycle(options)).toMatchObject({ checked: 0 });
      await stage(page(9, 1100));
      expect(await publishQuestXpCycle(options)).toMatchObject({ published: 1 });
      const changed = (await readQuestXpIndex(options.destination))!.records[0]!;
      expect((await readPublishedQuestXp(options.destination, changed))?.status).toBe("conflict");
      expect((await readPublishedQuestXp(options.destination, first))?.fullXp).toBe(1050);
      await stage(page().replace("quest.js?5f36c4ad", "quest.js?new"));
      expect(await publishQuestXpCycle(options)).toMatchObject({ published: 0, held: 1 });
      expect((await readQuestXpIndex(options.destination))!.records[0]!.sha256).toBe(
        changed.sha256,
      );
      await stage(page(9, 1100));
      await publishQuestXpCycle(options);
      const repeated = (await readQuestXpIndex(options.destination))!.records[0]!;
      expect((await readPublishedQuestXp(options.destination, repeated))?.status).toBe("conflict");
      await writeFile(
        join(options.destination, "quest-xp", "records", `${changed.sha256}.json`),
        "{}",
      );
      await expect(readPublishedQuestXp(options.destination, changed)).rejects.toThrow(/checksum/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
