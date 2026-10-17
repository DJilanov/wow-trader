import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadRobotsPolicyText, ROBOTS_CACHE_TTL_MS } from "./robots-cache.js";

const directories: string[] = [];

afterEach(async (): Promise<void> => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("robots policy cache", () => {
  it("reuses a validated policy until its bounded expiry", async () => {
    const directory = await mkdtemp(join(tmpdir(), "reference-robots-"));
    directories.push(directory);
    const first = Date.parse("2026-10-17T12:00:00Z");
    let fetches = 0;
    const fetchText = async (): Promise<string> => {
      fetches++;
      return `User-agent: *\nAllow: /\n# ${fetches}`;
    };

    await expect(loadRobotsPolicyText(directory, first, fetchText)).resolves.toMatchObject({
      source: "network",
      text: expect.stringContaining("# 1"),
    });
    await expect(
      loadRobotsPolicyText(directory, first + ROBOTS_CACHE_TTL_MS - 1, fetchText),
    ).resolves.toMatchObject({ source: "cache", text: expect.stringContaining("# 1") });
    await expect(
      loadRobotsPolicyText(directory, first + ROBOTS_CACHE_TTL_MS, fetchText),
    ).resolves.toMatchObject({ source: "network", text: expect.stringContaining("# 2") });
    expect(fetches).toBe(2);
  });
});
