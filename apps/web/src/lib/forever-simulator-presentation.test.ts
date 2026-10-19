import { createHash } from "node:crypto";
import console from "node:console";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SIMULATOR_REVISION,
  SIMULATOR_SPECS,
  type SimulatorManifest,
} from "@wow-trader/forever-data/simulator";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";
import { buildsForPresentation, readSimulatorPresentation } from "./forever-simulator-presentation";

const fixtures: string[] = [];
const sourceRelease = "a".repeat(24),
  release = "b".repeat(24);
const sha = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const hash = (value: unknown): string => sha(JSON.stringify(value));
const checks = {
  configurations: true,
  gearSets: true,
  gearAndEnchants: true,
  talentsAndRotation: true,
  specOptionsRaceConsumes: true,
  firstVisitDefault: true,
  savedCharacterPreserved: true,
  provisionalConsentOff: true,
  requestParity: true,
  desktopMobile: true,
};
interface Pointer {
  schema: string;
  sourceRelease: string;
  profiles: Record<
    string,
    { release: string; proofSha256: string; browserReview: { path: string; sha256: string } }
  >;
}
interface Fixture {
  directory: string;
  source: SimulatorManifest;
  candidate: SimulatorManifest;
  proof: Record<string, unknown>;
  browser: Record<string, unknown>;
  pointer: Pointer;
  browserPath: () => string;
  rewrite: () => Promise<void>;
}
async function json(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}
async function fixture(profile: string = "warrior"): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "sim-presentation-test-"));
  fixtures.push(directory);
  const model = { bytes: 8, sha256: sha("fixture!") };
  const source: SimulatorManifest = {
    schema: "kfc-forever-simulator.v1",
    release: sourceRelease,
    upstream: "https://github.com/gunba/wow-forever-sim",
    revision: SIMULATOR_REVISION,
    preparedAt: "2026-10-17T00:00:00Z",
    itemCount: 1,
    excludedModeledItems: 0,
    pages: SIMULATOR_SPECS.map((spec) => spec.page),
    files: {
      "lib.wasm": { ...model },
      "sim_worker.js": { ...model },
      "assets/database/db.json": { ...model },
    },
    dataProvenance: "pinned-upstream-forever-data",
    mechanicsStatus: "beta_model",
  };
  await json(join(directory, "active.json"), source);
  const evidence = { path: "synthetic-unit-test-only.json", sha256: "c".repeat(64) };
  const sourcePins = [{ path: "synthetic-unit-test-source.ts", sha256: "d".repeat(64) }];
  const proof: Record<string, unknown> = {
    schema: "kfc-simulator-presentation-proof.v1",
    release,
    sourceRelease,
    sourceManifestSha256: hash(source),
    stagingSha256: "e".repeat(64),
    presentationInputSha256: "f".repeat(64),
    profiles: ["warrior"],
    reviewedCases: ["arms-alliance"],
    reviewedExports: [
      {
        variant: "arms",
        sha256: "c".repeat(64),
        evidence: {
          baseline: evidence,
          review: evidence,
          accessories: [evidence, evidence],
          rotation: evidence,
          exported: evidence,
        },
      },
    ],
    modelAssets: source.files,
    sourcePins,
    sourcePinsSha256: hash(sourcePins),
    virtualSourceFiles: [{ path: "ui/warrior/presets.ts", sha256: "c".repeat(64) }],
    typecheckDiagnostics: 0,
    oldEngineUnchanged: true,
    savedStorageUntouched: true,
    notice: "Synthetic unit-test approval, not real model evidence or a player recommendation.",
  };
  const candidate: SimulatorManifest = { ...source, release, files: { ...source.files } };
  const browser: Record<string, unknown> = {
    schema: "kfc-reviewed-presets-browser.v1",
    status: "passed",
    capturedAt: "2026-10-17T00:00:00Z",
    release,
    sourceRelease,
    presentationProofSha256: "0".repeat(64),
    checked: { ...checks },
    evidence: { syntheticUnitTestOnly: true },
    errors: [],
  };
  const pointer: Pointer = {
    schema: "kfc-simulator-presentation.v1",
    sourceRelease,
    profiles: {
      warrior: {
        release,
        proofSha256: "0".repeat(64),
        browserReview: { path: "", sha256: "0".repeat(64) },
      },
    },
  };
  const rewrite = async (): Promise<void> => {
    const proofBytes = JSON.stringify(proof);
    await json(join(directory, release, "kfc-reviewed-presets.json"), proof);
    candidate.files["kfc-reviewed-presets.json"] = {
      bytes: Buffer.byteLength(proofBytes),
      sha256: sha(proofBytes),
    };
    await json(join(directory, release, "manifest.json"), candidate);
    browser.presentationProofSha256 = sha(proofBytes);
    const browserHash = hash(browser);
    pointer.profiles[profile] = {
      release,
      proofSha256: sha(proofBytes),
      browserReview: {
        path: `optimization/reviews/preset-browser-${browserHash.slice(0, 16)}.json`,
        sha256: browserHash,
      },
    };
    if (profile !== "warrior") delete pointer.profiles.warrior;
    await json(join(directory, pointer.profiles[profile]!.browserReview.path), browser);
    await json(join(directory, "presentation.json"), pointer);
  };
  await rewrite();
  return {
    directory,
    source,
    candidate,
    proof,
    browser,
    pointer,
    browserPath: () => join(directory, pointer.profiles[profile]!.browserReview.path),
    rewrite,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    fixtures.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Preset-only simulator presentation releases", () => {
  it("selects a browser-approved UI with the unchanged numerical model without changing active.json", async () => {
    const f = await fixture();
    const before = await readFile(join(f.directory, "active.json"));
    const result = await readSimulatorPresentation("warrior", f.directory);
    expect(result?.kind).toBe("reviewed-presets");
    expect(result?.manifest.release).toBe(release);
    expect(result?.sourceRelease).toBe(sourceRelease);
    expect(await readFile(join(f.directory, "active.json"))).toEqual(before);
  });
  it("keeps other profiles on the numerical release and tolerates an absent optional pointer", async () => {
    const f = await fixture();
    expect((await readSimulatorPresentation("mage", f.directory))?.manifest.release).toBe(
      sourceRelease,
    );
    await rm(join(f.directory, "presentation.json"));
    expect((await readSimulatorPresentation("warrior", f.directory))?.kind).toBe("base");
    expect(await readSimulatorPresentation("warrior", join(f.directory, "missing"))).toBeNull();
  });
  it("retires a UI-only promotion when the active numerical release changes", async () => {
    const f = await fixture();
    await json(join(f.directory, "active.json"), { ...f.source, release: "c".repeat(24) });
    expect((await readSimulatorPresentation("warrior", f.directory))?.manifest.release).toBe(
      "c".repeat(24),
    );
  });
  it.each(["lib.wasm", "sim_worker.js", "assets/database/db.json"])(
    "rejects changes to the %s numerical asset",
    async (name: string) => {
      const f = await fixture();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      f.candidate.files[name] = { bytes: 8, sha256: "0".repeat(64) };
      await f.rewrite();
      expect((await readSimulatorPresentation("warrior", f.directory))?.kind).toBe("base");
    },
  );
  it("rejects a self-consistently rehashed but incomplete model proof", async () => {
    const f = await fixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    f.proof.modelAssets = { "lib.wasm": f.source.files["lib.wasm"] };
    await f.rewrite();
    expect((await readSimulatorPresentation("warrior", f.directory))?.kind).toBe("base");
  });
  it("rejects extra numerical assets, altered catalog scope or non-preset source overrides", async () => {
    const f = await fixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    f.candidate.files["other.wasm"] = { ...f.source.files["lib.wasm"]! };
    await f.rewrite();
    expect((await readSimulatorPresentation("warrior", f.directory))?.kind).toBe("base");
    delete f.candidate.files["other.wasm"];
    f.candidate.itemCount = 2;
    await f.rewrite();
    expect((await readSimulatorPresentation("warrior", f.directory))?.kind).toBe("base");
    f.candidate.itemCount = 1;
    f.proof.virtualSourceFiles = [{ path: "ui/core/player.ts", sha256: "c".repeat(64) }];
    await f.rewrite();
    expect((await readSimulatorPresentation("warrior", f.directory))?.kind).toBe("base");
  });
  it("requires the browser approval's hash, release, successful checks and no errors", async () => {
    const f = await fixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await json(f.browserPath(), { ...f.browser, evidence: { tampered: true } });
    expect((await readSimulatorPresentation("warrior", f.directory))?.kind).toBe("base");
    f.browser.checked = { ...checks, savedCharacterPreserved: false };
    await f.rewrite();
    expect((await readSimulatorPresentation("warrior", f.directory))?.kind).toBe("base");
    f.browser.checked = { ...checks };
    f.browser.release = sourceRelease;
    await f.rewrite();
    expect((await readSimulatorPresentation("warrior", f.directory))?.kind).toBe("base");
    f.browser.release = release;
    f.browser.errors = ["test-only browser failure"];
    await f.rewrite();
    expect((await readSimulatorPresentation("warrior", f.directory))?.kind).toBe("base");
  });
  it("refuses missing approval, escaped symlinks and oversized pointers while retaining the working engine", async () => {
    const f = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "sim-presentation-outside-"));
    fixtures.push(outside);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await rm(f.browserPath());
    expect((await readSimulatorPresentation("warrior", f.directory))?.kind).toBe("base");
    await json(join(outside, "approval.json"), f.browser);
    await symlink(join(outside, "approval.json"), f.browserPath());
    expect((await readSimulatorPresentation("warrior", f.directory))?.kind).toBe("base");
    await writeFile(join(f.directory, "presentation.json"), " ".repeat(32_001));
    expect((await readSimulatorPresentation("warrior", f.directory))?.kind).toBe("base");
  });
});

describe("Hunter practical preset presentation approvals", () => {
  async function hunterFixture(): Promise<Fixture> {
    const value = await fixture("hunter");
    delete value.proof.stagingSha256;
    delete value.proof.reviewedExports;
    value.proof.schema = "kfc-simulator-presentation-proof.v6";
    value.proof.profiles = ["hunter"];
    value.proof.reviewedCases = ["hunter-beast-mastery-static"];
    value.proof.classBuilds = [
      {
        profile: "hunter",
        caseId: "hunter-beast-mastery-static",
        build: { path: "synthetic-hunter-build.json", sha256: "e".repeat(64) },
        share: { path: "synthetic-hunter-share.json", sha256: "f".repeat(64) },
      },
    ];
    value.proof.defaultOverrides = {
      profile: "hunter",
      changes: ["race", "partyBuffs"],
      settingsSha256: "d".repeat(64),
    };
    value.proof.virtualSourceFiles = [
      "ui/hunter/presets.ts",
      "ui/hunter/sim.ts",
      "ui/hunter/gear_sets/forever_beast_mastery.gear.json",
      "ui/hunter/apls/beast_mastery.apl.json",
    ].map((path) => ({ path, sha256: "c".repeat(64) }));
    value.browser.schema = "kfc-reviewed-presets-browser.v6";
    value.browser.checked = {
      ...checks,
      defaultRaceAndProfessions: true,
      petAndAmmoOptions: true,
      unreviewedStarterOptionsPreserved: true,
      allDeclaredBuilds: true,
    };
    value.browser.evidence = {
      syntheticUnitTestOnly: true,
      rawRequestVerified: true,
      verifiedCaseIds: ["hunter-beast-mastery-static"],
    };
    value.browser.classBuilds = [
      {
        profile: "hunter",
        caseId: "hunter-beast-mastery-static",
        buildSha256: "e".repeat(64),
        shareSha256: "f".repeat(64),
      },
    ];
    await value.rewrite();
    return value;
  }

  it("admits actual class-specific Hunter approval without changing the old Rogue contracts", async () => {
    const value = await hunterFixture();
    expect((await readSimulatorPresentation("hunter", value.directory))?.kind).toBe(
      "reviewed-presets",
    );
    expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe("base");
  });
  it.each(["petAndAmmoOptions", "unreviewedStarterOptionsPreserved", "requestParity"])(
    "requires the actual Hunter browser check %s",
    async (check: string) => {
      const value = await hunterFixture();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const checked = value.browser.checked;
      if (typeof checked !== "object" || checked === null) throw new Error("Missing test checks");
      value.browser.checked = { ...checked, [check]: false };
      await value.rewrite();
      expect((await readSimulatorPresentation("hunter", value.directory))?.kind).toBe("base");
    },
  );
  it("rejects missing or resealed foreign raw-request coverage and changed build links", async () => {
    const value = await hunterFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const original = structuredClone(value.browser);
    for (const patch of [
      { evidence: { rawRequestVerified: false, verifiedCaseIds: ["hunter-beast-mastery-static"] } },
      { evidence: { rawRequestVerified: true, verifiedCaseIds: ["rogue-combat-static"] } },
      {
        classBuilds: [
          {
            profile: "hunter",
            caseId: "hunter-beast-mastery-static",
            buildSha256: "0".repeat(64),
            shareSha256: "f".repeat(64),
          },
        ],
      },
      { schema: "kfc-reviewed-presets-browser.v3" },
    ]) {
      Object.assign(value.browser, original, patch);
      await value.rewrite();
      expect((await readSimulatorPresentation("hunter", value.directory))?.kind).toBe("base");
    }
  });
  it("rejects extra, omitted, duplicate or cross-class virtual files and undeclared defaults", async () => {
    const value = await hunterFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const original = structuredClone(value.proof);
    const files = value.proof.virtualSourceFiles;
    if (!Array.isArray(files)) throw new Error("Missing test files");
    for (const patch of [
      { virtualSourceFiles: files.slice(0, 3) },
      {
        virtualSourceFiles: [
          ...files,
          { path: "ui/hunter/apls/other.apl.json", sha256: "c".repeat(64) },
        ],
      },
      { virtualSourceFiles: [...files.slice(0, 3), files[0]] },
      {
        virtualSourceFiles: [
          ...files.slice(0, 3),
          { path: "ui/rogue/presets.ts", sha256: "c".repeat(64) },
        ],
      },
      {
        defaultOverrides: {
          profile: "hunter",
          changes: ["race", "rotation"],
          settingsSha256: "d".repeat(64),
        },
      },
      { reviewedCases: ["hunter-marksmanship-static"] },
    ]) {
      Object.assign(value.proof, original, patch);
      await value.rewrite();
      expect((await readSimulatorPresentation("hunter", value.directory))?.kind).toBe("base");
    }
  });
});

describe("First-pass preset presentation approvals", () => {
  async function firstPassFixture(): Promise<Fixture> {
    const value = await fixture();
    const entry = {
      caseId: "two-hand-fury-static",
      build: { path: "synthetic-build.json", sha256: "e".repeat(64) },
      share: { path: "synthetic-share.json", sha256: "f".repeat(64) },
    };
    value.proof.schema = "kfc-simulator-presentation-proof.v2";
    value.proof.firstPassBuilds = [entry];
    value.proof.reviewedCases = ["arms-alliance", entry.caseId];
    value.proof.virtualSourceFiles = [
      { path: "ui/warrior/presets.ts", sha256: "c".repeat(64) },
      { path: "ui/warrior/gear_sets/forever_fury_2h.gear.json", sha256: "c".repeat(64) },
      { path: "ui/warrior/apls/forever_fury_2h.apl.json", sha256: "d".repeat(64) },
    ];
    value.browser.schema = "kfc-reviewed-presets-browser.v2";
    value.browser.evidence = { syntheticUnitTestOnly: true, rawRequestVerified: true };
    value.browser.firstPassBuilds = [
      { caseId: entry.caseId, buildSha256: entry.build.sha256, shareSha256: entry.share.sha256 },
    ];
    await value.rewrite();
    return value;
  }
  it("supports separately approved new styles without reinterpreting legacy exports", async () => {
    const value = await firstPassFixture();
    expect((await readSimulatorPresentation("warrior", value.directory))?.kind).toBe(
      "reviewed-presets",
    );
  });
  it("does not let an old browser approval approve a new first-pass style", async () => {
    const value = await firstPassFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    value.browser.schema = "kfc-reviewed-presets-browser.v1";
    delete value.browser.firstPassBuilds;
    await value.rewrite();
    expect((await readSimulatorPresentation("warrior", value.directory))?.kind).toBe("base");
  });
  it("requires raw worker checks before any adapter can replace UI inputs", async () => {
    const value = await firstPassFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    value.browser.evidence = { syntheticUnitTestOnly: true };
    await value.rewrite();
    expect((await readSimulatorPresentation("warrior", value.directory))?.kind).toBe("base");
  });
  it("rejects resealed approvals for different exports or hidden case coverage", async () => {
    const value = await firstPassFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    value.browser.firstPassBuilds = [
      { caseId: "two-hand-fury-static", buildSha256: "0".repeat(64), shareSha256: "f".repeat(64) },
    ];
    await value.rewrite();
    expect((await readSimulatorPresentation("warrior", value.directory))?.kind).toBe("base");
    value.proof.reviewedCases = ["arms-alliance"];
    await value.rewrite();
    expect((await readSimulatorPresentation("warrior", value.directory))?.kind).toBe("base");
  });
});

describe("Class-specific preset presentation approvals", () => {
  async function rogueFixture(): Promise<Fixture> {
    const value = await fixture("rogue");
    delete value.proof.stagingSha256;
    delete value.proof.reviewedExports;
    value.proof.schema = "kfc-simulator-presentation-proof.v3";
    value.proof.profiles = ["rogue"];
    value.proof.reviewedCases = ["rogue-combat-static"];
    value.proof.classBuilds = [
      {
        profile: "rogue",
        caseId: "rogue-combat-static",
        build: { path: "synthetic-rogue-build.json", sha256: "e".repeat(64) },
        share: { path: "synthetic-rogue-share.json", sha256: "f".repeat(64) },
      },
    ];
    value.proof.defaultOverrides = {
      profile: "rogue",
      changes: ["race", "partyBuffs"],
      settingsSha256: "d".repeat(64),
    };
    value.proof.virtualSourceFiles = [
      "ui/rogue/presets.ts",
      "ui/rogue/sim.ts",
      "ui/rogue/gear_sets/forever_combat.gear.json",
      "ui/rogue/apls/forever_combat_reviewed.apl.json",
    ].map((path) => ({ path, sha256: "c".repeat(64) }));
    value.browser.schema = "kfc-reviewed-presets-browser.v3";
    value.browser.checked = { ...checks, defaultRaceAndProfessions: true, poisonOptions: true };
    value.browser.evidence = { syntheticUnitTestOnly: true, rawRequestVerified: true };
    value.browser.classBuilds = [
      {
        profile: "rogue",
        caseId: "rogue-combat-static",
        buildSha256: "e".repeat(64),
        shareSha256: "f".repeat(64),
      },
    ];
    await value.rewrite();
    return value;
  }

  it("admits explicit Rogue defaults without inventing a legacy Warrior export", async () => {
    const value = await rogueFixture();
    expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe(
      "reviewed-presets",
    );
    expect((await readSimulatorPresentation("warrior", value.directory))?.kind).toBe("base");
  });
  async function practicalRogueFixture(): Promise<Fixture> {
    const value = await rogueFixture();
    value.proof.schema = "kfc-simulator-presentation-proof.v4";
    value.proof.reviewedCases = ["rogue-combat-static", "rogue-mutilate-static"];
    value.proof.classBuilds = [
      {
        profile: "rogue",
        caseId: "rogue-combat-static",
        build: { path: "synthetic-rogue-build.json", sha256: "e".repeat(64) },
        share: { path: "synthetic-rogue-share.json", sha256: "f".repeat(64) },
      },
      {
        profile: "rogue",
        caseId: "rogue-mutilate-static",
        build: { path: "synthetic-mutilate-build.json", sha256: "1".repeat(64) },
        share: { path: "synthetic-mutilate-share.json", sha256: "2".repeat(64) },
      },
    ];
    value.proof.defaultOverrides = {
      profile: "rogue",
      caseId: "rogue-combat-static",
      changes: ["race", "partyBuffs"],
      settingsSha256: "d".repeat(64),
    };
    value.proof.virtualSourceFiles = [
      "ui/rogue/presets.ts",
      "ui/rogue/sim.ts",
      "ui/rogue/gear_sets/forever_combat.gear.json",
      "ui/rogue/apls/forever_combat_reviewed.apl.json",
      "ui/rogue/gear_sets/forever_mutilate.gear.json",
      "ui/rogue/apls/forever_mutilate_first_pass.apl.json",
    ].map((path) => ({ path, sha256: "c".repeat(64) }));
    value.browser.schema = "kfc-reviewed-presets-browser.v4";
    value.browser.checked = {
      ...checks,
      defaultRaceAndProfessions: true,
      poisonOptions: true,
      allDeclaredBuilds: true,
    };
    value.browser.evidence = {
      syntheticUnitTestOnly: true,
      rawRequestVerified: true,
      verifiedCaseIds: ["rogue-combat-static", "rogue-mutilate-static"],
    };
    value.browser.classBuilds = [
      {
        profile: "rogue",
        caseId: "rogue-combat-static",
        buildSha256: "e".repeat(64),
        shareSha256: "f".repeat(64),
      },
      {
        profile: "rogue",
        caseId: "rogue-mutilate-static",
        buildSha256: "1".repeat(64),
        shareSha256: "2".repeat(64),
      },
    ];
    await value.rewrite();
    return value;
  }
  it("admits combined practical presets only with both exact class approvals and Combat defaults preserved", async () => {
    const value = await practicalRogueFixture();
    expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe(
      "reviewed-presets",
    );
    expect((await readSimulatorPresentation("warrior", value.directory))?.kind).toBe("base");
  });
  async function threeSpecRogueFixture(): Promise<Fixture> {
    const value = await practicalRogueFixture();
    const builds = value.proof.classBuilds,
      files = value.proof.virtualSourceFiles,
      browserBuilds = value.browser.classBuilds;
    if (!Array.isArray(builds) || !Array.isArray(files) || !Array.isArray(browserBuilds))
      throw new Error("Missing combined fixture declarations");
    value.proof.schema = "kfc-simulator-presentation-proof.v5";
    value.proof.reviewedCases = [
      "rogue-combat-static",
      "rogue-mutilate-static",
      "rogue-subtlety-static",
    ];
    value.proof.classBuilds = [
      ...builds,
      {
        profile: "rogue",
        caseId: "rogue-subtlety-static",
        build: { path: "synthetic-subtlety-build.json", sha256: "3".repeat(64) },
        share: { path: "synthetic-subtlety-share.json", sha256: "4".repeat(64) },
      },
    ];
    value.proof.virtualSourceFiles = [
      ...files,
      { path: "ui/rogue/gear_sets/forever_subtlety.gear.json", sha256: "c".repeat(64) },
      { path: "ui/rogue/apls/forever_subtlety_first_pass.apl.json", sha256: "d".repeat(64) },
    ];
    value.browser.schema = "kfc-reviewed-presets-browser.v5";
    value.browser.classBuilds = [
      ...browserBuilds,
      {
        profile: "rogue",
        caseId: "rogue-subtlety-static",
        buildSha256: "3".repeat(64),
        shareSha256: "4".repeat(64),
      },
    ];
    value.browser.evidence = {
      syntheticUnitTestOnly: true,
      rawRequestVerified: true,
      verifiedCaseIds: ["rogue-combat-static", "rogue-mutilate-static", "rogue-subtlety-static"],
    };
    await value.rewrite();
    return value;
  }
  it("admits the explicit three-spec proof only with all three exact browser approvals", async () => {
    const value = await threeSpecRogueFixture();
    expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe(
      "reviewed-presets",
    );
    expect((await readSimulatorPresentation("warrior", value.directory))?.kind).toBe("base");
  });
  it("cannot use the valid older two-spec browser contract to approve the new three-spec UI", async () => {
    const value = await threeSpecRogueFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    value.browser.schema = "kfc-reviewed-presets-browser.v4";
    const builds = value.browser.classBuilds;
    if (!Array.isArray(builds)) throw new Error("Missing browser fixture builds");
    value.browser.classBuilds = builds.slice(0, 2);
    value.browser.evidence = {
      rawRequestVerified: true,
      verifiedCaseIds: ["rogue-combat-static", "rogue-mutilate-static"],
    };
    await value.rewrite();
    expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe("base");
  });
  it.each([
    { rawRequestVerified: true, verifiedCaseIds: ["rogue-combat-static", "rogue-mutilate-static"] },
    {
      rawRequestVerified: false,
      verifiedCaseIds: ["rogue-combat-static", "rogue-mutilate-static", "rogue-subtlety-static"],
    },
  ])("requires actual Subtlety raw-request coverage in v5 %j", async (evidence) => {
    const value = await threeSpecRogueFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    value.browser.evidence = evidence;
    await value.rewrite();
    expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe("base");
  });
  it("rejects changed default ownership or undeclared sources even in a resealed three-spec proof", async () => {
    const value = await threeSpecRogueFixture(),
      original = structuredClone(value.proof);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const patch of [
      {
        defaultOverrides: {
          profile: "rogue",
          caseId: "rogue-subtlety-static",
          changes: ["race", "partyBuffs"],
          settingsSha256: "d".repeat(64),
        },
      },
      {
        virtualSourceFiles: [
          { path: "ui/rogue/apls/forever_hemorrhage.apl.json", sha256: "c".repeat(64) },
        ],
      },
    ]) {
      Object.assign(value.proof, original, patch);
      await value.rewrite();
      expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe("base");
    }
  });
  it("rejects a Combat-only browser approval for the combined UI", async () => {
    const value = await practicalRogueFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    value.browser.classBuilds = [
      {
        profile: "rogue",
        caseId: "rogue-combat-static",
        buildSha256: "e".repeat(64),
        shareSha256: "f".repeat(64),
      },
    ];
    await value.rewrite();
    expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe("base");
  });
  it.each([
    { rawRequestVerified: true, verifiedCaseIds: ["rogue-combat-static"] },
    {
      rawRequestVerified: false,
      verifiedCaseIds: ["rogue-combat-static", "rogue-mutilate-static"],
    },
  ])("rejects missing/raw-unverified Mutilate request coverage %j", async (evidence) => {
    const value = await practicalRogueFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    value.browser.evidence = evidence;
    await value.rewrite();
    expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe("base");
  });
  it("rejects hidden sources, unknown specs and a changed first-visit default in combined proofs", async () => {
    const value = await practicalRogueFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const original = structuredClone(value.proof);
    for (const patch of [
      {
        defaultOverrides: {
          profile: "rogue",
          caseId: "rogue-mutilate-static",
          changes: ["race", "partyBuffs"],
          settingsSha256: "d".repeat(64),
        },
      },
      { reviewedCases: ["rogue-combat-static", "rogue-subtlety-static"] },
      { virtualSourceFiles: [{ path: "ui/core/player.ts", sha256: "c".repeat(64) }] },
    ]) {
      Object.assign(value.proof, original, patch);
      await value.rewrite();
      expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe("base");
    }
  });
  it.each(["defaultRaceAndProfessions", "poisonOptions", "requestParity"])(
    "requires the actual class browser check %s",
    async (check: string) => {
      const value = await rogueFixture();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      value.browser.checked = {
        ...checks,
        defaultRaceAndProfessions: true,
        poisonOptions: true,
        [check]: false,
      };
      await value.rewrite();
      expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe("base");
    },
  );
  it("rejects undeclared default changes, cross-class overrides and hidden files", async () => {
    const value = await rogueFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const original = structuredClone(value.proof);
    for (const patch of [
      {
        defaultOverrides: {
          profile: "rogue",
          changes: ["race", "rotation"],
          settingsSha256: "d".repeat(64),
        },
      },
      { profiles: ["rogue", "warrior"] },
      { reviewedCases: ["rogue-combat-static", "rogue-subtlety-static"] },
      { virtualSourceFiles: [{ path: "ui/core/player.ts", sha256: "c".repeat(64) }] },
      { virtualSourceFiles: [{ path: "ui/rogue/sim.ts", sha256: "c".repeat(64) }] },
    ]) {
      Object.assign(value.proof, original, patch);
      await value.rewrite();
      expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe("base");
    }
  });
  it("cannot substitute legacy approval or reseal different class exports", async () => {
    const value = await rogueFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    value.browser.classBuilds = [
      {
        profile: "rogue",
        caseId: "rogue-combat-static",
        buildSha256: "0".repeat(64),
        shareSha256: "f".repeat(64),
      },
    ];
    await value.rewrite();
    expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe("base");
    value.browser.schema = "kfc-reviewed-presets-browser.v1";
    delete value.browser.classBuilds;
    value.browser.checked = { ...checks };
    await value.rewrite();
    expect((await readSimulatorPresentation("rogue", value.directory))?.kind).toBe("base");
  });
  it("does not widen legacy virtual source permissions", async () => {
    const value = await fixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    value.proof.virtualSourceFiles = [{ path: "ui/warrior/sim.ts", sha256: "c".repeat(64) }];
    await value.rewrite();
    expect((await readSimulatorPresentation("warrior", value.directory))?.kind).toBe("base");
  });
});

describe("Reviewed share links on a model-compatible UI", () => {
  const build: LocalSimulatorBuildReview = {
    id: "arms-alliance",
    spec: "warrior/arms",
    faction: "alliance",
    scenario: "conservative",
    stage: "reviewed",
    status: "reviewed",
    href: `/forever-sim/${sourceRelease}/warrior#${"A".repeat(80)}`,
    referenceDps: 800,
    requiresProvisionalEnchantOptIn: false,
    warnings: [],
  };
  it("changes only the verified release path and preserves complete share payload and input objects", async () => {
    const f = await fixture();
    const presentation = await readSimulatorPresentation("warrior", f.directory);
    expect(presentation?.kind).toBe("reviewed-presets");
    const mapped = buildsForPresentation([build], presentation!, "warrior");
    expect(mapped[0]?.href).toBe(`/forever-sim/${release}/warrior/#${"A".repeat(80)}`);
    expect(build.href).toContain(sourceRelease);
    expect(
      buildsForPresentation(
        [build],
        { manifest: f.source, sourceRelease, kind: "base" },
        "warrior",
      ),
    ).toEqual([build]);
  });
  it("refuses foreign origins, mismatched profiles, search parameters or partial payloads", async () => {
    const f = await fixture();
    const presentation = (await readSimulatorPresentation("warrior", f.directory))!;
    for (const href of [
      `https://evil.invalid${build.href}`,
      `https://helper.invalid${build.href}`,
      `//user:password@helper.invalid${build.href}`,
      `/forever-sim/${sourceRelease}/mage#${"A".repeat(80)}`,
      `/forever-sim/${sourceRelease}/warrior?partial=1#${"A".repeat(80)}`,
      `/forever-sim/${sourceRelease}/warrior#short`,
    ])
      expect(() => buildsForPresentation([{ ...build, href }], presentation, "warrior")).toThrow(
        "does not match",
      );
  });
});
