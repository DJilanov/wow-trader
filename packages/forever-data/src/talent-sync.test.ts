import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WowTraderDatabase } from "@wow-trader/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createForeverCapture,
  getPublishedForeverSnapshot,
  importForeverCapture,
} from "./server.js";
import type { ForeverExport } from "./schemas.js";
import type * as ForeverServer from "./server.js";
import { FOREVER_CLASSES } from "./updates.js";
import { syncTalentSnapshot, validateAutomaticTalentCapture } from "./talent-sync.js";

vi.mock("./server.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ForeverServer>()),
  getPublishedForeverSnapshot: vi.fn(),
  importForeverCapture: vi.fn(),
}));
const paths: string[] = [];
afterEach(async (): Promise<void> => {
  vi.resetAllMocks();
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true })));
});
function fixture(): ForeverExport {
  return {
    _readme: "Synthetic update fixture",
    license: "CC-BY-4.0",
    attribution: "Test",
    generated: "2026-10-16",
    talents: Object.fromEntries(
      FOREVER_CLASSES.map((className) => [
        className,
        {
          icon: "class_fixture",
          source: "Synthetic test",
          trees: [0, 1, 2].map((tree) => ({
            name: `Tree ${tree}`,
            bg: 1,
            icon: "class_fixture",
            removed: [],
            talents: Array.from({ length: 13 }, (_, i) => ({
              name: `Talent ${i}`,
              max: 1,
              row: Math.floor(i / 4) + 1,
              col: (i % 4) + 1,
              passive: true,
              icon: "class_fixture",
              desc: ["Synthetic rank"],
              complete: true,
              classic: { status: "same" as const },
            })),
          })),
        },
      ]),
    ),
    spellbooks: Object.fromEntries(
      FOREVER_CLASSES.map((className) => [
        className,
        {
          race: "",
          level: 60,
          seen: "",
          missing: [],
          general: [],
          tabs: [],
          notes: [],
          source: "beta",
          build: "1.60.1.70425",
        },
      ]),
    ),
    spell_desc: {},
    racials: {},
    class_racials: {},
    class_abilities: Object.fromEntries(FOREVER_CLASSES.map((c) => [c, []])),
    legacy: { note: "Synthetic", trees: [] },
    changelog: [],
  };
}
describe("Daily talent publication", () => {
  it("requires complete all-class evidence and rejects backwards or future source generations", () => {
    const capture = createForeverCapture(JSON.stringify(fixture()), { spellbookIcons: {} });
    expect(capture.validation.issues).toEqual([]);
    expect(validateAutomaticTalentCapture(capture, null, new Date("2026-10-16T07:00:00Z"))).toBe(
      "1.60.1.70425",
    );
    expect(() =>
      validateAutomaticTalentCapture(
        capture,
        { generated: "2026-10-17", build: null },
        new Date("2026-10-18T00:00:00Z"),
      ),
    ).toThrow(/backwards/);
    expect(() =>
      validateAutomaticTalentCapture(capture, null, new Date("2026-10-15T00:00:00Z")),
    ).toThrow(/date/);
    const partial = fixture();
    delete partial.talents.Warrior;
    expect(() =>
      validateAutomaticTalentCapture(
        createForeverCapture(JSON.stringify(partial), { spellbookIcons: {} }),
        null,
        new Date("2026-10-16T07:00:00Z"),
      ),
    ).toThrow(/coverage/);
  });
  it("verifies assets before publication and performs no second fetch before the next daily check", async () => {
    const directory = await mkdtemp(join(tmpdir(), "talent-sync-"));
    paths.push(directory);
    const capture = createForeverCapture(JSON.stringify(fixture()), { spellbookIcons: {} });
    const captureSource = vi.fn(async () => capture);
    vi.mocked(getPublishedForeverSnapshot).mockResolvedValue(null);
    const publish = vi.mocked(importForeverCapture).mockImplementation(async () => {
      expect(
        JSON.parse(
          await readFile(join(directory, "assets", capture.checksum, "manifest.json"), "utf8"),
        ),
      ).toMatchObject({ missing: [] });
      return {
        sourceId: "fixture",
        snapshotId: "fixture",
        duplicate: false,
        checksum: capture.checksum,
        published: true,
        validation: capture.validation,
      };
    });
    const options = {
      database: {} as WowTraderDatabase,
      directory,
      assetsDirectory: join(directory, "assets"),
      capture: captureSource,
      now: (): Date => new Date("2026-10-16T07:00:00Z"),
      fetcher: async (): Promise<Response> =>
        new Response(new Uint8Array([255, 216, 255, 217]), {
          headers: { "content-type": "image/jpeg" },
        }),
    };
    const status = await syncTalentSnapshot(options);
    expect(status).toMatchObject({
      checksum: capture.checksum,
      error: null,
      nextCheckAt: "2026-10-17T06:00:00.000Z",
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(await syncTalentSnapshot(options)).toEqual(status);
    expect(captureSource).toHaveBeenCalledTimes(1);
  });
  it("does not publish when assets fail and cleans only its private staging directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "talent-failure-"));
    paths.push(directory);
    vi.mocked(getPublishedForeverSnapshot).mockResolvedValue(null);
    const capture = createForeverCapture(JSON.stringify(fixture()), { spellbookIcons: {} });
    await expect(
      syncTalentSnapshot({
        database: {} as WowTraderDatabase,
        directory,
        assetsDirectory: join(directory, "assets"),
        capture: async () => capture,
        now: (): Date => new Date("2026-10-16T07:00:00Z"),
        fetcher: async (): Promise<Response> => new Response(null, { status: 503 }),
      }),
    ).rejects.toThrow(/incomplete/);
    expect(importForeverCapture).not.toHaveBeenCalled();
    expect(await readdir(join(directory, "assets"))).toEqual([]);
  });
});
