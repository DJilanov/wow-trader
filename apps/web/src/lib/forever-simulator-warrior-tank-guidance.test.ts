import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { testedWarriorTankGuidance } from "./forever-simulator-warrior-tank-guidance";

const fixture = z
  .object({
    sourceSha256: z.literal("22dc237872a9a8232460989e198388aa28cf731e61727b1ed78db0b32b1c04c0"),
    cases: z
      .array(
        z.object({
          id: z.string(),
          scenario: z.enum(["raid", "solo"]),
          settings: z.object({
            player: z.object({
              talentsString: z.string(),
              rotation: z.record(z.string(), z.unknown()),
            }),
            encounter: z
              .object({
                duration: z.number(),
                targets: z.array(z.object({ level: z.number() }).passthrough()),
              })
              .passthrough(),
          }),
        }),
      )
      .length(6),
  })
  .parse(
    JSON.parse(
      gunzipSync(
        await readFile(
          new URL("./fixtures/current-warrior-tank-guidance.v1.json.gz", import.meta.url),
        ),
      ).toString("utf8"),
    ),
  );

describe("recorded Warrior tank guidance", (): void => {
  it("matches all six authentic fixed rotations and keeps raid and dungeon scenarios distinct", (): void => {
    for (const row of fixture.cases) {
      const guidance = testedWarriorTankGuidance(row.settings, row.scenario);
      expect(guidance.talents).toBe("8/5/38");
      expect(guidance.priorities).toHaveLength(11);
      expect(guidance.scenario).toContain(
        row.scenario === "raid" ? "one level-63" : "three level-62",
      );
      expect(guidance.priorities.join(" ")).toContain("Revenge before Shield Slam");
      expect(guidance.caveats.join(" ")).toContain("did not perform a deep rotation timing search");
    }
  });
  it("rejects altered talents, APL and encounter rather than publishing stale instructions", (): void => {
    const row = fixture.cases[0];
    if (!row) throw new Error("Missing recorded tank");
    const talents = structuredClone(row.settings);
    talents.player.talentsString = "1-1-1";
    expect((): unknown => testedWarriorTankGuidance(talents, row.scenario)).toThrow();
    const apl = structuredClone(row.settings);
    apl.player.rotation.priorityList = [];
    expect((): unknown => testedWarriorTankGuidance(apl, row.scenario)).toThrow(
      /rotation needs updated guidance/,
    );
    const encounter = structuredClone(row.settings);
    encounter.encounter.duration = 60;
    expect((): unknown => testedWarriorTankGuidance(encounter, row.scenario)).toThrow(
      /encounter differs/,
    );
    expect((): unknown => testedWarriorTankGuidance(row.settings, "solo")).toThrow(
      /encounter differs/,
    );
  });
  it("does not mutate saved settings", (): void => {
    const before = structuredClone(fixture);
    for (const row of fixture.cases) testedWarriorTankGuidance(row.settings, row.scenario);
    expect(fixture).toEqual(before);
  });
});
