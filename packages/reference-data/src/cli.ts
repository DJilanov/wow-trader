import { readFile, stat } from "node:fs/promises";
import { setPriority } from "node:os";
import { parseArgs } from "node:util";
import { z } from "zod";
import { referenceQualityGaps, referenceTaskSchema } from "./contracts.js";
import { crawlReferences } from "./crawler.js";
import { publishReferences, readStagedReference } from "./store.js";
import { atomicJsonWrite } from "./store.js";
import { seedFromHelperSitemaps } from "./seeds.js";
import { readCrawlJobStatus, runCrawlJob } from "./job.js";
import { readRequestPacing } from "./pacing.js";

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      queue: { type: "string" },
      staging: { type: "string" },
      destination: { type: "string" },
      "permission-ref": { type: "string" },
      limit: { type: "string" },
      "delay-ms": { type: "string" },
      refresh: { type: "boolean" },
      approve: { type: "boolean" },
      sitemap: { type: "string", multiple: true },
      game: { type: "string" },
      kind: { type: "string" },
      ids: { type: "string" },
      status: { type: "string" },
      "batch-size": { type: "string" },
      "min-free-disk-mb": { type: "string" },
      "max-staging-mb": { type: "string" },
    },
  });
  const command = positionals[0];
  if (command === "status") {
    if (!values.status) throw new Error("Status requires --status file");
    const status = await readCrawlJobStatus(values.status);
    if (!status) throw new Error("No crawl checkpoint exists yet");
    const pacing = values.staging ? await readRequestPacing(values.staging) : null;
    console.log(JSON.stringify({
      ...status,
      ...(pacing ? { requestPacing: {
        delayMs: pacing.delayMs,
        maximumRequestsPerHour: Math.floor(3600000 / pacing.delayMs),
        lastRequestedAt: new Date(pacing.lastRequestedAt).toISOString(),
        notBefore: new Date(pacing.notBefore).toISOString(),
      } } : {}),
    }));
    return;
  }
  if (command === "seed") {
    const game = z.enum(["tbc", "forever"]).parse(values.game);
    if (!values.queue) throw new Error("Seed requires --queue and --game");
    const tasks = values.ids
      ? values.ids
          .split(",")
          .map((id) => referenceTaskSchema.parse({ game, kind: values.kind, id: Number(id) }))
      : await seedFromHelperSitemaps(values.sitemap ?? [], game);
    if (!tasks.length)
      throw new Error("No item/quest seeds; supply --sitemap files or --kind and --ids");
    await atomicJsonWrite(values.queue, tasks);
    console.log(JSON.stringify({ seeded: tasks.length }));
    return;
  }
  if (!values.queue || !values.staging)
    throw new Error(
      "Usage: reference <crawl|crawl-all|report|publish> --queue file --staging directory [--status file --permission-ref reference | --approve --destination directory]",
    );
  if ((await stat(values.queue)).size > 32000000) throw new Error("Queue exceeds size budget");
  const tasks = z
    .array(referenceTaskSchema)
    .min(1)
    .max(250000)
    .parse(JSON.parse(await readFile(values.queue, "utf8")));
  if (command === "crawl-all") {
    if (!values.status || !values["permission-ref"])
      throw new Error("Full crawl requires --status and --permission-ref");
    setPriority(0, 10);
    const controller = new AbortController();
    const stop = (): void => controller.abort(new Error("Crawl interrupted by operator"));
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
      console.log(
        JSON.stringify(
          await runCrawlJob(tasks, {
            directory: values.staging,
            statusPath: values.status,
            permissionRef: values["permission-ref"],
            signal: controller.signal,
            refresh: values.refresh ?? false,
            ...(values["batch-size"] ? { batchSize: Number(values["batch-size"]) } : {}),
            ...(values["delay-ms"] ? { delayMs: Number(values["delay-ms"]) } : {}),
            ...(values["min-free-disk-mb"]
              ? { minFreeDiskBytes: Number(values["min-free-disk-mb"]) * 1024 ** 2 }
              : {}),
            ...(values["max-staging-mb"]
              ? { maxStagingBytes: Number(values["max-staging-mb"]) * 1024 ** 2 }
              : {}),
            onProgress: (key, gaps): void =>
              console.log(
                JSON.stringify({
                  key,
                  status: gaps.length ? "incomplete" : "ready_for_review",
                  gaps,
                }),
              ),
          }),
        ),
      );
    } finally {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    }
  } else if (command === "crawl") {
    if (!values["permission-ref"]) throw new Error("--permission-ref is required");
    console.log(
      JSON.stringify(
        await crawlReferences(tasks, {
          directory: values.staging,
          permissionRef: values["permission-ref"],
          ...(values.limit ? { limit: Number(values.limit) } : {}),
          ...(values["delay-ms"] ? { delayMs: Number(values["delay-ms"]) } : {}),
          refresh: values.refresh ?? false,
          onProgress: (key, gaps): void => {
            console.log(
              JSON.stringify({
                key,
                status: gaps.length ? "incomplete" : "ready_for_review",
                gaps,
              }),
            );
          },
        }),
      ),
    );
  } else if (command === "report") {
    for (const task of tasks) {
      const record = await readStagedReference(values.staging, task);
      console.log(
        JSON.stringify({
          ...task,
          status: record ? "staged" : "missing",
          gaps: record ? referenceQualityGaps(record) : ["not_crawled"],
        }),
      );
    }
  } else if (command === "publish") {
    if (!values.approve || !values.destination)
      throw new Error(
        "Publishing requires --approve and --destination after reviewing the selected queue",
      );
    console.log(
      JSON.stringify({
        published: await publishReferences(values.staging, values.destination, tasks),
      }),
    );
  } else
    throw new Error("Unknown command; choose seed, crawl, crawl-all, status, report, or publish");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Reference operation failed");
  process.exitCode = 1;
});
