import { describe, expect, it } from "vitest";
import { parseGuideChapter, WESTFALL_ROUTE } from "@wow-trader/leveling";
import {
  buildLevelingMaps,
  importedMapSteps,
  originalMapSteps,
  type LevelingMapWorld,
} from "./leveling-map-data";

function fixture(): LevelingMapWorld {
  return {
    build: {
      id: null,
      product: "wow_classic_beta",
      clientVersion: "1.60.1",
      buildNumber: 70205,
      locale: "enUS",
      state: "review_required",
    },
    uiMaps: [
      {
        uiMapId: 1429,
        name: "Elwynn Forest",
        parentUiMapId: null,
        type: 3,
        system: 0,
        flags: 0,
        rawRecord: {},
      },
      {
        uiMapId: 1453,
        name: "Stormwind City",
        parentUiMapId: null,
        type: 3,
        system: 0,
        flags: 0,
        rawRecord: {},
      },
    ],
    uiMapAssignments: [
      {
        assignmentId: 46739,
        uiMapId: 1429,
        mapId: 0,
        areaId: 12,
        orderIndex: 0,
        uiMinX: 0,
        uiMinY: 0,
        uiMaxX: 1,
        uiMaxY: 1,
        region: [
          -10254.166015625, -1935.4166259765625, -1000000, -7939.5830078125, 1535.4166259765625,
          1000000,
        ],
        rawRecord: {},
      },
    ],
    uiMapArtLinks: [{ linkId: 1, uiMapId: 1429, mapArtId: 2153, phaseId: 0 }],
    mapArts: [{ mapArtId: 2153, styleId: 1, rawRecord: {} }],
    mapArtLayers: [
      {
        layerId: 1,
        styleId: 1,
        layerIndex: 0,
        layerWidth: 1002,
        layerHeight: 668,
        tileWidth: 256,
        tileHeight: 256,
        minScale: 1,
        maxScale: 2,
        additionalZoomSteps: 0,
      },
    ],
    mapArtTiles: [
      { tileId: 1, mapArtId: 2153, layerIndex: 0, rowIndex: 0, columnIndex: 0, fileDataId: 123 },
    ],
    questPois: [
      {
        blobId: 1,
        questId: 783,
        mapId: 0,
        uiMapId: 1429,
        objectiveIndex: 0,
        objectiveId: null,
        flags: 0,
        points: [{ pointId: 1, x: -8933.47, y: -136.48, z: 0 }],
        rawRecord: {},
      },
    ],
  };
}
function steps(source: string): ReturnType<typeof importedMapSteps> {
  return importedMapSteps(
    parseGuideChapter(source, "chapter-115-1-6-northshire", "a".repeat(64), 70205),
  );
}
describe("leveling zone map evidence", () => {
  it("joins reveal layers only to their exact art and layer, retaining PNG padding dimensions", () => {
    const data = buildLevelingMaps(steps("step\n.goto 1429,50,40"), 70205, fixture(), [
      {
        overlayId: 1,
        mapArtId: 2153,
        offsetX: 100,
        offsetY: 200,
        width: 306,
        height: 233,
        tiles: [
          { fileDataId: 300, rowIndex: 0, columnIndex: 0, layerIndex: 0, width: 256, height: 256 },
          { fileDataId: 301, rowIndex: 0, columnIndex: 1, layerIndex: 0, width: 64, height: 256 },
          { fileDataId: 302, rowIndex: 0, columnIndex: 0, layerIndex: 1, width: 256, height: 256 },
        ],
      },
      { overlayId: 2, mapArtId: 999, offsetX: 0, offsetY: 0, width: 256, height: 256, tiles: [] },
    ]);
    expect(data.zones[0]?.overlays).toHaveLength(1);
    expect(data.zones[0]?.overlays[0]).toMatchObject({
      offsetX: 100,
      offsetY: 200,
      width: 306,
      height: 233,
    });
    expect(data.zones[0]?.overlays[0]?.tiles.map((tile) => tile.fileDataId)).toEqual([300, 301]);
    expect(data.zones[0]?.overlays[0]?.tiles[1]?.width).toBe(64);
  });
  it("resolves zone IDs, names and the verified Classic alias without guessing a map", () => {
    const data = buildLevelingMaps(
      steps(
        "step\n.goto 1429,50,40\n.goto Elwynn Forest,60,20\n.goto StormwindClassic,55,7\n.goto Fictional Forest,40,40",
      ),
      70205,
      fixture(),
    );
    expect(data.points).toHaveLength(3);
    expect(data.points[0]).toMatchObject({
      uiMapId: 1429,
      x: 0.5,
      y: 0.4,
      evidence: "guide_coordinate",
      questId: null,
    });
    expect(data.points[2]?.uiMapId).toBe(1453);
    expect(data.unmappedPoints).toBe(1);
    expect(data.zones[0]?.tiles[0]?.fileDataId).toBe(123);
    expect(data.zones[1]?.tiles).toEqual([]);
  });
  it("converts RXP/HBD world axes correctly and treats the slash suffix as world map ID, not floor", () => {
    const data = buildLevelingMaps(
      steps("step\n.goto 1429/0,-136.48,-8933.47\n.goto 1429/1,-136.48,-8933.47"),
      70205,
      fixture(),
    );
    expect(data.points).toHaveLength(1);
    expect(data.points[0]?.x).toBeCloseTo(0.48169, 4);
    expect(data.points[0]?.y).toBeCloseTo(0.4294, 4);
    expect(data.unmappedPoints).toBe(1);
  });
  it("does not clamp invalid coordinates or place an unresolvable point at a guessed location", () => {
    const data = buildLevelingMaps(
      steps("step\n.goto 1429,100.1,40\n.goto 1429,-1,40\n.goto 1429/0,999999,999999"),
      70205,
      fixture(),
    );
    expect(data.points).toEqual([]);
    expect(data.unmappedPoints).toBe(3);
  });
  it("keeps client quest POIs separate from route waypoints and refuses different-build POIs", () => {
    const guide = steps("step\n.goto 1429,50,40\n.accept 783 >>Accept A Threat Within");
    const data = buildLevelingMaps(guide, 70205, fixture());
    expect(data.points.map((point) => point.evidence)).toEqual([
      "guide_coordinate",
      "client_quest_poi",
    ]);
    expect(data.points[1]).toMatchObject({
      questId: 783,
      sourceLine: 3,
      outline: [{ x: expect.any(Number), y: expect.any(Number) }],
    });
    const earlier = fixture();
    expect(
      buildLevelingMaps(guide, 70205, {
        ...earlier,
        build: { ...earlier.build, buildNumber: 70124 },
      }).points,
    ).toHaveLength(1);
  });
  it("keeps original preview coordinates and quest identity attached to their own step", () => {
    const original = originalMapSteps(WESTFALL_ROUTE);
    expect(original.filter((step) => step.positions.length)).toHaveLength(3);
    expect(original.find((step) => step.quests.length)?.quests[0]?.questId).toBeGreaterThan(0);
    expect(original.find((step) => step.positions.length)?.positions[0]?.position.space).toBe(
      "map-percent",
    );
  });
});
