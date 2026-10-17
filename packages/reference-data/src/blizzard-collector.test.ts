import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectBlizzardQuestXp } from "./blizzard-collector.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Blizzard quest XP collection", () => {
  it("imports usable responses and queues only confirmed gaps for Wowhead", async () => {
    const root = await mkdtemp(join(tmpdir(), "blizzard-quest-"));
    roots.push(root);
    const evidenceDirectory = join(root, "evidence");
    await mkdir(evidenceDirectory);
    const responses = [
      new Response(
        JSON.stringify({ access_token: "temporary", token_type: "bearer", expires_in: 3600 }),
        { status: 200 },
      ),
      new Response(JSON.stringify({ _links: { self: { href: "quest-index" } } }), {
        status: 200,
      }),
      new Response(
        JSON.stringify({
          id: 581,
          title: "Hunt for Yenniku",
          requirements: { min_character_level: 25 },
          rewards: { experience: 2450 },
        }),
        { status: 200 },
      ),
      new Response(JSON.stringify({ code: 404 }), { status: 404 }),
      new Response(JSON.stringify({ id: 582, title: "Metadata only" }), { status: 200 }),
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => responses.shift()!);
    const tasks = [581, 999, 582].map((id) => ({
      game: "forever" as const,
      kind: "quest" as const,
      id,
    }));
    const options = {
      tasks,
      config: {
        clientId: "client123",
        clientSecret: "secret456",
        region: "eu" as const,
        namespace: "static-classic1x-eu",
        locale: "en_US",
      },
      evidenceDirectory,
      delayMs: 0,
      fetcher,
      now: () => Date.parse("2026-10-17T10:00:00.000Z"),
    };
    const result = await collectBlizzardQuestXp(options);
    expect(result.counts).toEqual({
      total: 3,
      available: 1,
      missing: 1,
      missingXp: 1,
      cached: 0,
      fetched: 3,
    });
    expect(result.fallbackTasks.map((task) => task.id)).toEqual([999, 582]);
    expect(result.importResult.set.sourceKind).toBe("blizzard-api");
    expect(result.importResult.set.records).toHaveLength(2);
    expect(result.importResult.set.records[0]).toMatchObject({
      id: 581,
      fullXp: 2450,
      status: "available",
    });
    expect(result.importResult.set.records[1]).toMatchObject({
      id: 582,
      fullXp: null,
      status: "unknown",
    });

    const cached = await collectBlizzardQuestXp({
      ...options,
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("network must not be used")),
    });
    expect(cached.counts).toMatchObject({ cached: 3, fetched: 0 });
  });

  it("does not turn a broad API failure into a Wowhead fallback queue", async () => {
    const root = await mkdtemp(join(tmpdir(), "blizzard-quest-"));
    roots.push(root);
    const evidenceDirectory = join(root, "evidence");
    await mkdir(evidenceDirectory);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "temporary", token_type: "bearer", expires_in: 3600 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 404 }), { status: 404 }));
    await expect(
      collectBlizzardQuestXp({
        tasks: [{ game: "forever", kind: "quest", id: 581 }],
        config: {
          clientId: "client123",
          clientSecret: "secret456",
          region: "eu",
          namespace: "static-classic1x-eu",
          locale: "en_US",
        },
        evidenceDirectory,
        fetcher,
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining("Quest API is unavailable"),
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
