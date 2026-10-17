import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, statfs, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { clearInterval, setInterval } from "node:timers";
import process from "node:process";
import console from "node:console";
import {
  campaignArtifactPath,
  campaignChanges,
  campaignChangeSummary,
  campaignCommand,
  campaignOutput,
  campaignPolicies,
  campaignSnapshot,
  runCampaignCase,
  validateCampaignConfig,
} from "../infra/simulator/prebis-campaign.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import {
  acquireSimulatorWorkspace,
  workspaceLeaseVariable,
} from "../infra/simulator/simulator-workspace.mjs";
import { startSimulatorLocalServer } from "../infra/simulator/simulator-local-server.mjs";

const root = resolve(import.meta.dirname, "..");
const flags = new Map();
for (const argument of process.argv.slice(2)) {
  const match =
    /^--(plan|status|help|details)$/.exec(argument) ?? /^--(spec|case|config)=(.+)$/.exec(argument);
  assert(match && !flags.has(match[1]), `Unknown or repeated argument: ${argument}`);
  flags.set(match[1], match[2] ?? true);
}
assert(!(flags.has("plan") && flags.has("status")), "Choose --plan or --status");
assert(
  !flags.has("details") || flags.has("plan") || flags.has("status"),
  "--details requires read-only --plan or --status",
);
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function optionalRead(path) {
  try {
    return await read(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.pending`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temporary, path);
}

async function immutableJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(await read(path), value, "Immutable campaign receipt changed");
  }
}

async function sourceFiles(directory, filter) {
  const files = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path, filter)));
    else if (entry.isFile() && filter(path)) files.push(path);
  }
  return files.sort();
}

async function snapshot() {
  const active = await read("artifacts/forever-simulator/active.json");
  const upstream = ".cache/forever-sim-upstream/";
  const db = await read(upstream + "assets/database/db.json");
  assert.deepEqual(
    db,
    await read(`artifacts/forever-simulator/${active.release}/assets/database/db.json`),
    "Browser and native item databases differ; prepare a coherent release first",
  );
  const files = [
    ...(await sourceFiles("infra/simulator", (path) => /\.(mjs|json|go|ts|css)$/.test(path))),
    ...(await sourceFiles(
      "scripts",
      (path) => path.includes("simulator") && path.endsWith(".mjs") && !path.endsWith(".test.mjs"),
    )),
    ...(await sourceFiles(upstream + "sim", (path) => path.endsWith(".go"))),
    ...(await sourceFiles(upstream + "proto", (path) => path.endsWith(".proto"))),
    ...(await sourceFiles(upstream + "ui/core/talents/trees", (path) => path.endsWith(".json"))),
    upstream + "go.mod",
    upstream + "go.sum",
    upstream + "assets/db_inputs/forever_gear_catalog.json",
    upstream + "ui/core/kfc_prebis_import.json",
    upstream + "ui/core/kfc_inspection.json",
    "artifacts/forever-simulator/craft-acquisition.json",
    "artifacts/forever-simulator/optimization/requests.json",
  ];
  const components = {};
  // Bound concurrent file handles; the engine has thousands of source files.
  for (let start = 0; start < files.length; start += 32) {
    for (const [path, checksum] of await Promise.all(
      files
        .slice(start, start + 32)
        .map(async (path) => [path.split(sep).join("/"), sha(await readFile(resolve(root, path)))]),
    ))
      components[path] = checksum;
  }
  const otherData = Object.fromEntries(Object.entries(db).filter(([key]) => key !== "items"));
  components.databaseMetadata = simulationHash(otherData);
  components.browserManifest = simulationHash(active.files);
  return campaignSnapshot({ release: active.release, revision: active.revision, db, components });
}

async function freeSpace(config, required = true) {
  const info = await statfs(root);
  const gib = (info.bavail * info.bsize) / 1024 ** 3;
  if (required)
    assert(
      gib >= config.minimumFreeGiB,
      `Only ${gib.toFixed(2)} GiB free; campaign requires ${config.minimumFreeGiB} GiB. Free or archive reviewed data before resuming; nothing was deleted.`,
    );
  return Number(gib.toFixed(2));
}

async function main() {
  const config = validateCampaignConfig(
    await read(flags.get("config") ?? "infra/simulator/prebis-campaign.json"),
  );
  if (flags.has("spec"))
    assert(
      campaignPolicies.includes(flags.get("spec")),
      `No completed feedback policy for ${flags.get("spec")}; unsupported specs are never presented as optimized`,
    );
  const selected = config.cases.filter(
    (entry) =>
      (!flags.has("spec") || entry.spec === flags.get("spec")) &&
      (!flags.has("case") || entry.id === flags.get("case")),
  );
  assert(selected.length > 0, "No configured cases match the selection");
  const directory = join(root, "artifacts/forever-simulator/optimization/campaigns");
  let lease, server, child, heartbeat, state, statePath;
  let interrupted = false;
  let phase = "starting";
  const inheritedLease = process.env[workspaceLeaseVariable];
  const interrupt = () => {
    interrupted = true;
    if (child?.pid) {
      if (process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      } else child.kill("SIGTERM");
    }
  };
  const execute = async (script, args = []) => {
    assert(!interrupted, "Campaign interrupted");
    await freeSpace(config);
    phase = script;
    console.log(`[campaign] ${script} ${args.join(" ")}`);
    const stdout = await new Promise((resolveOutput, reject) => {
      let output = "";
      child = spawn(process.execPath, [join(root, "scripts", script), ...args], {
        cwd: root,
        env: {
          ...process.env,
          SIMULATOR_TEST_URL: server?.origin ?? process.env.SIMULATOR_TEST_URL,
        },
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (text) => {
        process.stdout.write(text);
        output = (output + text).slice(-512000);
      });
      child.stderr.on("data", (bytes) => process.stderr.write(bytes));
      child.once("error", reject);
      child.once("close", (code, signal) => {
        child = undefined;
        if (code === 0 && !interrupted) resolveOutput(output);
        else
          reject(
            new Error(
              `${script} exited ${code ?? signal}; completed evidence is retained for resume`,
            ),
          );
      });
    });
    assert(!interrupted, "Campaign interrupted");
    return stdout;
  };
  const reference = async (path) => {
    const checked = campaignArtifactPath(root, path);
    const canonical = await realpath(checked);
    assert(
      canonical.startsWith(
        (await realpath(join(root, "artifacts/forever-simulator/optimization"))) + sep,
      ),
      "Campaign evidence follows a link outside optimization artifacts",
    );
    return {
      path: relative(root, checked).split(sep).join("/"),
      sha256: simulationHash(await read(checked)),
    };
  };
  try {
    if (!flags.has("plan") && !flags.has("status")) {
      await freeSpace(config);
      assert(
        !(await optionalRead("artifacts/forever-simulator/.build.lock")),
        "A simulator release build is already reserved; do not overlap it",
      );
      lease = await acquireSimulatorWorkspace(root, join(directory, "latest.json"));
      process.env[workspaceLeaseVariable] = lease.environment[workspaceLeaseVariable];
      process.on("SIGINT", interrupt);
      process.on("SIGTERM", interrupt);
      heartbeat = setInterval(() => {
        const active = state ? Object.values(state.cases).find((entry) => entry.active) : null;
        console.log(
          `[campaign] PID ${process.pid}; ${active ? `${active.entry.id}: ${active.active.kind}` : phase}; child ${child?.pid ?? "none"}; checkpoints retained`,
        );
      }, 30000);
      await execute("prepare-forever-simulator.mjs");
      const active = await read("artifacts/forever-simulator/active.json");
      server = await startSimulatorLocalServer(join(root, "artifacts/forever-simulator"), active);
      const requests = await optionalRead("artifacts/forever-simulator/optimization/requests.json");
      if (requests?.sourceRelease !== active.release || requests?.revision !== active.revision)
        await execute("capture-simulator-prebis.mjs");
      // Compile before freezing the source snapshot: adapters can refresh owned generated files.
      await execute("preflight-simulator-native.mjs");
      assert(!interrupted, "Campaign interrupted");
    }
    const current = await snapshot();
    const identity = simulationHash({ snapshot: current.fingerprint, config });
    statePath = join(directory, identity, "state.json");
    const saved = await optionalRead(statePath);
    const latest = await optionalRead(join(directory, "latest.json"));
    let previous = null;
    if (latest) {
      assert(/^[a-f0-9]{64}$/.test(latest.identity));
      previous = await read(join(directory, latest.identity, "snapshot.json"));
      assert.equal(
        simulationHash(previous),
        latest.snapshotSha256,
        "Previous campaign snapshot changed",
      );
    }
    const requests = await read("artifacts/forever-simulator/optimization/requests.json");
    const capturedProfiles = requests.profiles.map((entry) => `${entry.profile}/${entry.variant}`);
    const coverage = {
      ready: campaignPolicies,
      pendingPolicies: [
        ...new Set([
          ...capturedProfiles.filter((spec) => !campaignPolicies.includes(spec)),
          "paladin/shockadin",
          "tank_warrior/protection",
          "protection_paladin/protection",
          "feral_tank_druid/bear",
        ]),
      ],
      notice:
        "Captured data is not a completed talent/rotation search. Tank/healer objectives need separate policies; no fabricated successes.",
    };
    const plan = {
      identity,
      sourceRelease: current.release,
      changes: campaignChanges(previous, current),
      freeGiB: await freeSpace(config, false),
      recaptureRequired: requests.sourceRelease !== current.release,
      cases: selected.map((entry) => ({
        ...entry,
        status: saved?.cases[entry.id]?.status ?? "pending",
        active: saved?.cases[entry.id]?.active ?? null,
      })),
      coverage,
      statePath,
      previousIdentity: latest?.identity ?? null,
      previousResultsAreStale: latest ? latest.identity !== identity : false,
      notice:
        "Serial all-slot/enchant/set searches, feedback, independent accessory/rotation checks, local review exports only. No automatic publication or global-BiS claim.",
    };
    if (flags.has("plan") || flags.has("status")) {
      const lock = await optionalRead(
        "artifacts/forever-simulator/optimization/feedback-sessions/active.lock",
      );
      let ownerAlive = false;
      if (lock) {
        assert(Number.isSafeInteger(lock.pid) && lock.pid > 0);
        try {
          process.kill(lock.pid, 0);
          ownerAlive = true;
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      }
      console.log(
        JSON.stringify(
          {
            ...plan,
            changes: flags.has("details") ? plan.changes : campaignChangeSummary(plan.changes),
            workspace: lock ? { pid: lock.pid, ownerAlive, statePath: lock.statePath } : null,
            ...(flags.has("status")
              ? {
                  previousCases: latest
                    ? Object.fromEntries(
                        Object.entries(
                          (await read(join(directory, latest.identity, "state.json"))).cases,
                        ).map(([id, entry]) => [
                          id,
                          { status: entry.status, active: entry.active, final: entry.final },
                        ]),
                      )
                    : null,
                }
              : {}),
          },
          null,
          2,
        ),
      );
      return;
    }
    await immutableJson(join(directory, identity, "snapshot.json"), current);
    await immutableJson(
      join(directory, identity, `changes-${simulationHash(plan.changes).slice(0, 16)}.json`),
      plan.changes,
    );
    state = saved ?? {
      schema: "kfc-prebis-campaign.v1",
      identity,
      snapshotFingerprint: current.fingerprint,
      config,
      cases: {},
      status: "running",
      coverage,
    };
    assert.equal(state.schema, "kfc-prebis-campaign.v1");
    assert.equal(state.identity, identity);
    assert.equal(state.snapshotFingerprint, current.fingerprint);
    assert.deepEqual(state.config, config);
    state.status = "running";
    delete state.lastError;
    await atomicJson(statePath, state);
    await atomicJson(join(directory, "latest.json"), {
      identity,
      snapshotSha256: simulationHash(current),
    });
    console.log(
      JSON.stringify(
        {
          ...plan,
          changes: campaignChangeSummary(plan.changes),
        },
        null,
        2,
      ),
    );
    const checkInputs = async () => {
      assert(!interrupted, "Campaign interrupted");
      await freeSpace(config);
      assert.equal(
        (await snapshot()).fingerprint,
        current.fingerprint,
        "Campaign inputs changed during the run; rerun the update command to start a new versioned campaign",
      );
    };
    for (const entry of selected) {
      state.activeCase = entry.id;
      const job = state.cases[entry.id] ?? {
        schema: "kfc-prebis-campaign-case.v1",
        entry,
        steps: [],
        status: "pending",
        active: null,
        final: null,
      };
      state.cases[entry.id] = job;
      await runCampaignCase(
        job,
        {
          read: async (path) => read(campaignArtifactPath(root, path)),
          checkInputs,
          execute: async (kind, inputs) => {
            const [script, ...args] = campaignCommand(kind, inputs, entry, config);
            const summary = campaignOutput(await execute(script, args));
            let path = summary.output;
            if (kind === "feedback") {
              assert.equal(summary.status, "closed-loop-reviewed");
              path = summary.final?.review?.path;
            }
            const files = { output: await reference(path) };
            if (kind === "rotation" && summary.validated)
              files.nextBaseline = await reference(summary.nextBaseline);
            if (["baseline", "proc-scenario", "accessory-feedback"].includes(kind)) {
              const value = await read(files.output.path);
              assert.equal(value.schema, "kfc-optimization-baseline.v1");
              assert.equal(`${value.profile}/${value.variant}`, entry.spec);
              assert.equal(value.settings.settings.faction.toLowerCase(), entry.faction);
              assert.equal(value.dbSha256, current.dbSha256);
              assert.equal(value.sourceRelease, current.release);
            }
            return files;
          },
        },
        async () => atomicJson(statePath, state),
        config,
      );
      if (job.status !== "reviewed-local") {
        state.status = "needs-review";
        await atomicJson(statePath, state);
        process.exitCode = 2;
        console.log(JSON.stringify({ statePath, case: entry.id, status: job.status }));
        return;
      }
      state.activeCase = null;
    }
    await checkInputs();
    state.status = config.cases.every((entry) => state.cases[entry.id]?.status === "reviewed-local")
      ? "configured-cases-reviewed"
      : "selected-cases-reviewed";
    await atomicJson(statePath, state);
    const result = {
      schema: "kfc-prebis-campaign-result.v1",
      identity,
      snapshotSha256: simulationHash(current),
      configSha256: simulationHash(config),
      status: state.status,
      cases: Object.fromEntries(
        Object.entries(state.cases)
          .filter(([, entry]) => entry.status === "reviewed-local")
          .map(([id, entry]) => [id, entry.final]),
      ),
      coverage,
      notice: plan.notice,
    };
    const output = join(directory, identity, `result-${simulationHash(result).slice(0, 16)}.json`);
    await immutableJson(output, result);
    console.log(
      JSON.stringify({
        output,
        statePath,
        status: state.status,
        notice:
          "Local evidence only; pending spec policies are not complete, and no public build was changed.",
      }),
    );
  } catch (error) {
    if (state) {
      state.status = interrupted ? "interrupted" : "failed";
      state.lastError = error.message;
      for (const job of Object.values(state.cases).filter((entry) => entry.active)) {
        job.status = state.status;
        job.lastError = error.message;
      }
      if (state.activeCase && state.cases[state.activeCase]) {
        state.cases[state.activeCase].status = state.status;
        state.cases[state.activeCase].lastError = error.message;
        state.cases[state.activeCase].final = null;
      }
      await atomicJson(statePath, state);
    }
    throw error;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    try {
      await server?.close();
    } finally {
      try {
        await lease?.release();
      } finally {
        if (inheritedLease === undefined) delete process.env[workspaceLeaseVariable];
        else process.env[workspaceLeaseVariable] = inheritedLease;
      }
    }
  }
}

if (flags.has("help")) {
  console.log(
    "pnpm simulator:prebis:update [--spec=warrior/arms] [--case=arms-alliance]\nUse --plan for a read-only change/coverage report (--details for the full diff); --status for saved progress.\nDefault: prepare/verify the current reviewed catalog, then resume selected configured cases, all slots/enchants, feedback, accessory/rotation audits and local exports. No public deployment.",
  );
} else {
  await main();
}
