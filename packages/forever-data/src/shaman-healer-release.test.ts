import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { shamanHealerPresentationSchema } from "./shaman-healer-release.js";
import { shamanHealerLibraryIndexSchema } from "./shaman-healer-library.js";

const bytes = readFileSync(
  new URL("./fixtures/shaman-healer-presentation.v1.json.gz", import.meta.url),
);
expect(createHash("sha256").update(bytes).digest("hex")).toBe(
  "5631acf0c0e075255375b693920b4c2346962d95b24cb5b12dd3f13b9377c3a0",
);
const fixture = z
  .object({
    schema: z.literal("kfc-shaman-healer-presentation-fixture.v1"),
    presentation: z.unknown(),
    libraryIndex: z.unknown(),
    input: z.object({ path: z.string(), byteSha256: z.string().length(64) }),
    noNewSimulationsExecuted: z.literal(true),
  })
  .strict()
  .parse(JSON.parse(gunzipSync(bytes).toString("utf8")));
const presentation = shamanHealerPresentationSchema.parse(fixture.presentation);
const index = shamanHealerLibraryIndexSchema.parse(fixture.libraryIndex);

describe("Shaman healer presentation", () => {
  it("retains the real five-race equipment, spell and enchant data for the measured library", () => {
    expect(presentation).toEqual(fixture.presentation);
    expect(presentation.modelIdentity).toBe(index.modelIdentity);
    expect(presentation.runtimeIdentity).toBe(index.runtimeIdentity);
    expect(presentation.libraryIndexSha256).toBe(
      createHash("sha256")
        .update(JSON.stringify(fixture.libraryIndex) + "\n")
        .digest("hex"),
    );
    expect(presentation.items).toHaveLength(2019);
    expect(presentation.equipmentRules).toHaveLength(2019);
    expect(presentation.enchants).toHaveLength(105);
    expect(presentation.spells).toHaveLength(33);
    expect(presentation.scenarios).toHaveLength(14);
    for (const entry of index.groups)
      expect(presentation.races.find((race) => race.id === entry.group.race)?.profileId).toBe(
        entry.group.profileId,
      );
  });

  it("resolves both numeric ranks and fixed one-point talent descriptions", () => {
    const fixed = presentation.talents[0]!.talents[15]!;
    expect(fixed.max).toBe(1);
    expect(fixed.descriptions).toHaveLength(1);
    expect(fixed.descriptions[0]).not.toBe("");
    for (const talent of presentation.talents.flatMap((tree) => tree.talents)) {
      expect(talent.descriptions).toHaveLength(talent.max);
      expect(talent.descriptions.every((text) => !/\{\d+\}|<[^>]*>/.test(text))).toBe(true);
    }
  });

  it("shows the legacy values actually used by the engine and preserves profession requirements", () => {
    for (const [id, value] of [
      [12930, 15],
      [18471, 18],
    ]) {
      const item = presentation.items.find((item) => item.id === id)!;
      expect(item.stats.find((stat) => stat.label === "Spell power")?.value).toBe(value);
      expect(item.effectLines.some((line) => line.includes(String(value)))).toBe(true);
    }
    expect(presentation.items.find((item) => item.id === 227862)?.effectLines).toContain(
      "Requires Tailoring",
    );
    expect(
      presentation.items
        .find((item) => item.id === 252561)
        ?.effectLines.some((line) => line.startsWith("Requires ")),
    ).toBe(false);
  });

  it("rejects stale profiles, missing enchant rules and unsupported talent references", () => {
    for (const kind of ["race", "enchant", "rule", "talent", "scenario", "duplicate"] as const) {
      const changed = structuredClone(presentation);
      if (kind === "race") changed.races[0]!.profileId = "unknown-profile";
      if (kind === "enchant") changed.enchants = [];
      if (kind === "rule") changed.equipmentRules.pop();
      if (kind === "talent") changed.supportedTalentFields.push("unknownTalent");
      if (kind === "scenario") changed.scenarios[0]!.id = "unknown-scenario";
      if (kind === "duplicate") changed.items.push(changed.items[0]!);
      expect(shamanHealerPresentationSchema.safeParse(changed).success, kind).toBe(false);
    }
  });
});
