import type { CampaignEvidenceIssue } from "./campaign-evidence.js";
import type { DungeonGate } from "./dungeon-model.js";
import {
  campaignQuestValidationEvidenceSchema,
  type CampaignQuestValidationEvidence,
  type CampaignQuestValidationObservation,
  type QuestValidationEvidenceCode,
} from "./quest-validation-evidence.js";
import {
  namedTargetCredits,
  questAcceptanceTime,
  questReadyTimes,
  questRewardTime,
} from "./quest-validation-signals.js";

interface SourcedObservation {
  readonly sourceSha256: string;
  readonly observation: CampaignQuestValidationObservation;
}

export interface QuestValidationContext {
  readonly release: string;
  readonly raceId: string | null;
  readonly classSlug: string | null;
  readonly partySize: number;
  readonly partyMembers?: readonly {
    readonly raceId: string | null;
    readonly classSlug: string | null;
  }[];
  readonly objectiveIndexes: readonly number[];
  readonly targetNpcIds: readonly number[];
  readonly minimumLevelClaims: readonly number[];
  readonly prerequisiteGate: DungeonGate | null;
}

export interface QuestValidationResolution {
  readonly runtimeBuild: number;
  readonly compilerRevision: string;
  readonly code: QuestValidationEvidenceCode;
  readonly questId: number;
  readonly sourceSha256s: readonly string[];
  readonly sessionIds?: readonly string[];
  readonly observationCount: number;
  readonly raceId: string;
  readonly classSlug: string;
  readonly context: QuestValidationContext;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesCharacter(row: SourcedObservation, context: QuestValidationContext): boolean {
  return (
    context.raceId !== null &&
    context.classSlug !== null &&
    normalize(row.observation.character.race) === normalize(context.raceId) &&
    normalize(row.observation.character.class) === normalize(context.classSlug)
  );
}

function identity(row: SourcedObservation): string {
  const own = row.observation.startParty.members[0]!;
  return own.rosterFingerprint
    ? `${row.observation.startParty.setFingerprint}:${own.rosterFingerprint}`
    : `${row.sourceSha256}:${own.fingerprint}`;
}

function questOnlyGateIds(gate: DungeonGate | null): readonly number[] | null {
  if (!gate || gate.kind === "item" || gate.kind === "confirmation") return null;
  if (gate.kind === "quest") return [gate.questId];
  const children = gate.gates.map(questOnlyGateIds);
  return children.some((ids) => ids === null)
    ? null
    : [...new Set(children.flatMap((ids) => ids ?? []))];
}

function personalProof(row: SourcedObservation, context: QuestValidationContext): boolean {
  // An acceptance on another character cannot certify an unknown inventory/confirmation gate.
  const gateIds = context.prerequisiteGate ? questOnlyGateIds(context.prerequisiteGate) : [];
  return gateIds !== null && questAcceptanceTime(row.observation) !== null;
}

function sourceGateProof(row: SourcedObservation, context: QuestValidationContext): boolean {
  const acceptedAt = questAcceptanceTime(row.observation);
  const ids = questOnlyGateIds(context.prerequisiteGate);
  if (acceptedAt === null || !ids?.length) return false;
  const before = row.observation.snapshots
    .filter((snapshot) => snapshot.capturedAt <= acceptedAt && snapshot.onQuest === false)
    .at(-1);
  const after = row.observation.snapshots.find(
    (snapshot) => snapshot.capturedAt >= acceptedAt && snapshot.onQuest === true,
  );
  return [before, after].every(
    (snapshot) =>
      snapshot &&
      ids.every((id) =>
        snapshot.prerequisites?.some(
          (state) => state.questId === id && state.onQuest === false && state.rewarded === false,
        ),
      ),
  );
}

function lifecycleProof(
  rows: readonly SourcedObservation[],
  context: QuestValidationContext,
): readonly SourcedObservation[] | null {
  for (const accepted of rows) {
    const acceptedAt = questAcceptanceTime(accepted.observation);
    if (acceptedAt === null) continue;
    const related = rows.filter((row) => identity(row) === identity(accepted));
    for (const complete of related) {
      const completedAt = questReadyTimes(complete.observation, context.objectiveIndexes).find(
        (time) => time >= acceptedAt,
      );
      if (completedAt === undefined) continue;
      const rewarded = related.find((row) => {
        const time = questRewardTime(row.observation);
        return (
          time !== null &&
          time >= completedAt &&
          !related.some((candidate) =>
            candidate.observation.events.some(
              (event) =>
                event.name === "QUEST_REMOVED" &&
                event.capturedAt > acceptedAt &&
                event.capturedAt < time,
            ),
          )
        );
      });
      if (rewarded) return [accepted, complete, rewarded];
    }
  }
  return null;
}

function namedPartyProof(
  rows: readonly SourcedObservation[],
  context: QuestValidationContext,
): readonly SourcedObservation[] | null {
  if (context.partySize !== 5) return null;
  const composition = context.partyMembers;
  if (
    !composition ||
    composition.length !== 5 ||
    composition.some((member) => !member.raceId || !member.classSlug)
  )
    return null;
  const expectedComposition = composition
    .map((member) => `${normalize(member.raceId!)}:${normalize(member.classSlug!)}`)
    .sort()
    .join("|");
  for (const anchor of rows.filter((row) => matchesCharacter(row, context))) {
    const party = anchor.observation.startParty;
    if (
      party.members
        .map((member) => `${normalize(member.race)}:${normalize(member.class)}`)
        .sort()
        .join("|") !== expectedComposition
    )
      continue;
    const roster = party.members.map((member) => member.rosterFingerprint);
    if (party.size !== 5 || roster.some((fingerprint) => !fingerprint)) continue;
    for (const credit of namedTargetCredits(
      anchor.observation,
      context.objectiveIndexes,
      context.targetNpcIds,
    )) {
      const selected: SourcedObservation[] = [];
      for (const member of party.members) {
        const matching = rows.find((row) => {
          const other = row.observation.startParty;
          const own = other.members[0]!;
          if (
            other.size !== 5 ||
            other.setFingerprint !== party.setFingerprint ||
            own.rosterFingerprint !== member.rosterFingerprint ||
            normalize(own.class) !== normalize(member.class) ||
            normalize(own.race) !== normalize(member.race) ||
            other.members.some((candidate) => !roster.includes(candidate.rosterFingerprint))
          )
            return false;
          return namedTargetCredits(
            row.observation,
            context.objectiveIndexes,
            context.targetNpcIds,
          ).some(
            (value) =>
              value.targetFingerprint === credit.targetFingerprint &&
              row.observation.startedAt <= anchor.observation.endedAt &&
              row.observation.endedAt >= anchor.observation.startedAt,
          );
        });
        if (matching) selected.push(matching);
      }
      if (
        selected.length === 5 &&
        Math.max(...selected.map((row) => row.observation.startedAt)) <=
          Math.min(...selected.map((row) => row.observation.endedAt))
      )
        return selected;
    }
  }
  return null;
}

export function createQuestValidationResolver(
  evidences: readonly CampaignQuestValidationEvidence[],
  runtimeBuild: number,
  compilerRevision: string,
): (
  issue: CampaignEvidenceIssue,
  context: QuestValidationContext,
) => QuestValidationResolution | null {
  if (!Number.isSafeInteger(runtimeBuild) || runtimeBuild <= 0 || !compilerRevision.trim())
    throw new Error("Invalid quest-validation runtime context.");
  if (evidences.length > 20) throw new Error("Quest-validation input count exceeds its budget.");
  const observations = new Map<string, SourcedObservation>();
  for (const input of evidences) {
    const evidence = campaignQuestValidationEvidenceSchema.parse(input);
    if (evidence.runtimeBuild !== runtimeBuild)
      throw new Error("Quest-validation evidence belongs to a different runtime build.");
    for (const observation of evidence.observations) {
      const key = `${evidence.sourceSha256}:${observation.sessionId}`;
      const previous = observations.get(key);
      if (previous && JSON.stringify(previous.observation) !== JSON.stringify(observation))
        throw new Error("Conflicting quest-validation session identity.");
      observations.set(key, { sourceSha256: evidence.sourceSha256, observation });
    }
  }
  const byQuest = new Map<number, SourcedObservation[]>();
  for (const row of observations.values()) {
    if (row.observation.compiler !== compilerRevision) continue;
    const rows = byQuest.get(row.observation.questId) ?? [];
    rows.push(row);
    byQuest.set(row.observation.questId, rows);
  }
  return (issue, context): QuestValidationResolution | null => {
    if (issue.questId === null || issue.blocksForecast || !context.raceId || !context.classSlug)
      return null;
    const rows = (byQuest.get(issue.questId) ?? []).filter(
      (row) =>
        row.observation.release === context.release &&
        row.observation.evidenceCode === issue.code &&
        row.observation.startParty.size === context.partySize,
    );
    const personal = rows.filter((row) => matchesCharacter(row, context));
    let proof: readonly SourcedObservation[] | null = null;
    if (issue.code === "named-target-unverified") proof = namedPartyProof(rows, context);
    else if (issue.code === "quest-lifecycle-unverified") proof = lifecycleProof(personal, context);
    else if (issue.code === "personal-eligibility-unverified") {
      const match = personal.find((row) => personalProof(row, context));
      if (match) proof = [match];
    } else if (issue.code === "pickup-level-conflict" && context.minimumLevelClaims.length) {
      const match = personal.find(
        (row) =>
          personalProof(row, context) &&
          row.observation.startParty.members[0]!.level ===
            row.observation.endParty.members[0]!.level &&
          row.observation.startParty.members[0]!.level <= Math.min(...context.minimumLevelClaims),
      );
      if (match) proof = [match];
    } else if (issue.code === "source-gate-conflict") {
      const match = personal.find((row) => sourceGateProof(row, context));
      if (match) proof = [match];
    }
    if (!proof) return null;
    const sessionIds = [
      ...new Set(proof.map((row) => `${row.sourceSha256}:${row.observation.sessionId}`)),
    ].sort();
    return {
      runtimeBuild,
      compilerRevision,
      code: proof[0]!.observation.evidenceCode,
      questId: issue.questId,
      sourceSha256s: [...new Set(proof.map((row) => row.sourceSha256))].sort(),
      sessionIds,
      observationCount: sessionIds.length,
      raceId: context.raceId,
      classSlug: context.classSlug,
      context,
    };
  };
}
