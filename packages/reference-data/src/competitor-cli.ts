#!/usr/bin/env node

import { mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import {
  crawlStillSixtyRecipes,
  downloadStillSixtyPlan,
  parseCompetitorPlan,
  parseCompetitorQueue,
} from "./stillsixty-collector.js";
import { atomicJsonWrite } from "./store.js";

async function main(args: readonly string[]): Promise<void> {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const [command, ...flagTokens] = normalizedArgs;
  if (command === "stillsixty-plan") {
    const flags = parseFlags(flagTokens, new Set(), new Set(["queue", "output"]));
    const queue = parseCompetitorQueue(await readJson(requiredFlag(flags, "queue")));
    const plan = await downloadStillSixtyPlan({ queue });
    const output = resolvePath(requiredFlag(flags, "output"));
    await mkdir(dirname(output), { recursive: true });
    await atomicJsonWrite(output, plan);
    process.stdout.write(
      `${JSON.stringify({ output, summary: plan.summary, rights: plan.rights }, null, 2)}\n`,
    );
    return;
  }
  if (command === "stillsixty-crawl") {
    const flags = parseFlags(
      flagTokens,
      new Set(["all"]),
      new Set(["plan", "staging", "status", "limit", "requests-per-hour"]),
    );
    const all = flags.has("all");
    const limitValue = optionalFlag(flags, "limit");
    if (all === Boolean(limitValue)) {
      throw new Error("Choose exactly one of --limit NUMBER or --all");
    }
    const plan = parseCompetitorPlan(await readJson(requiredFlag(flags, "plan")));
    const requestsPerHour = Number(optionalFlag(flags, "requests-per-hour") ?? "48");
    const status = await crawlStillSixtyRecipes({
      plan,
      stagingDirectory: resolvePath(requiredFlag(flags, "staging")),
      statusPath: resolvePath(requiredFlag(flags, "status")),
      ...(limitValue ? { limit: Number(limitValue) } : {}),
      requestsPerHour,
    });
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return;
  }
  throw new Error(usage());
}

function parseFlags(
  tokens: readonly string[],
  booleanFlags: ReadonlySet<string>,
  valueFlags: ReadonlySet<string>,
): ReadonlyMap<string, string | true> {
  const result = new Map<string, string | true>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (!token.startsWith("--") || token === "--") throw new Error(`Invalid flag: ${token}`);
    const name = token.slice(2);
    if (result.has(name)) throw new Error(`Duplicate flag: --${name}`);
    if (booleanFlags.has(name)) {
      result.set(name, true);
      continue;
    }
    if (!valueFlags.has(name)) throw new Error(`Unknown flag: --${name}`);
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    result.set(name, value);
    index += 1;
  }
  return result;
}

function requiredFlag(flags: ReadonlyMap<string, string | true>, name: string): string {
  const value = optionalFlag(flags, name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function optionalFlag(flags: ReadonlyMap<string, string | true>, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolvePath(path), "utf8")) as unknown;
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(import.meta.dirname, "../../../", path);
}

function usage(): string {
  return [
    "Usage:",
    "  competitor-reference stillsixty-plan --queue QUEUE.json --output PLAN.json",
    "  competitor-reference stillsixty-crawl --plan PLAN.json --staging DIRECTORY --status STATUS.json (--limit NUMBER | --all) [--requests-per-hour 48]",
  ].join("\n");
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(
    `competitor-reference: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
