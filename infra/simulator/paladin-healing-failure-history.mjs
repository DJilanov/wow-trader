import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { assertPaladinLegacyHealingJob } from "./paladin-legacy-protocol.mjs";
import { selectPaladinHealingSurvivalTraining } from "./paladin-healing-survival-selection.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

/** Identify a gameplay setup across seeds, iteration counts, detail levels and transport IDs.
 * All character, encounter, ruleset and workload fields remain part of the identity.
 * @param {{job:object,codec:object,runtimeSha256:string}} input @returns {string}
 */
export function paladinHealingGameplayKey({ job, codec, runtimeSha256 }) {
  assert(/^[a-f0-9]{64}$/.test(runtimeSha256));
  assertPaladinLegacyHealingJob(job);
  const api = codec.api.RaidSimRequest,
    raw = api.fromBinary(Buffer.from(job.requestBase64, "base64"));
  assert.equal(Buffer.from(api.toBinary(raw)).toString("base64"), job.requestBase64);
  const players = raw.raid.parties
    .flatMap((party) => party.players)
    .filter((player) => player.class !== 0);
  assert.equal(players.length, 1);
  assert.equal(players[0].class, 4);
  assert.equal(players[0].level, 60);
  assert.equal(players[0].spec.oneofKind, "holyPaladin");
  assert(raw.simOptions);
  const normalized = api.fromJson({ simOptions: { iterations: 1, randomSeed: "1" } }).simOptions;
  raw.simOptions.iterations = normalized.iterations;
  raw.simOptions.randomSeed = normalized.randomSeed;
  return simulationHash({
    runtimeSha256,
    requestBase64: Buffer.from(api.toBinary(raw)).toString("base64"),
    workloadSha256: simulationHash(job.workload),
  });
}

/** Earlier failed gameplay setups cannot win because a later training seed happens to survive.
 * Failure keys must come from authenticated observations on the same model; scores never transfer.
 * @param {{candidates:object[],failedGameplayKeys:Set<string>,plannedIncomingDamage:number}} input
 * @returns {object}
 */
export function selectPaladinHealingHistoryAwareTraining({
  candidates,
  failedGameplayKeys,
  plannedIncomingDamage,
}) {
  assert(Array.isArray(candidates) && candidates.length > 0);
  assert(failedGameplayKeys instanceof Set);
  assert(Number.isFinite(plannedIncomingDamage) && plannedIncomingDamage > 0);
  const validKey = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
    finite = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
    tolerance = Math.max(1, plannedIncomingDamage) * 1e-7;
  assert([...failedGameplayKeys].every(validKey));
  assert.equal(new Set(candidates.map((row) => row.optionId)).size, candidates.length);
  for (const row of candidates) {
    assert(validKey(row.optionId) && validKey(row.gameplayKey));
    assert(finite(row.meanMissingHealth));
    assert(Array.isArray(row.summaries) && row.summaries.length === 2);
    for (const summary of row.summaries) {
      for (const key of [
        "survivalRate",
        "deliveredIncomingDamageMean",
        "meanMissingHealth",
        "manaBlockedSecondsMean",
        "finalMissingHealthMean",
      ])
        assert(finite(summary[key]), "Invalid history-aware training metric: " + key);
      assert(summary.survivalRate <= 1);
      assert(summary.deliveredIncomingDamageMean <= plannedIncomingDamage + tolerance);
      assert.equal(
        summary.feasible,
        summary.survivalRate === 1 &&
          Math.abs(summary.deliveredIncomingDamageMean - plannedIncomingDamage) <= tolerance,
      );
    }
    assert.equal(
      row.feasible,
      row.summaries.every((summary) => summary.feasible),
    );
    const mean =
      row.summaries.reduce((sum, summary) => sum + summary.meanMissingHealth, 0) /
      row.summaries.length;
    assert(Math.abs(row.meanMissingHealth - mean) <= Math.max(1, mean) * 1e-7);
  }
  const excluded = candidates.filter((row) => failedGameplayKeys.has(row.gameplayKey)),
    eligible = candidates.filter((row) => !failedGameplayKeys.has(row.gameplayKey)),
    surviving = eligible.filter((row) => row.feasible),
    selection = surviving.length ? selectPaladinHealingSurvivalTraining(eligible) : null;
  return {
    selected: selection?.selected ?? null,
    selection,
    observedSurvivingCandidates: candidates.filter((row) => row.feasible).length,
    admissibleSurvivingCandidates: surviving.length,
    excludedKnownFailures: excluded.map((row) => ({
      optionId: row.optionId,
      gameplayKey: row.gameplayKey,
      survivedThisTraining: row.feasible,
    })),
    independentConfirmationRequired: true,
    classQualified: false,
    publicationAllowed: false,
  };
}
