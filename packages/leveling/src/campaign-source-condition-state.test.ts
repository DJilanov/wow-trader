import { describe, expect, it } from "vitest";
import { z } from "zod";
import fixture from "./fixtures/source-conditions-v41127.json" with { type: "json" };
import { parseGuideChapter } from "./guide-archive.js";
import { evaluateCampaignSourceChecks } from "./campaign-source-condition-state.js";

const cases = z
  .array(
    z
      .object({
        tag: z.string(),
        args: z.array(z.string()),
        states: z.record(
          z.string(),
          z.enum(["not-started", "accepted", "objectives-complete", "rewarded"]),
        ),
        expectedSkip: z.boolean(),
        items: z.record(z.string(), z.number().int().nonnegative()),
        money: z.number().int().nonnegative(),
      })
      .strict(),
  )
  .parse(fixture.cases);

function checks(text: string): ReturnType<typeof parseGuideChapter>["steps"][number]["directives"] {
  return parseGuideChapter(`step\n${text}`, "condition-control", "a".repeat(64), 70205).steps[0]!
    .directives;
}

describe("source conditions against pinned RXP execution", () => {
  it.each(cases)("matches $tag $args with states $states", (control) => {
    const directives = checks(`.${control.tag} ${control.args.join(",")}`);
    expect(
      evaluateCampaignSourceChecks(directives, {
        questStates: control.states,
        itemCounts: new Map(
          Object.entries(control.items).map(([id, count]) => [Number(id), count]),
        ),
        moneyCopper: control.money,
      }),
    ).toBe(control.expectedSkip ? "skip" : "execute");
  });

  it("does not invent item counts, money, account history or resource flags", () => {
    for (const text of [
      ".itemcount 2886,6",
      ".money <0.5",
      ".isQuestTurnedIn 100,account",
      ".itemcount 2886,6,bank",
      ".isOnQuest 9999999999999999999999999999",
    ])
      expect(evaluateCampaignSourceChecks(checks(text), { questStates: {} })).toBe("unknown");
  });

  it("keeps uncertain branch states unknown without losing a proven active condition", () => {
    const context = { questStates: { "100": ["accepted", "objectives-complete"] as const } };
    expect(evaluateCampaignSourceChecks(checks(".isQuestComplete 100"), context)).toBe("unknown");
    expect(evaluateCampaignSourceChecks(checks(".isOnQuest 100"), context)).toBe("execute");
    expect(evaluateCampaignSourceChecks(checks(".isQuestTurnedIn 100"), context)).toBe("skip");
  });

  it("lets a proven skip dominate unrecorded optional resources", () => {
    expect(
      evaluateCampaignSourceChecks(checks(".itemcount 2886,6\n.isQuestComplete 100"), {
        questStates: { "100": "accepted" },
      }),
    ).toBe("skip");
  });
});
