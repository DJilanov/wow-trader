import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReferenceRecord } from "@wow-trader/reference-data";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCatalogReference,
  getIndexableReferenceIds,
  itemReferenceMatchesClient,
} from "./catalog-reference";

afterEach((): void => {
  vi.unstubAllEnvs();
});

function fixture(): ReferenceRecord {
  return {
    schema: "wowhead-reference.v1",
    game: "forever",
    kind: "item",
    id: 25,
    name: "Test Sword",
    sourceUrl: "https://www.wowhead.com/forever/item=25/test-sword",
    capturedAt: new Date().toISOString(),
    permissionRef: "unit-test",
    sourceSha256: "a".repeat(64),
    tooltipLines: ["Test Sword", "Item Level 2", "1 - 3 Damage"],
    numericFacts: { classId: 2, subclassId: 7, reqlevel: 1 },
    quickFacts: [],
    objectives: [],
    description: "",
    rewards: [],
    relations: [{ relation: "sold-by", kind: "npc", id: 1, name: "Vendor" }],
  };
}

describe("published catalog reference gate", () => {
  it("holds every record when no published directory is configured", async () => {
    vi.stubEnv("WOW_TRADER_REFERENCE_DIRECTORY", "");
    expect(await getCatalogReference("forever", "item", 25)).toBeNull();
    expect((await getIndexableReferenceIds("forever", "item")).size).toBe(0);
  });

  it("rejects known identity, classification and requirement conflicts", () => {
    const item = { itemId: 25, name: "Test Sword", classId: 2, subclassId: 7, requiredLevel: 1 };
    expect(itemReferenceMatchesClient(fixture(), item)).toBe(true);
    expect(itemReferenceMatchesClient(fixture(), { ...item, requiredLevel: 0 })).toBe(true);
    expect(itemReferenceMatchesClient(null, item)).toBe(false);
    expect(itemReferenceMatchesClient(fixture(), { ...item, name: "Other Sword" })).toBe(false);
    expect(itemReferenceMatchesClient(fixture(), { ...item, classId: 4 })).toBe(false);
    expect(itemReferenceMatchesClient(fixture(), { ...item, requiredLevel: 20 })).toBe(false);
  });

  it("includes only fresh, complete, checksum-valid files of the requested edition in sitemaps", async () => {
    const root = await mkdtemp(join(tmpdir(), "helper-reference-"));
    vi.stubEnv("WOW_TRADER_REFERENCE_DIRECTORY", root);
    const log = vi.spyOn(console, "error").mockImplementation((): void => {});
    try {
      await mkdir(join(root, "records"));
      const valid = fixture();
      const invalid = {
        ...valid,
        id: 26,
        sourceUrl: "https://www.wowhead.com/forever/item=26",
        relations: [],
      };
      const stale = {
        ...valid,
        id: 27,
        sourceUrl: "https://www.wowhead.com/forever/item=27",
        capturedAt: "2020-01-01T00:00:00.000Z",
      };
      const corrupted = { ...valid, id: 28, sourceUrl: "https://www.wowhead.com/forever/item=28" };
      const entries = [];
      for (const record of [valid, invalid, stale, corrupted]) {
        const contents = JSON.stringify(record);
        const sha256 = createHash("sha256").update(contents).digest("hex");
        await writeFile(
          join(root, "records", `${sha256}.json`),
          record.id === 28 ? "{}" : contents,
        );
        entries.push({
          game: record.game,
          kind: record.kind,
          id: record.id,
          capturedAt: record.capturedAt,
          sha256,
        });
      }
      await writeFile(
        join(root, "index.json"),
        JSON.stringify({
          schema: "wowhead-reference-index.v1",
          publishedAt: new Date().toISOString(),
          records: entries,
        }),
      );
      expect((await getCatalogReference("forever", "item", 25))?.name).toBe("Test Sword");
      expect((await getCatalogReference("forever", "item", 26))?.relations).toEqual([]);
      expect(await getCatalogReference("forever", "item", 28)).toBeNull();
      expect([...(await getIndexableReferenceIds("forever", "item")).keys()]).toEqual([25]);
      const identity = {
        itemId: 25,
        name: "Test Sword",
        classId: 2,
        subclassId: 7,
        requiredLevel: 1,
      };
      expect([
        ...(await getIndexableReferenceIds("forever", "item", { items: [identity] })).keys(),
      ]).toEqual([25]);
      expect(
        (
          await getIndexableReferenceIds("forever", "item", {
            items: [{ ...identity, name: "New client name" }],
          })
        ).size,
      ).toBe(0);
      expect(
        (
          await getIndexableReferenceIds("forever", "item", {
            items: [{ ...identity, classId: 4 }],
          })
        ).size,
      ).toBe(0);
      expect((await getIndexableReferenceIds("tbc", "item")).size).toBe(0);
      expect(
        (
          await getIndexableReferenceIds("forever", "item", {
            items: [{ ...identity, stats: [{ statType: 4, value: 5 }] }],
          })
        ).size,
      ).toBe(0);
    } finally {
      log.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
});
