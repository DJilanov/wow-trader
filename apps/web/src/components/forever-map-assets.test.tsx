import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ForeverMapDirectory } from "./forever-map-directory";
import { LevelingZoneMap } from "./leveling-zone-map";

describe("Forever map artwork", () => {
  it("keeps directory background previews inside the tools application", () => {
    const markup = renderToStaticMarkup(
      <ForeverMapDirectory
        buildNumber={70450}
        maps={[
          {
            uiMapId: 37,
            name: "Elwynn Forest",
            parentUiMapId: null,
            type: 3,
            system: 0,
            parentName: "Eastern Kingdoms",
            featured: false,
            hasArt: true,
            tileCount: 1,
            layerWidth: 256,
            layerHeight: 256,
            questCount: 0,
            markerCount: 0,
            previewFileDataId: 123,
          },
        ]}
      />,
    );

    expect(markup).toContain("/tools/api/forever-map-media/123?v=70450");
    expect(markup).not.toContain("&quot;/api/");
  });

  it("keeps base tiles and overlay tiles inside the tools application", () => {
    const markup = renderToStaticMarkup(
      <LevelingZoneMap
        stepLabel="Elwynn Forest"
        points={[]}
        maps={{
          state: "ready",
          buildNumber: 70450,
          targetBuild: 70450,
          points: [],
          unmappedPoints: 0,
          zones: [
            {
              uiMapId: 37,
              name: "Elwynn Forest",
              width: 256,
              height: 256,
              tileWidth: 256,
              tileHeight: 256,
              tiles: [{ rowIndex: 0, columnIndex: 0, fileDataId: 123 }],
              overlays: [
                {
                  overlayId: 1,
                  mapArtId: 1,
                  width: 256,
                  height: 256,
                  offsetX: 0,
                  offsetY: 0,
                  tiles: [
                    {
                      rowIndex: 0,
                      columnIndex: 0,
                      layerIndex: 0,
                      fileDataId: 456,
                      width: 256,
                      height: 256,
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(markup).toContain('href="/tools/api/forever-map-media/123?v=70450"');
    expect(markup).toContain('href="/tools/api/forever-map-media/456?v=70450"');
    expect(markup).not.toContain('href="/api/');
  });
});
