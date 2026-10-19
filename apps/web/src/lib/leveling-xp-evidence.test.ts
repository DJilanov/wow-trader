import { describe, expect, it } from "vitest";
import type { CampaignEvidenceIssue } from "@wow-trader/leveling";
import { describeChapterEvidence } from "./leveling-xp-evidence";

const issue = (overrides: Partial<CampaignEvidenceIssue> = {}): CampaignEvidenceIssue => ({
  code: "adaptive-grind-unmeasured",
  domain: "combat",
  message: "Reach the source level checkpoint with adaptive grinding.",
  resolution: "in-game",
  actionId: "level-20",
  questId: null,
  blocksForecast: false,
  ...overrides,
});

const member = (
  issues: readonly CampaignEvidenceIssue[] = [],
  overrides: Partial<Parameters<typeof describeChapterEvidence>[0][number]> = {},
): Parameters<typeof describeChapterEvidence>[0][number] => ({
  status: issues.length ? "incomplete" : "covered",
  residualXp: 0,
  blockedReason: null,
  issues,
  inheritedIssueCount: 0,
  ...overrides,
});

describe("chapter XP evidence presentation", () => {
  it("labels guaranteed bundle estimates as planning inputs rather than missing or verified XP", () => {
    const presentation = describeChapterEvidence([
      member([
        issue({ code: "dungeon-bundle-estimated", domain: "reward", actionId: "bundle" }),
        issue({ code: "dungeon-details-pending", domain: "route", actionId: "bundle" }),
      ]),
    ]);
    expect(presentation.state).toBe("estimated-reward");
    expect(presentation.label).toContain("guaranteed-bundle estimates");
    expect(presentation.details.join(" ")).toContain("level-scaled planning rewards");
  });
  it("does not describe an adaptive level checkpoint as unresolved XP", () => {
    expect(describeChapterEvidence([member([issue()])])).toMatchObject({
      state: "adaptive",
      label: "XP target modeled with adaptive grinding",
      issueCount: 1,
    });
  });

  it("keeps historical rewards distinct from missing rewards", () => {
    expect(
      describeChapterEvidence([
        member([
          issue({
            code: "reward-historical-estimate",
            domain: "reward",
            questId: 42,
          }),
        ]),
      ]),
    ).toMatchObject({ state: "estimated-reward", issueCount: 1 });
    expect(
      describeChapterEvidence([
        member([issue({ code: "reward-unresolved", domain: "reward", questId: 42 })], {
          residualXp: null,
        }),
      ]),
    ).toMatchObject({ state: "unknown" });
  });

  it("deduplicates party-wide issues and identifies inherited uncertainty", () => {
    const shared = issue({
      code: "quest-lifecycle-unverified",
      domain: "eligibility",
      questId: 100,
    });
    const presentation = describeChapterEvidence([
      member([], { inheritedIssueCount: 1 }),
      member([shared]),
    ]);
    expect(presentation).toMatchObject({
      state: "review",
      issueCount: 1,
      inheritedIssueCount: 1,
    });
    expect(presentation.details.join(" ")).toContain("earlier chapter");
  });
  it("shows scoped reviewed conditions without hiding other incomplete evidence", () => {
    const presentation = describeChapterEvidence([
      member([issue()], {
        validationResolutions: [
          {
            code: "personal-eligibility-unverified",
            questId: 153,
            raceId: "human",
            classSlug: "priest",
          },
        ],
      }),
    ]);
    expect(presentation.state).toBe("adaptive");
    expect(presentation.details.join(" ")).toContain("1 quest condition matched reviewed evidence");
    expect(presentation.issueCount).toBe(1);
  });
});
