import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { parsePaladinHealerFullCatalog } from "@wow-trader/forever-data/paladin-healer-catalog";
import { parsePaladinHealerFramePayload } from "@wow-trader/forever-data/paladin-healer-frame";
import { parsePaladinHealerFrameLibraryIndex } from "@wow-trader/forever-data/paladin-healer-frame-library";
import { paladinHealerFrameReleaseSchema } from "@wow-trader/forever-data/paladin-healer-frame-release";
import { parsePaladinHealerFullPresentation } from "@wow-trader/forever-data/paladin-healer-presentation";

export function paladinFrameFixtureBytes(name: string): Buffer {
  return gunzipSync(
    readFileSync(
      new URL("../../../../../packages/forever-data/src/fixtures/" + name, import.meta.url),
    ),
  );
}
function json(name: string): unknown {
  return JSON.parse(paladinFrameFixtureBytes(name).toString("utf8")) as unknown;
}
export const frameReleaseFixture = paladinHealerFrameReleaseSchema.parse(
  json("paladin-healer-frame-release.v2.json.gz"),
);
export const frameCatalogFixture = parsePaladinHealerFullCatalog(
  json("paladin-healer-catalog.v2.json.gz"),
);
export const framePresentationFixture = parsePaladinHealerFullPresentation(
  frameCatalogFixture,
  json("paladin-healer-presentation.v2.json.gz"),
  frameReleaseFixture.catalogSha256,
);
export const frameIndexFixture = parsePaladinHealerFrameLibraryIndex(
  frameCatalogFixture,
  framePresentationFixture,
  json("paladin-healer-frame-index.v2.json.gz"),
);
export const framePayloadFixtures = z
  .object({ assets: z.array(z.object({ payload: z.unknown() })) })
  .parse(json("paladin-healer-frames.v2.json.gz"))
  .assets.map((entry) => parsePaladinHealerFramePayload(entry.payload));
