import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { assertCompletedTalentEvidence } from "../infra/simulator/talent-evidence.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import {
  independentValidationSeeds,
  validationSeedPolicy,
} from "../infra/simulator/simulation-seeds.mjs";

function fixture() {
  const trees = [
    {
      name: "Arms",
      talents: Array.from({ length: 11 }, (_, i) => ({
        fieldName: `field${i}`,
        maxPoints: 5,
        location: { rowIdx: 0, colIdx: i },
      })),
    },
  ];
  const talents = "55555555551";
  const rotation = { type: "TypeAPL", priorityList: [] };
  const baseline = {
    profile: "warrior",
    variant: "arms",
    revision: "pinned",
    dbSha256: "a".repeat(64),
    requestBase64: "fixture-request",
    settings: { player: { talentsString: talents, equipment: { items: [] }, rotation } },
  };
  const expected = {
    baseline,
    nativeBinarySha256: "b".repeat(64),
    algorithmSha256: "c".repeat(64),
    optimizerSha256: "d".repeat(64),
    controlBaselineSha256: "f".repeat(64),
    validationSeedContext: "e".repeat(64),
    validationIterationsPerSeed: 100000,
  };
  const metric = { dps: 100, stdev: 2, iterations: 100000 };
  const review = {
    schema: "kfc-talent-search.v1",
    status: "simulation-complete-awaiting-browser-review",
    profile: "warrior/arms",
    revision: "pinned",
    baselineSha256: simulationHash(baseline),
    dbSha256: baseline.dbSha256,
    treeSha256: simulationHash(trees),
    gearSha256: simulationHash(baseline.settings.player.equipment),
    requestHashEncoding: "json-string",
    requestSha256: simulationHash(JSON.stringify(baseline.requestBase64)),
    ...Object.fromEntries(Object.entries(expected).filter(([key]) => key !== "baseline")),
    original: { talents },
    winner: { talents, rotation: { value: rotation } },
    selection: { talents, rotation: { value: rotation }, reason: "kept-incumbent-no-proven-gain" },
    history: [{ round: 0 }],
    finalists: [{ talents, ...metric, iterations: 10000 }],
    validationSeedPolicy,
    validation: independentValidationSeeds(expected.validationSeedContext, "talents").map(
      (seed) => ({ seed, baseline: { ...metric }, candidate: { ...metric } }),
    ),
    validated: false,
  };
  return { review, expected, trees, rotations: [rotation] };
}

test("completed talent evidence can be reused with its original measurements and identity", () => {
  const input = fixture();
  const before = globalThis.structuredClone(input.review);
  assertCompletedTalentEvidence(input.review, input.expected, input.trees, input.rotations);
  assert.deepEqual(input.review, before);
});

test("stale, partial, lower-precision or unsupported completed reports fail rather than being overwritten", () => {
  for (const change of [
    (input) => (input.review.nativeBinarySha256 = "changed"),
    (input) => (input.review.algorithmSha256 = "changed"),
    (input) => (input.review.controlBaselineSha256 = "changed"),
    (input) => (input.review.baselineSha256 = "changed"),
    (input) => (input.review.status = "running"),
    (input) => (input.review.validation[0].candidate.iterations = 20000),
    (input) => (input.review.validationSeedContext = "f".repeat(64)),
    (input) => input.review.finalists.pop(),
    (input) => input.review.history.pop(),
    (input) => (input.review.winner.rotation.value = { priorityList: [{ action: { wait: {} } }] }),
    (input) => (input.review.original.talents = "1"),
  ]) {
    const input = fixture();
    change(input);
    assert.throws(() =>
      assertCompletedTalentEvidence(input.review, input.expected, input.trees, input.rotations),
    );
  }
});

test("talent CLI rejects unsupported, empty, duplicate and unknown inputs before starting work", () => {
  for (const args of [
    [],
    ["--spec=paladin/shockadin"],
    ["--spec=warrior/arms", "--spec=warrior/fury"],
    ["--spec=warrior/arms", "--baseline="],
    ["--spec=warrior/arms", "--validation-iterations=20"],
    ["--spec=warrior/arms", "--unexpected=true"],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["scripts/optimize-simulator-talents.mjs", ...args],
      {
        cwd: resolve(import.meta.dirname, ".."),
        encoding: "utf8",
        timeout: 5000,
      },
    );
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Unknown, empty or duplicate|Use a reviewed talent policy|validation-iterations/,
    );
    assert(!result.stdout.includes("talent audit"));
  }
});
