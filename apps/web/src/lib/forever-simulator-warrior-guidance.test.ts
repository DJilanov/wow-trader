import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { testedWarriorRotationGuidance } from "./forever-simulator-warrior-guidance";

const source = z
  .object({
    source: z
      .object({
        byteSha256: z.literal("b0ece2dd4afaf9d60fcc0e6473a00bbba4d5894dd2b16c419fbd7b894f9f9c5c"),
      })
      .passthrough(),
    builds: z
      .array(
        z.object({
          id: z.string(),
          settings: z.object({
            player: z.object({
              talentsString: z.string(),
              rotation: z.object({ type: z.string(), priorityList: z.array(z.unknown()) }),
            }),
          }),
        }),
      )
      .length(5),
  })
  .parse(
    JSON.parse(
      gunzipSync(
        await readFile(new URL("./fixtures/current-warrior-guidance.v1.json.gz", import.meta.url)),
      ).toString("utf8"),
    ),
  );

describe("tested Warrior rotation guidance", (): void => {
  it("translates every action in all five authentic selected rotations", (): void => {
    for (const build of source.builds) {
      const guide = testedWarriorRotationGuidance(build.settings);
      expect(guide.priorities).toHaveLength(build.settings.player.rotation.priorityList.length);
      expect(guide.priorities[0]).toBe(
        "Use Recklessness when the target is in the 20% execute phase.",
      );
      expect(guide.priorities[1]).toBe("Use the other enabled automatic cooldowns when available.");
      expect(guide.priorities.join(" ")).not.toContain("undefined");
      expect(guide.caveats.join(" ")).toContain("2%");
    }
    expect(testedWarriorRotationGuidance(source.builds[0]?.settings).talents).toBe("19/32/0");
    expect(testedWarriorRotationGuidance(source.builds[2]?.settings).talents).toBe("39/10/2");
  });
  it("keeps execute exclusions and the actual rage thresholds", (): void => {
    const fury = testedWarriorRotationGuidance(source.builds[0]?.settings);
    expect(fury.priorities.at(-1)).toBe(
      "Queue Heroic Strike when (rage is at least 30) and (not (the target is in the 20% execute phase)).",
    );
    const arms = testedWarriorRotationGuidance(source.builds[2]?.settings);
    expect(arms.priorities).toContain("Use Slam when rage is at least 15.");
    expect(arms.priorities.join(" ")).toContain("rage is at least 90");
  });
  it("rejects unknown spells, unsupported comparisons and unspent talents", (): void => {
    const base = source.builds[0]?.settings;
    expect(base).toBeDefined();
    for (const action of [
      { castSpell: { spellId: { spellId: 999999999 } } },
      { castSpell: { spellId: { spellId: 25286, tag: 2 } } },
      {
        castSpell: { spellId: { spellId: 1680 } },
        condition: { cmp: { op: "OpGt", lhs: { currentRage: {} }, rhs: { const: { val: "30" } } } },
      },
      { castSpell: { spellId: { spellId: 1680 } }, condition: { currentHealthPercent: {} } },
    ]) {
      const data = structuredClone(base);
      if (!data) throw new Error("Missing source fixture");
      data.player.rotation.priorityList = [{ action }];
      expect((): unknown => testedWarriorRotationGuidance(data)).toThrow();
    }
    const data = structuredClone(base);
    if (!data) throw new Error("Missing source fixture");
    data.player.talentsString = "1-1-1";
    expect((): unknown => testedWarriorRotationGuidance(data)).toThrow(/51 talent points/);
  });
  it("leaves the measured source settings untouched", (): void => {
    const before = structuredClone(source.builds);
    for (const build of source.builds) testedWarriorRotationGuidance(build.settings);
    expect(source.builds).toEqual(before);
  });
});
