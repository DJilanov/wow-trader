import assert from "node:assert/strict";
import { resolve, sep } from "node:path";
import { simulationHash } from "./simulation-cache.mjs";
import { accessoryChallengeVerdict } from "./accessory-challengers.mjs";
import {
  assertIndependentSeedRanges,
  assertValidationSeeds,
  independentValidationSeeds,
  selectionSeedRanges,
  validationSeedPolicy,
} from "./simulation-seeds.mjs";

export const campaignPolicies = ["warrior/arms", "warrior/fury"];
const digest = /^[a-f0-9]{64}$/;

export function validateCampaignConfig(value) {
  assert.equal(value.schema, "kfc-prebis-campaign-config.v1");
  assert.equal(value.validationIterations, 100000, "Reviewed campaigns require 100k per range");
  for (const key of ["maxFeedbackRounds", "maxFinalizationRounds"])
    assert(Number.isSafeInteger(value[key]) && value[key] >= 1 && value[key] <= 20, key);
  assert(Number.isFinite(value.minimumFreeGiB) && value.minimumFreeGiB >= 1);
  assert(Array.isArray(value.cases) && value.cases.length > 0);
  const ids = new Set();
  for (const entry of value.cases) {
    assert(/^[a-z][a-z0-9-]{0,79}$/.test(entry.id), "Invalid campaign case ID");
    assert(!ids.has(entry.id), "Duplicate campaign case ID");
    ids.add(entry.id);
    assert(campaignPolicies.includes(entry.spec), `Unimplemented feedback policy: ${entry.spec}`);
    assert(["alliance", "horde"].includes(entry.faction));
    assert(["conservative", "provisional-procs"].includes(entry.scenario));
    assert.deepEqual(Object.keys(entry).sort(), ["faction", "id", "scenario", "spec"]);
  }
  assert.deepEqual(Object.keys(value).sort(), [
    "cases",
    "maxFeedbackRounds",
    "maxFinalizationRounds",
    "minimumFreeGiB",
    "schema",
    "validationIterations",
  ]);
  return value;
}

export function campaignSnapshot({ release, revision, db, components }) {
  assert(/^[a-f0-9]{24}$/.test(release));
  assert(/^[a-f0-9]{40}$/.test(revision));
  assert(Array.isArray(db.items) && db.items.length > 0);
  assert(Object.keys(components).length > 0);
  for (const checksum of Object.values(components)) assert(digest.test(checksum));
  const ids = new Set();
  const items = db.items.map((item) => {
    assert(Number.isSafeInteger(item.id) && item.id > 0 && !ids.has(item.id));
    ids.add(item.id);
    return { id: item.id, name: item.name, sha256: simulationHash(item) };
  });
  items.sort((a, b) => a.id - b.id);
  const value = {
    schema: "kfc-prebis-campaign-snapshot.v1",
    release,
    revision,
    dbSha256: simulationHash(db),
    components: Object.fromEntries(
      Object.entries(components).sort(([a], [b]) => a.localeCompare(b)),
    ),
    items,
  };
  return { ...value, fingerprint: simulationHash(value) };
}

export function campaignChanges(previous, current) {
  const old = new Map((previous?.items ?? []).map((item) => [item.id, item]));
  const next = new Map(current.items.map((item) => [item.id, item]));
  return {
    firstRun: previous === null,
    changed: previous?.fingerprint !== current.fingerprint,
    added: current.items.filter((item) => !old.has(item.id)).map(({ id, name }) => ({ id, name })),
    removed: (previous?.items ?? [])
      .filter((item) => !next.has(item.id))
      .map(({ id, name }) => ({ id, name })),
    modified: current.items
      .filter((item) => old.has(item.id) && old.get(item.id).sha256 !== item.sha256)
      .map(({ id, name }) => ({ id, name })),
    components: [
      ...new Set([...Object.keys(previous?.components ?? {}), ...Object.keys(current.components)]),
    ]
      .filter((name) => previous?.components[name] !== current.components[name])
      .sort(),
    notice:
      "Any changed input invalidates every configured case. Shared effects, sets and stat breakpoints make item-slot-only invalidation unsafe.",
  };
}

export function campaignChangeSummary(changes) {
  return {
    firstRun: changes.firstRun,
    changed: changes.changed,
    counts: Object.fromEntries(
      ["added", "removed", "modified", "components"].map((key) => [key, changes[key].length]),
    ),
    samples: Object.fromEntries(
      ["added", "removed", "modified", "components"].map((key) => [key, changes[key].slice(0, 10)]),
    ),
    notice: changes.notice,
  };
}

export function campaignArtifactPath(root, path) {
  assert.equal(typeof path, "string");
  const output = resolve(root, path);
  assert(
    output.startsWith(resolve(root, "artifacts/forever-simulator/optimization") + sep) &&
      output.endsWith(".json"),
    "Campaign evidence must stay inside optimization artifacts",
  );
  return output;
}

export function campaignCommand(kind, inputs, entry, config) {
  const file = (key) => {
    assert(inputs[key]?.path && digest.test(inputs[key].sha256), `Missing ${key} evidence`);
    return inputs[key].path;
  };
  if (kind === "baseline")
    return ["capture-simulator-baseline.mjs", `--spec=${entry.spec}`, `--faction=${entry.faction}`];
  if (kind === "proc-scenario")
    return ["capture-simulator-proc-scenario.mjs", `--baseline=${file("baseline")}`];
  if (kind === "feedback")
    return [
      "run-simulator-feedback.mjs",
      `--baseline=${file("baseline")}`,
      `--max-rounds=${config.maxFeedbackRounds}`,
      `--validation-iterations=${config.validationIterations}`,
    ];
  if (kind === "accessories") {
    assert(["rings", "trinkets"].includes(inputs.kind));
    return [
      "audit-simulator-accessories.mjs",
      `--feedback-review=${file("review")}`,
      `--kind=${inputs.kind}`,
    ];
  }
  if (kind === "accessory-feedback")
    return [
      "create-simulator-accessory-baseline.mjs",
      `--feedback-review=${file("review")}`,
      `--accessory-review=${file("audit")}`,
    ];
  if (kind === "rotation")
    return [
      "audit-simulator-fury-rotation.mjs",
      `--baseline=${file("baseline")}`,
      `--feedback-review=${file("review")}`,
      `--validation-iterations=${config.validationIterations}`,
    ];
  assert.equal(kind, "export", "Unknown campaign stage");
  return [
    "export-simulator-reviewed-build.mjs",
    `--feedback-review=${file("review")}`,
    `--rotation-review=${file("rotation")}`,
  ];
}

export function campaignOutput(stdout) {
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    if (!line.startsWith("{")) continue;
    const value = JSON.parse(line);
    if (typeof value.output === "string" || typeof value.statePath === "string") return value;
  }
  throw new Error("No completed campaign stage receipt in command output");
}

export function campaignAccessoryRanges(audit, review) {
  assert.equal(audit.schema, "kfc-accessory-challenger-audit.v1");
  assert.equal(audit.feedbackReviewSha256, simulationHash(review));
  assert.equal(audit.baselineSha256, review.baselineSha256);
  for (const field of ["profile", "variant", "dbSha256", "nativeBinarySha256"])
    assert.equal(audit[field], review[field], `Accessory evidence ${field} changed`);
  assert.equal(audit.status, "no-confirmed-challenger");
  assert.equal(audit.bestConfirmed, null);
  assert.equal(audit.validationIterations, 100000);
  assert.equal(audit.screeningIterations, 2000);
  assert.equal(audit.validationSeedPolicy, validationSeedPolicy);
  assert.equal(audit.validationSeedContext, audit.identity);
  assert.deepEqual(audit.validationSeeds, independentValidationSeeds(audit.identity, "gear"));
  assert.equal(
    audit.screeningSeed,
    independentValidationSeeds(
      simulationHash({ identity: audit.identity, phase: "screening" }),
      "gear",
    )[0],
  );
  assert(Array.isArray(audit.screened) && audit.screened.length > 0);
  assert.equal(new Set(audit.screened.map((row) => row.id)).size, audit.screened.length);
  assert(
    audit.screened.every(
      (row) =>
        Number.isFinite(row.dps) &&
        row.dps > 0 &&
        Number.isFinite(row.stdev) &&
        row.stdev >= 0 &&
        row.iterations === 2000,
    ),
  );
  for (const challenge of audit.challenges) {
    assert.deepEqual(
      challenge.comparisons.map((row) => row.seed),
      audit.validationSeeds,
    );
    const verdict = accessoryChallengeVerdict(challenge.comparisons);
    assert.equal(verdict.confirmed, false, "Accessory improvement still requires feedback");
    for (const [key, value] of Object.entries(verdict)) assert.deepEqual(challenge[key], value);
  }
  return [
    { label: `${audit.kind} screening`, seed: audit.screeningSeed, iterations: 2000 },
    ...audit.validationSeeds.map((seed) => ({
      label: `${audit.kind} confirmation`,
      seed,
      iterations: 100000,
    })),
  ];
}

export async function runCampaignCase(state, actions, save, config) {
  assert.equal(state.schema, "kfc-prebis-campaign-case.v1");
  validateCampaignConfig(config);
  assert.deepEqual(
    config.cases.find((entry) => entry.id === state.entry.id),
    state.entry,
  );
  const read = async (reference) => {
    assert(reference && digest.test(reference.sha256));
    const value = await actions.read(reference.path);
    assert.equal(simulationHash(value), reference.sha256, "Campaign evidence changed on disk");
    return value;
  };
  for (const step of state.steps) {
    assert.equal(step.identity, simulationHash({ kind: step.kind, inputs: step.inputs }));
    for (const reference of Object.values(step.files)) await read(reference);
  }
  const step = async (kind, inputs) => {
    await actions.checkInputs();
    const identity = simulationHash({ kind, inputs });
    const previous = state.steps.find((entry) => entry.identity === identity);
    if (previous) return previous.files;
    state.status = "running";
    state.active = { kind, inputs };
    await save(state);
    const files = await actions.execute(kind, inputs, state.entry);
    assert(files.output, "Campaign stage did not produce evidence");
    for (const reference of Object.values(files)) await read(reference);
    await actions.checkInputs();
    state.steps.push({ identity, kind, inputs, files });
    state.active = null;
    await save(state);
    return files;
  };
  state.final = null;
  delete state.lastError;
  let { output: baseline } = await step("baseline", {});
  if (state.entry.scenario === "provisional-procs")
    ({ output: baseline } = await step("proc-scenario", { baseline }));
  for (let round = 0; round < config.maxFinalizationRounds; round++) {
    const { output: review } = await step("feedback", { baseline });
    const reviewed = await read(review);
    assert.equal(reviewed.status, "closed-loop-verified");
    assert.equal(reviewed.iterations, 400000);
    assert.equal(`${reviewed.profile}/${reviewed.variant}`, state.entry.spec);
    const finalBaseline = {
      path: reviewed.evidencePaths.baseline,
      sha256: reviewed.baselineSha256,
    };
    await read(finalBaseline);
    const accessories = [];
    let restart = false;
    for (const kind of ["trinkets", "rings"]) {
      const { output: audit } = await step("accessories", { review, kind });
      const audited = await read(audit);
      assert.equal(audited.schema, "kfc-accessory-challenger-audit.v1");
      assert.equal(audited.feedbackReviewSha256, review.sha256);
      assert.equal(audited.kind, kind);
      if (audited.status === "challenger-requires-feedback") {
        ({ output: baseline } = await step("accessory-feedback", { review, audit }));
        restart = true;
        break;
      }
      assert.equal(audited.status, "no-confirmed-challenger");
      assert.equal(audited.bestConfirmed, null);
      accessories.push(audit);
    }
    if (restart) continue;
    const rotationFiles = await step("rotation", { review, baseline: finalBaseline });
    const rotation = await read(rotationFiles.output);
    assert.equal(rotation.feedbackSha256, review.sha256);
    assert.equal(typeof rotation.validated, "boolean");
    if (rotation.validated) {
      assert(rotationFiles.nextBaseline, "Rotation gain has no recaptured feedback baseline");
      baseline = rotationFiles.nextBaseline;
      continue;
    }
    assertIndependentSeedRanges([
      ...selectionSeedRanges,
      ...reviewed.validationSeedRanges,
      ...(
        await Promise.all(
          accessories.map(async (reference) =>
            campaignAccessoryRanges(await read(reference), reviewed),
          ),
        )
      ).flat(),
      ...assertValidationSeeds(rotation, "rotation"),
    ]);
    const { output: exported } = await step("export", { review, rotation: rotationFiles.output });
    const result = await read(exported);
    assert.equal(result.schema, "kfc-reviewed-simulator-build.v1");
    assert.equal(`${result.profile}/${result.variant}`, state.entry.spec);
    assert.equal(result.evidence.feedbackSha256, review.sha256);
    assert.equal(result.evidence.rotationAuditSha256, rotationFiles.output.sha256);
    assert.equal(result.faction.toLowerCase(), state.entry.faction);
    assert.equal(
      result.requiresProvisionalEnchantOptIn,
      state.entry.scenario === "provisional-procs",
    );
    await actions.checkInputs();
    state.status = "reviewed-local";
    state.final = {
      baseline: finalBaseline,
      review,
      accessories,
      rotation: rotationFiles.output,
      exported,
    };
    state.active = null;
    await save(state);
    return state;
  }
  state.status = "finalization-limit-reached";
  state.active = null;
  await save(state);
  return state;
}
