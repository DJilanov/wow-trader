import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { assertPaladinLegacyHealingJob } from "./paladin-legacy-protocol.mjs";
import { simulationHash as hash } from "./simulation-fingerprint.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const checksum = /^[a-f0-9]{64}$/;
const titles = {
  "direct-healing-support": "Direct healing",
  "vigil-mobility": "Vigil mobility",
  "vigil-support": "Vigil support",
};
const admittedCandidates = new WeakMap();

function freezeJson(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) freezeJson(child, seen);
  Object.freeze(value);
}

function assertReference(ref) {
  assert(ref && typeof ref.path === "string" && ref.path.length > 0);
  assert(checksum.test(ref.byteSha256));
}

function assertProfile(context) {
  assert(context && typeof context === "object");
  assert.deepEqual(Object.keys(context).sort(), [
    "faction",
    "playerClass",
    "professions",
    "raceId",
  ]);
  assert.equal(context.playerClass, 4);
  assert([1, 2].includes(context.faction));
  assert(Number.isSafeInteger(context.raceId) && context.raceId > 0);
  assert.deepEqual(context.professions, [4, 11]);
}

function assertCandidate(library) {
  assert.equal(library.schema, "kfc-paladin-healer-library-candidate.v1");
  assert.equal(library.profile, "healing-paladin");
  assert.equal(library.publicationAllowed, false);
  assert.equal(library.fullClassQualified, false);
  assert.equal(library.websiteAdmissionComplete, false);
  assert.equal(library.scope.durationSeconds, 180);
  assert.equal(library.scope.layout, "stacked");
  assert.equal(library.scope.fiveMinuteAndSpreadQualification, false);
  assert.equal(library.scope.scenarioChangesRequireTheirOwnGearTalentsConsumesAndWorkload, true);
  assert(checksum.test(library.model.identity));
  assert(checksum.test(library.model.runtimeSha256));
  assertReference(library.source.input);
  assertReference(library.source.review);
  assert.equal(library.source.sourcePackReviewComplete, true);
  const groups = new Map(),
    configurations = new Map(),
    workloads = new Map(),
    items = new Set();
  assert.equal(library.groups.length, 18);
  assert.equal(library.configurations.length, 504);
  for (const entry of library.workloads) {
    assert(checksum.test(entry.id));
    assert.equal(hash(entry.frame), entry.id);
    assert(!workloads.has(entry.id));
    workloads.set(entry.id, entry.frame);
  }
  for (const entry of library.catalog) {
    assert(Number.isSafeInteger(entry.item.id) && entry.item.id > 0);
    assert.equal(entry.source.id, entry.item.id);
    assert(!items.has(entry.item.id));
    items.add(entry.item.id);
  }
  for (const group of library.groups) {
    assert(!groups.has(group.id));
    assert.equal(group.id, [group.archetype, group.assignment, group.profileId].join("|"));
    assert(Object.hasOwn(titles, group.archetype));
    assert.equal(group.title, titles[group.archetype]);
    assert(["tank", "group", "burst"].includes(group.assignment));
    assertProfile(group.context);
    assert.equal(
      group.profileId,
      group.context.faction + ":" + group.context.professions.join(","),
    );
    assert.equal(group.configurationIds.length, 28);
    assert.equal(new Set(group.configurationIds).size, 28);
    assert(group.configurationIds.includes(group.defaultConfigurationId));
    groups.set(group.id, group);
  }
  const linked = new Set(),
    usedWorkloads = new Set();
  for (const configuration of library.configurations) {
    assert(checksum.test(configuration.id));
    assert.equal(hash(configuration.sourceCaseKey), configuration.id);
    assert(!configurations.has(configuration.id));
    configurations.set(configuration.id, configuration);
    const group = groups.get(configuration.groupId);
    assert(group && group.configurationIds.includes(configuration.id));
    linked.add(configuration.id);
    assert.equal(configuration.sourceEvidence.caseKey, configuration.sourceCaseKey);
    assert.equal(configuration.sourceEvidence.optionId, configuration.optionId);
    assert.equal(configuration.sourceEvidence.selectedSurvive, true);
    assert.equal(configuration.sourceEvidence.hasIndexedHistoricalFailure, false);
    assert.equal(configuration.sourceEvidence.observedPractical2Percent, true);
    assert.equal(configuration.sourceEvidence.scenarioId, configuration.scenarioId);
    assert.equal(configuration.option.gear.items.length, 17);
    for (const item of configuration.option.gear.items) if (item.id) assert(items.has(item.id));
    assert.equal(
      configuration.optionId,
      hash({
        ...configuration.option,
        state: { talentsString: configuration.option.state.talentsString },
      }),
    );
    const frame = workloads.get(configuration.workloadId);
    assert(frame);
    usedWorkloads.add(configuration.workloadId);
    assertPaladinLegacyHealingJob({ ...configuration.job, workload: frame });
    assert.deepEqual(Object.keys(configuration.job).sort(), [
      "detail",
      "id",
      "requestBase64",
      "schema",
    ]);
    assert.equal(configuration.job.detail, false);
    assert.equal(
      configuration.job.id,
      "h-" + configuration.sourceEvidence.requestKeys[0].slice(0, 32),
    );
    assert.equal(configuration.reference.rounds.length, 4);
    assert.equal(configuration.reference.summaries.length, 4);
    assert.equal(configuration.sourceEvidence.requestKeys.length, 4);
    assert.equal(new Set(configuration.sourceEvidence.requestKeys).size, 4);
    assert.equal(new Set(configuration.reference.rounds.map((round) => round.seed)).size, 4);
    for (const round of configuration.reference.rounds) {
      assert(Number.isSafeInteger(round.seed) && round.seed > 0);
      assert(Number.isSafeInteger(round.iterations) && round.iterations > 0);
    }
    for (const summary of configuration.reference.summaries) {
      assert.equal(summary.feasible, true);
      assert.equal(summary.survivalRate, 1);
      assert(
        Object.values(summary).every(
          (value) =>
            typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)),
        ),
      );
    }
    assert.equal(
      configuration.reference.iterations,
      configuration.reference.rounds.reduce((sum, round) => sum + round.iterations, 0),
    );
    assert.equal(
      configuration.reference.hps,
      configuration.reference.summaries.reduce((sum, summary) => sum + summary.hps, 0) / 4,
    );
    assert.equal(
      configuration.reference.meanMissingHealth,
      configuration.reference.summaries.reduce(
        (sum, summary) => sum + summary.meanMissingHealth,
        0,
      ) / 4,
    );
    assert.equal(
      configuration.sourceEvidence.requestKeys[0],
      hash({
        runtimeSha256: library.model.runtimeSha256,
        requestBase64: configuration.job.requestBase64,
        workloadSha256: configuration.workloadId,
        detail: false,
      }),
    );
    assert.deepEqual(configuration.reference.rounds, configuration.sourceEvidence.rounds);
    assert.equal(configuration.reference.wholeClassQualified, false);
    assert.equal(configuration.reference.demandLimitedHps, true);
    assert.equal(configuration.reference.healthDeficitObjective, true);
    assert.equal(configuration.reference.observedPractical2Percent, true);
    const tuple = JSON.parse(configuration.sourceCaseKey);
    assert.deepEqual(tuple.slice(0, 3), [group.archetype, group.assignment, group.profileId]);
    assert.deepEqual(group.context, {
      playerClass: 4,
      faction: tuple[3],
      professions: tuple[4],
      raceId: tuple[5],
    });
    assert.equal(tuple[7], 180);
    assert.equal(tuple[8], configuration.scenarioId);
  }
  for (const group of groups.values()) {
    const entries = group.configurationIds.map((id) => configurations.get(id));
    assert(entries.every((entry) => entry && entry.groupId === group.id));
    assert.equal(new Set(entries.map((entry) => entry.scenarioId)).size, 28);
    assert.equal(configurations.get(group.defaultConfigurationId).scenarioId, "reference");
  }
  assert.equal(linked.size, configurations.size);
  assert.equal(usedWorkloads.size, workloads.size);
  assert(groups.has(library.defaultGroupId));
  return { groups, configurations, workloads };
}

function admittedCandidate(library) {
  const existing = admittedCandidates.get(library);
  if (existing) return existing;
  const indexes = assertCandidate(library);
  freezeJson(library);
  admittedCandidates.set(library, indexes);
  return indexes;
}

/** Build a portable candidate from an independently reviewed, byte-bound source packet.
 * Website and browser admission remain separate; no numerical work or approval occurs here.
 * @param {{sourceBytes:Buffer,sourceRef:object,reviewBytes:Buffer,reviewRef:object}} input
 * @returns {object}
 */
export function createPaladinHealerLibraryCandidate({
  sourceBytes,
  sourceRef,
  reviewBytes,
  reviewRef,
}) {
  assert(Buffer.isBuffer(sourceBytes) && Buffer.isBuffer(reviewBytes));
  assertReference(sourceRef);
  assertReference(reviewRef);
  assert.equal(sha(sourceBytes), sourceRef.byteSha256);
  assert.equal(sha(reviewBytes), reviewRef.byteSha256);
  const packet = JSON.parse(sourceBytes),
    review = JSON.parse(reviewBytes);
  assert.equal(packet.schema, "kfc-paladin-three-minute-library-source.v2");
  assert.equal(packet.publicationAllowed, false);
  assert.equal(packet.fullClassQualified, false);
  assert.equal(packet.newNumericalRequests, 0);
  assert.equal(review.schema, "kfc-paladin-three-minute-library-origin-review.v2");
  assert.equal(review.status, "passed");
  assert.deepEqual(review.input, sourceRef);
  assert.deepEqual(review.model, packet.model);
  for (const field of [
    "sourcePackReviewComplete",
    "profileContextPortable",
    "completeSavedRequestBodiesPreserved",
    "scenarioSpecificLoadoutsPreserved",
    "actualSourceJournalsReplayed",
  ])
    assert.equal(review[field], true, field);
  assert.equal(review.groups, packet.groups.length);
  assert.equal(
    review.configurations,
    packet.groups.reduce((sum, group) => sum + group.configurations.length, 0),
  );
  assert.equal(review.actualNativeOrigins, packet.nativeOrigins.length);
  assert.equal(review.catalogItems, packet.catalog.length);
  assert.equal(review.workloadSources, packet.workloadSources.length);
  const workloads = new Map(),
    configurations = [],
    groups = [];
  for (const group of packet.groups) {
    const configurationIds = [];
    let defaultConfigurationId;
    for (const entry of group.configurations) {
      const id = hash(entry.caseKey),
        workloadId = hash(entry.job.workload);
      if (workloads.has(workloadId))
        assert.deepEqual(workloads.get(workloadId), entry.job.workload);
      else workloads.set(workloadId, entry.job.workload);
      configurationIds.push(id);
      if (entry.scenarioId === group.defaultScenarioId) defaultConfigurationId = id;
      const { workload, ...job } = entry.job;
      assert.equal(hash(workload), workloadId);
      configurations.push({
        id,
        groupId: group.groupId,
        scenarioId: entry.scenarioId,
        optionId: entry.optionId,
        option: entry.option,
        job,
        workloadId,
        sourceCaseKey: entry.caseKey,
        sourceEvidence: entry.sourceEvidence,
        reference: entry.reference,
      });
    }
    assert(defaultConfigurationId);
    groups.push({
      id: group.groupId,
      archetype: group.spec,
      title: titles[group.spec],
      assignment: group.kind,
      profileId: group.profileId,
      context: group.context,
      defaultConfigurationId,
      configurationIds,
    });
  }
  const candidate = {
    schema: "kfc-paladin-healer-library-candidate.v1",
    profile: "healing-paladin",
    model: packet.model,
    source: { input: sourceRef, review: reviewRef, sourcePackReviewComplete: true },
    scope: packet.scope,
    defaultGroupId: "direct-healing-support|group|1:4,11",
    groups,
    configurations,
    workloads: [...workloads].map(([id, frame]) => ({ id, frame })),
    catalog: packet.catalog,
    websiteAdmissionComplete: false,
    fullClassQualified: false,
    publicationAllowed: false,
  };
  const owned = structuredClone(candidate);
  admittedCandidate(owned);
  return owned;
}

/** Validate and freeze the portable candidate without private journals or a numerical runner.
 * @param {object} library @returns {void}
 */
export function assertPaladinHealerLibraryCandidate(library) {
  admittedCandidate(library);
}

/** A scenario change replaces its complete loadout, policies and request together.
 * Return an owned copy so editing a personal build cannot mutate the library.
 * @param {object} library @param {{groupId:string,scenarioId?:string}} selection
 * @returns {object}
 */
export function resolvePaladinHealerLibraryConfiguration(library, { groupId, scenarioId }) {
  const { groups, configurations, workloads } = admittedCandidate(library);
  const group = groups.get(groupId);
  assert(group, "Unknown Paladin build group");
  const configuration =
    scenarioId === undefined
      ? configurations.get(group.defaultConfigurationId)
      : group.configurationIds
          .map((id) => configurations.get(id))
          .find((entry) => entry.scenarioId === scenarioId);
  assert(configuration, "Unknown Paladin mechanics scenario");
  return structuredClone({
    group,
    configurationId: configuration.id,
    scenarioId: configuration.scenarioId,
    optionId: configuration.optionId,
    option: configuration.option,
    job: { ...configuration.job, workload: workloads.get(configuration.workloadId) },
    sourceEvidence: configuration.sourceEvidence,
    reference: configuration.reference,
  });
}
