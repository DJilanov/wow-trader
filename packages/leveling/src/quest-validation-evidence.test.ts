import { describe, expect, it } from "vitest";

import { campaignQuestValidationEvidenceSchema } from "./quest-validation-evidence.js";

function observation() {
  const member = {
    fingerprint: "a".repeat(24),
    level: 10,
    class: "PRIEST",
    race: "Human",
  };
  return {
    sessionId: "70450:1792500000:1",
    questId: 19,
    evidenceCode: "named-target-unverified",
    build: 70450,
    release: "campaign-20261019",
    compiler: "campaign-addon-20261019-v7",
    character: { fingerprint: member.fingerprint, class: member.class, race: member.race },
    startedAt: 1792500000,
    endedAt: 1792500010,
    completionReason: "manual-stop",
    startParty: { size: 1, setFingerprint: "d".repeat(24), members: [member] },
    endParty: { size: 1, setFingerprint: "d".repeat(24), members: [member] },
    partyChanged: false,
    snapshots: [
      {
        capturedAt: 1792500000,
        onQuest: true,
        readyForTurnIn: false,
        rewarded: false,
        availableAtGossip: false,
        objectives: [],
        target: null,
        location: { mapId: 1429, zone: "Elwynn Forest", subzone: "Forest's Edge" },
      },
      {
        capturedAt: 1792500010,
        onQuest: true,
        readyForTurnIn: true,
        rewarded: false,
        availableAtGossip: false,
        objectives: [],
        target: { npcId: 448, name: "Hogger", level: 11 },
        location: { mapId: 1429, zone: "Elwynn Forest", subzone: "Forest's Edge" },
      },
    ],
    events: [],
    signals: {
      accepted: false,
      turnedIn: false,
      heldTransition: false,
      rewardedTransition: false,
      objectiveProgress: true,
      objectiveCompleted: true,
      gossipAvailable: false,
      matchingTargetSeen: true,
      lootMessageCount: 0,
      lootMessageSha256: [],
    },
    source: "KFC quest observer abcdef0123456789; session 70450:1792500000:1",
    contextVerified: true,
  } as const;
}

describe("campaign quest validation evidence", () => {
  it("accepts a stable bounded observation", () => {
    expect(
      campaignQuestValidationEvidenceSchema.parse({
        schema: "campaign-quest-validation-evidence.v1",
        sourceSha256: "b".repeat(64),
        runtimeBuild: 70450,
        observations: [observation()],
      }).observations,
    ).toHaveLength(1);
  });

  it("rejects party changes and mismatched builds", () => {
    const changed = observation();
    expect(() =>
      campaignQuestValidationEvidenceSchema.parse({
        schema: "campaign-quest-validation-evidence.v1",
        sourceSha256: "b".repeat(64),
        runtimeBuild: 70451,
        observations: [
          {
            ...changed,
            endParty: {
              size: 1,
              setFingerprint: "e".repeat(24),
              members: [{ ...changed.endParty.members[0], fingerprint: "c".repeat(24) }],
            },
          },
        ],
      }),
    ).toThrow();
  });
});
