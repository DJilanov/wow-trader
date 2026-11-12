import { describe, expect, it } from "vitest";
import { indexCombatReferences, resolveCombatObjectives } from "./campaign-combat.js";
import type { CombatNpc, CombatObjective, CombatQuestReference } from "./combat-model.js";
import { parseGuideChapter } from "./guide-archive.js";

const npcs: readonly CombatNpc[] = [
  { id: 735, name: "Murloc Streamrunner", minimumLevel: 6, maximumLevel: 7 },
  { id: 285, name: "Murloc", minimumLevel: 6, maximumLevel: 7 },
].map((npc): CombatNpc => ({ ...npc, rank: 0, zoneIds: [12], xpEligibility: "assumed" }));

const quest: CombatQuestReference = {
  questId: 99128,
  creatureIds: [735, 285],
  itemCreatureIds: [],
  objectiveText: ["Kill the murlocs at Crystal Lake."],
  onlyCreatureObjectives: true,
  killQuotas: [
    { objectiveIndex: 1, npcId: 735, kills: 4, source: "Captured Streamrunner death counter" },
    { objectiveIndex: 2, npcId: 285, kills: 7, source: "Captured Murloc death counter" },
  ],
};

function resolve(
  body: string,
  overrides: Partial<CombatQuestReference> = {},
): readonly CombatObjective[] {
  const guide = parseGuideChapter(`step\n${body}`, "chapter-test", "a".repeat(64), 70205);
  return resolveCombatObjectives(
    guide.steps[0]!.directives,
    indexCombatReferences({ npcs: [...npcs], quests: [{ ...quest, ...overrides }] }),
    "source-test",
  );
}

const source = ".complete 99128,1 >>Murloc Streamrunners slain (4)\n.mob +Murloc Streamrunner";

describe("corroborated plural source targets", () => {
  it("resolves the original 4+7 counters without changing their order or quotas", () => {
    const result = resolve(".complete 99128,2 >>Murloc slain (7)\n.mob +Murloc\n" + source);
    expect(result).toMatchObject([
      { objectiveIndex: 2, npcIds: [285], requiredKills: 7, credit: "shared-kills" },
      {
        objectiveIndex: 1,
        npcIds: [735],
        requiredKills: 4,
        credit: "shared-kills",
        source: "Captured Streamrunner death counter",
      },
    ]);
  });

  it.each([
    ["missing mob", ".complete 99128,1 >>Murloc Streamrunners slain (4)"],
    [
      "other objective's mob",
      ".mob +Murloc Streamrunner\n.complete 99128,2 >>Murloc slain (7)\n.mob +Murloc\n.complete 99128,1 >>Murloc Streamrunners slain (4)",
    ],
    ["unrelated label", source.replace("Streamrunners slain", "Scouts slain")],
    ["different creature", source.replace(".mob +Murloc Streamrunner", ".mob +Murloc")],
    ["conflicting quantity", source.replace("(4)", "(5)")],
    ["interaction", source + "\n.interact 735"],
  ])("holds %s", (_name, body) => {
    const result = resolve(body).find((objective) => objective.objectiveIndex === 1);
    expect(result).toMatchObject({ requiredKills: null, credit: "unknown" });
  });

  it("requires a captured quota for the same objective and creature", () => {
    for (const quotas of [[], [quest.killQuotas![1]!], [{ ...quest.killQuotas![0]!, npcId: 285 }]])
      expect(resolve(source, { killQuotas: quotas })[0]).toMatchObject({
        requiredKills: null,
        credit: "unknown",
      });
  });

  it("preserves explicit quota conflicts and disabled counters", () => {
    expect(resolve(source, { killQuotaConflicts: [1] })[0]).toMatchObject({
      requiredKills: null,
      credit: "unknown",
      quotaConflict: true,
    });
    expect(resolve(source.replace("\n.mob", "\n.disablecheckbox\n.mob"))).toEqual([]);
  });
});
