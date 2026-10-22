import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storeToolUsage, toolUsageConfig } from "./tool-usage-store";
import { toolUsageAggregateSchema } from "./tool-usage-contract.mjs";
import type { ToolUsageEvent } from "./tool-usage";

let root: string;
const input = {
  schema: "tool-usage.v1",
  build: "test-release",
  action: "market_item_watched",
  edition: "tbc",
  device: "desktop",
} satisfies ToolUsageEvent;
const now = new Date("2026-10-22T12:00:00Z");
beforeEach(async (): Promise<void> => {
  root = await mkdtemp(join(tmpdir(), "helper-tool-usage-"));
  vi.stubEnv("TOOL_USAGE_ENABLED", "true");
  vi.stubEnv("TOOL_USAGE_BUILD", input.build);
  vi.stubEnv("TOOL_USAGE_ROOT", root);
});
afterEach(async (): Promise<void> => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("daily tool action storage", (): void => {
  it("requires explicit opt-in and release configuration", async (): Promise<void> => {
    expect(toolUsageConfig()).toEqual({ root, build: input.build });
    vi.stubEnv("TOOL_USAGE_ENABLED", "false");
    expect(toolUsageConfig()).toBeNull();
    await expect(storeToolUsage(input, now)).rejects.toThrow(/not configured/);
    expect(await readdir(root)).toEqual([]);
  });

  it("serializes concurrent actions, keeps private file permissions, and prunes only expired daily files", async (): Promise<void> => {
    await writeFile(join(root, "2026-07-01.json"), "old");
    const oldestKept = new Date(now.getTime() - 89 * 86_400_000).toISOString().slice(0, 10);
    const oldestRemoved = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
    await writeFile(join(root, `${oldestKept}.json`), "keep at retention boundary");
    await writeFile(join(root, `${oldestRemoved}.json`), "expired");
    await writeFile(join(root, "notes.json"), "keep");
    await mkdir(join(root, "2026-07-02.json"));
    await Promise.all(
      Array.from({ length: 20 }, async (): Promise<void> => storeToolUsage(input, now)),
    );
    const file = join(root, "2026-10-22.json");
    const aggregate = toolUsageAggregateSchema.parse(
      JSON.parse(await readFile(file, "utf8")) as unknown,
    );
    expect(Object.values(aggregate.groups)[0]?.count).toBe(20);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readdir(root)).toEqual(
      expect.arrayContaining(["2026-07-02.json", "notes.json", "2026-10-22.json"]),
    );
    expect(await readdir(root)).not.toContain("2026-07-01.json");
    expect(await readdir(root)).toContain(`${oldestKept}.json`);
    expect(await readdir(root)).not.toContain(`${oldestRemoved}.json`);
    expect(await readdir(root)).not.toContain(".writer-lock");
  });

  it("fails closed on corrupt data or symlinks and leaves the existing data intact", async (): Promise<void> => {
    const file = join(root, "2026-10-22.json");
    await writeFile(file, "broken");
    await expect(storeToolUsage(input, now)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe("broken");
    expect(await readdir(root)).not.toContain(".writer-lock");
    await rm(file);
    const target = join(root, "private.json");
    await writeFile(target, "do not change");
    await symlink(target, file);
    await expect(storeToolUsage(input, now)).rejects.toThrow(/Invalid tool usage/);
    expect(await readFile(target, "utf8")).toBe("do not change");
  });

  it("does not steal another process's writer lock", async (): Promise<void> => {
    await mkdir(join(root, ".writer-lock"));
    await expect(storeToolUsage(input, now)).rejects.toThrow(/lock is unavailable/);
    expect(await readdir(root)).toEqual([".writer-lock"]);
  });

  it("coordinates independent writers through the directory lock", async (): Promise<void> => {
    vi.resetModules();
    const { storeToolUsage: independentWriter } = await import("./tool-usage-store");
    await Promise.all(
      Array.from({ length: 20 }, async (_, index): Promise<void> =>
        (index % 2 ? independentWriter : storeToolUsage)(input, now),
      ),
    );
    const value = toolUsageAggregateSchema.parse(
      JSON.parse(await readFile(join(root, "2026-10-22.json"), "utf8")) as unknown,
    );
    expect(Object.values(value.groups)[0]?.count).toBe(20);
    expect(await readdir(root)).not.toContain(".writer-lock");
  });
});
