import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WARCRecord, WARCSerializer } from "warcio";
import type { ReferenceTask } from "./contracts.js";
import { crawlReferences } from "./crawler.js";
import { readRequestPacing } from "./pacing.js";
import { readStagedReference } from "./store.js";

const task: ReferenceTask = { game: "forever", kind: "item", id: 25 };
const html =
  '<link rel="canonical" href="https://www.wowhead.com/forever/item=25/test-sword"><h1>Test Sword</h1><script>WH.Gatherer.addData(3,16,{"25":{"name_enus":"Test Sword","jsonequip":{"dmgmin1":1,"dmgmax1":3}}});new Listview({template:"npc",id:"sold-by",name:WH.TERMS.soldby,data:[{id:1,name:"Vendor"}]});</script>';
const xml =
  '<wowhead><item id="25"><name>Test Sword</name><class id="2">Weapons</class><subclass id="7">Swords</subclass><link>https://www.wowhead.com/forever/item=25/test-sword</link><htmlTooltip><![CDATA[<table><tr><td>Test Sword<br>Item Level 2<br>1 - 3 Damage</td></tr></table>]]></htmlTooltip></item></wowhead>';
const questHtml =
  '<link rel="canonical" href="https://www.wowhead.com/forever/quest=1"><h1>Test Quest</h1>';
const screenshot = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const originalFetch = globalThis.fetch;
let root: string;

beforeEach(async (): Promise<void> => {
  root = await mkdtemp(join(tmpdir(), "reference-browsertrix-"));
});

afterEach(async (): Promise<void> => {
  globalThis.fetch = originalFetch;
  delete process.env.BROWSERTRIX_DOCKER;
  delete process.env.BROWSERTRIX_WORK_DIR;
  delete process.env.BROWSERTRIX_KEEP_ARCHIVE;
  delete process.env.BROWSERTRIX_IMAGE;
  delete process.env.BROWSERTRIX_BATCH_TASKS;
  delete process.env.BROWSERTRIX_SCREENCAST_PORT;
  delete process.env.BROWSERTRIX_PROFILE;
  delete process.env.BROWSERTRIX_SAVE_PROFILE;
  delete process.env.BROWSERTRIX_PROXY;
  delete process.env.BROWSERTRIX_ADD_HOSTS;
  delete process.env.BROWSERTRIX_NETWORK;
  delete process.env.BROWSERTRIX_USER_AGENT_SUFFIX;
  delete process.env.FAKE_FIXTURE;
  delete process.env.FAKE_MARKER;
  delete process.env.FAKE_EXIT;
  await rm(root, { recursive: true, force: true });
});

async function responseRecord(
  url: string,
  status: number,
  contentType: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<Buffer> {
  const record = await WARCRecord.create(
    {
      url,
      date: new Date().toISOString(),
      type: "response",
      warcVersion: "WARC/1.1",
      statusline: `HTTP/1.1 ${status} ${status === 200 ? "OK" : "Redirect"}`,
      httpHeaders: { "content-type": contentType, ...headers },
    },
    [Buffer.from(body)],
  );
  return Buffer.from(await WARCSerializer.serialize(record, { gzip: true }));
}

async function screenshotRecord(url: string): Promise<Buffer> {
  const record = await WARCRecord.create(
    {
      url: `urn:view:${url}`,
      date: new Date().toISOString(),
      type: "resource",
      warcVersion: "WARC/1.1",
      warcHeaders: { "Content-Type": "image/png" },
    },
    [screenshot],
  );
  return Buffer.from(await WARCSerializer.serialize(record, { gzip: true }));
}

async function fixture(
  variant: "ok" | "missing" | "redirect" | "rate-limit" | "waf-challenge" | "chunk",
): Promise<void> {
  const collection = join(root, "fixture", "collections", "crawl");
  await mkdir(join(collection, "archive"), { recursive: true });
  await mkdir(join(collection, "pages"), { recursive: true });
  await mkdir(join(collection, "reports"), { recursive: true });
  await mkdir(join(collection, "logs"), { recursive: true });
  const records: Buffer[] = [];
  if (variant === "ok" || variant === "chunk") {
    records.push(
      await responseRecord(
        "https://www.wowhead.com/forever/item=25",
        200,
        "text/html; charset=utf-8",
        html,
      ),
      await responseRecord(
        "https://www.wowhead.com/forever/item=25&xml",
        200,
        "application/xml",
        xml,
      ),
    );
    const pageRows = [
      JSON.stringify({ url: "https://www.wowhead.com/forever/item=25", status: 200, seed: true }),
    ];
    if (variant === "chunk") {
      records.push(
        await responseRecord(
          "https://www.wowhead.com/forever/quest=1",
          200,
          "text/html; charset=utf-8",
          questHtml,
        ),
      );
      pageRows.push(
        JSON.stringify({ url: "https://www.wowhead.com/forever/quest=1", status: 200, seed: true }),
      );
    }
    await writeFile(join(collection, "pages", "pages.jsonl"), `${pageRows.join("\n")}\n`);
  } else if (variant === "missing") {
    records.push(
      await responseRecord("https://www.wowhead.com/forever/item=25", 404, "text/html", "missing"),
    );
    await writeFile(
      join(collection, "pages", "pages.jsonl"),
      `${JSON.stringify({ url: "https://www.wowhead.com/forever/item=25", status: 404, seed: true })}\n`,
    );
  } else if (variant === "redirect") {
    records.push(
      await responseRecord("https://www.wowhead.com/forever/item=25", 301, "text/html", "", {
        location: "/forever/items?notFound=25",
      }),
    );
  } else if (variant === "waf-challenge") {
    records.push(
      await responseRecord(
        "https://www.wowhead.com/forever/item=25",
        202,
        "text/html; charset=UTF-8",
        "<title></title><script>AwsWafIntegration.getToken()</script><p>verify that you're not a robot</p>",
        { "x-amzn-waf-action": "challenge" },
      ),
      await screenshotRecord("https://www.wowhead.com/forever/item=25"),
    );
    await writeFile(
      join(collection, "pages", "pages.jsonl"),
      `${JSON.stringify({ url: "https://www.wowhead.com/forever/item=25", status: 202, seed: true })}\n`,
    );
  } else {
    await writeFile(
      join(collection, "logs", "crawl.log"),
      `${JSON.stringify({ status: 429, rateLimitStatus: 429, msg: "rate limited" })}\n`,
    );
  }
  await writeFile(join(collection, "archive", "rec-test.warc.gz"), Buffer.concat(records));
}

async function fakeDocker(): Promise<string> {
  const path = join(root, "fake-docker.sh");
  await writeFile(
    path,
    `#!/bin/sh
set -eu
for arg in "$@"; do
  case "$arg" in
    type=bind,source=*,target=/crawls)
      src="\${arg#type=bind,source=}"
      src="\${src%,target=/crawls}"
      ;;
  esac
done
printf '%s\\n' "$@" >> "$FAKE_MARKER"
mkdir -p "$src/collections"
cp -R "$FAKE_FIXTURE/collections/crawl" "$src/collections/crawl"
exit "\${FAKE_EXIT:-0}"
`,
    { mode: 0o755 },
  );
  return path;
}

async function arrange(
  variant: "ok" | "missing" | "redirect" | "rate-limit" | "waf-challenge" | "chunk",
  exitCode = "0",
): Promise<string> {
  await fixture(variant);
  const marker = join(root, "docker-args.txt");
  process.env.BROWSERTRIX_DOCKER = await fakeDocker();
  process.env.BROWSERTRIX_WORK_DIR = join(root, "work");
  process.env.FAKE_FIXTURE = join(root, "fixture");
  process.env.FAKE_MARKER = marker;
  process.env.FAKE_EXIT = exitCode;
  globalThis.fetch = (async (input: string | URL | Request): Promise<Response> => {
    if (String(input).endsWith("/robots.txt"))
      return new Response("User-agent: *\nAllow: /", {
        headers: { "content-type": "text/plain" },
      });
    throw new Error(`Unexpected network fetch: ${String(input)}`);
  }) as typeof fetch;
  return marker;
}

function options(): Parameters<typeof crawlReferences>[1] {
  return {
    directory: join(root, "staging"),
    permissionRef: "test",
    delayMs: 40000,
    sleep: async (): Promise<void> => {},
    now: (): number => Date.parse("2026-10-17T12:00:00Z"),
  };
}

describe("Browsertrix crawler transport", () => {
  it("drives the pinned image and ingests HTML plus item XML from WARC", async () => {
    const marker = await arrange("ok");
    expect(await crawlReferences([task], options())).toEqual({
      crawled: 1,
      cached: 0,
      incomplete: 0,
      notFound: 0,
    });
    expect((await readStagedReference(join(root, "staging"), task))?.name).toBe("Test Sword");
    const args = await readFile(marker, "utf8");
    for (const expected of [
      "webrecorder/browsertrix-crawler:1.15.0",
      "--scopeType\npage",
      "--exclude\n^(?:https?://[^/]*@|http://|https://(?!www\\.wowhead\\.com(?:/|$)))",
      "--url\nhttps://www.wowhead.com/forever/item=25",
      "--url\nhttps://www.wowhead.com/forever/item=25&xml",
      "--behaviors\n",
      "--screenshot\nview",
      "--rateLimitInterruptCount\n1",
    ])
      expect(args).toContain(expected);
    expect(args).not.toContain("--screencastPort");
    expect(args).not.toContain("--publish");
    expect((await readRequestPacing(join(root, "staging")))?.notBefore).toBe(
      Date.parse("2026-10-17T12:00:00Z") + 40000,
    );
  });

  it("paces every browser seed through the durable randomized gate", async () => {
    const marker = await arrange("ok");
    let clock = Date.parse("2026-10-17T12:00:00Z");
    const waits: number[] = [];
    expect(
      await crawlReferences([task], {
        directory: join(root, "staging"),
        permissionRef: "test",
        delayMinMs: 45000,
        delayMaxMs: 75000,
        random: (): number => 0.5,
        now: (): number => clock,
        sleep: async (milliseconds: number): Promise<void> => {
          waits.push(milliseconds);
          clock += milliseconds;
        },
      }),
    ).toEqual({ crawled: 1, cached: 0, incomplete: 0, notFound: 0 });
    const args = await readFile(marker, "utf8");
    expect(args).toContain("--delay\n0");
    expect(args).toContain("--behaviors\n");
    expect(args).not.toContain("--customBehaviors");
    expect(waits).toEqual([60000, 60000, 60000]);
    expect((await readRequestPacing(join(root, "staging")))?.requestTimestamps).toHaveLength(3);
  });

  it("exposes an opt-in screencast on host loopback only", async () => {
    const marker = await arrange("ok");
    expect(
      await crawlReferences([task], {
        ...options(),
        browsertrixScreencastPort: 9037,
      }),
    ).toEqual({ crawled: 1, cached: 0, incomplete: 0, notFound: 0 });
    const args = await readFile(marker, "utf8");
    expect(args).toContain("--publish\n127.0.0.1:9037:9037");
    expect(args).toContain("--screencastPort\n9037");
    expect(args).not.toContain("0.0.0.0:9037:9037");
  });

  it("rejects an invalid screencast port before network access", async () => {
    let requests = 0;
    await expect(
      crawlReferences([task], {
        ...options(),
        browsertrixScreencastPort: 80,
        fetcher: async (): Promise<Response> => {
          requests++;
          return new Response("");
        },
      }),
    ).rejects.toThrow(/screencast port/);
    expect(requests).toBe(0);
  });

  it("wires a browser profile and local network mapping into Docker", async () => {
    const marker = await arrange("ok");
    const profile = join(root, "profile.tar.gz");
    await writeFile(profile, "test-profile");
    expect(
      await crawlReferences([task], {
        ...options(),
        browsertrixProfile: profile,
        browsertrixSaveProfile: true,
        browsertrixProxy: "http://host.docker.internal:8080",
        browsertrixAddHosts: ["www.wowhead.com:host.docker.internal"],
        browsertrixNetwork: "host",
        browsertrixExtraChromeArgs: ["--ignore-certificate-errors"],
        browsertrixUserAgentSuffix: "",
      }),
    ).toEqual({ crawled: 1, cached: 0, incomplete: 0, notFound: 0 });
    const args = await readFile(marker, "utf8");
    for (const expected of [
      "--network\nhost",
      "--add-host\nwww.wowhead.com:host.docker.internal",
      `--mount\ntype=bind,source=${root},target=/profiles`,
      "--profile\n/profiles/profile.tar.gz",
      "--saveProfile",
      "--proxyServer\nhttp://host.docker.internal:8080",
      "--extraChromeArgs\n--ignore-certificate-errors",
    ])
      expect(args).toContain(expected);
    expect(args).not.toContain("--userAgentSuffix");
  });

  it("keeps Docker runs bounded to one task by default", async () => {
    const marker = await arrange("chunk");
    const quest: ReferenceTask = { game: "forever", kind: "quest", id: 1 };
    expect(await crawlReferences([task, quest], options())).toEqual({
      crawled: 2,
      cached: 0,
      incomplete: 1,
      notFound: 0,
    });
    expect((await readStagedReference(join(root, "staging"), task))?.name).toBe("Test Sword");
    expect((await readStagedReference(join(root, "staging"), quest))?.name).toBe("Test Quest");
    const args = await readFile(marker, "utf8");
    expect(args.match(/webrecorder\/browsertrix-crawler:1\.15\.0/g)).toHaveLength(3);
  });

  it.each([
    ["missing", 404],
    ["redirect", 301],
  ] as const)("records a %s entity response as not found", async (variant, status) => {
    await arrange(variant);
    expect(await crawlReferences([task], options())).toMatchObject({ notFound: 1, crawled: 0 });
    expect(
      JSON.parse(await readFile(join(root, "staging", "forever-item-25.missing.json"), "utf8")),
    ).toMatchObject({ id: 25, status });
  });

  it("maps a rate-limit exit code to a durable cooldown", async () => {
    await arrange("rate-limit", "18");
    await expect(crawlReferences([task], options())).rejects.toMatchObject({
      name: "SourceCooldownError",
      sourceStatus: 429,
    });
    expect((await readRequestPacing(join(root, "staging")))?.notBefore).toBe(
      Date.parse("2026-10-17T12:00:00Z") + 300000,
    );
  });

  it("rejects an AWS WAF challenge before parsing the entity", async () => {
    await arrange("waf-challenge");
    await expect(crawlReferences([task], options())).rejects.toThrow(
      "Source challenge encountered; stopped",
    );
    expect(await readStagedReference(join(root, "staging"), task)).toBeNull();
    const evidenceDirectory = join(root, "staging", "challenge-evidence");
    const names = await readdir(evidenceDirectory);
    expect(names.filter((name) => name.endsWith(".png"))).toHaveLength(1);
    expect(names.filter((name) => name.endsWith(".json"))).toHaveLength(1);
    const report = names.find((name) => name.endsWith(".html"));
    if (!report) throw new Error("Expected a saved challenge report");
    const contents = await readFile(join(evidenceDirectory, report), "utf8");
    expect(contents).toContain("Read-only challenge evidence");
    expect(contents).toContain("aws_waf");
    expect(contents).not.toContain("AwsWafIntegration.getToken");
  });
});
