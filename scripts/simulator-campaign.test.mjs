import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import {
  campaignArtifactPath,
  campaignChanges,
  campaignChangeSummary,
  campaignAccessoryRanges,
  campaignCommand,
  campaignOutput,
  campaignSnapshot,
  runCampaignCase,
  validateCampaignConfig,
} from "../infra/simulator/prebis-campaign.mjs";
import {
  independentValidationSeeds,
  validationSeedPolicy,
} from "../infra/simulator/simulation-seeds.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import {
  acquireSimulatorWorkspace,
  assertSimulatorWorkspaceAccess,
  workspaceLeaseVariable,
} from "../infra/simulator/simulator-workspace.mjs";
import { startSimulatorLocalServer } from "../infra/simulator/simulator-local-server.mjs";

const config = {
  schema: "kfc-prebis-campaign-config.v1",
  validationIterations: 100000,
  maxFeedbackRounds: 6,
  maxFinalizationRounds: 4,
  minimumFreeGiB: 4,
  cases: [
    { id: "arms-alliance", spec: "warrior/arms", faction: "alliance", scenario: "conservative" },
  ],
};

test("campaign configuration rejects unsupported policies, typos and reduced verification", () => {
  assert.deepEqual(validateCampaignConfig(config), config);
  for (const patch of [
    { validationIterations: 20000 },
    { minimumFreeGiB: 0 },
    { maxFinalizationRounds: 0 },
    { maxFeedbackRounds: 21 },
    { cases: [config.cases[0], config.cases[0]] },
    { cases: [{ ...config.cases[0], spec: "warlock/demonology" }] },
    { cases: [{ ...config.cases[0], id: "../../private" }] },
    { cases: [{ ...config.cases[0], faction: "any" }] },
    { cases: [{ ...config.cases[0], scenario: "raid" }] },
    { cases: [{ ...config.cases[0], typo: true }] },
    { typo: true },
  ])
    assert.throws(() => validateCampaignConfig({ ...config, ...patch }));
});

const makeSnapshot = (
  items = [{ id: 1, name: "Helm", stats: [4] }],
  components = { engine: "a".repeat(64), sources: "b".repeat(64) },
) =>
  campaignSnapshot({
    release: "c".repeat(24),
    revision: "d".repeat(40),
    db: { items, enchants: [] },
    components,
  });

test("catalog additions, removals, changed stats and changed models invalidate cases", () => {
  const first = makeSnapshot([
    { id: 1, name: "Helm", stats: [4] },
    { id: 2, name: "Boots" },
  ]);
  assert.equal(
    campaignChanges(
      first,
      makeSnapshot([
        { id: 1, name: "Helm", stats: [4] },
        { id: 2, name: "Boots" },
      ]),
    ).changed,
    false,
  );
  const next = makeSnapshot(
    [
      { id: 1, name: "Helm", stats: [5] },
      { id: 3, name: "Sword" },
    ],
    { engine: "e".repeat(64) },
  );
  const delta = campaignChanges(first, next);
  assert.deepEqual(
    delta.added.map((row) => row.id),
    [3],
  );
  assert.deepEqual(
    delta.removed.map((row) => row.id),
    [2],
  );
  assert.deepEqual(
    delta.modified.map((row) => row.id),
    [1],
  );
  assert.deepEqual(delta.components, ["engine", "sources"]);
  assert.equal(delta.changed, true);
  assert.deepEqual(campaignChangeSummary(delta).counts, {
    added: 1,
    removed: 1,
    modified: 1,
    components: 2,
  });
  assert.equal(campaignChanges(null, first).firstRun, true);
  assert.notEqual(
    makeSnapshot().fingerprint,
    makeSnapshot(undefined, { enchants: "f".repeat(64) }).fingerprint,
  );
  assert.throws(() => makeSnapshot([{ id: 1 }, { id: 1 }]));
});

test("campaign output parsing and evidence paths fail closed", () => {
  const root = resolve("/workspace/project");
  assert.equal(
    campaignArtifactPath(root, "artifacts/forever-simulator/optimization/review.json"),
    resolve(root, "artifacts/forever-simulator/optimization/review.json"),
  );
  for (const path of [
    ".env",
    "artifacts/forever-simulator/optimization/../secret.json",
    "artifacts/forever-simulator/optimization-other/review.json",
    "artifacts/forever-simulator/optimization/review.txt",
  ])
    assert.throws(() => campaignArtifactPath(root, path));
  assert.deepEqual(campaignOutput('progress\n{"output":"proof.json"}\n'), { output: "proof.json" });
  assert.equal(
    campaignOutput('{"statePath":"session.json","status":"closed-loop-reviewed"}').statePath,
    "session.json",
  );
  assert.throws(() => campaignOutput("still running"));
  assert.throws(() => campaignOutput("{invalid json"));
});

test("campaign commands use the existing complete checks with fixed verification precision", () => {
  const reference = { path: "review.json", sha256: "a".repeat(64) };
  for (const kind of [
    "baseline",
    "proc-scenario",
    "feedback",
    "accessories",
    "accessory-feedback",
    "rotation",
    "export",
  ]) {
    const args = campaignCommand(
      kind,
      {
        baseline: reference,
        review: reference,
        audit: reference,
        rotation: reference,
        kind: "rings",
      },
      config.cases[0],
      config,
    );
    assert(args[0].endsWith(".mjs"));
    if (["feedback", "rotation"].includes(kind))
      assert(args.includes("--validation-iterations=100000"));
  }
  assert.throws(() =>
    campaignCommand("accessories", { review: reference, kind: "weapon" }, config.cases[0], config),
  );
  assert.throws(() => campaignCommand("fake", {}, config.cases[0], config));
});

function workflowFixture({
  accessoryGain = false,
  rotationGain = false,
  alwaysGain = false,
  procs = false,
} = {}) {
  const files = new Map();
  const calls = [];
  const configuration = globalThis.structuredClone(config);
  if (procs) configuration.cases[0].scenario = "provisional-procs";
  const state = {
    schema: "kfc-prebis-campaign-case.v1",
    entry: configuration.cases[0],
    status: "pending",
    steps: [],
    active: null,
    final: null,
  };
  const add = (value) => {
    const path = `evidence-${files.size}.json`;
    files.set(path, value);
    return { path, sha256: simulationHash(value) };
  };
  let audits = 0,
    rotations = 0,
    checkpoints = 0;
  const actions = {
    checkInputs: async () => {},
    read: async (path) => {
      assert(files.has(path));
      return files.get(path);
    },
    execute: async (kind, inputs) => {
      calls.push(kind);
      if (["baseline", "proc-scenario", "accessory-feedback"].includes(kind))
        return { output: add({ baseline: calls.length }) };
      if (kind === "feedback") {
        const baseline = add({ finalBaseline: calls.length });
        return {
          output: add({
            status: "closed-loop-verified",
            profile: "warrior",
            variant: "arms",
            iterations: 400000,
            baselineSha256: baseline.sha256,
            dbSha256: "a".repeat(64),
            nativeBinarySha256: "b".repeat(64),
            validationSeedRanges: [{ seed: 2000000, iterations: 100000 }],
            evidencePaths: { baseline: baseline.path },
          }),
        };
      }
      if (kind === "accessories") {
        const improves = alwaysGain || (accessoryGain && audits++ === 0);
        const reviewed = files.get(inputs.review.path);
        const identity = simulationHash({ review: inputs.review.sha256, kind: inputs.kind });
        return {
          output: add({
            schema: "kfc-accessory-challenger-audit.v1",
            profile: "warrior",
            variant: "arms",
            dbSha256: reviewed.dbSha256,
            nativeBinarySha256: reviewed.nativeBinarySha256,
            baselineSha256: reviewed.baselineSha256,
            feedbackReviewSha256: inputs.review.sha256,
            kind: inputs.kind,
            status: improves ? "challenger-requires-feedback" : "no-confirmed-challenger",
            bestConfirmed: improves ? { confirmed: true } : null,
            identity,
            validationSeedContext: identity,
            validationSeedPolicy,
            validationSeeds: independentValidationSeeds(identity, "gear"),
            validationIterations: 100000,
            screeningSeed: independentValidationSeeds(
              simulationHash({ identity, phase: "screening" }),
              "gear",
            )[0],
            screeningIterations: 2000,
            screened: [{ id: "candidate", dps: 100, stdev: 1, iterations: 2000 }],
            challenges: [],
          }),
        };
      }
      if (kind === "rotation") {
        const improves = rotationGain && rotations++ === 0;
        const context = simulationHash({ review: inputs.review.sha256, rotation: true });
        return {
          output: add({
            feedbackSha256: inputs.review.sha256,
            validated: improves,
            validationSeedContext: context,
            validationSeedPolicy,
            validation: independentValidationSeeds(context, "rotation").map((seed) => ({
              seed,
              baseline: { iterations: 100000 },
              candidate: { iterations: 100000 },
            })),
          }),
          ...(improves ? { nextBaseline: add({ rotationBaseline: calls.length }) } : {}),
        };
      }
      assert.equal(kind, "export");
      return {
        output: add({
          schema: "kfc-reviewed-simulator-build.v1",
          profile: "warrior",
          variant: "arms",
          faction: "Alliance",
          requiresProvisionalEnchantOptIn: procs,
          evidence: {
            feedbackSha256: inputs.review.sha256,
            rotationAuditSha256: inputs.rotation.sha256,
          },
        }),
      };
    },
  };
  return {
    state,
    actions,
    files,
    calls,
    config: configuration,
    save: async () => {
      checkpoints++;
    },
    checkpointCount: () => checkpoints,
  };
}

test("full campaign includes both accessory audits and rotation before exporting, then resumes without rerunning", async () => {
  const input = workflowFixture();
  await runCampaignCase(input.state, input.actions, input.save, input.config);
  assert.equal(input.state.status, "reviewed-local");
  assert.deepEqual(input.calls, [
    "baseline",
    "feedback",
    "accessories",
    "accessories",
    "rotation",
    "export",
  ]);
  assert.equal(input.state.final.accessories.length, 2);
  assert(input.checkpointCount() > 6);
  await runCampaignCase(input.state, input.actions, input.save, input.config);
  assert.equal(input.calls.length, 6);
});

test("confirmed accessories return through full feedback before a recommendation", async () => {
  const input = workflowFixture({ accessoryGain: true });
  await runCampaignCase(input.state, input.actions, input.save, input.config);
  assert.deepEqual(input.calls.slice(0, 5), [
    "baseline",
    "feedback",
    "accessories",
    "accessory-feedback",
    "feedback",
  ]);
  assert.equal(input.state.status, "reviewed-local");
});

test("rotation gains also restart feedback and invalidate accessory checks", async () => {
  const input = workflowFixture({ rotationGain: true });
  await runCampaignCase(input.state, input.actions, input.save, input.config);
  assert.equal(input.calls.filter((kind) => kind === "feedback").length, 2);
  assert.equal(input.calls.filter((kind) => kind === "accessories").length, 4);
  assert.equal(input.calls.filter((kind) => kind === "export").length, 1);
});

test("provisional scenarios are explicit and finalization limits never export", async () => {
  const procs = workflowFixture({ procs: true });
  await runCampaignCase(procs.state, procs.actions, procs.save, procs.config);
  assert.equal(procs.calls[1], "proc-scenario");
  const limited = workflowFixture({ alwaysGain: true });
  await runCampaignCase(limited.state, limited.actions, limited.save, limited.config);
  assert.equal(limited.state.status, "finalization-limit-reached");
  assert.equal(limited.state.final, null);
  assert(!limited.calls.includes("export"));
});

test("resume rejects changed evidence, wrong cases and changed inputs", async () => {
  const input = workflowFixture();
  await runCampaignCase(input.state, input.actions, input.save, input.config);
  input.files.set(input.state.steps[0].files.output.path, { modified: true });
  await assert.rejects(
    runCampaignCase(input.state, input.actions, input.save, input.config),
    /evidence changed/,
  );
  const changed = workflowFixture();
  changed.actions.checkInputs = async () => {
    throw new Error("new catalog");
  };
  await assert.rejects(
    runCampaignCase(changed.state, changed.actions, changed.save, changed.config),
    /new catalog/,
  );
  assert.equal(changed.calls.length, 0);
  const wrong = workflowFixture();
  wrong.state.entry = { ...wrong.state.entry, faction: "horde" };
  await assert.rejects(runCampaignCase(wrong.state, wrong.actions, wrong.save, wrong.config));
});

test("campaign finalization rejects mismatched or insufficient accessory evidence", async () => {
  const input = workflowFixture();
  await runCampaignCase(input.state, input.actions, input.save, input.config);
  const review = input.files.get(input.state.final.review.path);
  const audit = input.files.get(input.state.final.accessories[0].path);
  assert.equal(campaignAccessoryRanges(audit, review).length, 3);
  for (const patch of [
    { validationIterations: 20000 },
    { screeningIterations: 80 },
    { baselineSha256: "e".repeat(64) },
    { nativeBinarySha256: "e".repeat(64) },
    { screened: [] },
    { validationSeeds: [1, 2] },
  ])
    assert.throws(() => campaignAccessoryRanges({ ...audit, ...patch }, review));
});

test("workspace leases exclude other runs and can be borrowed without releasing the owner", async () => {
  const root = await mkdtemp(join(tmpdir(), "kfc-sim-lease-"));
  try {
    const lease = await acquireSimulatorWorkspace(root, "campaign.json", {});
    await assert.rejects(acquireSimulatorWorkspace(root, "other.json", {}), /reserved/);
    assert.deepEqual(await assertSimulatorWorkspaceAccess(root, {}), lease.owner);
    const module = new URL("../infra/simulator/simulator-workspace.mjs", import.meta.url).href;
    const denied = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { assertSimulatorWorkspaceAccess } from ${JSON.stringify(module)}; await assertSimulatorWorkspaceAccess(${JSON.stringify(root)}, {});`,
      ],
      { encoding: "utf8" },
    );
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /reserved/);
    const borrowed = await acquireSimulatorWorkspace(root, "child.json", lease.environment);
    await borrowed.release();
    const inherited = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { acquireSimulatorWorkspace } from ${JSON.stringify(module)}; const lease = await acquireSimulatorWorkspace(${JSON.stringify(root)}, "child.json"); await lease.release();`,
      ],
      { encoding: "utf8", env: { ...process.env, ...lease.environment } },
    );
    assert.equal(inherited.status, 0, inherited.stderr);
    assert.deepEqual(await assertSimulatorWorkspaceAccess(root, lease.environment), lease.owner);
    await assert.rejects(
      assertSimulatorWorkspaceAccess(root, {
        [workspaceLeaseVariable]: JSON.stringify({ ...lease.owner, nonce: "wrong" }),
      }),
      /different run/,
    );
    await lease.release();
    await lease.release();
    assert.equal(await assertSimulatorWorkspaceAccess(root, {}), null);
    await assert.rejects(
      assertSimulatorWorkspaceAccess(root, lease.environment),
      /no longer exists/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("native builds reject another process's workspace before changing generated source", async () => {
  const root = await mkdtemp(join(tmpdir(), "kfc-sim-native-lock-"));
  let lease;
  try {
    lease = await acquireSimulatorWorkspace(root, "campaign.json", {});
    const module = new URL("../infra/simulator/native-runner.mjs", import.meta.url).href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { createNativeRunners } from ${JSON.stringify(module)}; await createNativeRunners(${JSON.stringify(root)}, 1);`,
      ],
      { encoding: "utf8", env: { ...process.env, [workspaceLeaseVariable]: "" } },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /workspace is reserved by PID/);
    assert.deepEqual(await assertSimulatorWorkspaceAccess(root, lease.environment), lease.owner);
  } finally {
    await lease?.release();
    await rm(root, { recursive: true, force: true });
  }
});

test("lease release does not unlink a replacement lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "kfc-sim-lease-replace-"));
  try {
    const lease = await acquireSimulatorWorkspace(root, "campaign.json", {});
    const path = join(
      root,
      "artifacts/forever-simulator/optimization/feedback-sessions/active.lock",
    );
    const replacement = { ...lease.owner, nonce: "replacement" };
    await writeFile(path, JSON.stringify(replacement));
    await assert.rejects(lease.release(), /another simulator run/);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), replacement);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("temporary local server serves only checksummed release assets and handles errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "kfc-sim-server-"));
  let server;
  try {
    const release = "a".repeat(24);
    const contents = { "warrior/index.html": "<main>Warrior</main>", "sim.wasm": "wasm" };
    for (const [path, value] of Object.entries(contents)) {
      await mkdir(dirname(join(root, release, path)), { recursive: true });
      await writeFile(join(root, release, path), value);
    }
    const files = Object.fromEntries(
      Object.entries(contents).map(([path, value]) => [
        path,
        {
          bytes: Buffer.byteLength(value),
          sha256: createHash("sha256").update(value).digest("hex"),
        },
      ]),
    );
    server = await startSimulatorLocalServer(root, { release, files });
    const base = `${server.origin}/forever-sim/${release}/`;
    const page = await globalThis.fetch(base + "warrior/");
    assert.equal(page.status, 200);
    assert.equal(await page.text(), contents["warrior/index.html"]);
    const wasm = await globalThis.fetch(base + "sim.wasm", { method: "HEAD" });
    assert.equal(wasm.headers.get("content-type"), "application/wasm");
    assert.equal(await wasm.text(), "");
    assert.equal((await globalThis.fetch(base + "sim.wasm", { method: "POST" })).status, 405);
    for (const path of ["unknown", "%ZZ", "%2e%2e%2fsecret", "..%5csecret"])
      assert((await globalThis.fetch(base + path)).status >= 400);
    await writeFile(join(root, release, "sim.wasm"), "corrupt");
    assert.equal((await globalThis.fetch(base + "sim.wasm")).status, 500);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("update CLI rejects invalid flags before touching catalogs or running simulations", () => {
  const cli = fileURLToPath(new URL("./update-simulator-prebis.mjs", import.meta.url));
  for (const args of [
    ["--unknown"],
    ["--details"],
    ["--plan", "--prepare"],
    ["--plan", "--plan"],
    ["--status", "--plan"],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert(!result.stdout.includes("[campaign]"));
  }
  const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert(help.stdout.includes("--plan"));
});
