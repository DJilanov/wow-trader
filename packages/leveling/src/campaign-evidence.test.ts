import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_EVIDENCE_CATALOG,
  campaignEvidenceIssueKey,
  summarizeCampaignEvidence,
  type CampaignEvidenceIssue,
} from "./campaign-evidence.js";

const issue = (overrides: Partial<CampaignEvidenceIssue>): CampaignEvidenceIssue => ({
  code: "adaptive-grind-unmeasured",
  domain: "combat",
  message: "Unmeasured adaptive grind",
  resolution: "in-game",
  actionId: "level-20",
  questId: null,
  blocksForecast: false,
  ...overrides,
});

describe("campaign evidence", () => {
  it("classifies independent evidence dimensions without treating adaptive XP as missing", () => {
    expect(
      summarizeCampaignEvidence([
        issue({}),
        issue({
          code: "reward-historical-estimate",
          domain: "reward",
          questId: 42,
          actionId: "turn-in",
        }),
      ]),
    ).toEqual({
      reward: "estimated",
      eligibility: "verified",
      combat: "adaptive",
      route: "compiled",
      progress: "current",
    });
  });

  it("deduplicates quest evidence across players while keeping action evidence distinct", () => {
    expect(
      campaignEvidenceIssueKey(
        issue({ code: "reward-historical-estimate", domain: "reward", questId: 42 }),
      ),
    ).toBe("reward-historical-estimate:42");
    expect(campaignEvidenceIssueKey(issue({ actionId: "level-21" }))).toBe(
      "adaptive-grind-unmeasured:level-21",
    );
  });

  it("defines an actionable acceptance requirement for every issue code", () => {
    expect(Object.values(CAMPAIGN_EVIDENCE_CATALOG)).not.toContainEqual(
      expect.objectContaining({ requiredEvidence: "" }),
    );
    expect(CAMPAIGN_EVIDENCE_CATALOG["reward-unresolved"].releaseImpact).toBe("blocker");
  });
});
