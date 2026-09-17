import { describe, expect, it } from "vitest";

import {
  buildForeverBossDirectory,
  foreverInstanceTypeLabel,
  groupForeverEncounters,
  type ForeverWorldData,
  worldToUiMap,
} from "./forever-world";

describe("worldToUiMap", () => {
  it("uses the client assignment axis order for Durotar", () => {
    const point = worldToUiMap(312.659, -4745.52, {
      assignmentId: 46721,
      uiMapId: 1411,
      mapId: 1,
      areaId: 14,
      orderIndex: 0,
      uiMinX: 0,
      uiMinY: 0,
      uiMaxX: 1,
      uiMaxY: 1,
      region: [-1716.6666, -7249.9995, -1_000_000, 1808.3333, -1962.4999, 1_000_000],
      rawRecord: {},
    });

    expect(point?.x).toBeCloseTo(0.5264, 3);
    expect(point?.y).toBeCloseTo(0.4243, 3);
  });

  it("rejects positions outside an assignment", () => {
    expect(
      worldToUiMap(50_000, 50_000, {
        assignmentId: 1,
        uiMapId: 1,
        mapId: 1,
        areaId: null,
        orderIndex: 0,
        uiMinX: 0,
        uiMinY: 0,
        uiMaxX: 1,
        uiMaxY: 1,
        region: [0, 0, -1, 100, 100, 1],
        rawRecord: {},
      }),
    ).toBeNull();
  });
});

describe("groupForeverEncounters", () => {
  it("collapses difficulty variants into one canonical encounter", () => {
    const groups = groupForeverEncounters([
      {
        encounterId: 10,
        mapId: 200,
        difficultyId: 1,
        name: "The Wild King",
        orderIndex: 2,
        flags: 0,
        iconFileDataId: null,
        rawRecord: {},
      },
      {
        encounterId: 11,
        mapId: 200,
        difficultyId: 2,
        name: "The Wild King",
        orderIndex: 2,
        flags: 0,
        iconFileDataId: null,
        rawRecord: {},
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe("The Wild King");
    expect(groups[0]?.variants.map((variant) => variant.encounterId)).toEqual([10, 11]);
  });
});

describe("foreverInstanceTypeLabel", () => {
  it("uses Map.InstanceType semantics", () => {
    expect(foreverInstanceTypeLabel(1)).toBe("Dungeon");
    expect(foreverInstanceTypeLabel(2)).toBe("Raid");
  });
});

describe("buildForeverBossDirectory", () => {
  it("does not turn a dungeon completion label into a boss name", () => {
    const world = createWorldFixture();

    expect(buildForeverBossDirectory(world)).toEqual([
      expect.objectContaining({
        creatureId: 250_001,
        name: "Creature 250001",
        contextLabel: "City of Dalaran",
        namingState: "ambiguous",
      }),
    ]);
  });
});

function createWorldFixture(): ForeverWorldData {
  return {
    build: {
      id: null,
      product: "wow_classic_beta",
      clientVersion: "1.60.1",
      buildNumber: 69_893,
      locale: "enUS",
      state: "review_required",
    },
    maps: [
      {
        mapId: 200,
        directory: "Test",
        name: "City of Dalaran",
        description: "",
        mapType: 0,
        instanceType: 1,
        expansionId: 0,
        areaTableId: 0,
        parentMapId: null,
        cosmeticParentMapId: null,
        maxPlayers: 5,
        wdtFileDataId: null,
        rawRecord: {},
      },
    ],
    areas: [],
    uiMaps: [],
    uiMapAssignments: [],
    mapArts: [],
    uiMapArtLinks: [],
    mapArtLayers: [],
    mapArtTiles: [],
    pois: [],
    encounters: [],
    lfgDungeons: [],
    quests: [],
    questLines: [],
    questLineMembers: [],
    questPois: [],
    itemSourceHints: [],
    creatureObjectives: [
      {
        criteriaTreeId: 1,
        criteriaId: 2,
        creatureId: 250_001,
        name: "City of Dalaran",
        parentCriteriaTreeId: 0,
        rootCriteriaTreeId: 1,
        rootDescription: "City of Dalaran",
        orderIndex: 0,
        amount: 1,
        flags: 0,
        achievementId: 3,
        achievementTitle: "City of Dalaran",
        achievementDescription: "Complete the following dungeon.",
        achievementCategoryId: null,
        achievementInstanceMapId: 200,
        achievementIconFileDataId: null,
        encounterIds: [],
        mapIds: [200],
        rawCriteriaTree: {},
        rawCriteria: {},
      },
    ],
    bosses: [
      {
        creatureId: 250_001,
        name: "City of Dalaran",
        aliases: ["City of Dalaran"],
        contextNames: ["City of Dalaran"],
        criteriaTreeIds: [1],
        criteriaIds: [2],
        achievementIds: [3],
        encounterIds: [],
        mapIds: [200],
        iconFileDataIds: [],
        identityEvidence: "criteria_type_0",
        staticModelStatus: "unresolved_static",
      },
    ],
    bossLocations: [],
    creatureModels: [],
    bossSpellCandidates: [],
    lootSourceCandidates: [],
    mapDifficulties: [],
    contentTunings: [],
  };
}
