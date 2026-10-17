import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  feedbackOutputPath,
  runFuryFeedback,
  runWarriorFeedback,
} from "../infra/simulator/feedback-workflow.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { hasCurrentPrebisCoverage } from "../infra/simulator/prebis-search-coverage.mjs";
import { prebisSlotTypes } from "../infra/simulator/prebis-pool.mjs";
import {
  independentValidationSeeds,
  validationSeedPolicy,
} from "../infra/simulator/simulation-seeds.mjs";

function fixture({
  initialGear = true,
  improves = false,
  converged = true,
  initialCoverage = true,
  variant = "fury",
} = {}) {
  const files = new Map();
  const add = (path, value) => {
    files.set(path, value);
    return { path, sha256: simulationHash(value) };
  };
  const baseline = {
    schema: "kfc-optimization-baseline.v1",
    profile: "warrior",
    variant,
    revision: "fixture-revision",
    requestBase64: "controlled-request",
    settings: { player: { talentsString: "1", rotation: { priorityList: [] } } },
  };
  const makeGear = (input, talents = input.settings.player.talentsString) => ({
    result: {
      profile: "warrior",
      variant,
      requestSha256: simulationHash(input.requestBase64),
      converged,
      status: "simulation-complete-awaiting-browser-review",
      talentsString: talents,
      currentCoverage: true,
    },
  });
  const session = {
    schema: "kfc-prebis-feedback-session.v1",
    profile: `warrior/${variant}`,
    initialBaseline: add("blue.json", baseline),
    initialGear: initialGear ? add("initial-gear.json", makeGear(baseline)) : null,
    steps: [],
    status: "running",
    final: null,
  };
  if (session.initialGear && !initialCoverage) {
    const old = files.get(session.initialGear.path);
    old.result.currentCoverage = false;
    session.initialGear.sha256 = simulationHash(old);
  }
  const executed = [];
  const saved = [];
  let talentCalls = 0;
  const actions = {
    hasCurrentCoverage: async (result) => result.currentCoverage,
    read: async (path) => {
      assert(files.has(path), `Missing test artifact ${path}`);
      return files.get(path);
    },
    execute: async (kind, inputs) => {
      executed.push(kind);
      const input = files.get(inputs.baseline.path);
      let value;
      if (kind === "feedback") {
        value = globalThis.structuredClone(input);
        value.settings.player.talentsString = files.get(inputs.gear.path).result.talentsString;
        value.predecessor = inputs.gear;
      } else if (kind === "talents") {
        const gain = improves && talentCalls++ === 0;
        const selected = gain ? "2" : input.settings.player.talentsString;
        const rotation = { value: input.settings.player.rotation };
        value = {
          profile: `warrior/${variant}`,
          revision: input.revision,
          baselineSha256: simulationHash(input),
          validated: gain,
          validationSeedPolicy,
          validationSeedContext: simulationHash(input),
          winner: { talents: selected, rotation },
          selection: {
            talents: selected,
            rotation,
            reason: gain ? "independently-validated-gain" : "kept-incumbent-no-proven-gain",
          },
          validation: independentValidationSeeds(simulationHash(input), "talents").map((seed) => ({
            seed,
            baseline: { dps: 100, stdev: 1, iterations: 20000 },
            candidate: { dps: gain ? 110 : 100, stdev: 1, iterations: 20000 },
          })),
        };
      } else if (kind === "gear") {
        value = makeGear(input, files.get(inputs.talents.path).selection.talents);
      } else if (kind === "browser") {
        value = { baselineSha256: simulationHash(input), parity: true };
      } else if (kind === "review") value = { status: "closed-loop-verified" };
      else throw new Error(`Unknown test action ${kind}`);
      return add(`${kind}-${executed.length}.json`, value).path;
    },
  };
  return {
    session,
    actions,
    executed,
    files,
    save: async (state) => saved.push(globalThis.structuredClone(state)),
    saved,
  };
}

test("feedback driver adopts completed gear, checks talents and requires browser plus linked review", async () => {
  const input = fixture();
  const result = await runFuryFeedback(input.session, input.actions, input.save);
  assert.equal(result.status, "closed-loop-reviewed");
  assert.deepEqual(input.executed, ["feedback", "talents", "browser", "review"]);
  assert(result.final.review.sha256);
  assert.equal(input.saved.at(-1).active, null);
  await runFuryFeedback(input.session, input.actions, input.save);
  assert.equal(input.executed.length, 4, "Resume must reuse identical completed steps");
  input.files.get(result.final.talents.path).validated = true;
  await assert.rejects(
    runFuryFeedback(input.session, input.actions, input.save),
    /evidence changed/,
  );
});

test("Arms follows its own feedback chain and cannot be accepted through the Fury-only entry point", async () => {
  const input = fixture({ variant: "arms", improves: true });
  await assert.rejects(runFuryFeedback(input.session, input.actions, input.save));
  const result = await runWarriorFeedback(input.session, input.actions, input.save);
  assert.equal(result.status, "closed-loop-reviewed");
  assert.deepEqual(input.executed, [
    "feedback",
    "talents",
    "gear",
    "feedback",
    "talents",
    "browser",
    "review",
  ]);
  const count = input.executed.length;
  await runWarriorFeedback(input.session, input.actions, input.save);
  assert.equal(input.executed.length, count);
  input.session.profile = "mage/fire";
  await assert.rejects(runWarriorFeedback(input.session, input.actions, input.save));
});

test("an accepted talent change always gets another gear and actual-gear talent pass", async () => {
  const input = fixture({ initialGear: false, improves: true });
  await runFuryFeedback(input.session, input.actions, input.save);
  assert.equal(input.session.status, "closed-loop-reviewed");
  assert.deepEqual(input.executed, ["talents", "gear", "feedback", "talents", "browser", "review"]);
  const final = input.files.get(input.session.final.baseline.path);
  assert.equal(final.settings.player.talentsString, "2");
});

test("a non-converged gear safety limit is incomplete, never a reviewed result", async () => {
  const input = fixture({ initialGear: false, converged: false });
  await runFuryFeedback(input.session, input.actions, input.save, 1);
  assert.equal(input.session.status, "feedback-limit-reached");
  assert.equal(input.session.final, null);
  assert.deepEqual(input.executed, ["talents", "gear", "feedback", "talents"]);
  await assert.rejects(runFuryFeedback(input.session, input.actions, input.save, 0));
  input.session.profile = "mage/fire";
  await assert.rejects(runFuryFeedback(input.session, input.actions, input.save));
});

test("requested high precision also rejects lower-count talent evidence", async () => {
  const input = fixture();
  input.session.validationIterationsPerSeed = 100000;
  await assert.rejects(
    runFuryFeedback(input.session, input.actions, input.save),
    /Talent evidence is below the requested validation precision/,
  );
  assert(!input.executed.includes("browser"));
  assert(!input.executed.includes("review"));
});

test("a stable legacy search with incomplete item/enchant coverage is reoptimized", async () => {
  const input = fixture({ initialCoverage: false });
  await runFuryFeedback(input.session, input.actions, input.save);
  assert.equal(input.session.status, "closed-loop-reviewed");
  assert.deepEqual(input.executed, [
    "feedback",
    "talents",
    "gear",
    "feedback",
    "talents",
    "browser",
    "review",
  ]);
});

test("CLI output parsing requires completed artifacts inside the research directory", () => {
  const root = resolve("fixture-repo");
  const directory = resolve(root, "artifacts/forever-simulator/optimization");
  assert.equal(
    feedbackOutputPath(
      "talents",
      `Fury talent evidence saved: ${directory}/talents.json; 10 simulations`,
      root,
    ),
    directory + "/talents.json",
  );
  assert.equal(
    feedbackOutputPath(
      "talents",
      `Arms talent evidence saved: ${directory}/arms-talents.json; reused completed evidence without new simulations or rewriting measurements`,
      root,
    ),
    directory + "/arms-talents.json",
  );
  assert.equal(
    feedbackOutputPath(
      "gear",
      `Finished 1 profiles. Report: ${directory}/warrior-fury-results.json`,
      root,
    ),
    directory + "/warrior-fury-gear.json",
  );
  assert.equal(
    feedbackOutputPath("browser", JSON.stringify({ output: directory + "/browser.json" }), root),
    directory + "/browser.json",
  );
  assert.throws(() => feedbackOutputPath("gear", "SEARCH still running", root), /completed/);
  assert.throws(
    () => feedbackOutputPath("review", JSON.stringify({ output: "outside.json" }), root),
    /escaped/,
  );
  assert.throws(() => feedbackOutputPath("unknown", "{}", root));
});

test("coverage requires low-level candidates, full accessory pools and modeled haste enchants", () => {
  const db = {
    items: prebisSlotTypes.map((type, slot) => ({
      id: slot + 1,
      type,
      ilvl: 60,
      stats: Array(44).fill(0),
      ...(type === 13 ? { weaponType: 9, handType: 2 } : {}),
      ...(type === 14 ? { rangedWeaponType: 1 } : {}),
    })),
  };
  db.items.push({ ...db.items[0], id: 101, ilvl: 20 });
  db.items.push({ ...db.items[12], id: 102, ilvl: 20 });
  const sources = new Map(
    db.items.map((item) => [item.id, { requiredLevel: 20, sources: [{ kind: "dungeon" }] }]),
  );
  const gear = {
    items: db.items.slice(0, 17).map((item, slot) => ({
      id: item.id,
      ...(slot === 0 ? { enchant: 1506 } : {}),
    })),
  };
  const baseline = {
    profile: "warrior",
    variant: "fury",
    playerClass: 9,
    settings: {
      settings: { faction: "Alliance" },
      player: {
        race: "RaceHuman",
        profession1: "Engineering",
        profession2: "Blacksmithing",
        equipment: gear,
      },
    },
  };
  const common = {
    type: 1,
    extraTypes: [],
    classAllowlist: [],
    armorTypes: [],
    minLevel: 0,
    maxLevel: 0,
    itemLevelMin: 0,
    itemLevelMax: 0,
    enchantType: 0,
  };
  const inspection = {
    enchants: {
      strength: { ...common, status: "static", effectId: 1506, spellId: 15397 },
      haste: { ...common, status: "scripted", effectId: 2543, spellId: 22840 },
    },
  };
  const result = {
    converged: true,
    validationSeedPolicy,
    validation: [0, 1].map(() => ({
      baseline: { iterations: 20000 },
      candidate: { iterations: 20000 },
    })),
    gear,
    comparisons: [{ pass: 1, slots: ["enchant:0"], screened: 2, accepted: false }],
    candidateIdsBySlot: prebisSlotTypes.map((type) =>
      db.items.filter((item) => item.type === type).map((item) => item.id),
    ),
  };
  const covered = (value) => hasCurrentPrebisCoverage(value, baseline, db, sources, inspection);
  assert.equal(covered(result), true);
  assert.equal(hasCurrentPrebisCoverage(result, baseline, db, sources, inspection, 100000), false);
  const precise = globalThis.structuredClone(result);
  for (const row of precise.validation) row.baseline.iterations = row.candidate.iterations = 100000;
  assert.equal(hasCurrentPrebisCoverage(precise, baseline, db, sources, inspection, 100000), true);
  assert.equal(
    hasCurrentPrebisCoverage(precise, baseline, db, sources, inspection, Number.NaN),
    false,
  );
  for (const slot of [0, 12]) {
    const missing = globalThis.structuredClone(result);
    missing.candidateIdsBySlot[slot].pop();
    assert.equal(covered(missing), false);
  }
  const hasteSkipped = globalThis.structuredClone(result);
  hasteSkipped.comparisons[0].screened = 1;
  assert.equal(covered(hasteSkipped), false);
  assert.equal(covered({ ...result, converged: false }), false);
  const tighterSources = new Map(sources);
  tighterSources.delete(101);
  assert.equal(hasCurrentPrebisCoverage(result, baseline, db, tighterSources, inspection), true);
  tighterSources.delete(1);
  assert.equal(hasCurrentPrebisCoverage(result, baseline, db, tighterSources, inspection), false);
  for (const extraId of [101, 999, 2, 101.5]) {
    const invalid = globalThis.structuredClone(result);
    invalid.candidateIdsBySlot[0].push(extraId);
    assert.equal(covered(invalid), false);
  }
  const newlyAdmitted = new Map(sources);
  newlyAdmitted.set(103, sources.get(101));
  assert.equal(
    hasCurrentPrebisCoverage(
      result,
      baseline,
      { ...db, items: [...db.items, { ...db.items[0], id: 103 }] },
      newlyAdmitted,
      inspection,
    ),
    false,
  );
  const illegal = globalThis.structuredClone(result);
  illegal.gear.items[0].id = 999;
  assert.equal(covered(illegal), false);
});

test("feedback CLI rejects missing, unsupported, duplicate and invalid inputs before starting work", () => {
  const root = resolve(import.meta.dirname, "..");
  const script = resolve(root, "scripts/run-simulator-feedback.mjs");
  for (const [args, message] of [
    [[], /Pass --baseline/],
    [["--spec=mage/fire"], /Unknown argument/],
    [["--baseline=one.json", "--baseline=two.json"], /Repeated feedback argument/],
    [["--baseline=ignored.json", "--max-rounds=0"], /Choose --max-rounds/],
    [["--baseline=ignored.json", "--validation-iterations=50000"], /Use --validation-iterations/],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
    assert.equal(result.stdout, "");
  }
});
