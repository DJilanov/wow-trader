import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SIMULATOR_REVISION,
  SIMULATOR_SPECS,
  type SimulatorManifest,
} from "@wow-trader/forever-data/simulator";
import {
  readSimulatorModelUpdate,
  simulatorModelUpdateBrowserChecks,
  validateSimulatorModelUpdateBuilds,
} from "./forever-simulator-model-updates";
import firstPassFixture from "./fixtures/model-first-pass-marksmanship.json";

const paths: string[] = [];
afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
const sha = (value: string): string => createHash("sha256").update(value).digest("hex");
const hash = (value: unknown): string => sha(JSON.stringify(value));
const previous = "a".repeat(24),
  source = "b".repeat(24),
  release = "c".repeat(24),
  safety = "d".repeat(24);
const ids = [
  "arms-alliance",
  "arms-alliance-procs",
  "fury-horde",
  "fury-horde-procs",
  "two-hand-fury-static",
  "rogue-combat-static",
  "rogue-mutilate-static",
  "rogue-subtlety-static",
  "hunter-beast-mastery-static",
];
async function json(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

interface Fixture {
  directory: string;
  proof: Record<string, unknown>;
  pointer: Record<string, unknown>;
  browser: Record<string, unknown>;
  candidate: SimulatorManifest;
  corrections: Record<string, unknown>[];
  rewrite: () => Promise<void>;
}
async function fixture(
  modelSource: string = source,
  databaseSha256: string = "f".repeat(64),
): Promise<Fixture> {
  const source = modelSource;
  const directory = await mkdtemp(join(tmpdir(), "kfc-model-update-unit-"));
  paths.push(directory);
  const metadata = { bytes: 8, sha256: sha("fixture!") };
  const files = Object.fromEntries(
    [
      "lib.wasm",
      "sim_worker.js",
      "assets/database/db.json",
      "assets/database/db.bin",
      "assets/database/leftover_db.json",
      "assets/database/leftover_db.bin",
    ].map((name) => [name, { ...metadata }]),
  );
  const active: SimulatorManifest = {
    schema: "kfc-forever-simulator.v1",
    release: previous,
    upstream: "https://github.com/gunba/wow-forever-sim",
    revision: SIMULATOR_REVISION,
    preparedAt: "2026-10-19T00:00:00Z",
    itemCount: 1,
    excludedModeledItems: 0,
    pages: SIMULATOR_SPECS.map((spec) => spec.page),
    files,
    dataProvenance: "pinned-upstream-forever-data",
    mechanicsStatus: "beta_model",
  };
  const policy = {
    schema: "kfc-item-weapon-skills.v1",
    mode: "ignore-item-bonuses",
    basis: "owner-directed-model-assumption",
    notice: "Synthetic unit-test policy; not server verification.",
    changes: [],
  };
  const model: SimulatorManifest = {
    ...active,
    release: source,
    itemWeaponSkillPolicy: {
      ...policy,
      schema: "kfc-item-weapon-skills.v1",
      mode: "ignore-item-bonuses",
      basis: "owner-directed-model-assumption",
    },
    files: {
      ...files,
      "kfc-item-weapon-skills.json": { bytes: JSON.stringify(policy).length, sha256: hash(policy) },
    },
  };
  const candidate: SimulatorManifest = { ...model, release, files: { ...model.files } };
  const originalSafety = {
    schema: "kfc-simulator-preset-safety.v1",
    release: safety,
    sourceRelease: previous,
    typecheckDiagnostics: 0,
    repairs: Array.from({ length: 28 }, () => ({ syntheticUnitOnly: true })),
  };
  await json(join(directory, "active.json"), active);
  await json(join(directory, source, "manifest.json"), model);
  await json(join(directory, source, "kfc-item-weapon-skills.json"), policy);
  await json(join(directory, safety, "kfc-preset-safety.json"), originalSafety);
  const corrections = ids.map((id) => {
    const settings = {
      player: {
        equipment: { items: Array.from({ length: 17 }, () => ({ id: 1 })) },
        talentsString: "1",
        rotation: { priorityList: [] },
      },
    };
    const requestBase64 = "SYNTHETIC-UNIT-FIXTURE-NOT-A-REAL-COMBAT-REQUEST";
    return {
      schema: "kfc-item-skill-correction-result.v1",
      id,
      profile: id.startsWith("rogue-") ? "rogue" : id.startsWith("hunter-") ? "hunter" : "warrior",
      release: source,
      nativeBinarySha256: "e".repeat(64),
      databaseSha256,
      settings,
      requestBase64,
      referenceDps: 100,
      validationIterations: 40000,
      verdict: { selected: "incumbent" },
      affected: false,
      browserControl: {
        seed: 819000001,
        iterations: 25,
        dps: 100,
        nativeDps: 100,
        historicalDps: 100,
      },
      confirmation: [819410001, 819450001].map((seed) => {
        const metric = {
          id: hash({
            requestBase64,
            gear: settings.player.equipment.items,
            talentsString: "1",
            rotation: settings.player.rotation,
            iterations: 20000,
            seed,
          }),
          dps: 100,
          stdev: 1,
          iterations: 20000,
        };
        return { seed, incumbent: metric, candidate: metric };
      }),
    };
  });
  const proof: Record<string, unknown> = {
    schema: "kfc-simulator-item-skill-update.v1",
    sourceRelease: source,
    release,
    previousRelease: previous,
    previousManifestSha256: hash(active),
    sourceManifestSha256: hash(model),
    nativeBinarySha256: "e".repeat(64),
    databaseSha256,
    policySha256: hash(policy),
    parentSafety: { release: safety, reportSha256: hash(originalSafety) },
    typecheckDiagnostics: 0,
    modelAssets: files,
    virtualSourceFiles: [{ path: "ui/warrior/presets.ts", sha256: "e".repeat(64) }],
    presets: Array.from({ length: 28 }, (_, i) => ({
      profile: "synthetic_unit_only",
      variant: String(i),
      gearSha256: "e".repeat(64),
    })),
    builds: [],
    notice:
      "Synthetic unit-test contract fixture only; not real simulation or publication evidence.",
  };
  const browser: Record<string, unknown> = {
    schema: "kfc-item-skill-update-browser.v1",
    status: "passed",
    capturedAt: "2026-10-19T00:00:00Z",
    sourceRelease: source,
    release,
    proofSha256: "",
    checked: { ...simulatorModelUpdateBrowserChecks },
    evidence: { syntheticUnitOnly: true },
    errors: [],
  };
  const pointer: Record<string, unknown> = {
    schema: "kfc-simulator-model-update-selection.v1",
    sourceRelease: source,
    release,
    proofSha256: "",
    browserReview: {},
  };
  const rewrite = async (): Promise<void> => {
    const builds = [];
    for (const result of corrections) {
      const path = `optimization/item-skill-revalidation-v1/${result.id}.json`;
      await json(join(directory, path), result);
      builds.push({
        id: result.id,
        profile: result.profile,
        correction: { path, sha256: hash(result) },
        settingsSha256: hash(result.settings),
        hrefSha256: sha(`synthetic-unit-href:${result.id}`),
        referenceDps: result.referenceDps,
        validationIterations: 40000,
      });
    }
    proof.builds = builds;
    const text = JSON.stringify(proof);
    const digest = sha(text);
    candidate.files["kfc-reviewed-presets.json"] = { bytes: text.length, sha256: digest };
    pointer.proofSha256 = digest;
    browser.proofSha256 = digest;
    const browserDigest = hash(browser);
    pointer.browserReview = {
      path: `optimization/reviews/item-skills-browser-${browserDigest.slice(0, 16)}.json`,
      sha256: browserDigest,
    };
    await json(join(directory, String((pointer.browserReview as { path: string }).path)), browser);
    await json(join(directory, release, "kfc-reviewed-presets.json"), proof);
    await json(join(directory, release, "manifest.json"), candidate);
    await json(join(directory, "model-update.json"), pointer);
  };
  await rewrite();
  return { directory, proof, pointer, browser, candidate, corrections, rewrite };
}

describe("numerical item-skill corrections have an independent fail-closed publication gate", () => {
  it("binds public DPS, precision and share URLs to the corrected measurements", async () => {
    const state = await fixture();
    const builds = state.corrections
      .filter((row) => row.profile === "warrior")
      .map((row) => ({
        id: String(row.id),
        href: `synthetic-unit-href:${row.id}`,
        referenceDps: 100,
        validationIterations: 40000,
      }));
    await expect(
      validateSimulatorModelUpdateBuilds("warrior", state.candidate, builds, state.directory),
    ).resolves.toBeUndefined();
    for (const change of [
      { referenceDps: 200 },
      { validationIterations: 1000 },
      { href: "different-unit-only-share" },
    ])
      await expect(
        validateSimulatorModelUpdateBuilds(
          "warrior",
          state.candidate,
          builds.map((row, index) => (index === 0 ? { ...row, ...change } : row)),
          state.directory,
        ),
      ).rejects.toThrow(/corrected evidence/);
  });
  it("is absent for historical deployments and admits a fully linked corrected model", async () => {
    const state = await fixture();
    const selected = await readSimulatorModelUpdate("warrior", state.directory);
    expect(selected?.manifest.release).toBe(release);
    expect(selected?.sourceRelease).toBe(source);
    await rm(join(state.directory, "model-update.json"));
    expect(await readSimulatorModelUpdate("warrior", state.directory)).toBeNull();
  });
  it("admits the reviewed stat-label source only, without opening arbitrary shared core files or duplicate paths", async () => {
    const state = await fixture();
    state.proof.virtualSourceFiles = [
      { path: "ui/warrior/presets.ts", sha256: "e".repeat(64) },
      { path: "ui/core/proto_utils/names.ts", sha256: "e".repeat(64) },
    ];
    await state.rewrite();
    expect((await readSimulatorModelUpdate("warrior", state.directory))?.manifest.release).toBe(
      release,
    );
    for (const path of [
      "ui/core/proto_utils/stats.ts",
      "ui/core/proto/common.ts",
      "ui/core/proto_utils/../names.ts",
      "ui/core/proto_utils/names.js",
    ]) {
      state.proof.virtualSourceFiles = [{ path, sha256: "e".repeat(64) }];
      await state.rewrite();
      await expect(readSimulatorModelUpdate("warrior", state.directory)).rejects.toThrow(
        /virtual source scope/,
      );
    }
    state.proof.virtualSourceFiles = [
      { path: "ui/core/proto_utils/names.ts", sha256: "e".repeat(64) },
      { path: "ui/core/proto_utils/names.ts", sha256: "e".repeat(64) },
    ];
    await state.rewrite();
    await expect(readSimulatorModelUpdate("warrior", state.directory)).rejects.toThrow(
      /virtual source scope/,
    );
  });
  it.each([
    "allPresets",
    "savedCharacterPreserved",
    "provisionalConsentOff",
    "nativeBrowserParity",
    "itemSkillsIgnored",
    "desktopMobile",
  ])("rejects missing actual browser approval for %s", async (field) => {
    const state = await fixture();
    state.browser.checked = { ...simulatorModelUpdateBrowserChecks, [field]: false };
    await state.rewrite();
    await expect(readSimulatorModelUpdate("rogue", state.directory)).rejects.toThrow();
  });
  it("rejects old-model DPS even when result and proof references have been rehashed", async () => {
    const state = await fixture();
    state.corrections[0]!.release = previous;
    await state.rewrite();
    await expect(readSimulatorModelUpdate("warrior", state.directory)).rejects.toThrow(/stale/);
  });
  it("rejects changed gear, fabricated DPS and reduced confirmation precision", async () => {
    for (const change of ["gear", "dps", "precision"]) {
      const state = await fixture();
      const row = state.corrections[0]!;
      if (change === "gear")
        row.settings = {
          player: {
            equipment: { items: Array.from({ length: 17 }, () => ({ id: 2 })) },
            talentsString: "1",
            rotation: { priorityList: [] },
          },
        };
      if (change === "dps") row.referenceDps = 200;
      if (change === "precision") row.validationIterations = 1000;
      await state.rewrite();
      await expect(readSimulatorModelUpdate("warrior", state.directory)).rejects.toThrow();
    }
  });
  it("rejects a selected metric borrowed from a different seed/request", async () => {
    const state = await fixture();
    state.corrections[0]!.requestBase64 = "DIFFERENT-SYNTHETIC-UNIT-REQUEST";
    await state.rewrite();
    await expect(readSimulatorModelUpdate("hunter", state.directory)).rejects.toThrow(
      /selected settings/,
    );
  });
  it("rejects UI model mismatches and stale numeric parents", async () => {
    const state = await fixture();
    state.candidate.files["lib.wasm"] = { bytes: 1, sha256: "a".repeat(64) };
    await state.rewrite();
    await expect(readSimulatorModelUpdate("warrior", state.directory)).rejects.toThrow(
      /assets disagree/,
    );
    const other = await fixture();
    const active = JSON.parse(
      await readFile(join(other.directory, "active.json"), "utf8"),
    ) as Record<string, unknown>;
    active.preparedAt = "2026-10-20T00:00:00Z";
    await json(join(other.directory, "active.json"), active);
    await expect(readSimulatorModelUpdate("warrior", other.directory)).rejects.toThrow(
      /stale numerical parent/,
    );
  });
  it("does not accept symlinked private evidence outside simulator storage", async () => {
    const state = await fixture();
    const external = await mkdtemp(join(tmpdir(), "kfc-outside-model-unit-"));
    paths.push(external);
    const evidence = join(
      state.directory,
      "optimization/item-skill-revalidation-v1/arms-alliance.json",
    );
    await writeFile(join(external, "evidence.json"), await readFile(evidence));
    await rm(evidence);
    await symlink(join(external, "evidence.json"), evidence);
    await expect(readSimulatorModelUpdate("warrior", state.directory)).rejects.toThrow(/escaped/);
  });
});

function fixtureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected unit metadata object");
  return value as Record<string, unknown>;
}
async function firstPassState(): Promise<Fixture> {
  // Existing synthetic nine-build metadata shell, with the genuine MM numerical/parity corpus.
  // This tests release authentication only; the shell is never published as combat evidence.
  const state = await fixture(firstPassFixture.sourceRelease, firstPassFixture.databaseSha256);
  for (const [path, value] of Object.entries(firstPassFixture.documents)) {
    const target = join(state.directory, path.replace(/^artifacts\/forever-simulator\//, ""));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(value, null, 2) + "\n");
  }
  state.proof.schema = "kfc-simulator-model-update-with-builds.v1";
  state.proof.firstPassBuilds = [structuredClone(firstPassFixture.entry)];
  const presets = state.proof.presets;
  if (!Array.isArray(presets)) throw new Error("Missing unit preset audit");
  const raw = fixtureObject(
    firstPassFixture.documents[
      firstPassFixture.entry.build.path as keyof typeof firstPassFixture.documents
    ],
  );
  const player = fixtureObject(fixtureObject(raw.settings).player);
  presets[0] = { profile: "hunter", variant: "marksmanship", gearSha256: hash(player.equipment) };
  const allIds = [...ids, firstPassFixture.entry.id];
  state.browser.evidence = {
    syntheticUnitOnly: true,
    parityChecks: allIds.map((id) => ({ id, iterations: 25, nativeDps: 100, browserDps: 100 })),
    shares: allIds.flatMap((id) =>
      [1440, 390].map((width) => ({
        id,
        viewport: { width },
        fullMeasuredSettingsPreserved: true,
      })),
    ),
  };
  await state.rewrite();
  return state;
}

describe("additional first-pass builds retain the corrected-model release gate", () => {
  it("admits a linked MM result only with both browser widths, full delivery parity and matching preset gear", async () => {
    const state = await firstPassState();
    expect((await readSimulatorModelUpdate("hunter", state.directory))?.manifest.release).toBe(
      release,
    );
  });

  it("rejects reused approval missing the new case's combat or mobile import", async () => {
    for (const mode of ["parity", "mobile"]) {
      const state = await firstPassState();
      const evidence = fixtureObject(state.browser.evidence);
      if (mode === "parity")
        evidence.parityChecks = fixtureObjectArray(evidence.parityChecks).filter(
          (row) => row.id !== firstPassFixture.entry.id,
        );
      else
        evidence.shares = fixtureObjectArray(evidence.shares).filter(
          (row) =>
            row.id !== firstPassFixture.entry.id || fixtureObject(row.viewport).width !== 390,
        );
      await state.rewrite();
      await expect(readSimulatorModelUpdate("hunter", state.directory)).rejects.toThrow(
        /approval omitted|approval omitted or failed/,
      );
    }
  });

  it("rejects an otherwise valid build with stale preset summaries or repeated identities", async () => {
    for (const mode of ["gear", "duplicate"]) {
      const state = await firstPassState();
      if (mode === "gear") fixtureObjectArray(state.proof.presets)[0]!.gearSha256 = "0".repeat(64);
      else
        state.proof.firstPassBuilds = [
          structuredClone(firstPassFixture.entry),
          structuredClone(firstPassFixture.entry),
        ];
      await state.rewrite();
      await expect(readSimulatorModelUpdate("hunter", state.directory)).rejects.toThrow(
        /preset audit|Duplicate model/,
      );
    }
  });

  it("requires both Hunter publications and binds the new DPS, precision and URL too", async () => {
    const state = await firstPassState();
    const additional = fixtureObjectArray(state.proof.firstPassBuilds)[0]!;
    additional.hrefSha256 = sha("synthetic-unit-mm-link");
    await state.rewrite();
    const builds = [
      {
        id: "hunter-beast-mastery-static",
        href: "synthetic-unit-href:hunter-beast-mastery-static",
        referenceDps: 100,
        validationIterations: 40000,
      },
      {
        id: firstPassFixture.entry.id,
        href: "synthetic-unit-mm-link",
        referenceDps: firstPassFixture.entry.referenceDps,
        validationIterations: 40000,
      },
    ];
    await expect(
      validateSimulatorModelUpdateBuilds("hunter", state.candidate, builds, state.directory),
    ).resolves.toBeUndefined();
    await expect(
      validateSimulatorModelUpdateBuilds(
        "hunter",
        state.candidate,
        builds.slice(0, 1),
        state.directory,
      ),
    ).rejects.toThrow(/omitted/);
    await expect(
      validateSimulatorModelUpdateBuilds(
        "hunter",
        state.candidate,
        builds.map((build, index) => (index === 1 ? { ...build, referenceDps: 1 } : build)),
        state.directory,
      ),
    ).rejects.toThrow(/corrected evidence/);
  });
});

function fixtureObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("Expected unit metadata array");
  return value.map(fixtureObject);
}
