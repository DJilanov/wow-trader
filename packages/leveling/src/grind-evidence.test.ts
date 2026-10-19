import { describe, expect, it } from "vitest";

import {
  campaignGrindEvidenceSchema,
  grindMeasurementTotal,
  type CampaignGrindMeasurement,
} from "./grind-evidence.js";

function measurement(): CampaignGrindMeasurement {
  return {
    sessionId: "70450:1792400000:1",
    checkpointId: "westfall-level-21",
    build: 70450,
    release: "campaign-20261019",
    compiler: "campaign-addon-20261019-v7",
    character: { fingerprint: "a".repeat(24), class: "PRIEST", race: "Human" },
    startedAt: 1792400000,
    endedAt: 1792400100,
    start: { level: 20, xp: 23000, xpMax: 23200 },
    finish: { level: 21, xp: 50, xpMax: 25200 },
    xpGained: 250,
    elapsedSeconds: 100,
    activeSeconds: 95,
    combatSeconds: 80,
    party: { size: 1, startLevels: [20], endLevels: [21] },
    areas: [
      {
        mapId: 1436,
        zone: "Westfall",
        subzone: "Moonbrook",
        instanceId: 0,
        instanceType: "none",
        capturedAt: 1792400000,
      },
    ],
    killCount: 2,
    unattributedKillCount: 0,
    reportedKillXp: 250,
    unparsedKillMessageCount: 0,
    killMix: [
      {
        npcId: 127,
        name: "Defias Trapper",
        level: 19,
        count: 2,
        reportedXp: 250,
        unparsedMessages: 0,
      },
    ],
    questTurnIns: 0,
    deaths: 0,
    restedAtStart: 0,
    restedAtEnd: 0,
    source: "KFC grind observer fixture",
    contextVerified: true,
  };
}

describe("campaign grind evidence", () => {
  it("accepts a reconciled, privacy-safe measurement", () => {
    const result = campaignGrindEvidenceSchema.parse({
      schema: "campaign-grind-evidence.v1",
      sourceSha256: "b".repeat(64),
      measurements: [measurement()],
    });
    expect(result.measurements[0]?.character).toEqual({
      fingerprint: "a".repeat(24),
      class: "PRIEST",
      race: "Human",
    });
    expect(grindMeasurementTotal(result.measurements[0]!.finish)).toBe(
      grindMeasurementTotal(result.measurements[0]!.start) + 250,
    );
  });

  it("rejects unreconciled kills, duplicate sessions, and contaminated state", () => {
    expect(() =>
      campaignGrindEvidenceSchema.parse({
        schema: "campaign-grind-evidence.v1",
        sourceSha256: "b".repeat(64),
        measurements: [{ ...measurement(), killCount: 3 }],
      }),
    ).toThrow("Kill mix does not reconcile");
    expect(() =>
      campaignGrindEvidenceSchema.parse({
        schema: "campaign-grind-evidence.v1",
        sourceSha256: "b".repeat(64),
        measurements: [measurement(), measurement()],
      }),
    ).toThrow("Duplicate session");
    expect(() =>
      campaignGrindEvidenceSchema.parse({
        schema: "campaign-grind-evidence.v1",
        sourceSha256: "b".repeat(64),
        measurements: [{ ...measurement(), questTurnIns: 1 }],
      }),
    ).toThrow();
  });
});
