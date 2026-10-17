import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ReferenceTask } from "./contracts.js";
import { readCrawlJobStatus, runCrawlJob, runPriorityCrawlJob } from "./job.js";

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
    random: (): number => 0.5,
    availableDiskBytes: async (): Promise<number> => 64 * 1024 ** 3,
    sleep: async (): Promise<void> => {},
  };
}

describe("durable catalog crawl", () => {
  it("resumes a legacy blocked base checkpoint after leveling phases and quarantines its exact not-found redirect", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-job-legacy-redirect-"));
    const missing: ReferenceTask = { game: "forever", kind: "quest", id: 260 };
    const base = [tasks[0]!, missing, tasks[1]!];
    const settings = options(root);
    const requests: string[] = [];
    const order: string[] = [];
    try {
      await expect(
        runCrawlJob(base, {
          ...settings,
          fetcher: async (input, init): Promise<Response> => {
            if (String(input).includes("quest=260"))
              throw new Error("Source redirected outside the permitted entity");
            return fetcher(input, init);
          },
        }),
      ).rejects.toThrow(/redirected outside/);
      const blocked = await readCrawlJobStatus(settings.statusPath);
      expect(blocked).toMatchObject({
        state: "blocked",
        cursor: 1,
        currentKey: "forever-quest-260",
        counts: { crawled: 1, cached: 0, notFound: 0 },
      });
      if (!blocked) throw new Error("Expected the saved legacy failure.");
      const { questXp, ...legacy } = blocked;
      expect(questXp).toBe(false);
      await writeFile(settings.statusPath, JSON.stringify(legacy));

      const result = await runPriorityCrawlJob(base, [tasks[2]!], {
        ...settings,
        recovery: { tasks: [tasks[3]!], statusPath: join(root, "recovery.json") },
        priorityStatusPath: join(root, "priority.json"),
        archive: { tasks: [tasks[4]!], statusPath: join(root, "archive.json") },
        onTaskStart: (key): void => {
          order.push(key);
        },
        fetcher: async (input, init): Promise<Response> => {
          const url = String(input);
          requests.push(url);
          if (url === "https://www.wowhead.com/forever/quest=260")
            return new Response(null, {
              status: 301,
              headers: { location: "/forever/quests?notFound=260" },
            });
          return fetcher(input, init);
        },
      });
      expect(order).toEqual([
        "forever-item-4",
        "forever-item-3",
        "forever-item-5",
        "forever-quest-260",
        "forever-item-2",
      ]);
      expect(result.base).toMatchObject({
        state: "completed",
        cursor: 3,
        total: 3,
        currentKey: null,
        error: null,
        queueSha256: blocked.queueSha256,
        counts: { crawled: 2, cached: 0, notFound: 1 },
      });
      expect(result.recovery?.state).toBe("completed");
      expect(result.priority.state).toBe("completed");
      expect(result.archive?.state).toBe("completed");
      expect(requests.filter((url) => url.includes("quest=260"))).toHaveLength(1);
      expect(requests.some((url) => url.includes("notFound="))).toBe(false);
      expect(requests.some((url) => /item=1(?:$|&|\/)/.test(url))).toBe(false);
      expect(
        JSON.parse(
          await readFile(join(settings.directory, "forever-quest-260.missing.json"), "utf8"),
        ),
      ).toMatchObject({
        game: "forever",
        kind: "quest",
        id: 260,
        status: 301,
      });
      const resultAgain = await runPriorityCrawlJob(base, [tasks[2]!], {
        ...settings,
        recovery: { tasks: [tasks[3]!], statusPath: join(root, "recovery.json") },
        priorityStatusPath: join(root, "priority.json"),
        archive: { tasks: [tasks[4]!], statusPath: join(root, "archive.json") },
        fetcher: async (): Promise<Response> => {
          throw new Error("Completed phases must not refetch.");
        },
      });
      expect(resultAgain.base).toEqual(result.base);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("continues recovery then priority then archive before resuming the unchanged base checkpoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-job-archive-"));
    const controller = new AbortController();
    const archiveStatusPath = join(root, "archive.json");
    const priorityStatusPath = join(root, "priority.json");
    const sequence: string[] = [];
    const phases = {
      recovery: { tasks: tasks.slice(0, 1), statusPath: join(root, "recovery.json") },
      archive: { tasks: tasks.slice(2, 4), statusPath: archiveStatusPath },
    };
    try {
      await expect(
        runPriorityCrawlJob(tasks.slice(4), tasks.slice(1, 2), {
          ...options(root),
          ...phases,
          priorityStatusPath,
          signal: controller.signal,
          onTaskStart: (key): void => {
            sequence.push(key);
          },
          onTaskComplete: (result): void => {
            if (result.key === "forever-item-3") controller.abort(new Error("Archive pause"));
          },
        }),
      ).rejects.toThrow(/Archive pause/);
      expect(sequence).toEqual(["forever-item-1", "forever-item-2", "forever-item-3"]);
      expect(await readCrawlJobStatus(archiveStatusPath)).toMatchObject({
        cursor: 1,
        state: "interrupted",
        questXp: true,
      });
      expect(await readCrawlJobStatus(join(root, "status.json"))).toBeNull();
      const resumed: string[] = [];
      const result = await runPriorityCrawlJob(tasks.slice(4), tasks.slice(1, 2), {
        ...options(root),
        ...phases,
        priorityStatusPath,
        onTaskStart: (key): void => {
          resumed.push(key);
        },
      });
      expect(resumed).toEqual(["forever-item-4", "forever-item-5"]);
      expect(result.archive).toMatchObject({ state: "completed", cursor: 2, questXp: true });
      expect(result.base).toMatchObject({ cursor: 1, questXp: false });
      await expect(
        runPriorityCrawlJob(tasks, tasks, {
          ...options(root),
          priorityStatusPath,
          archive: { tasks, statusPath: priorityStatusPath },
        }),
      ).rejects.toThrow(/separate/);
      await expect(
        runPriorityCrawlJob(tasks, tasks, {
          ...options(root),
          priorityStatusPath,
          ...phases,
          archive: { tasks, statusPath: phases.recovery.statusPath },
        }),
      ).rejects.toThrow(/separate/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not start priority or base when the recovery source denies access", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-job-recovery-denied-"));
    const priorityStatusPath = join(root, "priority.json");
    try {
      await expect(
        runPriorityCrawlJob(tasks.slice(3), tasks.slice(2, 3), {
          ...options(root),
          priorityStatusPath,
          recovery: { tasks: tasks.slice(0, 2), statusPath: join(root, "recovery.json") },
          fetcher: async (input, init): Promise<Response> =>
            String(input).endsWith("robots.txt")
              ? fetcher(input, init)
              : new Response(null, { status: 403 }),
        }),
      ).rejects.toThrow(/403/);
      expect(await readCrawlJobStatus(join(root, "recovery.json"))).toMatchObject({
        state: "blocked",
        cursor: 0,
      });
      expect(await readCrawlJobStatus(priorityStatusPath)).toBeNull();
      expect(await readCrawlJobStatus(join(root, "status.json"))).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("waits through a bounded access cooldown and resumes the exact checkpoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-job-access-wait-"));
    let clock = Date.parse("2026-10-17T08:00:00Z");
    let entityRequests = 0;
    let waitingStatus: Awaited<ReturnType<typeof readCrawlJobStatus>> = null;
    try {
      const result = await runCrawlJob(tasks.slice(0, 1), {
        ...options(root),
        waitOnSourceCooldown: true,
        delayMs: 60000,
        now: (): number => clock,
        sleep: async (milliseconds: number): Promise<void> => {
          if (milliseconds === 6 * 60 * 60 * 1000)
            waitingStatus = await readCrawlJobStatus(join(root, "status.json"));
          clock += milliseconds;
        },
        fetcher: async (input, init): Promise<Response> => {
          if (String(input).endsWith("robots.txt")) return fetcher(input, init);
          entityRequests++;
          return entityRequests === 1 ? new Response(null, { status: 403 }) : fetcher(input, init);
        },
      });
      expect(waitingStatus).toMatchObject({
        state: "waiting",
        cursor: 0,
        currentKey: "forever-item-1",
        retryAt: "2026-10-17T14:02:00.000Z",
        error: expect.stringMatching(/HTTP 403/),
      });
      expect(entityRequests).toBe(3); // Denied page, successful page, then item XML.
      expect(result).toMatchObject({
        state: "completed",
        cursor: 1,
        currentKey: null,
        retryAt: null,
        error: null,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("resumes recovery before priority/base without changing their existing checkpoints", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-job-recovery-"));
    const controller = new AbortController();
    const priorityStatusPath = join(root, "priority.json"),
      recoveryStatusPath = join(root, "recovery.json");
    try {
      const priority = await runCrawlJob(tasks.slice(2, 3), {
        ...options(root),
        statusPath: priorityStatusPath,
        questXp: true,
      });
      const base = await runCrawlJob(tasks.slice(3), options(root));
      await expect(
        runPriorityCrawlJob(tasks.slice(3), tasks.slice(2, 3), {
          ...options(root),
          priorityStatusPath,
          recovery: { tasks: tasks.slice(0, 2), statusPath: recoveryStatusPath },
          signal: controller.signal,
          onTaskComplete: (): void => controller.abort(new Error("Recovery pause")),
        }),
      ).rejects.toThrow(/Recovery pause/);
      expect((await readCrawlJobStatus(recoveryStatusPath))?.cursor).toBe(1);
      expect(await readCrawlJobStatus(priorityStatusPath)).toEqual(priority);
      expect(await readCrawlJobStatus(join(root, "status.json"))).toEqual(base);
      const order: string[] = [];
      const result = await runPriorityCrawlJob(tasks.slice(3), tasks.slice(2, 3), {
        ...options(root),
        priorityStatusPath,
        recovery: { tasks: tasks.slice(0, 2), statusPath: recoveryStatusPath },
        onTaskStart: (key): void => {
          order.push(key);
        },
      });
      expect(order).toEqual(["forever-item-2"]);
      expect(result.recovery).toMatchObject({ state: "completed", cursor: 2, questXp: true });
      expect(result.priority).toEqual(priority);
      expect(result.base).toEqual(base);
      await expect(
        runPriorityCrawlJob(tasks, tasks, {
          ...options(root),
          priorityStatusPath,
          recovery: { tasks, statusPath: priorityStatusPath },
        }),
      ).rejects.toThrow(/separate/);
      await expect(
        runPriorityCrawlJob(tasks, tasks, {
          ...options(root),
          priorityStatusPath,
          recovery: { tasks, statusPath: join(root, "status.json") },
        }),
      ).rejects.toThrow(/separate/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("serializes priority work before resuming the unchanged base checkpoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "reference-job-priority-"));
    try {
      await expect(
        runCrawlJob(tasks, {
          ...options(root),
          fetcher: async (input, init): Promise<Response> =>
            String(input).includes("item=2")
              ? new Response(null, { status: 403 })
              : fetcher(input, init),
        }),
      ).rejects.toThrow(/403/);
      const before = (await readCrawlJobStatus(join(root, "status.json")))!;
      const order: string[] = [];
      const result = await runPriorityCrawlJob(tasks, tasks.slice(3), {
        ...options(root),
        priorityStatusPath: join(root, "priority.json"),
        onTaskStart: (key): void => {
          order.push(key);
        },
      });
      expect(order.slice(0, 2)).toEqual(["forever-item-4", "forever-item-5"]);
      expect(result.base.queueSha256).toBe(before.queueSha256);
      expect(result.base).toMatchObject({ cursor: 5, counts: { crawled: 3, cached: 2 } });
      expect(result.priority).toMatchObject({ cursor: 2, questXp: true });
      expect(result.base.questXp).toBe(false);
      await expect(
        runPriorityCrawlJob(tasks, tasks, {
          ...options(root),
          priorityStatusPath: join(root, "status.json"),
        }),
      ).rejects.toThrow(/separate/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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
