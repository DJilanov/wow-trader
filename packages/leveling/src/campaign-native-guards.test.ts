import { describe, expect, it } from "vitest";
import { freshQuestGuardSatisfied } from "./campaign-native-guards.js";
import { parseGuideChapter, type ImportedDirective } from "./guide-archive.js";

function directive(tag: string, id = "8"): ImportedDirective {
  return parseGuideChapter(`step\n${tag} ${id}`, "guard-test", "a".repeat(64), 70205).steps[0]!
    .directives[0]!;
}

describe("source quest guard semantics", () => {
  it.each([
    [".isOnQuest", [false, true, true]],
    [".isNotOnQuest", [true, false, false]],
    [".isQuestComplete", [false, false, true]],
    [".isQuestNotComplete", [true, true, false]],
    [".isQuestTurnedIn", [false, false, false]],
    [".isQuestAvailable", [true, true, true]],
  ] as const)("checks %s before each fresh quest phase", (tag, expected) => {
    const phases = ["accepted", "objectives-complete", "rewarded"] as const;
    expect(
      phases.map((phase) => freshQuestGuardSatisfied(directive(tag), 8, phase, new Set())),
    ).toEqual(expected);
  });

  it("treats a required rewarded parent as turned in and absent from the active quest log", () => {
    expect(
      freshQuestGuardSatisfied(directive(".isQuestTurnedIn", "7"), 8, "accepted", new Set([7])),
    ).toBe(true);
    expect(
      freshQuestGuardSatisfied(directive(".isQuestComplete", "7"), 8, "accepted", new Set([7])),
    ).toBe(false);
    expect(
      freshQuestGuardSatisfied(directive(".isOnQuest", "7"), 8, "accepted", new Set([7])),
    ).toBe(false);
    expect(
      freshQuestGuardSatisfied(directive(".isQuestAvailable", "7"), 8, "accepted", new Set([7])),
    ).toBe(false);
  });

  it("holds unrelated or multi-quest guards instead of assuming their state", () => {
    expect(
      freshQuestGuardSatisfied(directive(".isQuestTurnedIn", "7"), 8, "accepted", new Set()),
    ).toBe(false);
    expect(
      freshQuestGuardSatisfied(directive(".isOnQuest", "8,9"), 8, "objectives-complete", new Set()),
    ).toBe(false);
  });
});
