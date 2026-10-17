import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { QUEST_XP_PARSER_VERSION, questXpRecordSchema } from "./quest-xp-contracts.js";

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
  it("accepts quest 2866's captured trailing metadata space without changing its identity or rewards", async () => {
    const html = await readFile(new URL("./fixtures/quest-2866-xp.html", import.meta.url), "utf8");
    const record = parseWowheadPage(
      html,
      { game: "forever", kind: "quest", id: 2866 },
      {
        url: "https://www.wowhead.com/forever/quest=2866/the-ruins-of-solarsal",
        capturedAt: new Date().toISOString(),
        permissionRef: "test",
      },
    );
    const result = parseQuestXpPage(html, record);
    expect(result).toMatchObject({
      id: 2866,
      name: "The Ruins of Solarsal",
      questLevel: 43,
      minimumLevel: 40,
      referenceBaseXp: 2700,
      pageMultiplier: 1,
      fullXp: 2700,
      status: "available",
      issues: [],
      rendererRevision: "quest-5f36c4ad-core-25318d8a",
      parserVersion: QUEST_XP_PARSER_VERSION,
    });
    expect(result.xpByLevel.find((row) => row.level === 49)?.xp).toBe(2150);
    expect(result.xpByLevel.find((row) => row.level === 53)?.xp).toBe(270);
  });
  it.each([" ", "\t", "\r\n", "\u00a0"])(
    "normalizes only surrounding name whitespace %j",
    (space) => {
      const html = page()
        .replace(
          '"name_enus":"Quest 9"',
          `"name_enus":${JSON.stringify(space + "Quest 9" + space)}`,
        )
        .replace('name:"Quest 9"', `name:${JSON.stringify(space + "Quest 9" + space)}`);
      expect(parse(html).fullXp).toBe(1050);
    },
  );
  it("still rejects genuine primary ID/name mismatches and ambiguous duplicate metadata", () => {
    for (const html of [
      page().replace('name:"Quest 9"', 'name:"Different quest"'),
      page().replace('"name_enus":"Quest 9"', '"name_enus":"Different quest"'),
      page().replace('name:"Quest 9"', 'name:"Quest  9"'),
      page().replace("id:9,name", "id:10,name"),
      page().replace('name:"Quest 9"', "name:9"),
      page().replace('"name_enus":"Quest 9"', '"name_enus":9'),
      page() +
        '<script>$.extend(g_quests[9],{id:9,name:"Quest 9",level:15,reqlevel:8,xp:1050});</script>',
    ])
      expect(() => parse(html)).toThrow(/mismatch|Duplicate/);
  });
  it("recovers the captured Red Crystal payload with the independently verified core revision", async () => {
    const html = await readFile(new URL("./fixtures/quest-4811-xp.html", import.meta.url), "utf8");
    const record = parseWowheadPage(
      html,
      { game: "forever", kind: "quest", id: 4811 },
      {
        url: "https://www.wowhead.com/forever/quest=4811/the-red-crystal",
        capturedAt: new Date().toISOString(),
        permissionRef: "test",
      },
    );
    const result = parseQuestXpPage(html, record);
    expect(result).toMatchObject({
      id: 4811,
      name: "The Red Crystal",
      fullXp: 490,
      referenceBaseXp: 490,
      pageMultiplier: 1,
      questLevel: 14,
      minimumLevel: 12,
      rendererRevision: "quest-5f36c4ad-core-97211824",
      parserVersion: QUEST_XP_PARSER_VERSION,
      status: "available",
      issues: [],
    });
    expect(result.xpByLevel.find((row) => row.level === 20)?.xp).toBe(390);
  });
  it("accepts all reviewed revisions with identical rewards, but not lookalike renderer URLs", () => {
    for (const base of [0, 490, 999, 1000, 1050, 1250, 10000]) {
      const html = page(9, base, 2.375);
      const old = parse(html),
        current = parse(html.replace("52d4f803", "97211824"));
      expect(current.fullXp).toEqual(old.fullXp);
      expect(current.xpByLevel).toEqual(old.xpByLevel);
      const newest = parse(html.replace("52d4f803", "25318d8a"));
      expect(newest.fullXp).toEqual(old.fullXp);
      expect(newest.xpByLevel).toEqual(old.xpByLevel);
    }
    for (const revision of ["unknown", "97211824&unverified=1", "25318d8a&unverified=1"]) {
      const result = parse(page().replace("52d4f803", revision));
      expect(result).toMatchObject({ status: "unknown", rendererRevision: null, fullXp: null });
    }
    expect(
      parse(
        page().replace(
          "https://wow.zamimg.com/js/global-core",
          "https://other.test/js/global-core",
        ),
      ).status,
    ).toBe("unknown");
    expect(
      questXpRecordSchema.parse({ ...parse(page()), parserVersion: "wowhead-quest-xp-20261014-v1" })
        .status,
    ).toBe("available");
    expect(
      questXpRecordSchema.parse({ ...parse(page()), parserVersion: "wowhead-quest-xp-20261015-v2" })
        .status,
    ).toBe("available");
    expect(() => questXpRecordSchema.parse({ ...parse(page()), rendererRevision: null })).toThrow(
      /verified renderer/,
    );
  });
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
  it("preserves the distinct collected Stockade and Gnomeregan page coefficients", () => {
    const stockade = parse(page(378, 2750, 2.1, 27), 378);
    expect(stockade).toMatchObject({ referenceBaseXp: 2750, pageMultiplier: 2.1, fullXp: 5800 });
    expect(stockade.xpByLevel.find((row) => row.level === 33)?.xp).toBe(4600);
    const gnomeregan = parse(page(2922, 2650, 1.8, 26), 2922);
    expect(gnomeregan).toMatchObject({ referenceBaseXp: 2650, pageMultiplier: 1.8, fullXp: 4750 });
    expect(gnomeregan.xpByLevel.find((row) => row.level === 32)?.xp).toBe(3800);
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
  it("records a matching quest with no XP payload as confirmed zero XP", () => {
    const html =
      '<link rel="canonical" href="https://www.wowhead.com/forever/quest=308/distracting-jarven"><div><h1>Distracting Jarven</h1><h2>Progress</h2><table class="icon-list"><tr><td>Thunder Ale (1)</td></tr></table><h2>Completion</h2></div>' +
      '<script src="https://wow.zamimg.com/js/quest.js?5f36c4ad"></script><script src="https://wow.zamimg.com/js/global-core.js?154e707b"></script>' +
      '<script>WH.Gatherer.addData(5,16,{"308":{"name_enus":"Distracting Jarven"}});$.extend(g_quests[308],{id:308,name:"Distracting Jarven",level:7,reqlevel:1});</script>';
    const result = parse(html, 308);

    expect(result).toMatchObject({
      fullXp: 0,
      referenceBaseXp: 0,
      pageMultiplier: null,
      rendererRevision: "quest-5f36c4ad-core-154e707b",
      status: "available",
      issues: [],
    });
    expect(result.xpByLevel).toEqual([]);
  });
  it("does not misdiagnose an unverified renderer as missing primary quest metadata", () => {
    const result = parse(page().replace("quest.js?5f36c4ad", "quest.js?new"));
    expect(result).toMatchObject({ questLevel: 15, minimumLevel: 8, status: "unknown" });
    expect(result.issues).toContain("unverified_quest_xp_renderer_revision");
    expect(result.issues).not.toContain("missing_primary_quest_dataset");
    expect(result.issues).not.toContain("missing_matching_quest_edition");
  });
  it("distinguishes a missing matching edition from missing primary metadata", () => {
    const foreign = parse(page().replace("addData(5,16", "addData(5,5"));
    expect(foreign.issues).toContain("missing_matching_quest_edition");
    expect(foreign.issues).not.toContain("missing_primary_quest_dataset");
    const absent = parse(page().replace(/\$\.extend\(g_quests\[9\],[^;]+;/, ""));
    expect(absent.issues).toContain("missing_primary_quest_dataset");
    expect(absent.issues).not.toContain("unverified_quest_xp_renderer_revision");
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
  it.each([
    "wowhead-quest-xp-20261014-v1",
    "wowhead-quest-xp-20261015-v2",
    "wowhead-quest-xp-20261016-v3",
  ] as const)(
    "repairs %s unknown XP once using its canonical URL and does not retry current unknowns",
    async (legacyVersion) => {
      const root = await mkdtemp(join(tmpdir(), "quest-xp-repair-"));
      const canonical = "https://www.wowhead.com/forever/quest=9/quest-9";
      const html = page().replace(
        'href="https://www.wowhead.com/forever/quest=9"',
        `href="${canonical}"`,
      );
      const record = parseWowheadPage(html, task, {
        url: canonical,
        capturedAt: new Date().toISOString(),
        permissionRef: "test",
      });
      const unknown = parseQuestXpPage(
        html.replace("52d4f803", "unknown"),
        reference(html.replace("52d4f803", "unknown")),
      );
      try {
        await writeFile(join(root, "forever-quest-9.json"), JSON.stringify(record));
        await writeFile(
          join(root, "forever-quest-9.xp.json"),
          JSON.stringify({
            ...unknown,
            sourceUrl: canonical,
            sourceSha256: record.sourceSha256,
            capturedAt: record.capturedAt,
            parserVersion: legacyVersion,
          }),
        );
        const requests: string[] = [];
        const options = {
          directory: root,
          permissionRef: "test",
          questXp: true,
          sleep: async (): Promise<void> => {},
          fetcher: async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
            requests.push(String(input));
            return String(input).endsWith("robots.txt")
              ? new Response("User-agent: *\nAllow: /")
              : new Response(html.replace("52d4f803", "97211824"), {
                  headers: { "content-type": "text/html" },
                });
          },
        };
        expect(await crawlReferences([task], options)).toMatchObject({ crawled: 1 });
        expect(requests[1]).toBe(canonical);
        expect((await readStagedQuestXp(root, task))?.fullXp).toBe(1050);
        expect(await crawlReferences([task], options)).toMatchObject({ cached: 1 });
        const repaired = (await readStagedQuestXp(root, task))!;
        await writeFile(
          join(root, "forever-quest-9.xp.json"),
          JSON.stringify({
            ...repaired,
            parserVersion: legacyVersion,
          }),
        );
        expect(await crawlReferences([task], options)).toMatchObject({ cached: 1 });
        await writeFile(
          join(root, "forever-quest-9.xp.json"),
          JSON.stringify({
            ...repaired,
            status: "unknown",
            fullXp: null,
            xpByLevel: [],
            rendererRevision: null,
            issues: ["unverified_quest_xp_renderer_revision", "missing_numeric_quest_xp"],
          }),
        );
        expect(await crawlReferences([task], options)).toMatchObject({ cached: 1 });
        expect(requests.filter((url) => !url.endsWith("robots.txt"))).toEqual([canonical]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
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
