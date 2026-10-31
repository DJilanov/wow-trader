import { describe, expect, it } from "vitest";

import {
  auctionScanUploadSchema,
  auctionItemSnapshotSchema,
  canonicalJson,
  catalogRecipeOutputSchema,
  professionSnapshotUploadSchema,
  type JsonValue,
  worldCombatSpellObservationSchema,
  worldHealthObservationSchema,
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
  it("validates optional client-reported names and item categories", () => {
    const item = {
      itemId: 2770,
      marketKey: "2770",
      itemLink: null,
      itemName: "Copper Ore",
      itemClassId: 7,
      priceLevels: [{ unitPriceCopper: "7000", quantity: 20, listingCount: 1 }],
    };
    expect(auctionItemSnapshotSchema.safeParse(item).success).toBe(true);
    expect(
      auctionItemSnapshotSchema.safeParse({ ...item, itemName: "bad\u0000name" }).success,
    ).toBe(false);
    expect(auctionItemSnapshotSchema.safeParse({ ...item, itemClassId: 32 }).success).toBe(false);
  });
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

describe("professionSnapshotUploadSchema", () => {
  it("accepts character recipe eligibility, cooldown, inventory, and capital evidence", () => {
    const result = professionSnapshotUploadSchema.safeParse(validProfessionSnapshotUpload());

    expect(result.success).toBe(true);
  });

  it("rejects duplicate recipes and a mismatched snapshot ID", () => {
    const upload = validProfessionSnapshotUpload();
    const data = upload.data as {
      snapshotId: string;
      professions: Array<{ knownRecipes: unknown[] }>;
    };
    data.snapshotId = "2a527e2f-bd73-4f35-9991-9ac43cf507bc";
    data.professions[0]!.knownRecipes.push(data.professions[0]!.knownRecipes[0]);

    expect(professionSnapshotUploadSchema.safeParse(upload).success).toBe(false);
  });
});

describe("worldHealthObservationSchema", () => {
  it("rejects an impossible current health value", () => {
    const result = worldHealthObservationSchema.safeParse({
      observationId: "2a527e2f-bd73-4f35-9991-9ac43cf507bc",
      capturedAt: "2026-09-17T18:00:00.000Z",
      creatureId: 249790,
      creatureName: "Bandalar",
      trigger: "target",
      level: 63,
      classification: "worldboss",
      currentHealth: "1500001",
      maximumHealth: "1500000",
      healthPercent: 100,
      isDead: false,
      groupSize: 20,
      observerLocation: {
        capturedAt: "2026-09-17T18:00:00.000Z",
        uiMapId: 2521,
        uiX: 0.4,
        uiY: 0.6,
        positionX: null,
        positionY: null,
        positionZ: null,
        coordinateSystem: null,
        instanceId: null,
        mapId: 2899,
        instanceType: "raid",
        difficultyId: 14,
        difficultyName: "Normal",
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("worldCombatSpellObservationSchema", () => {
  it("rejects an aggregate whose last event predates its first event", () => {
    const result = worldCombatSpellObservationSchema.safeParse({
      observationId: "5af7529f-6e55-431a-8f20-157ab45d30cf",
      capturedAt: "2026-09-17T18:00:05.000Z",
      lastSeenAt: "2026-09-17T18:00:00.000Z",
      eventCount: 2,
      subEvent: "SPELL_CAST_SUCCESS",
      sourceCreatureId: 249790,
      sourceCreatureName: "Bandalar",
      destinationCreatureId: null,
      destinationCreatureName: null,
      spellId: 12345,
      spellName: "Observed Ability",
      spellSchool: 4,
      encounterId: null,
      attemptId: null,
      observerLocation: {
        capturedAt: "2026-09-17T18:00:00.000Z",
        uiMapId: 2521,
        uiX: null,
        uiY: null,
        positionX: null,
        positionY: null,
        positionZ: null,
        coordinateSystem: null,
        instanceId: null,
        mapId: 2899,
        instanceType: "raid",
        difficultyId: 14,
        difficultyName: "Normal",
      },
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

function validProfessionSnapshotUpload(): Record<string, unknown> {
  return {
    schemaVersion: "profession-snapshot.v1",
    payloadType: "profession_snapshot",
    payloadId: "95e8df52-8d38-4a3c-8aad-9fbe26ff8eb8",
    addonVersion: "0.11.0",
    clientProduct: "wow_anniversary",
    clientBuild: 69795,
    locale: "enUS",
    region: "EU",
    realmId: "Spineshatter",
    sourceCharacter: {
      name: "Crafter",
      realmId: "Spineshatter",
      faction: "horde",
      guid: "Player-1234-ABCDEF",
    },
    anonymousInstallationId: "anonymous-test-installation",
    capturedAt: "2026-10-18T10:30:00.000Z",
    completedAt: "2026-10-18T10:30:01.000Z",
    checksum: "a".repeat(64),
    data: {
      snapshotId: "95e8df52-8d38-4a3c-8aad-9fbe26ff8eb8",
      moneyCopper: "123456",
      inventoryScope: "bags",
      inventory: [{ itemId: 12808, quantity: 7 }],
      professions: [
        {
          professionSkillLineId: 171,
          parentProfessionSkillLineId: null,
          name: "Alchemy",
          skillLevel: 375,
          maximumSkillLevel: 375,
          skillModifier: 0,
          apiFlavor: "c_trade_skill_ui",
          recipeListComplete: true,
          specializationSpellIds: [28672],
          knownRecipes: [
            {
              recipeSpellId: 17563,
              name: "Transmute: Arcanite",
              cooldownSecondsRemaining: 3600,
              isDayCooldown: true,
              charges: null,
              maximumCharges: null,
            },
          ],
        },
      ],
    },
  };
}
