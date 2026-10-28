import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { healerLibrarySchema } from "@wow-trader/forever-data/healing-simulator";
import { normalizeHealerLibrary } from "@wow-trader/forever-data/healer-workspace";
import { z } from "zod";
import {
  configurationForHealerBuild,
  healerWorkloadForConfiguration,
} from "./healer-configuration";

const fixture = z
  .object({
    schema: z.literal("kfc-priest-healing-request-regression.v1"),
    library: healerLibrarySchema,
    sources: z.array(z.object({ path: z.string(), sha256: z.string() }).strict()),
  })
  .strict()
  .parse(
    JSON.parse(
      gunzipSync(
        readFileSync(
          new URL("./fixtures/current-priest-healing-request.v1.json.gz", import.meta.url),
        ),
      ).toString(),
    ),
  );
const library = normalizeHealerLibrary(fixture.library);

describe("Current selected Priest healing requests", () => {
  it("preserves the actual selected cooldown order and every workload field", () => {
    for (const build of library.builds) {
      const config = configurationForHealerBuild(library, build);
      expect(healerWorkloadForConfiguration(library, config), build.id).toEqual(build.workload);
    }
  });

  it("changes activation ownership without reordering the remaining selected actions", () => {
    const build = library.builds.find((entry) => entry.id === "holy-group-stacked-180")!;
    const config = configurationForHealerBuild(library, build);
    config.race = library.races.find((race) => race.name === "Human")!.id;
    config.gear = config.gear.map((item) => (item.id === 272439 ? { id: 18469 } : item));
    expect(healerWorkloadForConfiguration(library, config).cooldowns).toEqual(
      build.workload.cooldowns.filter((use) => use.spellId !== 20554 && use.itemId !== 272439),
    );
  });
});
