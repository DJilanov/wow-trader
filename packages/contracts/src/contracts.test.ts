import { describe, expect, it } from "vitest";

import {
  auctionScanUploadSchema,
  canonicalJson,
  catalogRecipeOutputSchema,
  type JsonValue,
} from "./index.js";

describe("canonicalJson", () => {
  it("sorts object keys recursively while preserving array order", () => {
    const value: JsonValue = {
      z: [{ b: 2, a: 1 }],
      a: true,
    };

    expect(canonicalJson(value)).toBe('{"a":true,"z":[{"a":1,"b":2}]}');
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe("catalogRecipeOutputSchema", () => {
  it("requires an item or enchantment output", () => {
    const result = catalogRecipeOutputSchema.safeParse({
      recipeSpellId: 17563,
      outputItemId: null,
      enchantmentId: null,
      minimumQuantity: 1,
      maximumQuantity: 1,
      expectedQuantityNumerator: 1,
      expectedQuantityDenominator: 1,
    });

    expect(result.success).toBe(false);
  });
});

describe("auctionScanUploadSchema", () => {
  it("accepts private source-character provenance", () => {
    const result = auctionScanUploadSchema.safeParse({
      ...validAuctionScanUpload(),
      sourceCharacter: {
        name: "Bankalt",
        realmId: "Spineshatter",
        faction: "horde",
        guid: "Player-1234-ABCDEF",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects a scan whose completion precedes its start", () => {
    const result = auctionScanUploadSchema.safeParse({
      ...validAuctionScanUpload(),
      completedAt: "2026-09-15T10:29:59.000Z",
    });

    expect(result.success).toBe(false);
  });
});

function validAuctionScanUpload(): Record<string, unknown> {
  return {
    schemaVersion: "auction-scan.v1",
    payloadType: "auction_scan",
    payloadId: "f6714653-a4c4-4208-b7ee-b0a21a816593",
    addonVersion: "0.2.0",
    clientProduct: "wow_anniversary",
    clientBuild: 69795,
    locale: "enUS",
    region: "EU",
    realmId: "test-realm",
    auctionHouseType: "horde",
    anonymousInstallationId: "anonymous-test-installation",
    capturedAt: "2026-09-15T10:30:00.000Z",
    completedAt: "2026-09-15T10:30:10.000Z",
    completeness: 1,
    checksum: "a".repeat(64),
    data: {
      scanId: "95e8df52-8d38-4a3c-8aad-9fbe26ff8eb8",
      itemSnapshots: [],
    },
  };
}
