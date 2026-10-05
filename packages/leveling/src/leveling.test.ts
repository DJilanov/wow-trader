import { describe, expect, it } from "vitest";

import {
  compareBranches,
  parseNumericInput,
  xpToCheckpoint,
  type BranchComparisonInput,
} from "./calculator.js";
import { compileGuides } from "./compiler.js";
import { validateRoute } from "./model.js";
import {
  createThanesBranch,
  DUNGEON_LEVELS,
  FOREVER_XP_CURVE,
  missingPrerequisites,
  planDungeonLevel,
  THANES_ROUTE,
  WESTFALL_ROUTE,
} from "./westfall.js";

function scenario(overrides: Partial<BranchComparisonInput> = {}): BranchComparisonInput {
  return {
    level: 14,
    currentXp: 0,
    curve: FOREVER_XP_CURVE,
    omitted: [{ id: "outdoor", xp: 20_000 }],
    added: [{ id: "dungeon", xp: 20_000 }],
    completedQuestIds: [],
    outdoorMinutes: 90,
    time: { clear: 25, travel: 15, pickups: 0, idleWait: 0, prerequisites: 0, turnins: 0 },
    alternativeXpPerHour: 0,
    checkpoints: [{ id: "entry", level: 14, cumulativeEarnedXp: 0 }],
    ...overrides,
  };
}

describe("incremental dungeon comparisons", () => {
  it("saves 50 minutes against a crowded 90-minute block", () => {
    expect(compareBranches(scenario())).toMatchObject({
      state: "complete",
      savedMinutes: 50,
      catchupMinutes: 0,
    });
  });
  it("costs 10 minutes against the same quiet 30-minute block", () => {
    expect(compareBranches(scenario({ outdoorMinutes: 30 })).savedMinutes).toBe(-10);
  });
  it("subtracts rewards already budgeted by the retained route", () => {
    const result = compareBranches(
      scenario({ added: [{ id: "crest", questId: 95189, xp: 6200, baselineXp: 2600 }] }),
    );
    expect(result.addedXp).toBe(3600);
  });
  it("counts a shared kill/travel XP activity once", () => {
    const result = compareBranches(
      scenario({
        omitted: [
          { id: "shared-boars", xp: 1000 },
          { id: "shared-boars", xp: 1000 },
        ],
      }),
    );
    expect(result.omittedXp).toBe(1000);
  });
  it("rejects inconsistent shared activity XP", () => {
    expect(
      compareBranches(
        scenario({
          omitted: [
            { id: "boars", xp: 1000 },
            { id: "boars", xp: 2000 },
          ],
        }),
      ).state,
    ).toBe("invalid");
  });
  it("rejects duplicate one-time rewards across planned visits", () => {
    expect(
      compareBranches(
        scenario({
          added: [
            { id: "visit-one", questId: 166, xp: 2600 },
            { id: "visit-two", questId: 166, xp: 2600 },
          ],
        }),
      ).state,
    ).toBe("invalid");
  });
  it("excludes completed quests including unknown rewards", () => {
    const result = compareBranches(
      scenario({
        added: [
          { id: "done", questId: 166, xp: null },
          { id: "new", xp: 20_000 },
        ],
        completedQuestIds: [166],
      }),
    );
    expect(result.addedXp).toBe(20_000);
  });
  it("preserves unknown reward XP and hides a time-saving verdict", () => {
    expect(compareBranches(scenario({ added: [{ id: "unobserved", xp: null }] }))).toMatchObject({
      state: "incomplete",
      addedXp: null,
      savedMinutes: null,
    });
  });
  it("charges catch-up time for omitted kill XP", () => {
    expect(
      compareBranches(
        scenario({ added: [{ id: "dungeon", xp: 10_000 }], alternativeXpPerHour: 20_000 }),
      ),
    ).toMatchObject({ shortfallXp: 10_000, catchupMinutes: 30, savedMinutes: 20 });
  });
  it("allows zero catch-up rate only with no shortfall", () => {
    expect(compareBranches(scenario()).state).toBe("complete");
    expect(compareBranches(scenario({ added: [] })).state).toBe("incomplete");
  });
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid time %s",
    (outdoorMinutes) => {
      expect(compareBranches(scenario({ outdoorMinutes })).state).toBe("invalid");
    },
  );
  it("requires current XP to fit within the current level", () => {
    expect(compareBranches(scenario({ currentXp: 12900 })).state).toBe("invalid");
  });
  it("blocks an early visit despite a positive final XP balance", () => {
    const result = compareBranches(
      scenario({
        level: 13,
        checkpoints: [
          { id: "entry", level: 14, cumulativeEarnedXp: 100 },
          { id: "return", level: 15, cumulativeEarnedXp: 50_000 },
        ],
      }),
    );
    expect(result).toMatchObject({ state: "blocked", savedMinutes: null });
    expect(result.checkpoints[0]?.shortfallXp).toBe(11_300);
  });
  it("requires a known curve for checkpoints spanning levels", () => {
    expect(
      compareBranches(
        scenario({
          curve: null,
          checkpoints: [{ id: "entry", level: 15, cumulativeEarnedXp: 50_000 }],
        }),
      ).state,
    ).toBe("incomplete");
  });
  it("uses the extracted curve at every intervening level", () => {
    expect(xpToCheckpoint(13, 400, 15, FOREVER_XP_CURVE)).toBe(23_900);
    expect(xpToCheckpoint(13, 0, 14, { 14: 12900 })).toBeNull();
    expect(xpToCheckpoint(59, 0, 60, FOREVER_XP_CURVE)).toBe(209_800);
  });
  it("never turns a blank numeric input into zero", () => {
    expect(parseNumericInput(" ")).toBeNull();
    expect(parseNumericInput("0")).toBe(0);
    expect(parseNumericInput("1.5", true)).toBeNull();
  });
});

describe("route and recommended visit levels", () => {
  const thanes = DUNGEON_LEVELS.find((entry) => entry.id === "thanes")!;
  it("uses At level independently from minimum pickup levels", () => {
    expect(planDungeonLevel(thanes, [96395, 96403], WESTFALL_ROUTE.quests)).toBe(14);
    expect(planDungeonLevel(thanes, [96394], WESTFALL_ROUTE.quests)).toBe(15);
    expect(planDungeonLevel(thanes, [98423], WESTFALL_ROUTE.quests)).toBe(16);
    expect(DUNGEON_LEVELS.find((entry) => entry.id === "deadmines")?.atLevel).toBe(19);
  });
  it("renders only selected rewards and gates the whole bundle before entry", () => {
    const branch = createThanesBranch([96403, 96394, 96393]);
    expect(branch[0]).toMatchObject({ action: "checkpoint", level: 15 });
    expect(branch.some((entry) => entry.questId === 96395)).toBe(false);
    for (const questId of [96403, 96394, 96393]) {
      expect(
        branch.filter((entry) => entry.questId === questId).map((entry) => entry.action),
      ).toEqual(["accept", "complete", "turnin"]);
    }
    expect(branch.at(-1)?.id).toBe("return-westfall");
    expect(() => createThanesBranch([166])).toThrow("Unknown Hall of Thanes quest");
  });
  it("keeps the compiled default and the browser default sequence aligned", () => {
    expect(createThanesBranch([96395, 96403]).map((entry) => entry.id)).toEqual(
      THANES_ROUTE.steps.map((entry) => entry.id),
    );
    const treaty = createThanesBranch([98423]);
    expect(treaty[0]?.level).toBe(16);
    expect(treaty.filter((entry) => entry.questId === 98423).map((entry) => entry.action)).toEqual([
      "accept",
      "complete",
      "turnin",
    ]);
  });
  it("finds the entire missing prerequisite path rather than the immediate edge", () => {
    expect(missingPrerequisites(166, new Set(), WESTFALL_ROUTE.quests)).toEqual([
      155, 142, 141, 135, 132, 65,
    ]);
    expect(missingPrerequisites(166, new Set([155]), WESTFALL_ROUTE.quests)).toEqual([]);
  });
  it("does not invent a self-prerequisite from a storyline list", () => {
    expect(missingPrerequisites(92753, new Set(), WESTFALL_ROUTE.quests)).not.toContain(92753);
  });
  it("rejects dependency cycles and unknown references", () => {
    const cyclic = structuredClone(WESTFALL_ROUTE);
    cyclic.quests.find((entry) => entry.id === 65)!.prerequisiteIds = [155];
    expect(() => validateRoute(cyclic)).toThrow("cycle");
    expect(() => validateRoute({ ...WESTFALL_ROUTE, omittedCandidates: [99999] })).toThrow(
      "Unknown",
    );
  });
});

describe("original RestedXP compiler", () => {
  it("emits matching IDs, supported syntax and real quest actions deterministically", () => {
    const output = compileGuides([WESTFALL_ROUTE, THANES_ROUTE]);
    expect(output).toEqual(compileGuides([WESTFALL_ROUTE, THANES_ROUTE]));
    expect(output.lua).toContain(".accept 96403");
    expect(output.lua).toContain(".complete 96395,1");
    expect(output.lua).toContain(".complete 38,4");
    expect(output.lua).toContain(".turnin 96395");
    expect(output.lua).toContain(".xp 14");
    expect(output.lua).not.toContain(".dungeon");
    expect(output.lua).not.toContain("#xprate");
    expect(output.toc).toContain("Dependencies: RXPGuides");
    for (const step of WESTFALL_ROUTE.steps) expect(output.lua).toContain(`#label ${step.id}`);
  });
  it("rejects completion/turn-in before acceptance", () => {
    expect(() =>
      compileGuides([
        { ...THANES_ROUTE, steps: THANES_ROUTE.steps.filter((step) => step.action !== "accept") },
      ]),
    ).toThrow("accepted");
  });
  it("rejects mixed releases and parser directive injection", () => {
    expect(() => compileGuides([WESTFALL_ROUTE, { ...THANES_ROUTE, clientBuild: 99999 }])).toThrow(
      "identical",
    );
    expect(() =>
      compileGuides([
        {
          ...WESTFALL_ROUTE,
          steps: [{ ...WESTFALL_ROUTE.steps[0]!, text: "text\n.dungeon unknown" }],
        },
      ]),
    ).toThrow("one line");
  });
});
