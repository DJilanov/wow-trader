import { describe, expect, it } from "vitest";

import {
  campaignQuestRewardEvidenceSchema,
  mergeQuestRewardEvidence,
  type CampaignQuestRewardEvidence,
} from "./reward-evidence.js";
import type { QuestRewardFact } from "./quest-rewards.js";

function evidence(overrides: Partial<CampaignQuestRewardEvidence["facts"][number]> = {}) {
  return campaignQuestRewardEvidenceSchema.parse({
    schema: "campaign-quest-reward-evidence.v1",
    sourceSha256: "a".repeat(64),
    runtimeBuild: 70450,
    facts: [
      {
        questId: 977,
        fullXp: 6200,
        questLevel: 58,
        minimumLevel: 52,
        xpByLevel: [{ level: 58, xp: 6200 }],
        sourceUrl: "KFC reward observer aaaaaaaaaaaaaaaa; quest 977",
        capturedAt: "2026-10-19T10:00:00.000Z",
        status: "available",
        evidenceKind: "observed-forever",
        observations: [
          {
            level: 58,
            xp: 6200,
            sampleCount: 1,
            sessionIds: ["70450:1792400000:1"],
            characterFingerprints: ["b".repeat(24)],
            firstCapturedAt: 1792400000,
            lastCapturedAt: 1792400000,
          },
        ],
        contextVerified: true,
        ...overrides,
      },
    ],
  });
}

function historical(): QuestRewardFact {
  return {
    questId: 977,
    fullXp: 6000,
    questLevel: 58,
    minimumLevel: 52,
    xpByLevel: [
      { level: 58, xp: 6000 },
      { level: 59, xp: 5100 },
    ],
    sourceUrl: "historical",
    capturedAt: "2026-10-18T00:00:00.000Z",
    status: "available",
    evidenceKind: "historical-reference",
  };
}

describe("campaign quest reward evidence", () => {
  it("accepts a full-band observation and replaces historical reward rows", () => {
    const merged = mergeQuestRewardEvidence([historical()], evidence(), 70450);
    expect(merged.observedQuestIds).toEqual([977]);
    expect(merged.facts[0]).toMatchObject({
      fullXp: 6200,
      xpByLevel: [{ level: 58, xp: 6200 }],
      evidenceKind: "observed-forever",
    });
    expect(merged.facts[0]?.sourceUrl).not.toContain("historical");
  });

  it("keeps a scaled observation exact and never promotes it to full XP", () => {
    const scaled = evidence({
      fullXp: null,
      questLevel: 50,
      minimumLevel: 45,
      xpByLevel: [{ level: 59, xp: 5100 }],
      observations: [
        {
          level: 59,
          xp: 5100,
          sampleCount: 1,
          sessionIds: ["70450:1792400000:1"],
          characterFingerprints: ["b".repeat(24)],
          firstCapturedAt: 1792400000,
          lastCapturedAt: 1792400000,
        },
      ],
    });
    const merged = mergeQuestRewardEvidence([historical()], scaled, 70450);
    expect(merged.facts[0]?.fullXp).toBeNull();
    expect(merged.facts[0]?.xpByLevel).toEqual([{ level: 59, xp: 5100 }]);
  });

  it("retains compatible published Forever rows but never retains conflicting values", () => {
    const observed = evidence({
      fullXp: null,
      questLevel: 50,
      minimumLevel: 45,
      xpByLevel: [{ level: 59, xp: 5100 }],
      observations: [
        {
          level: 59,
          xp: 5100,
          sampleCount: 1,
          sessionIds: ["70450:1792400000:1"],
          characterFingerprints: ["b".repeat(24)],
          firstCapturedAt: 1792400000,
          lastCapturedAt: 1792400000,
        },
      ],
    });
    const published = {
      ...historical(),
      fullXp: 6000,
      questLevel: 50,
      minimumLevel: 45,
      status: "available" as const,
      evidenceKind: "published-forever" as const,
    };
    expect(mergeQuestRewardEvidence([published], observed, 70450).facts[0]).toMatchObject({
      fullXp: 6000,
      xpByLevel: [
        { level: 58, xp: 6000 },
        { level: 59, xp: 5100 },
      ],
    });
    const conflicting = { ...published, status: "conflict" as const };
    expect(mergeQuestRewardEvidence([conflicting], observed, 70450).facts[0]).toMatchObject({
      fullXp: null,
      xpByLevel: [{ level: 59, xp: 5100 }],
    });
  });

  it("rejects unsupported full XP and a mismatched runtime build", () => {
    expect(() =>
      evidence({
        fullXp: 6200,
        xpByLevel: [{ level: 59, xp: 5100 }],
        observations: [
          {
            level: 59,
            xp: 5100,
            sampleCount: 1,
            sessionIds: ["70450:1792400000:1"],
            characterFingerprints: ["b".repeat(24)],
            firstCapturedAt: 1792400000,
            lastCapturedAt: 1792400000,
          },
        ],
      }),
    ).toThrow(/Full XP/);
    expect(() => mergeQuestRewardEvidence([], evidence(), 70451)).toThrow(/different runtime/);
  });
});
