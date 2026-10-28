import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import {
  shamanHealerLibraryIndexSchema,
  parseShamanHealerGroupPayload,
  parseShamanHealerCatalogPayload,
} from "@wow-trader/forever-data/shaman-healer-library";
import { shamanHealerPresentationSchema } from "@wow-trader/forever-data/shaman-healer-release";

function readFixture(name: string): Record<string, unknown> {
  return z
    .record(z.string(), z.unknown())
    .parse(
      JSON.parse(
        gunzipSync(
          readFileSync(
            new URL("../../../../../packages/forever-data/src/fixtures/" + name, import.meta.url),
          ),
        ).toString("utf8"),
      ),
    );
}
const library = readFixture("shaman-healer-library.v2.json.gz");
export const shamanIndexFixture = shamanHealerLibraryIndexSchema.parse(library.index);
export const shamanGroupFixture = parseShamanHealerGroupPayload(
  shamanIndexFixture,
  library.payload,
);
export const shamanCatalogFixture = parseShamanHealerCatalogPayload(
  shamanIndexFixture,
  library.catalog,
);
export const shamanPresentationFixture = shamanHealerPresentationSchema.parse(
  readFixture("shaman-healer-presentation.v1.json.gz").presentation,
);
