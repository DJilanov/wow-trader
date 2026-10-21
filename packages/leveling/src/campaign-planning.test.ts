import { describe, expect, it } from "vitest";
import {
  auditCampaignSections,
  campaignCoverageReady,
  campaignPlanningReadiness,
  type CampaignSectionCoverage,
} from "./campaign-coverage.js";
import { forecastCampaignXp, type CampaignXpSectionForecast } from "./campaign-xp.js";
import type { CampaignEvidenceIssue } from "./campaign-evidence.js";
import type { CampaignPlan } from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";

function fixture(): {
  chapters: readonly CampaignSectionCoverage[];
  sections: readonly CampaignXpSectionForecast[];
} {
  const plan: CampaignPlan = {
    release: "planning-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    legs: [
      {
        id: "finish",
        title: "Finish",
        kind: "finish",
        from: 60,
        to: 60,
        stopId: null,
        actionIds: ["finish"],
        questIds: [],
        unresolvedQuestIds: [],
      },
    ],
    actions: [
      {
        id: "finish",
        legId: "finish",
        title: "Finish",
        kind: "instructions",
        instructions: [],
        questChanges: [],
        positions: [],
        source: null,
        leaderOnly: false,
        targetLevel: null,
        targetStopId: null,
        raidOnly: false,
      },
    ],
  };
  const base = emptyPremadeProgress();
  const progress = {
    ...base,
    members: base.members.map((member) => ({
      ...member,
      level: 60,
      currentXp: 0,
      xpNeedsUpdate: false,
    })),
  };
  return {
    chapters: auditCampaignSections(plan, progress),
    sections: forecastCampaignXp(plan, progress),
  };
}

function changeMember(
  sections: readonly CampaignXpSectionForecast[],
  changes: Partial<CampaignXpSectionForecast["members"][number]>,
): readonly CampaignXpSectionForecast[] {
  return sections.map((section) => ({
    ...section,
    members: section.members.map((member, index) =>
      index === 0 ? { ...member, ...changes } : member,
    ),
  }));
}

function issue(code: CampaignEvidenceIssue["code"]): CampaignEvidenceIssue {
  return {
    code,
    domain: "combat",
    message: "Synthetic reference or omitted-combat warning",
    resolution: "offline-or-in-game",
    actionId: "finish",
    questId: null,
    blocksForecast: false,
  };
}

describe("continuous campaign planning readiness", () => {
  it("keeps a usable estimated route separate from independent diagnostics and strict coverage", () => {
    const { chapters, sections } = fixture();
    const diagnostics = chapters.map((chapter) => ({ ...chapter, status: "blocked" as const }));
    const estimated = changeMember(sections, {
      status: "incomplete",
      issues: [issue("combat-profile-unverified")],
    });
    const before = JSON.stringify({ diagnostics, estimated });
    expect(campaignPlanningReadiness(diagnostics, estimated)).toEqual({
      ready: true,
      status: "ready-with-estimates",
      blockingSectionIds: [],
      estimatedSectionIds: [sections[0]!.sectionId],
      reason: null,
    });
    expect(campaignCoverageReady(diagnostics, estimated)).toBe(false);
    expect(JSON.stringify({ diagnostics, estimated })).toBe(before);
  });

  it.each([
    "combat-input-unknown",
    "combat-scenario-estimated",
    "adaptive-grind-unmeasured",
  ] as const)("does not require observations to use a funded plan with %s", (code) => {
    const { chapters, sections } = fixture();
    expect(
      campaignPlanningReadiness(
        chapters,
        changeMember(sections, {
          status: "incomplete",
          issues: [issue(code)],
        }),
      ),
    ).toMatchObject({ ready: true, status: "ready-with-estimates" });
  });

  it("reports a supported no-estimate finish without claiming playtest certification", () => {
    const { chapters, sections } = fixture();
    expect(campaignPlanningReadiness(chapters, sections)).toMatchObject({
      ready: true,
      status: "ready",
    });
  });

  it.each(["blocked", "shortfall", "no-start", "before-start"] as const)(
    "does not clear a %s continuous forecast",
    (status) => {
      const { chapters, sections } = fixture();
      expect(campaignPlanningReadiness(chapters, changeMember(sections, { status }))).toMatchObject(
        { ready: false, blockingSectionIds: [sections[0]!.sectionId] },
      );
    },
  );

  it.each([
    { endpoint: null },
    { residualXp: null },
    { residualXp: 1 },
    { blockedReason: "Real pickup prerequisite missing" },
    {
      issues: [{ ...issue("reward-unresolved"), domain: "reward" as const, blocksForecast: true }],
    },
    {
      checkpoints: [
        {
          actionId: "pickup",
          targetLevel: 60,
          position: null,
          missingXp: 1,
          ready: false,
          planningOnly: false,
        },
      ],
    },
  ])("preserves unmet requirements and missing inputs: %j", (changes) => {
    const { chapters, sections } = fixture();
    expect(campaignPlanningReadiness(chapters, changeMember(sections, changes)).ready).toBe(false);
  });

  it("requires all five distinct players at a supported level-60 endpoint", () => {
    const { chapters, sections } = fixture();
    for (const members of [
      sections[0]!.members.slice(0, 4),
      sections[0]!.members.map((member) => ({ ...member, player: 1 })),
      sections[0]!.members.map((member, index) =>
        index === 4 ? { ...member, endpoint: { level: 59, currentXp: 0 } } : member,
      ),
    ])
      expect(campaignPlanningReadiness(chapters, [{ ...sections[0]!, members }]).ready).toBe(false);
  });

  it("checks only the leader in a personal branch, then all five at the shared finish", () => {
    const { chapters, sections } = fixture();
    const starter = { ...chapters[0]!, sectionId: "starter", audience: "leader" as const };
    const personal = {
      ...sections[0]!,
      sectionId: "starter",
      members: sections[0]!.members.map((member, index) =>
        index === 0
          ? member
          : {
              ...member,
              status: "no-start" as const,
              endpoint: null,
              residualXp: null,
            },
      ),
    };
    expect(campaignPlanningReadiness([starter, ...chapters], [personal, ...sections]).ready).toBe(
      true,
    );
    expect(
      campaignPlanningReadiness(
        [{ ...starter, audience: "party" }, ...chapters],
        [personal, ...sections],
      ).ready,
    ).toBe(false);
  });

  it("rejects empty, duplicate, missing and out-of-order section inventories", () => {
    const { chapters, sections } = fixture();
    const nextChapter = { ...chapters[0]!, sectionId: "next" };
    const nextSection = { ...sections[0]!, sectionId: "next" };
    for (const [chapterRows, sectionRows] of [
      [[], []],
      [chapters, []],
      [[], sections],
      [
        [...chapters, ...chapters],
        [...sections, ...sections],
      ],
      [chapters, [nextSection]],
      [
        [...chapters, nextChapter],
        [nextSection, ...sections],
      ],
    ] as const)
      expect(campaignPlanningReadiness(chapterRows, sectionRows)).toMatchObject({
        ready: false,
        status: "blocked",
        reason: expect.any(String),
      });
  });
});
