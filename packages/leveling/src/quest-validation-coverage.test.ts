import { describe, expect, it } from "vitest";
import {
  createQuestValidationResolver,
  type QuestValidationContext,
} from "./quest-validation-coverage.js";
import {
  campaignQuestValidationEvidenceSchema,
  campaignQuestValidationObservationSchema,
  type CampaignQuestValidationEvidence,
  type CampaignQuestValidationObservation,
} from "./quest-validation-evidence.js";
import type { CampaignEvidenceIssue } from "./campaign-evidence.js";
import type { CampaignPlan } from "./campaign.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { CAMPAIGN_ADDON_COMPILER_REVISION } from "./campaign-addon.js";
import {
  questValidationCertificate,
  questValidationCoverageSchema,
} from "./quest-validation-certificates.js";

const compiler = CAMPAIGN_ADDON_COMPILER_REVISION;
const context: QuestValidationContext = {
  release: "validation-test",
  raceId: "human",
  classSlug: "priest",
  partySize: 5,
  partyMembers: Array.from({ length: 5 }, () => ({ raceId: "human", classSlug: "priest" })),
  objectiveIndexes: [1],
  targetNpcIds: [448],
  minimumLevelClaims: [9, 10],
  prerequisiteGate: null,
};

function observation(
  code: CampaignQuestValidationObservation["evidenceCode"] = "personal-eligibility-unverified",
  own = 0,
): CampaignQuestValidationObservation {
  const members = Array.from({ length: 5 }, (_, index) => ({
    fingerprint: (index + 1).toString(16).padStart(24, "0"),
    rosterFingerprint: (index + 100).toString(16).padStart(24, "0"),
    level: 9,
    class: "PRIEST",
    race: "Human",
  }));
  const ordered = [...members.slice(own), ...members.slice(0, own)];
  const party = { size: 5, setFingerprint: "d".repeat(24), members: ordered };
  const snapshot = {
    capturedAt: 100,
    onQuest: false,
    readyForTurnIn: false,
    rewarded: false,
    availableAtGossip: true,
    objectives: [
      { index: 1, textSha256: "a".repeat(64), fulfilled: 0, required: 1, finished: false },
    ],
    target: { npcId: 448, fingerprint: "f".repeat(24), name: "Hogger", level: 11 },
    location: { mapId: 1429, zone: "Elwynn Forest", subzone: "Forest's Edge" },
  };
  return campaignQuestValidationObservationSchema.parse({
    sessionId: "same-session-time:1",
    questId: 153,
    evidenceCode: code,
    build: 70450,
    release: context.release,
    compiler,
    character: { fingerprint: ordered[0]!.fingerprint, class: "PRIEST", race: "Human" },
    startedAt: 100,
    endedAt: 110,
    completionReason: "manual-stop",
    startParty: party,
    endParty: party,
    partyChanged: false,
    snapshots: [snapshot, { ...snapshot, capturedAt: 105, onQuest: true }],
    events: [{ name: "QUEST_ACCEPTED", questId: 153, capturedAt: 105 }],
    signals: {
      accepted: true,
      turnedIn: false,
      heldTransition: true,
      rewardedTransition: false,
      objectiveProgress: false,
      objectiveCompleted: false,
      gossipAvailable: true,
      matchingTargetSeen: true,
      lootMessageCount: 0,
      lootMessageSha256: [],
    },
    source: "Reviewed test fixture",
    contextVerified: true,
  });
}

function evidence(
  rows: readonly CampaignQuestValidationObservation[],
  source = 1,
): CampaignQuestValidationEvidence {
  return campaignQuestValidationEvidenceSchema.parse({
    schema: "campaign-quest-validation-evidence.v1",
    sourceSha256: source.toString(16).padStart(64, "0"),
    runtimeBuild: 70450,
    observations: rows,
  });
}

function issue(
  code: CampaignEvidenceIssue["code"] = "personal-eligibility-unverified",
): CampaignEvidenceIssue {
  return {
    code,
    questId: 153,
    actionId: "accept-153",
    domain: "eligibility",
    message: "Needs evidence",
    resolution: "in-game",
    blocksForecast: false,
  };
}

function resolver(
  rows: readonly CampaignQuestValidationObservation[],
): ReturnType<typeof createQuestValidationResolver> {
  return createQuestValidationResolver([evidence(rows)], 70450, compiler);
}

function namedParty(): CampaignQuestValidationEvidence[] {
  return Array.from({ length: 5 }, (_, own) => {
    const row = observation("named-target-unverified", own);
    row.snapshots[0]!.onQuest = true;
    row.snapshots[1]!.objectives[0]!.fulfilled = 1;
    row.snapshots[1]!.objectives[0]!.finished = true;
    row.events = [];
    return evidence([row], own + 1);
  });
}

describe("context-scoped quest-validation consumption", () => {
  it("consumes actual acceptance only for the matching release, compiler, race and class", () => {
    const resolve = resolver([observation()]);
    expect(resolve(issue(), context)).toMatchObject({
      questId: 153,
      raceId: "human",
      classSlug: "priest",
    });
    for (const change of [
      { raceId: "gnome" },
      { raceId: null },
      { classSlug: "warrior" },
      { release: "another-route" },
      { partySize: 1 },
    ])
      expect(resolve(issue(), { ...context, ...change })).toBeNull();
    expect(
      createQuestValidationResolver(
        [evidence([observation()])],
        70450,
        "new-compiler",
      )(issue(), context),
    ).toBeNull();
  });

  it("does not trust summary flags or a held quest with no acceptance event", () => {
    const row = observation();
    row.events = [];
    expect(resolver([row])(issue(), context)).toBeNull();
    row.events = [{ name: "QUEST_ACCEPTED", questId: 153, capturedAt: 105 }];
    row.snapshots[0]!.onQuest = true;
    expect(resolver([row])(issue(), context)).toBeNull();
  });

  it("rejects foreign runtime builds and conflicting copies of a session", () => {
    const row = observation();
    expect(() => createQuestValidationResolver([evidence([row])], 70451, compiler)).toThrow(
      /runtime build/,
    );
    const changed = structuredClone(row);
    changed.snapshots[0]!.availableAtGossip = false;
    expect(() =>
      createQuestValidationResolver([evidence([row]), evidence([changed])], 70450, compiler),
    ).toThrow(/Conflicting/);
  });

  it("does not clear inventory confirmations or blocking errors", () => {
    const resolve = resolver([observation()]);
    expect(
      resolve(issue(), { ...context, prerequisiteGate: { kind: "item", itemId: 100 } }),
    ).toBeNull();
    expect(resolve({ ...issue(), blocksForecast: true }, context)).toBeNull();
    expect(resolve(issue("quest-ineligible"), context)).toBeNull();
  });

  it("requires acceptance at the lowest disputed level, without a level-up during the session", () => {
    const row = observation("pickup-level-conflict");
    expect(resolver([row])(issue("pickup-level-conflict"), context)).not.toBeNull();
    const high = structuredClone(row);
    high.startParty.members[0]!.level = 20;
    high.endParty.members[0]!.level = 20;
    expect(resolver([high])(issue("pickup-level-conflict"), context)).toBeNull();
    const leveled = structuredClone(row);
    leveled.endParty.members[0]!.level = 10;
    expect(resolver([leveled])(issue("pickup-level-conflict"), context)).toBeNull();
  });

  it("requires explicit absent prerequisite states immediately before and after acceptance", () => {
    const row = observation("source-gate-conflict");
    const gateContext: QuestValidationContext = {
      ...context,
      prerequisiteGate: { kind: "quest", questId: 152, state: "rewarded" },
    };
    expect(resolver([row])(issue("source-gate-conflict"), gateContext)).toBeNull();
    for (const snapshot of row.snapshots)
      snapshot.prerequisites = [{ questId: 152, onQuest: false, rewarded: false }];
    expect(resolver([row])(issue("source-gate-conflict"), gateContext)).not.toBeNull();
    row.snapshots[1]!.prerequisites![0]!.rewarded = true;
    expect(resolver([row])(issue("source-gate-conflict"), gateContext)).toBeNull();
  });

  it("requires acceptance, ready objectives and an observed turn-in, in that order", () => {
    const row = observation("quest-lifecycle-unverified");
    const complete = structuredClone(row.snapshots[1]!);
    complete.capturedAt = 107;
    complete.readyForTurnIn = true;
    complete.objectives[0]!.fulfilled = 1;
    complete.objectives[0]!.finished = true;
    row.snapshots.push(complete, { ...complete, capturedAt: 109, onQuest: false, rewarded: true });
    row.events.push({ name: "QUEST_TURNED_IN", questId: 153, capturedAt: 109 });
    expect(resolver([row])(issue("quest-lifecycle-unverified"), context)).not.toBeNull();
    row.events.push({ name: "QUEST_REMOVED", questId: 153, capturedAt: 106 });
    expect(resolver([row])(issue("quest-lifecycle-unverified"), context)).toBeNull();
    row.events.pop();
    expect(
      resolver([row])(issue("quest-lifecycle-unverified"), { ...context, objectiveIndexes: [2] }),
    ).toBeNull();
    row.events.pop();
    expect(resolver([row])(issue("quest-lifecycle-unverified"), context)).toBeNull();
  });

  it("never pools unrelated characters' lifecycle phases", () => {
    const accepted = observation("quest-lifecycle-unverified");
    const rewarded = observation("quest-lifecycle-unverified", 1);
    rewarded.sessionId = "other-character";
    rewarded.snapshots[0]!.onQuest = true;
    rewarded.snapshots[0]!.readyForTurnIn = true;
    rewarded.snapshots[0]!.objectives[0]!.finished = true;
    rewarded.snapshots[1]!.rewarded = true;
    rewarded.events = [{ name: "QUEST_TURNED_IN", questId: 153, capturedAt: 105 }];
    expect(resolver([accepted, rewarded])(issue("quest-lifecycle-unverified"), context)).toBeNull();
  });

  it("correlates all five distinct members of the same party and NPC instance", () => {
    const files = namedParty();
    expect(
      createQuestValidationResolver(
        files,
        70450,
        compiler,
      )(issue("named-target-unverified"), { ...context, partyMembers: [] }),
    ).toBeNull();
    expect(
      createQuestValidationResolver(
        files,
        70450,
        compiler,
      )(issue("named-target-unverified"), {
        ...context,
        partyMembers: [
          { raceId: "human", classSlug: "warrior" },
          ...context.partyMembers!.slice(1),
        ],
      }),
    ).toBeNull();
    expect(
      createQuestValidationResolver(
        files,
        70450,
        compiler,
      )(issue("named-target-unverified"), context)?.sourceSha256s,
    ).toHaveLength(5);
    expect(
      createQuestValidationResolver(
        files.slice(0, 4),
        70450,
        compiler,
      )(issue("named-target-unverified"), context),
    ).toBeNull();
    expect(
      createQuestValidationResolver(
        Array.from({ length: 5 }, () => files[0]!),
        70450,
        compiler,
      )(issue("named-target-unverified"), context),
    ).toBeNull();
  });

  it("does not turn five exports from one character into five observed party members", () => {
    const files = Array.from({ length: 5 }, (_, index) =>
      evidence(namedParty()[0]!.observations, index + 1),
    );
    expect(
      createQuestValidationResolver(
        files,
        70450,
        compiler,
      )(issue("named-target-unverified"), context),
    ).toBeNull();
  });

  it("refuses another target, unlinked loot or a different objective", () => {
    const files = namedParty();
    files[4]!.observations[0]!.snapshots[0]!.target!.fingerprint = "e".repeat(24);
    expect(
      createQuestValidationResolver(
        files,
        70450,
        compiler,
      )(issue("named-target-unverified"), context),
    ).toBeNull();
    const loot = namedParty();
    loot[4]!.observations[0]!.snapshots[1]!.objectives[0]!.fulfilled = 0;
    loot[4]!.observations[0]!.snapshots[1]!.objectives[0]!.finished = false;
    loot[4]!.observations[0]!.signals.lootMessageCount = 1;
    expect(
      createQuestValidationResolver(
        loot,
        70450,
        compiler,
      )(issue("named-target-unverified"), context),
    ).toBeNull();
    expect(
      createQuestValidationResolver(
        namedParty(),
        70450,
        compiler,
      )(issue("named-target-unverified"), { ...context, objectiveIndexes: [2] }),
    ).toBeNull();
  });

  it("keeps legacy uncorrelated observations readable without certifying five-person credit", () => {
    const files = namedParty();
    for (const file of files)
      for (const row of file.observations)
        for (const party of [row.startParty, row.endParty])
          for (const member of party.members) delete member.rosterFingerprint;
    expect(
      createQuestValidationResolver(
        files,
        70450,
        compiler,
      )(issue("named-target-unverified"), context),
    ).toBeNull();
  });

  it("clears matching forecast annotations without awarding XP, lowering gates or mutating saved state", () => {
    const progress = emptyPremadeProgress();
    progress.members = progress.members.map((member, index) => ({
      ...member,
      level: 20,
      currentXp: 0,
      xpNeedsUpdate: false,
      classSlug: "priest",
      raceId: index === 4 ? "gnome" : "human",
    }));
    const plan: CampaignPlan = {
      release: context.release,
      race: "human",
      leaderClass: "priest",
      targetBuild: 70205,
      rewardFacts: [
        {
          questId: 153,
          fullXp: 100,
          questLevel: 15,
          minimumLevel: 10,
          xpByLevel: [],
          sourceUrl: "test",
          capturedAt: "2026-10-19T00:00:00.000Z",
          status: "available",
        },
      ],
      legs: [
        {
          id: "zone",
          title: "Zone",
          from: 20,
          to: 20,
          kind: "preparation",
          stopId: null,
          actionIds: ["accept-153"],
          questIds: [153],
          unresolvedQuestIds: [],
        },
      ],
      actions: [
        {
          id: "accept-153",
          legId: "zone",
          title: "Accept",
          instructions: [],
          positions: [],
          source: null,
          kind: "instructions",
          leaderOnly: false,
          targetLevel: null,
          targetStopId: null,
          raidOnly: false,
          questChanges: [
            {
              questId: 153,
              title: "Red Leather Bandanas",
              state: "accepted",
              objectiveIndex: null,
            },
          ],
        },
      ],
    };
    const before = structuredClone(progress);
    const plain = forecastCampaignXp(plan, progress)[0]!;
    const reviewed = forecastCampaignXp(plan, progress, {
      questValidation: {
        evidences: [evidence([observation("pickup-level-conflict")])],
        runtimeBuild: 70450,
        compilerRevision: compiler,
      },
    })[0]!;
    expect(plain.members[0]!.issues.some((row) => row.code === "pickup-level-conflict")).toBe(true);
    expect(
      reviewed.members
        .slice(0, 4)
        .every((member) =>
          member.validationResolutions.some((row) => row.code === "pickup-level-conflict"),
        ),
    ).toBe(true);
    expect(reviewed.members[4]!.issues.some((row) => row.code === "pickup-level-conflict")).toBe(
      true,
    );
    expect(reviewed.members.map((member) => member.referenceQuestXp)).toEqual(
      plain.members.map((member) => member.referenceQuestXp),
    );
    expect(reviewed.members.map((member) => member.endpoint)).toEqual(
      plain.members.map((member) => member.endpoint),
    );
    expect(progress).toEqual(before);
    const certificate = questValidationCertificate(
      reviewed.members[0]!.validationResolutions.find(
        (row) => row.code === "pickup-level-conflict",
      )!,
    );
    const publicPlan = {
      ...plan,
      rewardBuild: 70450,
      questValidationCoverage: questValidationCoverageSchema.parse({
        schema: "campaign-quest-validation-coverage.v1",
        runtimeBuild: 70450,
        compilerRevision: compiler,
        certificates: [certificate],
      }),
    };
    const published = forecastCampaignXp(publicPlan, progress)[0]!;
    expect(published.members.map((member) => member.issues)).toEqual(
      reviewed.members.map((member) => member.issues),
    );
    expect(published.members[0]!.validationResolutions[0]!.sessionIds).toBeUndefined();
  });
});
