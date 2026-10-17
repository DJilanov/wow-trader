import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { feedbackOutputPath, runWarriorFeedback } from "../infra/simulator/feedback-workflow.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";
import { hasCurrentPrebisCoverage } from "../infra/simulator/prebis-search-coverage.mjs";
import { prebisSources } from "../infra/simulator/prebis-pool.mjs";
import { parseValidationIterations } from "../infra/simulator/simulation-seeds.mjs";
import { loadBlueControl } from "../infra/simulator/baseline-control.mjs";
import { acquireSimulatorWorkspace } from "../infra/simulator/simulator-workspace.mjs";

const root = resolve(import.meta.dirname, "..");
const argument = (name) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
for (const value of process.argv.slice(2))
  assert(
    /^--(baseline|gear-review|max-rounds|validation-iterations)=.+$/.test(value),
    `Unknown argument: ${value}`,
  );
assert.equal(
  new Set(process.argv.slice(2).map((value) => value.split("=")[0])).size,
  process.argv.length - 2,
  "Repeated feedback argument",
);
const baselineArgument = argument("baseline");
assert(baselineArgument, "Pass --baseline=<controlled-warrior-baseline.json>");
const maxRounds = Number(argument("max-rounds") ?? 6);
const validationIterationsPerSeed = parseValidationIterations(argument("validation-iterations"));
assert(
  Number.isSafeInteger(maxRounds) && maxRounds >= 1 && maxRounds <= 20,
  "Choose --max-rounds from 1 to 20",
);
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const reference = async (path) => ({
  path: resolve(root, path),
  sha256: simulationHash(await read(resolve(root, path))),
});
const initialBaseline = await reference(baselineArgument);
const baseline = await read(initialBaseline.path);
assert.equal(baseline.schema, "kfc-optimization-baseline.v1");
const profileKey = `${baseline.profile}/${baseline.variant}`;
assert(["warrior/fury", "warrior/arms"].includes(profileKey), "Unsupported feedback policy");
assert.equal(baseline.playerClass, 9);
const { path: controlPath } = await loadBlueControl(root, baseline);
const gearArgument = argument("gear-review");
const initialGear = gearArgument ? await reference(gearArgument) : null;
const workspace = await acquireSimulatorWorkspace(root, initialBaseline.path);
try {
  await executeFeedbackSession();
} finally {
  await workspace.release();
}

async function executeFeedbackSession() {
  const verificationWorkers = await createNativeRunners(root, 1);
  const binarySha256 = verificationWorkers[0].binarySha256;
  verificationWorkers[0].close();
  const algorithmPaths = [
    "infra/simulator/feedback-workflow.mjs",
    "infra/simulator/simulator-workspace.mjs",
    "infra/simulator/talent-search.mjs",
    baseline.variant === "arms"
      ? "infra/simulator/arms-policy.mjs"
      : "infra/simulator/fury-rotations.mjs",
    "infra/simulator/talent-evidence.mjs",
    "infra/simulator/baseline-control.mjs",
    "infra/simulator/reference-builds.mjs",
    "infra/simulator/reference-builds.json",
    "infra/simulator/prebis-pool.mjs",
    "infra/simulator/prebis-search-coverage.mjs",
    "infra/simulator/prebis-enchants.mjs",
    "infra/simulator/enchant-acquisition.mjs",
    "infra/simulator/equipment-ownership.mjs",
    "infra/simulator/default-enchants.mjs",
    "infra/simulator/prebis-consumes.mjs",
    "infra/simulator/prebis-feedback.mjs",
    "infra/simulator/browser-capture.mjs",
    "infra/simulator/native-runner.mjs",
    "infra/simulator/item-effects-adapter.mjs",
    "infra/simulator/flame-wrath_test.go",
    "infra/simulator/manual-crowd-pummeler.mjs",
    "infra/simulator/manual-crowd-pummeler.go",
    "infra/simulator/manual-crowd-pummeler_test.go",
    "infra/simulator/drakkisath-trinkets.mjs",
    "infra/simulator/drakkisath-trinkets.go",
    "infra/simulator/drakkisath-trinkets_test.go",
    "infra/simulator/dungeon-set-mana-adapter.mjs",
    "infra/simulator/dungeon-set-mana.go",
    "infra/simulator/dungeon-set-mana_test.go",
    "infra/simulator/inspection-data.mjs",
    "infra/simulator/verified-accessories.mjs",
    "infra/simulator/current-prebis-admission.mjs",
    "infra/simulator/current-prebis-recovery.mjs",
    "infra/simulator/current-prebis-staging.mjs",
    "infra/simulator/current-prebis-equipment.json",
    "infra/simulator/validation-runner.mjs",
    "infra/simulator/simulation-cache.mjs",
    "infra/simulator/simulation-seeds.mjs",
    "infra/simulator/prebis-runner.go",
    "scripts/optimize-simulator-talents.mjs",
    "scripts/optimize-simulator-prebis.mjs",
    "scripts/create-simulator-feedback-baseline.mjs",
    "scripts/verify-simulator-baseline.mjs",
    "scripts/review-simulator-feedback.mjs",
    "scripts/run-simulator-feedback.mjs",
    "artifacts/forever-simulator/craft-acquisition.json",
    "artifacts/forever-simulator/active.json",
    "artifacts/forever-simulator/optimization/requests.json",
    controlPath,
    ".cache/forever-sim-upstream/assets/database/db.json",
    ".cache/forever-sim-upstream/assets/db_inputs/forever_gear_catalog.json",
    ".cache/forever-sim-upstream/ui/core/kfc_prebis_import.json",
    ".cache/forever-sim-upstream/ui/core/kfc_inspection.json",
    ".cache/forever-sim-upstream/ui/core/talents/trees/warrior.json",
  ];
  const algorithmSha256 = simulationHash(
    await Promise.all(
      algorithmPaths.map(async (path) => [path, await readFile(resolve(root, path), "utf8")]),
    ),
  );
  const identity = simulationHash({
    initialBaseline,
    initialGear,
    algorithmSha256,
    binarySha256,
    validationIterationsPerSeed,
  });
  const upstream = join(root, ".cache/forever-sim-upstream");
  const db = await read(join(upstream, "assets/database/db.json"));
  assert.equal(baseline.dbSha256, simulationHash(db), "Baseline database changed");
  const activeRelease = await read(join(root, "artifacts/forever-simulator/active.json"));
  assert.equal(baseline.revision, activeRelease.revision, "Baseline engine revision changed");
  const catalog = await read(join(upstream, "assets/db_inputs/forever_gear_catalog.json"));
  const imports = await read(join(upstream, "ui/core/kfc_prebis_import.json"));
  const craftAudit = await read(join(root, "artifacts/forever-simulator/craft-acquisition.json"));
  const inspection = await read(join(upstream, "ui/core/kfc_inspection.json"));
  const sources = prebisSources(
    catalog,
    imports,
    craftAudit,
    new Map(db.items.map((item) => [item.id, item])),
  );
  const directory = join(
    root,
    "artifacts/forever-simulator/optimization/feedback-sessions",
    identity,
  );
  await mkdir(directory, { recursive: true });
  const statePath = join(directory, "session.json");
  let child;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    child?.kill("SIGTERM");
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const save = async (session) => {
    await writeFile(statePath + ".pending", JSON.stringify(session, null, 2) + "\n");
    await rename(statePath + ".pending", statePath);
  };
  let session;
  try {
    try {
      session = await read(statePath);
      assert.equal(session.identity, identity, "Feedback session inputs changed");
      assert.equal(session.algorithmSha256, algorithmSha256);
      assert.equal(session.binarySha256, binarySha256);
      assert.equal(session.validationIterationsPerSeed, validationIterationsPerSeed);
      assert.deepEqual(session.initialBaseline, initialBaseline);
      assert.deepEqual(session.initialGear, initialGear);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      session = {
        schema: "kfc-prebis-feedback-session.v1",
        identity,
        algorithmSha256,
        binarySha256,
        validationIterationsPerSeed,
        profile: profileKey,
        initialBaseline,
        initialGear,
        status: "running",
        steps: [],
        active: null,
        final: null,
        notice:
          "Local research only. A reviewed feedback loop is not global BiS or public promotion.",
      };
    }
    console.log(`Feedback session: ${statePath}`);
    const execute = async (kind, inputs) => {
      assert(!interrupted, "Feedback interrupted");
      const scripts = {
        talents: "optimize-simulator-talents.mjs",
        gear: "optimize-simulator-prebis.mjs",
        feedback: "create-simulator-feedback-baseline.mjs",
        browser: "verify-simulator-baseline.mjs",
        review: "review-simulator-feedback.mjs",
      };
      const args = [join(root, "scripts", scripts[kind]), `--baseline=${inputs.baseline.path}`];
      if (["talents", "gear"].includes(kind)) args.push(`--spec=${profileKey}`);
      if (["talents", "gear"].includes(kind))
        args.push(`--validation-iterations=${validationIterationsPerSeed}`);
      if (kind === "gear") args.push(`--talent-review=${inputs.talents.path}`, "--resume");
      if (["feedback", "review"].includes(kind)) args.push(`--gear-review=${inputs.gear.path}`);
      if (kind === "review")
        args.push(
          `--talent-review=${inputs.talents.path}`,
          `--browser-review=${inputs.browser.path}`,
        );
      const stdout = await new Promise((resolveOutput, reject) => {
        let output = "";
        child = spawn(process.execPath, args, {
          cwd: root,
          env: workspace.environment,
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (value) => {
          process.stdout.write(value);
          output = (output + value).slice(-512000);
        });
        child.stderr.on("data", (bytes) => process.stderr.write(bytes));
        child.once("error", reject);
        child.once("exit", (code, signal) => {
          child = undefined;
          if (code === 0 && !interrupted) resolveOutput(output);
          else reject(new Error(`${kind} exited ${code ?? signal}`));
        });
      });
      return feedbackOutputPath(kind, stdout, root);
    };
    await runWarriorFeedback(
      session,
      {
        read,
        execute,
        hasCurrentCoverage: (result, input) =>
          hasCurrentPrebisCoverage(
            result,
            input,
            db,
            sources,
            inspection,
            validationIterationsPerSeed,
          ),
      },
      save,
      maxRounds,
    );
    assert(!interrupted, "Feedback interrupted");
    console.log(JSON.stringify({ statePath, status: session.status, final: session.final }));
    if (session.status !== "closed-loop-reviewed") process.exitCode = 2;
  } catch (error) {
    if (session) {
      session.status = interrupted ? "interrupted" : "failed";
      session.lastError = error.message;
      await save(session);
    }
    throw error;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}
