import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import {
  paladinHealerLibraryIndexSchema,
  parsePaladinHealerGroupPayload,
} from "@wow-trader/forever-data/paladin-healer-library-payloads";
import { paladinHealerPresentationSchema } from "@wow-trader/forever-data/paladin-healer-release";

const root = new URL("../../../../../packages/forever-data/src/fixtures/", import.meta.url);
export const paladinPayloadFixture = z
  .object({
    assets: z.array(
      z.object({
        ref: z.object({ file: z.string(), bytes: z.number(), byteSha256: z.string() }),
        payload: z.unknown(),
      }),
    ),
  })
  .parse(
    JSON.parse(
      gunzipSync(
        readFileSync(new URL("paladin-healer-library-payloads.v1.json.gz", root)),
      ).toString("utf8"),
    ),
  );
export const paladinIndexFixture = paladinHealerLibraryIndexSchema.parse(
  paladinPayloadFixture.assets.find((entry) => entry.ref.file === "library-index.json")?.payload,
);
export const paladinGroupFixtures = paladinPayloadFixture.assets
  .filter((entry) => entry.ref.file.startsWith("group-"))
  .map((entry) => parsePaladinHealerGroupPayload(paladinIndexFixture, entry.payload));
export const paladinPresentationFixture = paladinHealerPresentationSchema.parse(
  JSON.parse(
    gunzipSync(readFileSync(new URL("paladin-healer-presentation.v1.json.gz", root))).toString(
      "utf8",
    ),
  ),
);
