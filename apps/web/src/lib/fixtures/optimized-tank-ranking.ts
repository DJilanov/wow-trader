import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import {
  tankSimulatorProfileSchema,
  type TankSimulatorModelUpdate,
} from "../forever-simulator-tank-model-updates";

const recordedSchema = z.object({
  schema: z.literal("kfc-tank-model-reader-fixture.v2"),
  profiles: z.record(tankSimulatorProfileSchema, z.string().regex(/^[a-f0-9]{24}$/)),
  documents: z.record(z.string(), z.unknown()),
});
type RecordedTankModels = z.infer<typeof recordedSchema>;
export async function readOptimizedTankModelsFixture(): Promise<RecordedTankModels> {
  return recordedSchema.parse(
    JSON.parse(
      gunzipSync(
        await readFile(new URL("./optimized-tank-models.json.gz", import.meta.url)),
      ).toString("utf8"),
    ),
  );
}

/** All scores, gear and imports come from the three recorded, browser-approved model packages. */
export async function optimizedTankRankingFixture(): Promise<TankSimulatorModelUpdate[]> {
  const raw = await readOptimizedTankModelsFixture();
  const sha = (value: string): string => createHash("sha256").update(value).digest("hex"),
    selectionSha256 = sha(JSON.stringify(raw.documents["tank-model-updates.json"]));
  return tankSimulatorProfileSchema.options.map((profile): TankSimulatorModelUpdate => {
    const release = raw.profiles[profile],
      manifest = raw.documents[`${release}/manifest.json`] as TankSimulatorModelUpdate["manifest"],
      proof = raw.documents[
        `${release}/kfc-optimized-tank-profile.json`
      ] as TankSimulatorModelUpdate["proof"];
    return {
      manifest,
      proof,
      sourceRelease: proof.sourceRelease,
      selectionSha256,
      proofSha256: sha(JSON.stringify(proof, null, 2) + "\n"),
    };
  });
}
