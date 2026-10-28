import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readPaladinTankRotationGuidance } from "./forever-simulator-paladin-tank-guidance";

const fixture = z
  .object({
    schema: z.literal("kfc-recorded-paladin-tank-guidance.v1"),
    source: z.object({
      byteSha256: z.literal("90a4842874ffdb1f863189613a2a04e3572777d45b90f12ed5e7c5d9f0c51b13"),
    }),
    builds: z
      .array(
        z.object({
          id: z.string(),
          scenario: z.enum(["raid", "solo"]),
          settings: z.object({
            player: z.object({
              class: z.string(),
              talentsString: z.string(),
              protectionPaladin: z.object({
                options: z.object({ primarySeal: z.string(), righteousFury: z.boolean() }),
              }),
              rotation: z.object({
                type: z.string(),
                prepullActions: z.array(z.unknown()),
                priorityList: z.array(z.unknown()),
              }),
            }),
            encounter: z.object({
              duration: z.number(),
              targets: z.array(z.object({ level: z.number() })),
            }),
          }),
        }),
      )
      .length(6),
  })
  .parse(
    JSON.parse(
      gunzipSync(
        await readFile(new URL("./fixtures/paladin-tank-guidance.v1.json.gz", import.meta.url)),
      ).toString("utf8"),
    ),
  );

describe("recorded Protection Paladin instructions", (): void => {
  it("covers all six authentic setups with their actual talent allocation and priority", (): void => {
    for (const build of fixture.builds) {
      const before = structuredClone(build.settings);
      const guide = readPaladinTankRotationGuidance(build.settings, build.scenario);
      expect(guide.talents).toBe("0/42/9");
      expect(guide.prepull).toHaveLength(2);
      expect(guide.priorities).toHaveLength(9);
      expect(guide.priorities?.[0]).toContain("Judgement");
      expect(guide.priorities?.[6]).toContain("at least 15% mana");
      expect(guide.instruction).toContain("Righteous Fury");
      expect(guide.caveats.join(" ")).toContain("no execute phase");
      expect(guide.scenario).toContain(build.scenario === "raid" ? "raid" : "dungeon");
      expect(build.settings).toEqual(before);
    }
  });

  it("rejects changed actions rather than displaying instructions for the old priority", (): void => {
    const build = fixture.builds[0];
    if (!build) throw new Error("Missing authentic Paladin fixture");
    const settings = structuredClone(build.settings);
    settings.player.rotation.priorityList.reverse();
    expect(() => readPaladinTankRotationGuidance(settings, build.scenario)).toThrow(
      /measured priority/,
    );
  });

  it("rejects a different talent allocation even if its total remains 51 points", (): void => {
    const build = fixture.builds[0];
    if (!build) throw new Error("Missing authentic Paladin fixture");
    const settings = structuredClone(build.settings);
    settings.player.talentsString = "1-4520513321301551-15102";
    expect(() => readPaladinTankRotationGuidance(settings, build.scenario)).toThrow();
  });

  it("does not describe a Fury seal setup as the measured Righteousness priority", (): void => {
    const build = fixture.builds[0];
    if (!build) throw new Error("Missing authentic Paladin fixture");
    const settings = structuredClone(build.settings);
    settings.player.protectionPaladin.options.primarySeal = "Fury";
    expect(() => readPaladinTankRotationGuidance(settings, build.scenario)).toThrow();
  });

  it("keeps the dungeon and raid scenario descriptions bound to their actual encounters", (): void => {
    const build = fixture.builds[0];
    if (!build) throw new Error("Missing authentic Paladin fixture");
    expect(() => readPaladinTankRotationGuidance(build.settings, "solo")).toThrow(/scenario/);
  });
});
