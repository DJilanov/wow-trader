import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ReferenceTask } from "./contracts.js";
import { readCrawlJobStatus, runCrawlJob } from "./job.js";

const tasks: ReferenceTask[] = [1, 2, 3, 4, 5].map((id): ReferenceTask => ({
  game: "forever",
  kind: "item",
  id,
}));

function page(id: number): string {
  return `<link rel="canonical" href="https://www.wowhead.com/forever/item=${id}"><h1>Sword ${id}</h1><script>WH.Gatherer.addData(3,16,{"${id}":{"name_enus":"Sword ${id}"}});new Listview({template:"npc",id:"sold-by",data:[{id:1,name:"Vendor"}]});</script>`;
}

function xml(id: number): string {
  return `<wowhead><item id="${id}"><name>Sword ${id}</name><class id="2">Weapons</class><subclass id="7">Swords</subclass><link>https://www.wowhead.com/forever/item=${id}</link><htmlTooltip><![CDATA[Sword ${id}<br>Item Level 2<br>1 - 3 Damage]]></htmlTooltip></item></wowhead>`;
}

const fetcher: typeof fetch = async (input): Promise<Response> => {
  const url = String(input);
  if (url.endsWith("robots.txt")) return new Response("User-agent: *\nAllow: /");
  const id = Number(url.match(/item=(\d+)/)?.[1]);
  return new Response(url.endsWith("&xml") ? xml(id) : page(id), {
    headers: { "content-type": url.endsWith("&xml") ? "application/xml" : "text/html" },
  });
};

function options(root: string): Parameters<typeof runCrawlJob>[1] {
  return {
    directory: join(root, "staging"),
    statusPath: join(root, "status.json"),
    permissionRef: "test-permission",
    batchSize: 2,
    fetcher,
    availableDiskBytes: async (): Promise<number> => 64 * 1024 ** 3,
    sleep: async (): Promise<void> => {},
  };
}

describe("durable catalog crawl", () => {
  it("finishes every batch, persists progress and does not publish", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-job-"));
    try {
      const result = await runCrawlJob(tasks, options(root));
      expect(result).toMatchObject({
        state: "completed",
        total: 5,
        cursor: 5,
        counts: { crawled: 5, cached: 0, incomplete: 0, notFound: 0 },
      });
      expect(await readCrawlJobStatus(join(root, "status.json"))).toEqual(result);
      await expect(stat(join(root, "staging", "index.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(stat(join(root, "staging", ".job.lock"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      let requests = 0;
      await runCrawlJob(tasks, {
        ...options(root),
        fetcher: async (): Promise<Response> => {
          requests++;
          throw new Error("Completed runs must not fetch");
        },
      });
      expect(requests).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("checkpoints individual records and resumes a blocked partial batch without losing counts", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-job-resume-"));
    const blocked: typeof fetch = async (input, init): Promise<Response> =>
      String(input).includes("item=2")
        ? new Response("Denied", { status: 403 })
        : fetcher(input, init);
    try {
      await expect(runCrawlJob(tasks, { ...options(root), fetcher: blocked })).rejects.toThrow(
        /HTTP 403/,
      );
      expect(await readCrawlJobStatus(join(root, "status.json"))).toMatchObject({
        state: "blocked",
        cursor: 1,
        currentKey: "forever-item-2",
        counts: { crawled: 1 },
      });
      const fetched: string[] = [];
      const result = await runCrawlJob(tasks, {
        ...options(root),
        fetcher: async (input, init): Promise<Response> => {
          fetched.push(String(input));
          return fetcher(input, init);
        },
      });
      expect(result.counts.crawled).toBe(5);
      expect(fetched.some((url): boolean => url.includes("item=1"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("counts 404s and cached records as completed work", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-job-missing-"));
    try {
      await runCrawlJob(tasks.slice(0, 1), {
        ...options(root),
        statusPath: join(root, "first.json"),
      });
      const result = await runCrawlJob(tasks, {
        ...options(root),
        fetcher: async (input, init): Promise<Response> =>
          String(input).includes("item=2")
            ? new Response("Not found", { status: 404 })
            : fetcher(input, init),
      });
      expect(result.counts).toEqual({ crawled: 3, cached: 1, incomplete: 0, notFound: 1 });
      expect(result.cursor).toBe(5);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects queue changes and concurrent jobs", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-job-identity-"));
    try {
      const result = await runCrawlJob(tasks, options(root));
      await expect(runCrawlJob(tasks.slice(0, 2), options(root))).rejects.toThrow(/differs/);
      expect(await readCrawlJobStatus(join(root, "status.json"))).toEqual(result);
      await writeFile(join(root, "staging", ".job.lock"), "active");
      await expect(runCrawlJob(tasks, options(root))).rejects.toMatchObject({ code: "EEXIST" });
      expect(await readFile(join(root, "staging", ".job.lock"), "utf8")).toBe("active");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("stops before network access when disk or staging budgets are exhausted", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-job-disk-"));
    let requests = 0;
    const counted: typeof fetch = async (input, init): Promise<Response> => {
      requests++;
      return fetcher(input, init);
    };
    try {
      await expect(
        runCrawlJob(tasks, {
          ...options(root),
          fetcher: counted,
          availableDiskBytes: async (): Promise<number> => 0,
        }),
      ).rejects.toThrow(/free disk/);
      expect(requests).toBe(0);
      await writeFile(join(root, "staging", "unrelated.json"), "x".repeat(300001));
      await expect(
        runCrawlJob(tasks, { ...options(root), fetcher: counted, maxStagingBytes: 300000 }),
      ).rejects.toThrow(/storage budget/);
      expect(requests).toBe(1); // Robots is checked before the first task, but no entity is fetched.
      expect((await readCrawlJobStatus(join(root, "status.json")))?.cursor).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("gracefully interrupts and releases both locks", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-job-stop-"));
    const controller = new AbortController();
    try {
      await expect(
        runCrawlJob(tasks, {
          ...options(root),
          signal: controller.signal,
          onTaskComplete: (): void => controller.abort(new Error("Operator stop")),
        }),
      ).rejects.toThrow(/Operator stop/);
      expect(await readCrawlJobStatus(join(root, "status.json"))).toMatchObject({
        state: "interrupted",
        cursor: 1,
      });
      await expect(stat(join(root, "staging", ".crawl.lock"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(stat(join(root, "staging", ".job.lock"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect((await runCrawlJob(tasks, options(root))).cursor).toBe(5);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
