import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyPremadeProgress, campaignRouteValidationSchema, CAMPAIGN_VERSION, CAMPAIGN_XP_REVISION } from "../packages/leveling/dist/index.js";
import { sealCampaignRoute, revalidateCampaignRoute, verifyCampaignRouteFile, verifyCampaignRouteContext } from "./leveling-route-lock.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function verifyPayloadRevision(directory, current, revisionDepth = 0) {
  assert(revisionDepth < 10, "Payload revision history must be bounded.");
  if (!current.payloadRevision) return undefined;
  const descriptor = current.payloadRevision;
  assert.match(descriptor.file, /^(?:loot-target|counter-scope)-revision-[a-f0-9]{64}\.json$/);
  const bytes = await readFile(join(directory, descriptor.file));
  assert.equal(sha(bytes), descriptor.sha256);
  const revision = JSON.parse(bytes);
  assert.equal(revision.reason, descriptor.reason);
  if (revision.reason === "lowest-level-qualified-loot-source") {
    assert.equal(revision.schema, "campaign-loot-target-revision.v1");
    assert.equal(revision.ownerInstruction, "Use the lowest-level eligible creature that drops the item.");
  } else {
    assert.equal(revision.reason, "explicit-generated-counter-combat-scope");
    assert.equal(revision.schema, "campaign-route-payload-revision.v1");
    assert(revision.previous);
    const qualification = await readFile(revision.qualification);
    assert.equal(sha(qualification), revision.qualificationSha256);
    assert.deepEqual(JSON.parse(qualification).revised, revision.revised);
    await verifyPayloadRevision(directory, revision.previous, revisionDepth + 1);
  }
  for (const block of current.blocks) {
    const change = (revision.blocks ?? revision.revised).find((entry) => entry.targetLevel === block.targetLevel);
    assert(change);
    const previousBlock = revision.previous?.blocks.find((entry) => entry.targetLevel === block.targetLevel);
    const beforeLock = JSON.parse(await readFile(join(directory, previousBlock?.lock ?? `through-${block.targetLevel}.lock.json`), "utf8"));
    const afterLock = JSON.parse(await readFile(join(directory, block.lock), "utf8"));
    for (const lock of [beforeLock, afterLock]) await verifyCampaignRouteFile(
      join(directory, lock === beforeLock ? previousBlock?.lock ?? `through-${block.targetLevel}.lock.json` : block.lock),
      { engineSha256: lock.validation.engineSha256, referenceSha256: lock.validation.referenceSha256 },
    );
    assert.equal(change.previousRouteSha256, beforeLock.payload.sha256);
    assert.equal(change.routeSha256, afterLock.payload.sha256);
    assert.equal(block.routeSha256, afterLock.payload.sha256);
    const before = JSON.parse(await readFile(join(directory, beforeLock.payload.file), "utf8")).plan;
    const after = JSON.parse(await readFile(join(directory, afterLock.payload.file), "utf8")).plan;
    assert.equal(after.actions.length, before.actions.length);
    const changed = [];
    for (let index = 0; index < before.actions.length; index++) {
      const old = before.actions[index], next = after.actions[index];
      if (JSON.stringify(old) === JSON.stringify(next)) continue;
      if (revision.reason === "lowest-level-qualified-loot-source") {
        const { instructions: oldHints, referenceCreatureTargets: oldTargets, ...oldFixed } = old;
        const { instructions: nextHints, referenceCreatureTargets: nextTargets, ...nextFixed } = next;
        assert.deepEqual(nextFixed, oldFixed);
        assert.deepEqual(oldHints.filter((line) => !line.startsWith("For these objectives, focus on ")),
          nextHints.filter((line) => !line.startsWith("For these objectives, focus on ")));
        changed.push({ index, id: next.id, before: oldTargets, after: nextTargets });
      } else {
        const { combatObjectiveScope: oldScope, ...oldFixed } = old;
        const { combatObjectiveScope: nextScope, ...nextFixed } = next;
        assert.deepEqual(nextFixed, oldFixed);
        assert.equal(oldScope, undefined);
        assert.equal(nextScope, "listed");
        assert.equal(old.source, null);
        assert.match(old.id, /^quest-funding-/);
        assert.equal(old.questChanges.length, 1);
        assert.equal(old.questChanges[0].state, "objectives-complete");
        assert(Number.isInteger(old.questChanges[0].objectiveIndex));
        changed.push({ index, id: next.id, field: "combatObjectiveScope", after: "listed" });
      }
    }
    assert.deepEqual(changed, change.changes);
    const expectedCounts = revision.reason === "lowest-level-qualified-loot-source"
      ? { 10: 0, 20: 1, 30: 3 } : { 10: 1, 20: 35, 30: 61 };
    assert.equal(changed.length, expectedCounts[block.targetLevel]);
    assert.deepEqual(
      Object.fromEntries(Object.entries(after).filter(([field]) => field !== "actions")),
      Object.fromEntries(Object.entries(before).filter(([field]) => field !== "actions")),
    );
  }
  return revision;
}

test("the current qualification index binds its engine and preserves or explicitly revises prior tasks", async () => {
  const directory = "data/leveling/validated-segments/primary-human-five";
  const current = JSON.parse(await readFile(join(directory, "current.json"), "utf8"));
  assert.equal(current.schema, "campaign-route-qualification-index.v1");
  assert.equal(current.campaignRevision, CAMPAIGN_VERSION);
  assert.equal(current.xpRevision, CAMPAIGN_XP_REVISION);
  assert.equal(current.guideReady, false);
  assert.deepEqual(current.blocks.map((block) => block.targetLevel), [10, 20, 30]);
  const revision = await verifyPayloadRevision(directory, current);
  let previous = [];
  for (const block of current.blocks) {
    assert.match(block.lock, /^through-\d+\.validation-[a-f0-9]{64}\.lock\.json$/);
    const lock = await verifyCampaignRouteContext(join(directory, block.lock), join(directory, current.context));
    assert.equal(lock.validation.engineSha256, current.engineSha256);
    assert.equal(lock.validation.referenceSha256, current.referenceSha256);
    assert.equal(lock.payload.sha256, block.routeSha256);
    const original = JSON.parse(await readFile(join(directory, `through-${block.targetLevel}.lock.json`), "utf8"));
    if (!revision) assert.equal(lock.payload.sha256, original.payload.sha256);
    assert.deepEqual(lock.actions.slice(0, previous.length), previous);
    assert.equal(lock.validation.forecastCases, 48);
    assert.equal(lock.validation.nativeCases, 40);
    previous = lock.actions;
  }
});
function fixture() {
  const classes = ["warrior", "priest", "mage", "rogue", "warlock"], initial = emptyPremadeProgress();
  const progress = { ...initial, members: initial.members.map((member, index) => ({ ...member,
    raceId: "human", classSlug: classes[index], level: 10, currentXp: 0, xpNeedsUpdate: false })) };
  const party = progress.members.map(({ raceId, classSlug }, index) => ({ raceId, classSlug, role: index === 0 ? "tank" : index === 1 ? "healer" : "dps" }));
  const plan = { release: "synthetic-route-lock-test", race: "human", leaderClass: "warrior",
    targetBuild: 70205, sourceArchiveSha256: "a".repeat(64), legs: [], actions: [{
      id: "handoff", legId: "first", title: "Synthetic handoff", kind: "instructions", instructions: [],
      positions: [], source: null, questChanges: [], leaderOnly: false, raidOnly: false, targetLevel: null, targetStopId: null,
    }] };
  const forecastCases = [];
  for (const difficultyPolicy of ["at-level", "experienced-premade"])
    for (const strategy of ["dungeons", "mixed"]) for (const optionalStops of [true, false])
      for (const lootScenario of ["fast", "expected", "slow"]) for (const mode of ["fresh", "restored"])
        forecastCases.push({ difficultyPolicy, strategy, optionalStops, lootScenario, mode, peakQuestLog: 5,
          checks: { noBlocker: true, xpConserved: true, noDuplicateRewards: true, enemyLevels: true, noGrinding: true, saveEquivalent: true },
          handoff: { kind: "projected-reference-xp", afterActionId: "handoff", progress,
            xpBounds: classes.map(() => ({ minimum: { level: 10, currentXp: 0 }, maximum: { level: 10, currentXp: 0 } })) } });
  const validation = { schema: "campaign-route-validation.v1", kind: "projected-reference-xp",
    engineSha256: "b".repeat(64), referenceSha256: "c".repeat(64), targetLevel: 10,
    boundaryActionId: "handoff", routeSha256: sha(JSON.stringify({ schema: "campaign-route-prefix.v1", plan }, null, 2) + "\n"),
    forecastCases, nativeCases: Array.from({ length: 20 }, (_, index) => ({ id: `synthetic-${index}`, luaSha256: "d".repeat(64), verified: true })) };
  return { plan, party, validation };
}

test("seals content-addressed payload and evidence, verifies a candidate and permits an identical repeat", async () => {
  const directory = await mkdtemp(join(tmpdir(), "route-lock-"));
  try {
    const input = fixture(), lock = await sealCampaignRoute(directory, input);
    const current = { engineSha256: input.validation.engineSha256, referenceSha256: input.validation.referenceSha256 };
    assert.deepEqual(await verifyCampaignRouteFile(join(directory, "through-10.lock.json"), { ...current, plan: input.plan }), lock);
    assert.deepEqual(await sealCampaignRoute(directory, input), lock);
    const changed = { ...input.plan, actions: [{ ...input.plan.actions[0], instructions: ["Unapproved task"] }] };
    await assert.rejects(verifyCampaignRouteFile(join(directory, "through-10.lock.json"), { ...current, plan: changed }), /changed at/);
    await assert.rejects(verifyCampaignRouteFile(join(directory, "through-10.lock.json"), { ...current, engineSha256: "e".repeat(64) }), /revalidation/);
    const previous = await readFile(join(directory, "through-10.lock.json"), "utf8");
    const revised = globalThis.structuredClone(input); revised.validation.nativeCases[0].id = "revised-test";
    await assert.rejects(sealCampaignRoute(directory, revised), /explicit revision/);
    assert.equal(await readFile(join(directory, "through-10.lock.json"), "utf8"), previous);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const artifact of ["payload", "validation"]) test(`rejects corrupted ${artifact} bytes`, async () => {
  const directory = await mkdtemp(join(tmpdir(), "route-lock-"));
  try {
    const input = fixture(), lock = await sealCampaignRoute(directory, input);
    await writeFile(join(directory, lock[artifact].file), "{}\n");
    await assert.rejects(verifyCampaignRouteFile(join(directory, "through-10.lock.json"), input.validation), /hash mismatch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const defect of ["duplicate scenario", "failed check", "unreached target", "unknown bar", "full quest log", "wrong party", "wrong payload", "wrong boundary", "duplicate native"])
  test(`does not seal ${defect}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "route-lock-"));
    try {
      const input = fixture(), report = input.validation;
      if (defect === "duplicate scenario") report.forecastCases[1] = report.forecastCases[0];
      if (defect === "failed check") report.forecastCases[0].checks.enemyLevels = false;
      if (defect === "unreached target") report.forecastCases[0].handoff.progress.members[0].level = 9;
      if (defect === "unknown bar") report.forecastCases[0].handoff.progress.members[0].xpNeedsUpdate = true;
      if (defect === "full quest log") report.forecastCases[0].peakQuestLog = 41;
      if (defect === "wrong party") input.party[0].classSlug = "druid";
      if (defect === "wrong payload") report.routeSha256 = "f".repeat(64);
      if (defect === "wrong boundary") report.boundaryActionId = "missing";
      if (defect === "duplicate native") report.nativeCases[1] = report.nativeCases[0];
      await assert.rejects(sealCampaignRoute(directory, input));
      await assert.rejects(readFile(join(directory, "through-10.lock.json")), { code: "ENOENT" });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

test("validation schema accepts a JSON round trip without modifying evidence", () => {
  const input = fixture(), original = globalThis.structuredClone(input.validation);
  assert.deepEqual(campaignRouteValidationSchema.parse(JSON.parse(JSON.stringify(original))), original);
  assert.deepEqual(input.validation, original);
});

test("context verification reads the actual engine and reference bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "route-lock-context-"));
  try {
    const input = fixture(), engineFile = join(directory, "test.js"), referenceFile = join(directory, "reference.json");
    await writeFile(engineFile, "synthetic engine");
    await writeFile(referenceFile, "synthetic reference");
    const enginePins = { "test.js": sha("synthetic engine") }, references = { reference: sha("synthetic reference") };
    input.validation.engineSha256 = sha(JSON.stringify(enginePins));
    input.validation.referenceSha256 = sha(JSON.stringify(references));
    await sealCampaignRoute(directory, input);
    const contextFile = join(directory, "context.json"), lockFile = join(directory, "through-10.lock.json");
    await writeFile(contextFile, JSON.stringify({ schema: "campaign-route-context.v1", engineDirectory: directory,
      enginePins, references, referenceFiles: { [referenceFile]: references.reference } }));
    await verifyCampaignRouteContext(lockFile, contextFile, input.plan);
    await writeFile(engineFile, "changed engine");
    await assert.rejects(verifyCampaignRouteContext(lockFile, contextFile), /compiled engine changed/);
    await writeFile(engineFile, "synthetic engine");
    await writeFile(referenceFile, "changed reference");
    await assert.rejects(verifyCampaignRouteContext(lockFile, contextFile), /reference input changed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("an explicit new qualification preserves the old payload, manifest and certificate", async () => {
  const directory = await mkdtemp(join(tmpdir(), "route-lock-revalidation-"));
  try {
    const input = fixture(), original = await sealCampaignRoute(directory, input), oldFile = join(directory, "through-10.lock.json");
    const oldBytes = await readFile(oldFile, "utf8");
    const revised = globalThis.structuredClone(input); revised.validation.engineSha256 = "f".repeat(64);
    const result = await revalidateCampaignRoute(directory, revised, oldFile);
    assert.equal(result.lock.payload.sha256, original.payload.sha256);
    assert.equal(await readFile(oldFile, "utf8"), oldBytes);
    assert.notEqual(result.file, oldFile);
    await verifyCampaignRouteFile(result.file, revised.validation);
    await assert.rejects(verifyCampaignRouteFile(oldFile, revised.validation), /revalidation/);
    revised.plan.actions[0].instructions = ["Changed task"];
    revised.validation.routeSha256 = sha(JSON.stringify({ schema: "campaign-route-prefix.v1", plan: revised.plan }, null, 2) + "\n");
    await assert.rejects(revalidateCampaignRoute(directory, revised, oldFile), /exact approved payload/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("checked-in primary blocks remain internally consistent and cumulative", async () => {
  const directory = "data/leveling/validated-segments/primary-human-five";
  const locks = [];
  for (const level of [10, 20, 30]) {
    const file = join(directory, `through-${level}.lock.json`), lock = JSON.parse(await readFile(file, "utf8"));
    locks.push(await verifyCampaignRouteFile(file, { engineSha256: lock.validation.engineSha256, referenceSha256: lock.validation.referenceSha256 }));
  }
  for (let index = 1; index < locks.length; index++) {
    assert.deepEqual(locks[index].actions.slice(0, locks[index - 1].actions.length), locks[index - 1].actions);
    assert.deepEqual(locks[index].party, locks[0].party);
  }
});
