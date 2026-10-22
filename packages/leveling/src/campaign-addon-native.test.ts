import { describe, expect, it } from "vitest";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";

function fixture(text: string): {
  plan: CampaignPlan;
  sources: readonly CampaignSource[];
  action: CampaignAction;
} {
  const guide = parseGuideChapter(text, "test-chapter", "a".repeat(64), 70205);
  const step = guide.steps[0]!;
  const action: CampaignAction = {
    id: "test-action",
    legId: "test-leg",
    title: "Test",
    instructions: [],
    questChanges: step.directives
      .filter((directive) => directive.questId !== null)
      .map((directive) => ({
        questId: directive.questId!,
        title: "Test quest",
        state:
          directive.tag === ".accept"
            ? "accepted"
            : directive.tag === ".turnin"
              ? "rewarded"
              : "objectives-complete",
        objectiveIndex:
          directive.tag === ".complete" ? Number(directive.arguments.split(",")[1] ?? 1) : null,
      })),
    positions: step.directives.flatMap((directive) =>
      directive.position
        ? [{ sourceLine: directive.sourceLine, position: directive.position }]
        : [],
    ),
    source: { chapterId: guide.chapterId, version: guide.version, stepId: step.id },
    kind: "quests",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
  return {
    plan: {
      release: "test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      legs: [],
      actions: [action],
    },
    sources: [{ reference: { ...CHAPTER_REFERENCES[0]!, condition: "" }, guide }],
    action,
  };
}

describe("canonical campaign native instructions", () => {
  it("combines step and quest eligibility without leaking a chapter's route-selection guard into shared work", () => {
    const { plan, sources, action } = fixture("step << Warrior/Rogue\n .accept 7 << Human/Dwarf");
    const scoped = [
      { ...sources[0]!, reference: { ...sources[0]!.reference, condition: "Human/Dwarf" } },
    ];
    expect(campaignNativeInstructions(plan, scoped)(action)!.condition).toBe(
      "Warrior Human/Warrior Dwarf/Rogue Human/Rogue Dwarf",
    );
  });
  it("retains class eligibility on a canonical quest phase synthesized from known quest evidence", () => {
    const { plan, sources, action } = fixture("step\n .accept 7 << Warrior");
    const complete = {
      ...action,
      questChanges: [
        { ...action.questChanges[0]!, state: "objectives-complete" as const, objectiveIndex: 1 },
      ],
    };
    const native = campaignNativeInstructions(plan, sources)(complete)!;
    expect(native.condition).toBe("Warrior");
    expect(native.canonicalQuestConditions).toEqual({ 7: "Warrior" });
    expect(native.directives).toEqual([]);
  });
  it("skips unavailable training reminders rather than blocking the sequential route or hiding its window", () => {
    const { plan, sources, action } = fixture("step\n #level 10\n #hidewindow\n .train 355");
    expect(
      campaignNativeInstructions(
        plan,
        sources,
      )(action)!.directives.map((directive) => [directive.tag, directive.arguments]),
    ).toEqual([
      [".xp", "<10,1"],
      [".train", "355"],
    ]);
    const cancellation = fixture("step\n .accept 7\n .abandon 7");
    expect(() =>
      campaignNativeInstructions(cancellation.plan, cancellation.sources)(cancellation.action),
    ).toThrow("Abandoning a retained campaign quest");
  });
  it("preserves exact waypoint radius/order and native travel and training semantics", () => {
    const { plan, sources, action } = fixture(`step
      .goto 1429/0,-75.05,-8872.36,35,0
      .train 6673
      .goto 1429/0,-112.74,-8901.66
      .fp Stormwind
      .home Goldshire
      .hs
      .fly Ironforge
      .zone Ironforge
      .trainer
      .vendor`);
    const native = campaignNativeInstructions(plan, sources)(action)!;
    expect(native.directives.map((directive) => [directive.tag, directive.arguments])).toEqual([
      [".goto", "1429/0,-75.05,-8872.36,35,0"],
      [".train", "6673"],
      [".goto", "1429/0,-112.74,-8901.66"],
      [".fp", "Stormwind"],
      [".home", "Goldshire"],
      [".hs", ""],
      [".fly", "Ironforge"],
      [".zone", "Ironforge"],
      [".trainer", ""],
      [".vendor", ""],
    ]);
  });

  it("keeps retained native quest arguments and class eligibility, not discarded quest phases or utilities", () => {
    const { plan, sources, action } = fixture(`step
      .turnin 7,2 >> Choose the second reward << Warrior
      .target Marshal
      .accept 8
      .target Deputy
      .use 111
      .collect 112,1,8,1
      .addquestitem 113,7
      .isOnQuest 8
      .isQuestTurnedIn 7`);
    const selected = {
      ...action,
      questChanges: action.questChanges.filter((change) => change.questId === 7),
    };
    const native = campaignNativeInstructions(plan, sources)(selected)!;
    expect(native.condition).toBe("Warrior");
    expect(native.directives.map((directive) => directive.tag)).toEqual([
      ".turnin",
      ".target",
      ".addquestitem",
      ".isQuestTurnedIn",
    ]);
    expect(native.directives[0]!.arguments).toBe("7,2");
    expect(native.directives[0]!.condition).toBe("Warrior");
  });

  it("preserves quest-item tracking for the selected objective without reviving other quests", () => {
    const { plan, sources, action } = fixture(`step
      .complete 7,1
      .use 111
      .collect 111,1,7,1
      .mob Wolf
      .complete 8,1
      .collect 112,1,8,1
      .mob Bear`);
    const selected = {
      ...action,
      questChanges: action.questChanges.filter((change) => change.questId === 7),
    };
    const native = campaignNativeInstructions(plan, sources)(selected)!;
    expect(native.directives.map((directive) => [directive.tag, directive.arguments])).toEqual([
      [".complete", "7,1"],
      [".use", "111"],
      [".collect", "111,1,7,1"],
      [".mob", "Wolf"],
    ]);
  });

  it("uses the canonical sequential graph and required XP, not source optional grinding or stale labels", () => {
    const { plan, sources, action } = fixture(`step
      #label old
      #requires removed
      #completewith next
      #sticky
      #loop
      #optional
      .xp 60
      .maxlevel 4
      .disablecheckbox
      .accept 7`);
    expect(
      campaignNativeInstructions(
        plan,
        sources,
      )(action)!.directives.map((directive) => directive.tag),
    ).toEqual([".accept"]);
    expect(
      campaignNativeInstructions(plan, sources)({ ...action, kind: "xp-check", targetLevel: 5 }),
    ).toBeNull();
  });

  it("does not copy another class's instructions or unsupported executable commands", () => {
    const { plan, sources, action } = fixture(`step
      .accept 7 << Warrior
      .train 116 << Mage`);
    expect(
      campaignNativeInstructions(
        plan,
        sources,
      )(action)!.directives.map((directive) => directive.tag),
    ).toEqual([".accept"]);
    const unsupported = fixture("step\n .accept 7\n .unknown 1");
    expect(() =>
      campaignNativeInstructions(unsupported.plan, unsupported.sources)(unsupported.action),
    ).toThrow("Unsupported native instruction");
    const unsafe = fixture("step\n .accept 7\n .link javascript:alert(1)");
    expect(() => campaignNativeInstructions(unsafe.plan, unsafe.sources)(unsafe.action)).toThrow(
      "HTTPS",
    );
  });

  it("fails closed on a wrong source identity/build instead of fabricating native commands", () => {
    const { plan, sources, action } = fixture("step\n .accept 7");
    expect(() => campaignNativeInstructions({ ...plan, targetBuild: 70450 }, sources)).toThrow(
      "build mismatch",
    );
    expect(() =>
      campaignNativeInstructions(
        plan,
        sources,
      )({ ...action, source: { ...action.source!, version: "different" } }),
    ).toThrow("unavailable or ineligible");
    expect(() =>
      campaignNativeInstructions(
        plan,
        sources,
      )({ ...action, questChanges: [{ ...action.questChanges[0]!, questId: 8 }] }),
    ).toThrow("does not cover quest 8");
  });
});
