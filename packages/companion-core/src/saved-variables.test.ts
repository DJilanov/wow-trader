import { describe, expect, it } from "vitest";

import { parseCollectorSavedVariables } from "./saved-variables.js";
import {
  createAuctionScanUpload,
  createProfessionSnapshotUpload,
  createWorldDiagnosticsUpload,
} from "./upload.js";

const SOURCE = `WOW_TRADER_SAVED = {
  ["schemaVersion"] = 1,
  ["installationId"] = "67af914b-851d-44a0-b4ba-bb01458b7cbf",
  ["scans"] = {},
  ["worldDiagnostics"] = {
    ["schemaVersion"] = 5,
    ["addonVersion"] = "0.6.0",
    ["clientProduct"] = "wow_classic_beta",
    ["clientBuild"] = 69893,
    ["locale"] = "enUS",
    ["region"] = "EU",
    ["modelResolutions"] = {},
    ["spellObservations"] = {
      [1] = {
        ["observationID"] = "5af7529f-6e55-431a-8f20-157ab45d30cf",
        ["observationKey"] = "attempt:249790:0:12345:SPELL_CAST_SUCCESS",
        ["capturedAt"] = 1789671600,
        ["lastSeenAt"] = 1789671605,
        ["eventCount"] = 3,
        ["subEvent"] = "SPELL_CAST_SUCCESS",
        ["sourceCreatureID"] = 249790,
        ["sourceCreatureName"] = "Bandalar",
        ["spellID"] = 12345,
        ["spellName"] = "Observed Ability",
        ["spellSchool"] = 4,
        ["observerLocation"] = {
          ["capturedAt"] = 1789671600,
          ["uiMapID"] = 2521,
          ["mapID"] = 2899,
          ["instanceType"] = "raid",
          ["difficultyID"] = 14,
        },
      },
    },
    ["questQueries"] = {
      ["96912"] = {
        ["queryID"] = "61e54168-0634-4cad-8fd4-88aaecf76d2b",
        ["questID"] = 96912,
        ["status"] = "success",
        ["capturedAt"] = 1789671601,
        ["title"] = "A Forever Quest",
        ["objectives"] = {},
        ["location"] = {
          ["capturedAt"] = 1789671601,
          ["uiMapID"] = 2521,
          ["mapID"] = 2899,
          ["instanceType"] = "raid",
          ["difficultyID"] = 14,
        },
      },
    },
    ["questObservations"] = {},
    ["vendorObservations"] = {},
    ["encounterAttempts"] = {},
    ["encounterLoot"] = {},
    ["lootObservations"] = {},
    ["npcSightings"] = {},
    ["healthObservations"] = {
      [1] = {
        ["observationID"] = "2a527e2f-bd73-4f35-9991-9ac43cf507bc",
        ["capturedAt"] = 1789671600,
        ["creatureID"] = 249790,
        ["creatureName"] = "Bandalar",
        ["trigger"] = "target",
        ["level"] = 63,
        ["classification"] = "worldboss",
        ["currentHealth"] = 1200000,
        ["maximumHealth"] = 1500000,
        ["healthPercent"] = 80,
        ["isDead"] = false,
        ["groupSize"] = 20,
        ["observerLocation"] = {
          ["capturedAt"] = 1789671600,
          ["uiMapID"] = 2521,
          ["uiX"] = 0.4,
          ["uiY"] = 0.6,
          ["mapID"] = 2899,
          ["instanceType"] = "raid",
          ["difficultyID"] = 14,
          ["difficultyName"] = "Normal",
        },
      },
    },
  },
}`;

describe("collector SavedVariables", () => {
  it("accepts an empty Lua quest-query table as an empty record", () => {
    const savedVariables = parseCollectorSavedVariables(`WOW_TRADER_SAVED = {
      ["schemaVersion"] = 1,
      ["installationId"] = "67af914b-851d-44a0-b4ba-bb01458b7cbf",
      ["scans"] = {},
      ["worldDiagnostics"] = {
        ["schemaVersion"] = 5,
        ["questQueries"] = {},
      },
    }`);

    expect(savedVariables.worldDiagnostics?.questQueries).toEqual({});
  });

  it("preserves native Auction House quality evidence in the upload", () => {
    const savedVariables = parseCollectorSavedVariables(`WOW_TRADER_SAVED = {
      ["schemaVersion"] = 1,
      ["installationId"] = "67af914b-851d-44a0-b4ba-bb01458b7cbf",
      ["scans"] = {
        [1] = {
          ["scanId"] = "95e8df52-8d38-4a3c-8aad-9fbe26ff8eb8",
          ["addonVersion"] = "0.8.0",
          ["clientProduct"] = "wow_classic_beta",
          ["clientBuild"] = 70009,
          ["locale"] = "enUS",
          ["region"] = "EU",
          ["realmId"] = "ForeverRealm",
          ["auctionHouseType"] = "horde",
          ["capturedAt"] = 1790370000,
          ["completedAt"] = 1790370001,
          ["completeness"] = 1,
          ["provider"] = "blizzard_replicate",
          ["apiFlavor"] = "c_auction_house_replicate",
          ["marketKeyVersion"] = 1,
          ["reportedRowCount"] = 3,
          ["visitedRowCount"] = 3,
          ["pricedRowCount"] = 2,
          ["noBuyoutRowCount"] = 1,
          ["unresolvedRowCount"] = 0,
          ["invalidRowCount"] = 0,
          ["secretRowCount"] = 0,
          ["scanDurationMs"] = 712,
          ["auctionHouseStayedOpen"] = true,
          ["itemSnapshots"] = {
            [1] = {
              ["itemId"] = 12808,
              ["marketKey"] = "12808",
              ["priceLevels"] = {
                [1] = { ["unitPriceCopper"] = 12500, ["quantity"] = 2, ["listingCount"] = 2 },
              },
            },
          },
        },
      },
    }`);

    expect(createAuctionScanUpload(savedVariables, savedVariables.scans[0]!)).toMatchObject({
      provider: "blizzard_replicate",
      apiFlavor: "c_auction_house_replicate",
      reportedRowCount: 3,
      pricedRowCount: 2,
      noBuyoutRowCount: 1,
      scanDurationMs: 712,
      auctionHouseStayedOpen: true,
      data: { itemSnapshots: [{ itemLink: null }] },
    });

    const incompleteNativeScan = structuredClone(savedVariables.scans[0]!);
    Reflect.deleteProperty(incompleteNativeScan, "apiFlavor");
    expect(createAuctionScanUpload(savedVariables, incompleteNativeScan).apiFlavor).toBeUndefined();
  });

  it("parses health evidence and creates a deterministic upload", () => {
    const savedVariables = parseCollectorSavedVariables(SOURCE);
    const first = createWorldDiagnosticsUpload(savedVariables);
    const second = createWorldDiagnosticsUpload(savedVariables);

    expect(first).not.toBeNull();
    expect(second?.payloadId).toBe(first?.payloadId);
    expect(first).toMatchObject({
      clientBuild: 69893,
      data: {
        healthObservations: [
          {
            creatureId: 249790,
            maximumHealth: "1500000",
            observerLocation: { uiMapId: 2521, difficultyId: 14 },
          },
        ],
        spellObservations: [{ sourceCreatureId: 249790, spellId: 12345, eventCount: 3 }],
        questQueries: [{ questId: 96912, status: "success", title: "A Forever Quest" }],
      },
    });
  });

  it("preserves loot denominators and trainer acquisition evidence", () => {
    const savedVariables = parseCollectorSavedVariables(`WOW_TRADER_SAVED = {
      ["schemaVersion"] = 1,
      ["installationId"] = "67af914b-851d-44a0-b4ba-bb01458b7cbf",
      ["scans"] = {},
      ["worldDiagnostics"] = {
        ["schemaVersion"] = 6,
        ["addonVersion"] = "0.12.0",
        ["clientProduct"] = "wow_classic_beta",
        ["clientBuild"] = 70450,
        ["locale"] = "enUS",
        ["region"] = "EU",
        ["lootSessions"] = {
          [1] = {
            ["sessionID"] = "2a527e2f-bd73-4f35-9991-9ac43cf507bc",
            ["capturedAt"] = 1792319400,
            ["sourceType"] = "Creature",
            ["sourceID"] = 1234,
            ["sourceName"] = "Test Creature",
            ["sourceGuid"] = "Creature-0-0-0-0-1234-0000000000",
            ["sourceQuantity"] = 1,
            ["slotCount"] = 1,
            ["money"] = 12,
            ["observerLocation"] = { ["capturedAt"] = 1792319400, ["uiMapID"] = 14 },
          },
        },
        ["lootObservations"] = {
          [1] = {
            ["observationID"] = "5af7529f-6e55-431a-8f20-157ab45d30cf",
            ["lootSessionID"] = "2a527e2f-bd73-4f35-9991-9ac43cf507bc",
            ["capturedAt"] = 1792319400,
            ["slotIndex"] = 1,
            ["itemID"] = 400,
            ["itemName"] = "Recipe: Test",
            ["quantity"] = 1,
            ["sourceType"] = "Creature",
            ["sourceID"] = 1234,
            ["sourceGuid"] = "Creature-0-0-0-0-1234-0000000000",
            ["sourceQuantity"] = 1,
            ["observerLocation"] = { ["capturedAt"] = 1792319400, ["uiMapID"] = 14 },
          },
        },
        ["trainerObservations"] = {
          [1] = {
            ["observationID"] = "61e54168-0634-4cad-8fd4-88aaecf76d2b",
            ["observationKey"] = "1234:900",
            ["capturedAt"] = 1792319401,
            ["sourceType"] = "Creature",
            ["sourceID"] = 5678,
            ["sourceName"] = "Test Trainer",
            ["serviceIndex"] = 1,
            ["serviceName"] = "Test Recipe",
            ["serviceType"] = "available",
            ["spellID"] = 900,
            ["moneyCost"] = 1000,
            ["requiredLevel"] = 10,
            ["requiredSkillLine"] = "Alchemy",
            ["requiredSkillRank"] = 50,
            ["allFiltersEnabled"] = true,
            ["observerLocation"] = { ["capturedAt"] = 1792319401, ["uiMapID"] = 14 },
          },
        },
      },
    }`);

    expect(createWorldDiagnosticsUpload(savedVariables)).toMatchObject({
      data: {
        lootSessions: [{ sourceId: 1234, slotCount: 1, money: 12 }],
        lootObservations: [
          {
            lootSessionId: "2a527e2f-bd73-4f35-9991-9ac43cf507bc",
            itemId: 400,
            sourceId: 1234,
          },
        ],
        trainerObservations: [
          {
            sourceId: 5678,
            spellId: 900,
            serviceName: "Test Recipe",
            allFiltersEnabled: true,
          },
        ],
      },
    });
  });

  it("normalizes empty optional client strings before upload validation", () => {
    const savedVariables = parseCollectorSavedVariables(
      SOURCE.replace('["difficultyName"] = "Normal",', '["difficultyName"] = "",').replace(
        '["objectives"] = {},',
        `["objectives"] = {
          [1] = {
            ["text"] = "",
            ["objectiveType"] = "",
            ["finished"] = false,
            ["numFulfilled"] = 0,
            ["numRequired"] = 1,
          },
        },`,
      ),
    );
    const diagnostics = savedVariables.worldDiagnostics;

    expect(diagnostics?.healthObservations[0]?.observerLocation.difficultyName).toBeNull();
    expect(diagnostics?.questQueries["96912"]?.objectives?.[0]).toMatchObject({
      text: null,
      objectiveType: null,
    });
    expect(createWorldDiagnosticsUpload(savedVariables)).not.toBeNull();
  });

  it("parses and normalizes a profession snapshot", () => {
    const savedVariables = parseCollectorSavedVariables(`WOW_TRADER_SAVED = {
      ["schemaVersion"] = 1,
      ["installationId"] = "67af914b-851d-44a0-b4ba-bb01458b7cbf",
      ["scans"] = {},
      ["professionSnapshots"] = {
        [1] = {
          ["snapshotID"] = "95e8df52-8d38-4a3c-8aad-9fbe26ff8eb8",
          ["addonVersion"] = "0.11.0",
          ["clientProduct"] = "wow_anniversary",
          ["clientBuild"] = 69795,
          ["locale"] = "enUS",
          ["region"] = "EU",
          ["realmID"] = "Spineshatter",
          ["sourceCharacter"] = {
            ["name"] = "Crafter",
            ["realmId"] = "Spineshatter",
            ["faction"] = "horde",
            ["guid"] = "Player-1234-ABCDEF",
          },
          ["capturedAt"] = 1792319400,
          ["completedAt"] = 1792319401,
          ["moneyCopper"] = 123456,
          ["inventoryScope"] = "bags",
          ["inventory"] = {
            [1] = { ["itemID"] = 12808, ["quantity"] = 7 },
          },
          ["professions"] = {
            [1] = {
              ["professionSkillLineID"] = 171,
              ["name"] = "Alchemy",
              ["skillLevel"] = 375,
              ["maximumSkillLevel"] = 375,
              ["skillModifier"] = 0,
              ["apiFlavor"] = "c_trade_skill_ui",
              ["recipeListComplete"] = true,
              ["specializationSpellIDs"] = { [1] = 28672 },
              ["knownRecipes"] = {
                [1] = {
                  ["recipeSpellID"] = 17563,
                  ["name"] = "Transmute: Arcanite",
                  ["cooldownSecondsRemaining"] = 3600,
                  ["isDayCooldown"] = true,
                },
              },
            },
          },
        },
      },
    }`);

    const upload = createProfessionSnapshotUpload(
      savedVariables,
      savedVariables.professionSnapshots[0]!,
    );
    expect(upload).toMatchObject({
      payloadType: "profession_snapshot",
      sourceCharacter: { name: "Crafter", realmId: "Spineshatter" },
      data: {
        moneyCopper: "123456",
        inventory: [{ itemId: 12808, quantity: 7 }],
        professions: [
          {
            professionSkillLineId: 171,
            specializationSpellIds: [28672],
            knownRecipes: [{ recipeSpellId: 17563, cooldownSecondsRemaining: 3600, charges: null }],
          },
        ],
      },
    });
  });
});
