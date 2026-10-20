import { mkdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { setPriority } from "node:os";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { referenceQualityGaps, referenceTaskSchema, type ReferenceTask } from "./contracts.js";
import { crawlListings, crawlReferences } from "./crawler.js";
import { listingTaskSchema } from "./listing-contracts.js";
import { publishReferences, readStagedReference } from "./store.js";
import { atomicJsonWrite } from "./store.js";
import { seedFromHelperSitemaps } from "./seeds.js";
import { readCrawlJobStatus, runCrawlJob, runPriorityCrawlJob } from "./job.js";
import {
  MAX_REQUESTS_PER_WINDOW,
  readRequestPacing,
  REQUEST_WINDOW_MS,
  SourceCooldownError,
} from "./pacing.js";
import { buildQuestXpImport, IMPORT_SOURCE_KINDS } from "./quest-xp-import.js";
import { importSavedHtml } from "./manual-capture.js";
import { probeSource } from "./probe.js";
import {
  blizzardApiConfigFromEnvironment,
  requestBlizzardAccessToken,
  requestBlizzardQuest,
} from "./blizzard-api.js";
import { collectBlizzardQuestXp } from "./blizzard-collector.js";
import { collectQuestieQuestXp } from "./questie-collector.js";
import { parseQuestieTocRevision } from "./questie-source.js";
import { latestChallengeReport } from "./challenge-evidence.js";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../..");

function loadBlizzardEnvironment(): void {
  for (const filename of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(resolve(REPOSITORY_ROOT, filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (process.env.BLIZZARD_CLIENT_ID && process.env.BLIZZARD_CLIENT_SECRET) return;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await atomicJsonWrite(path, value);
}

async function readBoundedText(path: string, maximumBytes: number, label: string): Promise<string> {
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error(`${label} is not a file`);
  if (metadata.size > maximumBytes) throw new Error(`${label} exceeds its size budget`);
  const source = await readFile(path, "utf8");
  if (Buffer.byteLength(source) > maximumBytes) throw new Error(`${label} exceeds its size budget`);
  return source;
}

async function readOptionalBoundedText(
  path: string,
  maximumBytes: number,
  label: string,
): Promise<string | null> {
  try {
    return await readBoundedText(path, maximumBytes, label);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function operatorPath(path: string): string {
  return resolve(REPOSITORY_ROOT, path);
}

async function readLevelingQueue(path: string): Promise<ReferenceTask[]> {
  if ((await stat(path)).size > 32000000) throw new Error("Leveling queue too large");
  const tasks = z
    .array(referenceTaskSchema)
    .min(1)
    .max(10000)
    .parse(JSON.parse(await readFile(path, "utf8")));
  if (tasks.some((task) => task.game !== "forever" || task.kind !== "quest"))
    throw new Error("Leveling queues accept Forever quests only.");
  return tasks;
}

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
      "delay-min-ms": { type: "string" },
      "delay-max-ms": { type: "string" },
      "browsertrix-screencast-port": { type: "string" },
      profile: { type: "string" },
      "save-profile": { type: "boolean" },
      force: { type: "boolean" },
      "captured-at": { type: "string" },
      "proxy-server": { type: "string" },
      "add-host": { type: "string", multiple: true },
      network: { type: "string" },
      "extra-chrome-arg": { type: "string", multiple: true },
      "user-agent-suffix": { type: "string" },
      open: { type: "boolean" },
      browser: { type: "string" },
      refresh: { type: "boolean" },
      "quest-xp": { type: "boolean" },
      "priority-queue": { type: "string" },
      "priority-status": { type: "string" },
      "recovery-queue": { type: "string" },
      "recovery-status": { type: "string" },
      "archive-queue": { type: "string" },
      "archive-status": { type: "string" },
      approve: { type: "boolean" },
      sitemap: { type: "string", multiple: true },
      game: { type: "string" },
      kind: { type: "string" },
      ids: { type: "string" },
      status: { type: "string" },
      "batch-size": { type: "string" },
      "min-free-disk-mb": { type: "string" },
      "max-staging-mb": { type: "string" },
      "wait-on-source-cooldown": { type: "boolean" },
      input: { type: "string" },
      output: { type: "string" },
      format: { type: "string" },
      revision: { type: "string" },
      "source-ref": { type: "string" },
      "source-kind": { type: "string" },
      url: { type: "string" },
      "quest-id": { type: "string" },
      "evidence-directory": { type: "string" },
      "fallback-queue": { type: "string" },
      "excluded-queue": { type: "string" },
      "filter-report": { type: "string" },
      "questie-root": { type: "string" },
      "target-flavor": { type: "string" },
      namespace: { type: "string" },
      region: { type: "string" },
      locale: { type: "string" },
    },
  });
  const command = positionals[0];
  if (
    Boolean(values["recovery-queue"]) !== Boolean(values["recovery-status"]) ||
    ((values["recovery-queue"] || values["recovery-status"]) && command !== "crawl-priority")
  )
    throw new Error("Recovery requires crawl-priority and a separate queue/checkpoint pair.");
  if (
    Boolean(values["archive-queue"]) !== Boolean(values["archive-status"]) ||
    ((values["archive-queue"] || values["archive-status"]) && command !== "crawl-priority")
  )
    throw new Error(
      "Archive collection requires crawl-priority and a separate queue/checkpoint pair.",
    );
  if (command === "challenge-report") {
    if (!values.staging) throw new Error("challenge-report requires --staging");
    if (values.browser && !values.open) throw new Error("--browser requires --open");
    const report = await latestChallengeReport(operatorPath(values.staging));
    if (!report) throw new Error("No saved challenge report exists");
    if (values.open) await openLocalFile(report, values.browser);
    console.log(JSON.stringify({ report, opened: values.open ?? false }));
    return;
  }
  if (command === "status") {
    if (!values.status) throw new Error("Status requires --status file");
    const status = await readCrawlJobStatus(values.status);
    if (!status) throw new Error("No crawl checkpoint exists yet");
    const pacing = values.staging ? await readRequestPacing(operatorPath(values.staging)) : null;
    const pacingStatus = pacing
      ? {
          delayMs: pacing.delayMs,
          maximumRequestsPerHour: MAX_REQUESTS_PER_WINDOW,
          maximumRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
          rollingWindowMs: REQUEST_WINDOW_MS,
          requestsInCurrentWindow: pacing.requestTimestamps.filter(
            (requestedAt) => requestedAt > Date.now() - REQUEST_WINDOW_MS,
          ).length,
          lastRequestedAt: new Date(pacing.lastRequestedAt).toISOString(),
          notBefore: new Date(pacing.notBefore).toISOString(),
        }
      : null;
    console.log(
      JSON.stringify({
        ...status,
        ...(pacingStatus ? { requestPacing: pacingStatus } : {}),
      }),
    );
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
      throw new Error("No item/quest/spell seeds; supply --sitemap files or --kind and --ids");
    await atomicJsonWrite(operatorPath(values.queue), tasks);
    console.log(JSON.stringify({ seeded: tasks.length }));
    return;
  }
  if (command === "import-quest-xp") {
    if (!values.input || !values.output || !values["source-ref"] || !values.revision)
      throw new Error("import-quest-xp requires --input, --output, --source-ref and --revision");
    const format = z.enum(["csv", "json"]).parse(values.format ?? "csv");
    const game = z.enum(["tbc", "forever"]).parse(values.game ?? "forever");
    const sourceKind = z
      .enum(IMPORT_SOURCE_KINDS)
      .parse(values["source-kind"] ?? "operator-export");
    const knownIds = values.queue
      ? new Set((await readLevelingQueue(values.queue)).map((task) => task.id))
      : undefined;
    const result = await buildQuestXpImport({
      input: await readFile(values.input, "utf8"),
      format,
      game,
      sourceKind,
      sourceRef: values["source-ref"],
      revision: values.revision,
      ...(knownIds ? { knownIds } : {}),
      ...(values.staging ? { stagedDirectory: values.staging } : {}),
    });
    await atomicJsonWrite(values.output, result.set);
    console.log(JSON.stringify({ ...result.report, output: values.output }));
    return;
  }
  if (command === "import-saved-html") {
    if (!values.input || !values.staging || !values["permission-ref"])
      throw new Error("import-saved-html requires --input, --staging and --permission-ref");
    const result = await importSavedHtml({
      input: operatorPath(values.input),
      staging: operatorPath(values.staging),
      permissionRef: values["permission-ref"],
      ...(values.force ? { force: true } : {}),
      ...(values["captured-at"] ? { capturedAt: values["captured-at"] } : {}),
    });
    if (values.output) await writeJson(operatorPath(values.output), result);
    console.log(JSON.stringify(result));
    return;
  }
  if (command === "crawl-listings") {
    if (!values.queue || !values.staging || !values["permission-ref"])
      throw new Error("crawl-listings requires --queue, --staging and --permission-ref");
    const queuePath = operatorPath(values.queue);
    if ((await stat(queuePath)).size > 32000000)
      throw new Error("Listing queue exceeds size budget");
    const listingTasks = z
      .array(listingTaskSchema)
      .min(1)
      .max(100)
      .parse(JSON.parse(await readFile(queuePath, "utf8")));
    console.log(
      JSON.stringify(
        await crawlListings(listingTasks, {
          directory: operatorPath(values.staging),
          permissionRef: values["permission-ref"],
          ...(values.limit ? { limit: Number(values.limit) } : {}),
          ...(values["delay-ms"] ? { delayMs: Number(values["delay-ms"]) } : {}),
          ...(values["delay-min-ms"] ? { delayMinMs: Number(values["delay-min-ms"]) } : {}),
          ...(values["delay-max-ms"] ? { delayMaxMs: Number(values["delay-max-ms"]) } : {}),
          ...(values["browsertrix-screencast-port"]
            ? { browsertrixScreencastPort: Number(values["browsertrix-screencast-port"]) }
            : {}),
          ...(values.profile ? { browsertrixProfile: values.profile } : {}),
          ...(values["save-profile"] ? { browsertrixSaveProfile: true } : {}),
          ...(values["proxy-server"] ? { browsertrixProxy: values["proxy-server"] } : {}),
          ...(values["add-host"]?.length ? { browsertrixAddHosts: values["add-host"] } : {}),
          ...(values.network ? { browsertrixNetwork: values.network } : {}),
          ...(values["extra-chrome-arg"]?.length
            ? { browsertrixExtraChromeArgs: values["extra-chrome-arg"] }
            : {}),
          ...(values["user-agent-suffix"] !== undefined
            ? { browsertrixUserAgentSuffix: values["user-agent-suffix"] }
            : {}),
          ...(values["wait-on-source-cooldown"] ? { waitOnSourceCooldown: true } : {}),
          refresh: values.refresh ?? false,
          onProgress: (key: string, gaps: readonly string[]): void => {
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
    return;
  }
  if (command === "probe") {
    if (!values.url || !values.staging || !values.output)
      throw new Error("probe requires --url, --staging and --output");
    try {
      const evidence = await probeSource({
        directory: operatorPath(values.staging),
        url: values.url,
        ...(values["delay-ms"] ? { delayMs: Number(values["delay-ms"]) } : {}),
      });
      await atomicJsonWrite(values.output, evidence);
      console.log(JSON.stringify(evidence));
    } catch (error) {
      if (!(error instanceof SourceCooldownError)) throw error;
      console.log(
        JSON.stringify({
          state: "waiting",
          retryAt: new Date(error.retryAt).toISOString(),
          reason: error.message,
        }),
      );
      process.exitCode = 2;
    }
    return;
  }
  if (command === "questie-quest-xp") {
    if (
      !values.queue ||
      !values.output ||
      !values["fallback-queue"] ||
      !values["excluded-queue"] ||
      !values["filter-report"] ||
      !values["questie-root"]
    )
      throw new Error(
        "questie-quest-xp requires --queue, --questie-root, --output, --fallback-queue, --excluded-queue and --filter-report",
      );
    const targetFlavor = z.literal("forever").parse(values["target-flavor"] ?? "forever");
    const questieRoot = operatorPath(values["questie-root"]);
    const xpReference = "QuestieDB/support/Forever/QuestXP/xpDB-classic.lua";
    const sodReference = "QuestieDB/src/corrections/Sod/sodBaseQuests.lua";
    const xpSource = await readBoundedText(
      resolve(questieRoot, "support/Forever/QuestXP/xpDB-classic.lua"),
      2_500_000,
      "Questie XP source",
    );
    const sodQuestSource = await readBoundedText(
      resolve(questieRoot, "src/corrections/Sod/sodBaseQuests.lua"),
      8_000_000,
      "Questie SoD quest source",
    );
    const tocSource =
      (await readOptionalBoundedText(
        resolve(questieRoot, "QuestieDB_Forever.toc"),
        64_000_000,
        "QuestieDB Forever TOC",
      )) ??
      (await readOptionalBoundedText(
        resolve(questieRoot, "QuestieDB.toc"),
        2_000_000,
        "QuestieDB source TOC",
      ));
    const revision =
      values.revision ??
      (tocSource ? parseQuestieTocRevision(tocSource) : null) ??
      `sha256:${createHash("sha256").update(xpSource).digest("hex")}`;
    const queue = operatorPath(values.queue);
    const output = operatorPath(values.output);
    const fallbackQueue = operatorPath(values["fallback-queue"]);
    const excludedQueue = operatorPath(values["excluded-queue"]);
    const filterReport = operatorPath(values["filter-report"]);
    const staging = values.staging ? operatorPath(values.staging) : undefined;
    const result = await collectQuestieQuestXp({
      tasks: await readLevelingQueue(queue),
      xpSource,
      sodQuestSource,
      sourceRef: values["source-ref"] ?? xpReference,
      sodSourceRef: sodReference,
      revision,
      targetFlavor,
      ...(staging ? { stagedDirectory: staging } : {}),
    });
    await writeJson(output, result.importResult.set);
    await writeJson(fallbackQueue, result.fallbackTasks);
    await writeJson(
      excludedQueue,
      result.exclusions.map((entry) => entry.task),
    );
    await writeJson(filterReport, result.report);
    console.log(
      JSON.stringify({
        ...result.counts,
        conflicts: result.importResult.report.conflicts,
        output,
        fallbackQueue,
        excludedQueue,
        filterReport,
      }),
    );
    return;
  }
  if (command === "blizzard-probe") {
    if (!values["quest-id"] || !values.output)
      throw new Error("blizzard-probe requires --quest-id and --output");
    loadBlizzardEnvironment();
    const config = blizzardApiConfigFromEnvironment(process.env, {
      ...(values.region ? { region: values.region } : {}),
      ...(values.namespace ? { namespace: values.namespace } : {}),
      ...(values.locale ? { locale: values.locale } : {}),
    });
    const accessToken = await requestBlizzardAccessToken(config);
    const evidence = await requestBlizzardQuest({
      questId: Number(values["quest-id"]),
      accessToken,
      region: config.region,
      namespace: config.namespace,
      locale: config.locale,
    });
    const output = operatorPath(values.output);
    await writeJson(output, evidence);
    console.log(
      JSON.stringify({
        questId: evidence.questId,
        outcome: evidence.outcome,
        responseStatus: evidence.responseStatus,
        fullXp: evidence.fullXp,
        output,
      }),
    );
    return;
  }
  if (command === "blizzard-quest-xp") {
    if (
      !values.queue ||
      !values.output ||
      !values["fallback-queue"] ||
      !values["evidence-directory"]
    )
      throw new Error(
        "blizzard-quest-xp requires --queue, --output, --fallback-queue and --evidence-directory",
      );
    loadBlizzardEnvironment();
    const config = blizzardApiConfigFromEnvironment(process.env, {
      ...(values.region ? { region: values.region } : {}),
      ...(values.namespace ? { namespace: values.namespace } : {}),
      ...(values.locale ? { locale: values.locale } : {}),
    });
    const queue = operatorPath(values.queue);
    const output = operatorPath(values.output);
    const fallbackQueue = operatorPath(values["fallback-queue"]);
    const evidenceDirectory = operatorPath(values["evidence-directory"]);
    const staging = values.staging ? operatorPath(values.staging) : undefined;
    const tasks = await readLevelingQueue(queue);
    await mkdir(evidenceDirectory, { recursive: true });
    const result = await collectBlizzardQuestXp({
      tasks,
      config,
      evidenceDirectory,
      ...(values["delay-ms"] ? { delayMs: Number(values["delay-ms"]) } : {}),
      ...(values.refresh ? { refresh: true } : {}),
      ...(staging ? { stagedDirectory: staging } : {}),
      onProgress: (evidence, cached): void =>
        console.log(
          JSON.stringify({
            questId: evidence.questId,
            outcome: evidence.outcome,
            cached,
          }),
        ),
    });
    await writeJson(output, result.importResult.set);
    await writeJson(fallbackQueue, result.fallbackTasks);
    console.log(
      JSON.stringify({
        ...result.counts,
        conflicts: result.importResult.report.conflicts,
        output,
        fallbackQueue,
      }),
    );
    return;
  }
  if (!values.queue || !values.staging)
    throw new Error(
      "Usage: reference <crawl|crawl-all|report|publish> --queue file --staging directory [--status file --permission-ref reference | --approve --destination directory]",
    );
  const queuePath = operatorPath(values.queue);
  if ((await stat(queuePath)).size > 32000000) throw new Error("Queue exceeds size budget");
  const tasks = z
    .array(referenceTaskSchema)
    .min(1)
    .max(250000)
    .parse(JSON.parse(await readFile(queuePath, "utf8")));
  if (command === "crawl-all" || command === "crawl-priority") {
    if (!values.status || !values["permission-ref"])
      throw new Error("Full crawl requires --status and --permission-ref");
    setPriority(0, 10);
    const controller = new AbortController();
    const stop = (): void => controller.abort(new Error("Crawl interrupted by operator"));
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
      const options = {
        directory: operatorPath(values.staging),
        statusPath: operatorPath(values.status),
        permissionRef: values["permission-ref"],
        signal: controller.signal,
        refresh: values.refresh ?? false,
        questXp: values["quest-xp"] ?? false,
        waitOnSourceCooldown: values["wait-on-source-cooldown"] ?? false,
        ...(values["batch-size"] ? { batchSize: Number(values["batch-size"]) } : {}),
        ...(values["delay-ms"] ? { delayMs: Number(values["delay-ms"]) } : {}),
        ...(values["delay-min-ms"] ? { delayMinMs: Number(values["delay-min-ms"]) } : {}),
        ...(values["delay-max-ms"] ? { delayMaxMs: Number(values["delay-max-ms"]) } : {}),
        ...(values["browsertrix-screencast-port"]
          ? { browsertrixScreencastPort: Number(values["browsertrix-screencast-port"]) }
          : {}),
        ...(values.profile ? { browsertrixProfile: values.profile } : {}),
        ...(values["save-profile"] ? { browsertrixSaveProfile: true } : {}),
        ...(values["proxy-server"] ? { browsertrixProxy: values["proxy-server"] } : {}),
        ...(values["add-host"]?.length ? { browsertrixAddHosts: values["add-host"] } : {}),
        ...(values.network ? { browsertrixNetwork: values.network } : {}),
        ...(values["extra-chrome-arg"]?.length
          ? { browsertrixExtraChromeArgs: values["extra-chrome-arg"] }
          : {}),
        ...(values["user-agent-suffix"] !== undefined
          ? { browsertrixUserAgentSuffix: values["user-agent-suffix"] }
          : {}),
        ...(values["min-free-disk-mb"]
          ? { minFreeDiskBytes: Number(values["min-free-disk-mb"]) * 1024 ** 2 }
          : {}),
        ...(values["max-staging-mb"]
          ? { maxStagingBytes: Number(values["max-staging-mb"]) * 1024 ** 2 }
          : {}),
        onProgress: (key: string, gaps: readonly string[]): void =>
          console.log(
            JSON.stringify({ key, status: gaps.length ? "incomplete" : "ready_for_review", gaps }),
          ),
      };
      if (command === "crawl-priority") {
        if (!values["priority-queue"] || !values["priority-status"] || values.refresh)
          throw new Error(
            "Priority crawl requires separate queue/checkpoint and no global refresh.",
          );
        const priority = await readLevelingQueue(values["priority-queue"]);
        let recovery: { tasks: typeof priority; statusPath: string } | undefined;
        if (values["recovery-queue"] && values["recovery-status"]) {
          const tasks = await readLevelingQueue(values["recovery-queue"]);
          recovery = { tasks, statusPath: values["recovery-status"] };
        }
        const archive =
          values["archive-queue"] && values["archive-status"]
            ? {
                tasks: await readLevelingQueue(values["archive-queue"]),
                statusPath: values["archive-status"],
              }
            : undefined;
        console.log(
          JSON.stringify(
            await runPriorityCrawlJob(tasks, priority, {
              ...options,
              priorityStatusPath: values["priority-status"],
              ...(recovery ? { recovery } : {}),
              ...(archive ? { archive } : {}),
            }),
          ),
        );
        return;
      }
      console.log(JSON.stringify(await runCrawlJob(tasks, options)));
    } finally {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    }
  } else if (command === "crawl") {
    if (!values["permission-ref"]) throw new Error("--permission-ref is required");
    console.log(
      JSON.stringify(
        await crawlReferences(tasks, {
          directory: operatorPath(values.staging),
          permissionRef: values["permission-ref"],
          questXp: values["quest-xp"] ?? false,
          ...(values.limit ? { limit: Number(values.limit) } : {}),
          ...(values["delay-ms"] ? { delayMs: Number(values["delay-ms"]) } : {}),
          ...(values["delay-min-ms"] ? { delayMinMs: Number(values["delay-min-ms"]) } : {}),
          ...(values["delay-max-ms"] ? { delayMaxMs: Number(values["delay-max-ms"]) } : {}),
          ...(values["browsertrix-screencast-port"]
            ? { browsertrixScreencastPort: Number(values["browsertrix-screencast-port"]) }
            : {}),
          ...(values.profile ? { browsertrixProfile: values.profile } : {}),
          ...(values["save-profile"] ? { browsertrixSaveProfile: true } : {}),
          ...(values["proxy-server"] ? { browsertrixProxy: values["proxy-server"] } : {}),
          ...(values["add-host"]?.length ? { browsertrixAddHosts: values["add-host"] } : {}),
          ...(values.network ? { browsertrixNetwork: values.network } : {}),
          ...(values["extra-chrome-arg"]?.length
            ? { browsertrixExtraChromeArgs: values["extra-chrome-arg"] }
            : {}),
          ...(values["user-agent-suffix"] !== undefined
            ? { browsertrixUserAgentSuffix: values["user-agent-suffix"] }
            : {}),
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
      const record = await readStagedReference(operatorPath(values.staging), task);
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
        published: await publishReferences(
          operatorPath(values.staging),
          operatorPath(values.destination),
          tasks,
        ),
      }),
    );
  } else
    throw new Error(
      "Unknown command; choose seed, crawl, crawl-all, crawl-listings, crawl-priority, challenge-report, import-quest-xp, questie-quest-xp, probe, blizzard-probe, blizzard-quest-xp, status, report, or publish",
    );
}

async function openLocalFile(path: string, browser?: string): Promise<void> {
  const selectedBrowser = browser?.trim();
  if (
    browser !== undefined &&
    (!selectedBrowser || selectedBrowser.length > 200 || browser.includes("\0"))
  )
    throw new Error("Invalid browser application name");
  const command =
    process.platform === "darwin"
      ? {
          executable: "open",
          arguments: selectedBrowser ? ["-a", selectedBrowser, path] : [path],
        }
      : process.platform === "win32"
        ? selectedBrowser
          ? { executable: selectedBrowser, arguments: [path] }
          : { executable: "explorer.exe", arguments: [path] }
        : selectedBrowser
          ? { executable: selectedBrowser, arguments: [path] }
          : { executable: "xdg-open", arguments: [path] };
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command.executable, command.arguments, {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolvePromise();
    });
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Reference operation failed");
  process.exitCode = 1;
});
