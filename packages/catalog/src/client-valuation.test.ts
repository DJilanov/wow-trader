import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { CatalogSnapshotManifest } from "@wow-trader/contracts";
import { describe, expect, it } from "vitest";
import {
  createClientValuationPack,
  getClientDisenchantEligibility,
  loadClientDisenchantEvidence,
  type ClientValuationItem,
} from "./client-valuation.js";

const rule = {
  id: 1,
  Class: 4,
  Quality: 2,
  MinLevel: 16,
  MaxLevel: 25,
  SkillRequired: 25,
  Subclass: -1,
  ExpansionID: -2,
};
const item: ClientValuationItem = {
  itemId: 100,
  classId: 4,
  subclassId: 1,
  quality: 2,
  itemLevel: 21,
  binding: 2,
  rawRecord: { itemSparse: { Flags: [0, 0], ExpansionID: 0 } },
};
function manifest(bytes: Buffer, recordCount = 1): CatalogSnapshotManifest {
  return {
    schemaVersion: "catalog-snapshot-manifest.v4",
    product: "wow_classic_beta",
    clientVersion: "1.60.1.70938",
    buildNumber: 70938,
    buildKey: "a".repeat(32),
    cdnKey: "b".repeat(32),
    locale: "enUS",
    extractedAt: "2026-11-13T00:00:00.000Z",
    hotfix: { status: "applied", sha256: "c".repeat(64) },
    definitions: { source: "wowdev/WoWDBDefs", revision: "d".repeat(40) },
    extractor: { name: "wow-trader-extractor", version: "0.6.1", revision: null },
    normalizedArtifacts: {},
    rawTables: {
      "ItemDisenchantLoot.effective": {
        path: "rules.jsonl.gz",
        recordCount,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    },
  };
}

describe("catalog-derived disenchant eligibility", () => {
  it("respects item flags, quest binding, exact rule matches, malformed metadata and ambiguity", () => {
    expect(getClientDisenchantEligibility(item, [rule])).toEqual({
      eligible: true,
      skill: 25,
      referenceLevel: 21,
      specialLoot: false,
    });
    expect(getClientDisenchantEligibility({ ...item, binding: 4 }, [rule])?.eligible).toBe(false);
    expect(
      getClientDisenchantEligibility(
        { ...item, rawRecord: { itemSparse: { Flags: [32768, 0x40000000], ExpansionID: 0 } } },
        [rule],
      ),
    ).toMatchObject({ eligible: false, specialLoot: true });
    expect(getClientDisenchantEligibility({ ...item, rawRecord: {} }, [rule])).toBeNull();
    expect(getClientDisenchantEligibility(item, [rule, { ...rule, id: 2 }])).toBeNull();
    expect(getClientDisenchantEligibility(item, [{ ...rule, Subclass: 2 }])?.eligible).toBe(false);
  });
  it("preserves Classic reference levels and signed flags without treating yields as client facts", () => {
    expect(
      getClientDisenchantEligibility({ ...item, itemLevel: 80 }, [
        { ...rule, MinLevel: 61, MaxLevel: 99 },
      ])?.referenceLevel,
    ).toBe(65);
    expect(
      getClientDisenchantEligibility(
        {
          ...item,
          rawRecord: { itemSparse: { Flags: [-2147483648, -2147483648], ExpansionID: 0 } },
        },
        [rule],
      )?.specialLoot,
    ).toBe(false);
    expect(
      getClientDisenchantEligibility({ ...item, classId: 2, itemLevel: 5 }, [
        { ...rule, Class: 2, MinLevel: 1, MaxLevel: 10 },
      ])?.referenceLevel,
    ).toBe(6);
  });
  it("sends deterministic build-scoped entries for all equipment, including unlisted items", () => {
    const evidence = { manifest: manifest(Buffer.alloc(0)), rules: [rule], sha256: "e".repeat(64) };
    const second = { ...item, itemId: 99 };
    const a = createClientValuationPack(evidence, [item, second]);
    expect(a.items.map((row) => row[0])).toEqual([99, 100]);
    expect(createClientValuationPack(evidence, [second, item])).toEqual(a);
    expect(a.clientBuild).toBe(70938);
    expect(
      createClientValuationPack(
        { ...evidence, manifest: { ...evidence.manifest, buildNumber: 70939 } },
        [item, second],
      ).sourceSha256,
    ).not.toBe(a.sourceSha256);
  });
  it("verifies source bytes, counts and rule schema and retries evidence that arrives after a miss", async () => {
    const root = await mkdtemp(join(tmpdir(), "client-valuation-"));
    const release = join(root, `wow_classic_beta-70938-enUS-${"c".repeat(8)}-${"d".repeat(7)}`);
    await mkdir(release);
    const file = join(release, "rules.jsonl.gz");
    const bytes = gzipSync(JSON.stringify(rule) + "\n");
    const value = manifest(bytes);
    try {
      expect(await loadClientDisenchantEvidence(undefined, value)).toBeNull();
      expect(await loadClientDisenchantEvidence(root, value)).toBeNull();
      await writeFile(file, bytes);
      expect((await loadClientDisenchantEvidence(root, value))?.rules).toEqual([rule]);
      await expect(loadClientDisenchantEvidence(root, manifest(bytes, 2))).rejects.toThrow(
        "count mismatch",
      );
      await expect(
        loadClientDisenchantEvidence(root, {
          ...value,
          rawTables: {
            "ItemDisenchantLoot.effective": {
              ...value.rawTables["ItemDisenchantLoot.effective"]!,
              sha256: "0".repeat(64),
            },
          },
        }),
      ).rejects.toThrow("checksum");
      const invalid = gzipSync(JSON.stringify({ ...rule, MaxLevel: 0 }));
      await writeFile(file, invalid);
      await expect(loadClientDisenchantEvidence(root, manifest(invalid))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
