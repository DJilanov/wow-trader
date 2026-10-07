import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { referenceQualityGaps, type ReferenceRecord, type ReferenceTask } from "./contracts.js";
import { crawlReferences } from "./crawler.js";
import { parseWowheadPage } from "./parser.js";
import { publishReferences, readApprovedReference, readStagedReference } from "./store.js";

const task: ReferenceTask = { game: "forever", kind: "item", id: 25 };
const html =
  '<link rel="canonical" href="https://www.wowhead.com/forever/item=25/test-sword"><h1>Test Sword</h1><script>WH.Gatherer.addData(3,16,{"25":{"name_enus":"Test Sword","jsonequip":{"dmgmin1":1,"dmgmax1":3,"avgbuyout":999}}});new Listview({template:"npc",id:"sold-by",name:WH.TERMS.soldby,data:[{id:1,name:"Vendor",user:"not-imported"}]});new Listview({template:"comment",id:"comments",data:lv_comments0});</script>';
const xml =
  '<wowhead><item id="25"><name>Test Sword</name><class id="2">Weapons</class><subclass id="7">Swords</subclass><link>https://www.wowhead.com/forever/item=25/test-sword</link><htmlTooltip><![CDATA[<table><tr><td>Test Sword<br>Item Level 2<br>1 - 3 Damage<script>globalThis.attacked=true</script></td></tr></table>]]></htmlTooltip></item></wowhead>';

function fixture(): ReferenceRecord {
  return parseWowheadPage(html, task, {
    url: "https://www.wowhead.com/forever/item=25",
    capturedAt: new Date().toISOString(),
    permissionRef: "test-permission",
    itemXml: xml,
  });
}

describe("permissioned reference extraction", () => {
  it("extracts entity facts without executing scripts or importing comments and prices", () => {
    const record = fixture();
    expect(record.tooltipLines).toEqual(["Test Sword", "Item Level 2", "1 - 3 Damage"]);
    expect(record.numericFacts).toEqual({ dmgmin1: 1, dmgmax1: 3, classId: 2, subclassId: 7 });
    expect(record.relations).toEqual([{ relation: "sold-by", kind: "npc", id: 1, name: "Vendor" }]);
    expect(JSON.stringify(record)).not.toMatch(/not-imported|attacked|lv_comments/);
    expect(referenceQualityGaps(record)).toEqual([]);
  });

  it("ignores fake call text in strings and rejects executable data expressions", () => {
    const injected = html.replace(
      "</script>",
      'var x="new Listview({template:\\"npc\\",id:\\"sold-by\\",data:[]})";</script>',
    );
    expect(
      parseWowheadPage(injected, task, {
        url: "https://www.wowhead.com/forever/item=25",
        capturedAt: new Date().toISOString(),
        permissionRef: "test",
        itemXml: xml,
      }).relations,
    ).toHaveLength(1);
    expect(() =>
      parseWowheadPage(
        html.replace('data:[{id:1,name:"Vendor",user:"not-imported"}]', "data:stealCookies()"),
        task,
        {
          url: "https://www.wowhead.com/forever/item=25",
          capturedAt: new Date().toISOString(),
          permissionRef: "test",
        },
      ),
    ).toThrow(/Nonliteral/);
  });

  it("rejects crossed editions, XML entities and incomplete publication", async () => {
    expect(() =>
      parseWowheadPage(
        html.replace("/forever/item=25/test-sword", "/tbc/item=25/test-sword"),
        task,
        {
          url: "https://www.wowhead.com/forever/item=25",
          capturedAt: new Date().toISOString(),
          permissionRef: "test",
        },
      ),
    ).toThrow();
    expect(() =>
      parseWowheadPage(html, task, {
        url: "https://www.wowhead.com/forever/item=25",
        capturedAt: new Date().toISOString(),
        permissionRef: "test",
        itemXml: "<!DOCTYPE wowhead>" + xml,
      }),
    ).toThrow(/Unsupported/);
    const root = await mkdtemp(join(tmpdir(), "reference-test-"));
    try {
      const incomplete = { ...fixture(), relations: [] };
      await writeFile(join(root, "forever-item-25.json"), JSON.stringify(incomplete));
      await expect(publishReferences(root, join(root, "published"), [task])).rejects.toThrow(
        /incomplete/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("publishes checksum-verified records and rejects tampering", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-test-"));
    try {
      await writeFile(join(root, "forever-item-25.json"), JSON.stringify(fixture()));
      const published = join(root, "published");
      expect(await publishReferences(root, published, [task])).toBe(1);
      expect((await readApprovedReference(published, task))?.name).toBe("Test Sword");
      const index = JSON.parse(await readFile(join(published, "index.json"), "utf8")) as {
        records: Array<{ sha256: string }>;
      };
      await writeFile(join(published, "records", `${index.records[0]!.sha256}.json`), "{}");
      await expect(readApprovedReference(published, task)).rejects.toThrow(/checksum/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not claim that a named but incomplete quest is ready", () => {
    const quest = parseWowheadPage(
      '<link rel="canonical" href="https://www.wowhead.com/forever/quest=1"><div><h1>Known Quest</h1><h2>Description</h2></div>',
      { game: "forever", kind: "quest", id: 1 },
      {
        url: "https://www.wowhead.com/forever/quest=1",
        capturedAt: new Date().toISOString(),
        permissionRef: "test",
      },
    );
    expect(referenceQualityGaps(quest)).toEqual([
      "missing_quest_objectives",
      "missing_quest_requirements",
      "missing_quest_giver",
      "missing_quest_rewards",
    ]);
  });
});

describe("crawler controls", () => {
  it("rejects excessive delays instead of allowing overflowing timers", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-delay-"));
    let requests = 0;
    const fetcher: typeof fetch = async (): Promise<Response> => {
      requests++;
      return new Response("User-agent: *\nAllow: /\nCrawl-delay: 2147483647");
    };
    try {
      await expect(
        crawlReferences([task], {
          directory: root,
          permissionRef: "test",
          delayMs: 2147483647,
          fetcher,
        }),
      ).rejects.toThrow(/Crawl delay/);
      expect(requests).toBe(0);
      await expect(
        crawlReferences([task], { directory: root, permissionRef: "test", fetcher, sleep: async (): Promise<void> => {} }),
      ).rejects.toThrow(/robots crawl-delay/);
      expect(requests).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("honors robots, resumes cached records and supports document XML", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-crawl-"));
    const requests: string[] = [];
    const delays: number[] = [];
    const fetcher: typeof fetch = async (input): Promise<Response> => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/robots.txt"))
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 3", {
          headers: { "content-type": "text/plain" },
        });
      return new Response(url.endsWith("&xml") ? xml : html, {
        headers: { "content-type": url.endsWith("&xml") ? "application/xml" : "text/html" },
      });
    };
    const options = {
      directory: root,
      permissionRef: "test",
      fetcher,
      sleep: async (ms: number): Promise<void> => {
        delays.push(ms);
      },
    };
    try {
      expect(await crawlReferences([task], options)).toEqual({
        crawled: 1,
        cached: 0,
        incomplete: 0,
        notFound: 0,
      });
      expect(delays).toEqual([60000, 60000, 60000]);
      expect((await readStagedReference(root, task))?.id).toBe(25);
      expect(await crawlReferences([task], options)).toEqual({
        crawled: 0,
        cached: 1,
        incomplete: 0,
        notFound: 0,
      });
      expect(requests).toHaveLength(4);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("stops on disallowed paths and cross-host redirects before fetching them", async () => {
    for (const disallowed of [true, false]) {
      const root = await mkdtemp(join(tmpdir(), "reference-block-"));
      let requests = 0;
      const fetcher: typeof fetch = async (input): Promise<Response> => {
        requests++;
        return String(input).endsWith("/robots.txt")
          ? new Response(`User-agent: *\n${disallowed ? "Disallow" : "Allow"}: /`)
          : new Response(null, { status: 302, headers: { location: "https://example.com/steal" } });
      };
      try {
        await expect(
          crawlReferences([task], {
            directory: root,
            permissionRef: "test",
            fetcher,
            sleep: async (): Promise<void> => {},
          }),
        ).rejects.toThrow(disallowed ? /robots/ : /redirected/);
        expect(requests).toBe(disallowed ? 1 : 2);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });
});

describe("reference edge cases", () => {
  it("keeps same-edition NPC and object quest givers without weakening identity checks", () => {
    const parseQuest = (link: string): ReferenceRecord => {
      const markup = `[ul][li][icon name=quest-start]Start: [url=/forever/npc=261/test]Starter[/url][/icon][/li][li][icon name=quest-end]End: [url=${link}]Destination[/url][/icon][/li][/ul]`;
      return parseWowheadPage(`<link rel="canonical" href="https://www.wowhead.com/forever/quest=37"><h1>Test Quest</h1><script>WH.markup.printHtml(${JSON.stringify(markup)}, "infobox-contents-0");</script>`,
        { game: "forever", kind: "quest", id: 37 }, { url: "https://www.wowhead.com/forever/quest=37", capturedAt: new Date().toISOString(), permissionRef: "test" });
    };
    expect(parseQuest("/forever/object=55/test").relations).toEqual([
      { relation: "start", kind: "npc", id: 261, name: "Starter" },
      { relation: "end", kind: "object", id: 55, name: "Destination" },
    ]);
    expect(parseQuest("/forever/npc=55/test").relations[1]?.kind).toBe("npc");
    for (const link of ["/tbc/object=55", "/object=55", "https://example.com/forever/object=55",
      "https://user@www.wowhead.com/forever/object=55", "/forever/object=0", "/forever/object=9007199254740993",
      "/forever/object=55?edition=tbc", "/forever/object=55#tbc", "/forever/item=55"])
      expect(() => parseQuest(link)).toThrow(/identity or edition mismatch/);
  });

  it("keeps quest text nodes, requirements and rewards without completion widgets", () => {
    const questHtml =
      '<link rel="canonical" href="https://www.wowhead.com/forever/quest=1"><div><h1>Test Quest</h1>Bring <a>an item</a> to the keeper.<table><tr><td>Quest Item</td><td>(1)</td></tr></table><h2>Description</h2>Direct text, <b>important</b> details.<h2>Gains</h2>Upon completion of this quest you will gain:<ul><li>50 reputation</li></ul><div>See if complete: /run print(C_QuestLog.IsQuestFlaggedCompleted(1))</div><h2>Guides</h2>Not quest prose<script>WH.markup.printHtml("[ul][li]Requires level 5[/li][li]Class: [class=2][/li][li][icon name=quest-start]Start: [url=/forever/npc=5]Keeper[/url][/icon][/li][/ul]", "infobox-contents-0");</script></div>';
    const quest = parseWowheadPage(
      questHtml,
      { game: "forever", kind: "quest", id: 1 },
      {
        url: "https://www.wowhead.com/forever/quest=1",
        capturedAt: new Date().toISOString(),
        permissionRef: "test",
      },
    );
    expect(quest.objectives).toEqual(["Bring an item to the keeper. Quest Item (1)"]);
    expect(quest.description).toBe("Direct text, important details.");
    expect(quest.quickFacts).toContain("Class: class ID 2");
    expect(quest.rewards).toEqual(["50 reputation"]);
    expect(referenceQualityGaps(quest)).toEqual([]);
    expect(referenceQualityGaps({ ...quest, rewards: [] })).toContain("missing_quest_rewards");
  });

  it("requires rich tooltips for equipment but not fabricated stats for materials", () => {
    expect(referenceQualityGaps({ ...fixture(), tooltipLines: ["Test Sword"] })).toContain(
      "missing_item_tooltip",
    );
    expect(
      referenceQualityGaps({
        ...fixture(),
        numericFacts: { classId: 7 },
        tooltipLines: ["Crafting material"],
      }),
    ).toEqual([]);
  });

  it("resumes past 404 entities without repeatedly crawling missing pages", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-missing-"));
    let requests = 0;
    const missing: ReferenceTask = { ...task, id: 404 };
    const fetcher: typeof fetch = async (input): Promise<Response> => {
      requests++;
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /");
      if (url.includes("item=404")) return new Response(null, { status: 404 });
      return new Response(url.endsWith("&xml") ? xml : html, {
        headers: { "content-type": url.endsWith("&xml") ? "application/xml" : "text/html" },
      });
    };
    const options = {
      directory: root,
      permissionRef: "test",
      fetcher,
      sleep: async (): Promise<void> => {},
    };
    try {
      expect(await crawlReferences([missing, task, task], options)).toEqual({
        crawled: 1,
        notFound: 1,
        incomplete: 0,
        cached: 0,
      });
      expect(await crawlReferences([missing, task], options)).toEqual({
        crawled: 0,
        notFound: 0,
        incomplete: 0,
        cached: 2,
      });
      expect(requests).toBe(5);
      expect(await readStagedReference(root, missing)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists Retry-After and stops without retrying rate limits or access denials", async () => {
    for (const status of [429, 403]) {
      const root = await mkdtemp(join(tmpdir(), "reference-rate-"));
      const delays: number[] = [];
      let limited = false;
      const fetcher: typeof fetch = async (input): Promise<Response> => {
        const url = String(input);
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /");
        if (!limited) {
          limited = true;
          return new Response(null, { status, headers: { "retry-after": "5" } });
        }
        return new Response(url.endsWith("&xml") ? xml : html, {
          headers: { "content-type": url.endsWith("&xml") ? "application/xml" : "text/html" },
        });
      };
      const options = {
        directory: root,
        permissionRef: "test",
        fetcher,
        sleep: async (ms: number): Promise<void> => {
          delays.push(ms);
        },
      };
      try {
        if (status === 403)
          await expect(crawlReferences([task], options)).rejects.toThrow(/HTTP 403/);
        else {
          await expect(crawlReferences([task], options)).rejects.toThrow(/rate limited/);
          expect(delays).toEqual([60000, 60000]);
          expect(await readStagedReference(root, task)).toBeNull();
          const blocked: typeof fetch = async (input): Promise<Response> =>
            String(input).endsWith("/robots.txt")
              ? new Response("User-agent: *\nAllow: /")
              : new Response(null, { status: 429, headers: { "retry-after": "600" } });
          await expect(
            crawlReferences([task], { ...options, refresh: true, fetcher: blocked }),
          ).rejects.toThrow(/rate limited/);
          expect(await readStagedReference(root, task)).toBeNull();
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  it("publishes idempotently without dropping existing records or ignoring a publisher lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-publish-"));
    try {
      const record = fixture();
      await writeFile(join(root, "forever-item-25.json"), JSON.stringify(record));
      const published = join(root, "published");
      await publishReferences(root, published, [task]);
      await publishReferences(root, published, [task]);
      await writeFile(join(published, ".publish.lock"), "");
      await expect(publishReferences(root, published, [task])).rejects.toThrow(/EEXIST/);
      expect((await readApprovedReference(published, task))?.name).toBe(record.name);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
