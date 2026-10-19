import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SIMULATOR_REVISION, SIMULATOR_SPECS } from "@wow-trader/forever-data/simulator";
import {
  readLocalSimulatorReviews,
  reviewedBuildsForSimulator,
} from "./forever-simulator-local-reviews";

const fixtures: string[] = [];
const release = "a".repeat(24);
const identity = "b".repeat(64);
const id = "arms-alliance";
interface EvidenceReference {
  readonly path: string;
  readonly sha256: string;
}
interface FinalEvidence {
  readonly baseline: EvidenceReference;
  readonly review: EvidenceReference;
  readonly accessories: readonly EvidenceReference[];
  readonly rotation: EvidenceReference;
  readonly exported: EvidenceReference;
}
interface ReviewFixture {
  readonly directory: string;
  readonly share: {
    sourceRelease: string;
    campaignIdentity: string;
    status: string;
    link: string;
    requiresProvisionalEnchantOptIn?: boolean;
  };
  readonly sharePath: () => string;
  readonly updateShare: (update: () => void) => Promise<void>;
  readonly feedback: EvidenceReference;
  readonly final: FinalEvidence | null;
}
interface UpgradeShareFixture {
  schema: string;
  campaignIdentity: string;
  caseId: string;
  sourceRelease: string;
  status: string;
  requiresProvisionalEnchantOptIn: boolean;
  feedbackReview: EvidenceReference;
  baseline: EvidenceReference;
  campaignFinal: FinalEvidence;
  link: string;
  warnings: string[];
}
interface UpgradePointerFixture {
  schema: string;
  campaignIdentity: string;
  sourceRelease: string;
  cases: Record<string, { supersedesExportSha256: string; share: EvidenceReference }>;
}
interface DeliveredUpgradeFixture {
  readonly pointer: UpgradePointerFixture;
  readonly pointerPath: string;
  readonly share: UpgradeShareFixture;
  readonly shareReference: EvidenceReference;
  readonly final: FinalEvidence;
  readonly updateShare: () => Promise<void>;
}
const deliveryDatabase = { items: [{ id: 123, name: "Synthetic test item" }] };
const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function json(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

async function fixture(
  complete = false,
  exportedPlayerName = "Test fixture",
  options: { readonly provisional?: boolean; readonly exportedConsent?: boolean } = {},
): Promise<ReviewFixture> {
  const provisional = options.provisional ?? false;
  const directory = await mkdtemp(join(tmpdir(), "local-sim-review-"));
  fixtures.push(directory);
  const root = join(directory, "optimization");
  async function evidence(name: string, value: unknown): Promise<EvidenceReference> {
    const path = join(root, name);
    await json(path, value);
    return { path, sha256: hash(value) };
  }
  const baseline = await evidence("baseline.json", {
    settings: { player: { name: "Test fixture" } },
  });
  const feedback = await evidence("feedback.json", {
    schema: "kfc-prebis-feedback-review.v1",
    status: "closed-loop-verified",
    profile: "warrior",
    variant: "arms",
    revision: SIMULATOR_REVISION,
    baselineSha256: baseline.sha256,
    referenceDps: 800,
    iterations: 400000,
    enchantPolicy: { provisionalEffectIds: provisional ? [1900] : [] },
  });
  const final = complete
    ? {
        baseline,
        review: feedback,
        accessories: await Promise.all(
          ["rings", "trinkets"].map((kind) =>
            evidence(`${kind}.json`, {
              kind,
              status: "no-confirmed-challenger",
              feedbackReviewSha256: feedback.sha256,
            }),
          ),
        ),
        rotation: await evidence("rotation.json", {
          feedbackSha256: feedback.sha256,
          validated: false,
        }),
        exported: { path: "", sha256: "" },
      }
    : null;
  if (final)
    final.exported = await evidence("exported.json", {
      schema: "kfc-reviewed-simulator-build.v1",
      settings: { player: { name: exportedPlayerName } },
      requiresProvisionalEnchantOptIn: options.exportedConsent ?? provisional,
      evidence: { feedbackSha256: feedback.sha256, rotationAuditSha256: final.rotation.sha256 },
    });
  const state = {
    schema: "kfc-prebis-campaign.v1",
    identity,
    cases: {
      [id]: {
        entry: {
          id,
          spec: "warrior/arms",
          faction: "alliance",
          scenario: provisional ? "provisional-procs" : "conservative",
        },
        status: complete ? "reviewed-local" : "running",
        active: complete ? null : { kind: "accessories" },
        steps: [{ kind: "feedback", files: { output: feedback } }],
        final,
      },
    },
  };
  const share = {
    schema: "kfc-local-build-share-review.v1",
    campaignIdentity: identity,
    caseId: id,
    sourceRelease: release,
    requiresProvisionalEnchantOptIn: provisional,
    status: complete ? "reviewed-local" : "core-reviewed-final-audits-pending",
    feedbackReview: feedback,
    baseline,
    link: `http://localhost:3017/forever-sim/${release}/warrior#${"A".repeat(80)}`,
    warnings: ["Synthetic unit-test fixture; not a player recommendation."],
    ...(final ? { campaignFinal: final } : {}),
  };
  const sharePath = (): string =>
    join(root, "share-links", `${id}-${hash(share).slice(0, 16)}.json`);
  const statePath = join(root, "campaigns", identity, "state.json");
  await json(join(root, "campaigns/latest.json"), { identity });
  await json(statePath, state);
  await json(sharePath(), share);
  await json(join(directory, "active.json"), {
    schema: "kfc-forever-simulator.v1",
    release,
    upstream: "https://github.com/gunba/wow-forever-sim",
    revision: SIMULATOR_REVISION,
    preparedAt: "2026-10-17T00:00:00Z",
    itemCount: 1,
    excludedModeledItems: 0,
    pages: SIMULATOR_SPECS.map((spec) => spec.page),
    files: { "lib.wasm": { bytes: 1, sha256: "c".repeat(64) } },
    dataProvenance: "pinned-upstream-forever-data",
    mechanicsStatus: "beta_model",
  });
  async function updateShare(update: () => void): Promise<void> {
    const previous = sharePath();
    update();
    await json(previous, share);
    await rename(previous, sharePath());
  }
  return { directory, share, sharePath, updateShare, feedback, final };
}

async function deliveredUpgrade(
  fixture: ReviewFixture,
  options: { readonly exportedConsent?: boolean; readonly databaseSha256?: string } = {},
): Promise<DeliveredUpgradeFixture> {
  if (!fixture.final) throw new Error("Upgrade test requires a completed predecessor");
  const root = join(fixture.directory, "optimization");
  async function evidence(name: string, value: unknown): Promise<EvidenceReference> {
    const path = join(root, "upgrades", name);
    await json(path, value);
    return { path, sha256: hash(value) };
  }
  const provisional = fixture.share.requiresProvisionalEnchantOptIn ?? false;
  const model = {
    revision: SIMULATOR_REVISION,
    dbSha256: options.databaseSha256 ?? hash(deliveryDatabase),
    nativeBinarySha256: "d".repeat(64),
  };
  const settings = { player: { name: "Updated synthetic fixture" } };
  const baseline = await evidence("baseline.json", {
    sourceRelease: release,
    revision: model.revision,
    dbSha256: model.dbSha256,
    settings,
  });
  const feedback = await evidence("feedback.json", {
    schema: "kfc-prebis-feedback-review.v1",
    status: "closed-loop-verified",
    profile: "warrior",
    variant: "arms",
    faction: "Alliance",
    ...model,
    baselineSha256: baseline.sha256,
    referenceDps: 900,
    iterations: 400000,
    enchantPolicy: { provisionalEffectIds: provisional ? [1900] : [] },
  });
  const rotation = await evidence("rotation.json", {
    feedbackSha256: feedback.sha256,
    validated: false,
  });
  const final = {
    baseline,
    review: feedback,
    accessories: await Promise.all(
      ["rings", "trinkets"].map((kind) =>
        evidence(`${kind}.json`, {
          kind,
          status: "no-confirmed-challenger",
          feedbackReviewSha256: feedback.sha256,
        }),
      ),
    ),
    rotation,
    exported: await evidence("exported.json", {
      schema: "kfc-reviewed-simulator-build.v1",
      ...model,
      settings,
      requiresProvisionalEnchantOptIn: options.exportedConsent ?? provisional,
      evidence: { feedbackSha256: feedback.sha256, rotationAuditSha256: rotation.sha256 },
    }),
  };
  const share = {
    schema: "kfc-local-build-share-review.v1",
    campaignIdentity: identity,
    caseId: id,
    sourceRelease: release,
    status: "reviewed-local",
    requiresProvisionalEnchantOptIn: provisional,
    feedbackReview: feedback,
    baseline,
    campaignFinal: final,
    link: `http://localhost:3017/forever-sim/${release}/warrior#${"B".repeat(80)}`,
    warnings: ["Synthetic reviewed-upgrade test; no real build or simulation."],
  };
  const shareReference = await evidence("share.json", share);
  const pointer: UpgradePointerFixture = {
    schema: "kfc-local-reviewed-deliveries.v1",
    campaignIdentity: identity,
    sourceRelease: release,
    cases: {
      [id]: { supersedesExportSha256: fixture.final.exported.sha256, share: shareReference },
    },
  };
  const pointerPath = join(root, "reviewed-deliveries.json");
  await json(join(fixture.directory, release, "assets/database/db.json"), deliveryDatabase);
  await json(pointerPath, pointer);
  const updateShare = async (): Promise<void> => {
    await json(shareReference.path, share);
    pointer.cases[id]!.share = { path: shareReference.path, sha256: hash(share) };
    await json(pointerPath, pointer);
  };
  return { pointer, pointerPath, share, shareReference, final, updateShare };
}

afterEach(async () => {
  for (const directory of fixtures.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("Local-only simulator build reviews", () => {
  it("does not touch the filesystem when disabled", async () => {
    expect(await readLocalSimulatorReviews("/not-a-real-review-directory", false)).toEqual({
      status: "disabled",
    });
  });
  it("has an empty state before a local campaign exists", async () => {
    expect(await readLocalSimulatorReviews("/not-a-real-review-directory", true)).toEqual({
      status: "empty",
    });
  });
  it("shows core-reviewed data as an unfinished preview and makes the URL same-origin", async () => {
    const f = await fixture();
    const result = await readLocalSimulatorReviews(f.directory, true);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Missing review listing");
    expect(result.cases[0]).toMatchObject({
      id,
      status: "preview",
      referenceDps: 800,
      href: `/forever-sim/${release}/warrior#${"A".repeat(80)}`,
    });
  });
  it("requires a newly verified share receipt after final calculations finish", async () => {
    const f = await fixture(true);
    await f.updateShare(() => {
      f.share.status = "core-reviewed-final-audits-pending";
    });
    const result = await readLocalSimulatorReviews(f.directory, true);
    expect(result.status === "ready" && result.cases[0]?.status).toBe("waiting");
  });
  it("recognizes a complete hash-linked final chain without starting a simulation", async () => {
    const f = await fixture(true);
    const result = await readLocalSimulatorReviews(f.directory, true);
    expect(result.status === "ready" && result.cases[0]?.status).toBe("reviewed");
  });
  it("delivers a reviewed upgrade without mutating the original completed campaign or shares", async () => {
    const f = await fixture(true);
    const statePath = join(f.directory, "optimization/campaigns", identity, "state.json");
    const previousState = await readFile(statePath, "utf8");
    const previousShare = await readFile(f.sharePath(), "utf8");
    await deliveredUpgrade(f);
    const result = await readLocalSimulatorReviews(f.directory, true);
    expect(result.status === "ready" && result.cases[0]).toMatchObject({
      id,
      status: "reviewed",
      referenceDps: 900,
      href: `/forever-sim/${release}/warrior#${"B".repeat(80)}`,
    });
    expect(await readFile(statePath, "utf8")).toBe(previousState);
    expect(await readFile(f.sharePath(), "utf8")).toBe(previousShare);
  });
  it.each(["campaignIdentity", "sourceRelease"] as const)(
    "ignores an upgrade pointer from a stale %s and retains the original reviewed build",
    async (field) => {
      const f = await fixture(true);
      const upgrade = await deliveredUpgrade(f);
      upgrade.pointer[field] = "e".repeat(field === "sourceRelease" ? 24 : 64);
      await json(upgrade.pointerPath, upgrade.pointer);
      const result = await readLocalSimulatorReviews(f.directory, true);
      expect(result.status === "ready" && result.cases[0]).toMatchObject({
        status: "reviewed",
        referenceDps: 800,
      });
    },
  );
  it("rejects an upgrade for a different historical predecessor", async () => {
    const f = await fixture(true);
    const upgrade = await deliveredUpgrade(f);
    upgrade.pointer.cases[id]!.supersedesExportSha256 = "e".repeat(64);
    await json(upgrade.pointerPath, upgrade.pointer);
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow("predecessor");
  });
  it("rejects a delivered model with a different current database despite valid hash links", async () => {
    const f = await fixture(true);
    await deliveredUpgrade(f, { databaseSha256: "e".repeat(64) });
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow("delivered model");
  });
  it("keeps proc consent explicit for an upgrade and rejects an export that drops it", async () => {
    const f = await fixture(true, "Test fixture", { provisional: true });
    await deliveredUpgrade(f);
    const result = await readLocalSimulatorReviews(f.directory, true);
    expect(result.status === "ready" && result.cases[0]).toMatchObject({
      status: "reviewed",
      referenceDps: 900,
      requiresProvisionalEnchantOptIn: true,
    });
    await deliveredUpgrade(f, { exportedConsent: false });
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow("final review");
  });
  it.each(["caseId", "sourceRelease", "status"] as const)(
    "rejects a hash-valid upgraded share with mismatched %s",
    async (field) => {
      const f = await fixture(true);
      const upgrade = await deliveredUpgrade(f);
      upgrade.share[field] =
        field === "caseId"
          ? "unknown-case"
          : field === "status"
            ? "core-reviewed-final-audits-pending"
            : "e".repeat(24);
      await upgrade.updateShare();
      await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow("delivered share");
    },
  );
  it("rejects missing or corrupt upgraded final evidence", async () => {
    const f = await fixture(true);
    const upgrade = await deliveredUpgrade(f);
    await writeFile(upgrade.final.rotation.path, "{}");
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow("hash mismatch");
  });
  it("rejects a delivered share whose reference escapes the evidence archive", async () => {
    const f = await fixture(true);
    const upgrade = await deliveredUpgrade(f);
    const outside = join(f.directory, "outside-upgrade.json");
    await writeFile(outside, await readFile(upgrade.shareReference.path));
    await rm(upgrade.shareReference.path);
    await symlink(outside, upgrade.shareReference.path);
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow("escaped");
  });
  it("rejects upgrade pointers that introduce an unconfigured case", async () => {
    const f = await fixture(true);
    const upgrade = await deliveredUpgrade(f);
    upgrade.pointer.cases["unknown-case"] = upgrade.pointer.cases[id]!;
    await json(upgrade.pointerPath, upgrade.pointer);
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow("Unknown local");
  });
  it("does not accept a foreign full-build URL through a reviewed upgrade", async () => {
    const f = await fixture(true);
    const upgrade = await deliveredUpgrade(f);
    upgrade.share.link = `https://external.example/forever-sim/${release}/warrior#${"B".repeat(80)}`;
    await upgrade.updateShare();
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow("share URL");
  });
  it("bounds upgrade pointers and delivered shares before parsing", async () => {
    const f = await fixture(true);
    const upgrade = await deliveredUpgrade(f);
    await writeFile(upgrade.pointerPath, Buffer.alloc(128_001));
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow("file size");
    await json(upgrade.pointerPath, upgrade.pointer);
    await writeFile(upgrade.shareReference.path, Buffer.alloc(600_001));
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow("file size");
  });
  it("offers only completed current-release builds for the requested simulator page", async () => {
    const f = await fixture(true);
    const result = await readLocalSimulatorReviews(f.directory, true);
    if (result.status !== "ready" || !result.cases[0]) throw new Error("Missing reviewed build");
    const arms = result.cases[0];
    const fury = { ...arms, id: "fury-horde", spec: "warrior/fury", faction: "horde" };
    const listing = {
      ...result,
      cases: [
        arms,
        fury,
        { ...arms, id: "preview", status: "preview" as const },
        { ...arms, id: "waiting", status: "waiting" as const },
        { ...arms, id: "missing-link", href: null },
        { ...arms, id: "tank", spec: "tank_warrior/protection" },
        { ...arms, id: "rogue", spec: "rogue/combat" },
      ],
    };
    expect(reviewedBuildsForSimulator(listing, release, "warrior")).toEqual([arms, fury]);
    expect(reviewedBuildsForSimulator(listing, release, "war")).toEqual([]);
    expect(reviewedBuildsForSimulator(listing, "d".repeat(24), "warrior")).toEqual([]);
    expect(reviewedBuildsForSimulator({ status: "disabled" }, release, "warrior")).toEqual([]);
    expect(reviewedBuildsForSimulator({ status: "empty" }, release, "warrior")).toEqual([]);
    expect(listing.cases).toHaveLength(7);
  });
  it("keeps provisional-model consent warnings when offering a reviewed build on its class page", async () => {
    const f = await fixture(true, "Test fixture", { provisional: true });
    const result = await readLocalSimulatorReviews(f.directory, true);
    expect(reviewedBuildsForSimulator(result, release, "warrior")).toMatchObject([
      { id, requiresProvisionalEnchantOptIn: true, status: "reviewed" },
    ]);
  });
  it("preserves the explicit opt-in requirement for a provisional preview", async () => {
    const f = await fixture(false, "Test fixture", { provisional: true });
    const result = await readLocalSimulatorReviews(f.directory, true);
    expect(result.status === "ready" && result.cases[0]).toMatchObject({
      status: "preview",
      requiresProvisionalEnchantOptIn: true,
    });
  });
  it("accepts a fully linked provisional review without treating its link as consent", async () => {
    const f = await fixture(true, "Test fixture", { provisional: true });
    const result = await readLocalSimulatorReviews(f.directory, true);
    expect(result.status === "ready" && result.cases[0]).toMatchObject({
      status: "reviewed",
      requiresProvisionalEnchantOptIn: true,
    });
  });
  it("rejects a provisional share that omits the opt-in warning metadata", async () => {
    const f = await fixture(false, "Test fixture", { provisional: true });
    await f.updateShare(() => {
      delete f.share.requiresProvisionalEnchantOptIn;
    });
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow(
      "different combat setup",
    );
  });
  it("rejects opt-in metadata that contradicts the conservative scenario", async () => {
    const f = await fixture();
    await f.updateShare(() => {
      f.share.requiresProvisionalEnchantOptIn = true;
    });
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow(
      "different combat setup",
    );
  });
  it("rejects a final export that drops the provisional-model restriction", async () => {
    const f = await fixture(true, "Test fixture", { provisional: true, exportedConsent: false });
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow(
      "Stale local final review",
    );
  });
  it("keeps earlier conservative share receipts valid without adding any opt-in", async () => {
    const f = await fixture(true);
    await f.updateShare(() => {
      delete f.share.requiresProvisionalEnchantOptIn;
    });
    const result = await readLocalSimulatorReviews(f.directory, true);
    expect(result.status === "ready" && result.cases[0]).toMatchObject({
      status: "reviewed",
      requiresProvisionalEnchantOptIn: false,
    });
  });
  it("rejects a hash-valid final export that contains a different character setup", async () => {
    const f = await fixture(true, "Different character");
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow(
      "Stale local final review",
    );
  });
  it("bounds receipt reads before parsing an oversized file", async () => {
    const f = await fixture();
    await writeFile(f.sharePath(), Buffer.alloc(600_001));
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow("file size");
  });
  it.each(["sourceRelease", "campaignIdentity"] as const)(
    "does not reuse stale %s",
    async (field) => {
      const f = await fixture();
      await f.updateShare(() => {
        f.share[field] = "d".repeat(field === "sourceRelease" ? 24 : 64);
      });
      const result = await readLocalSimulatorReviews(f.directory, true);
      expect(result.status === "ready" && result.cases[0]?.href).toBeNull();
    },
  );
  it("rejects a mutated receipt even when its JSON still parses", async () => {
    const f = await fixture();
    await json(f.sharePath(), { ...f.share, warnings: [] });
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow(
      "receipt hash mismatch",
    );
  });
  it("rejects corrupt linked final evidence", async () => {
    const f = await fixture(true);
    await writeFile(f.final!.accessories[0]!.path, "{}");
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow("hash mismatch");
  });
  it.each([
    `https://external.example/forever-sim/${release}/warrior#${"A".repeat(80)}`,
    `http://localhost:3017/forever-sim/${release}/warrior?i=t#${"A".repeat(80)}`,
    `http://localhost:3017/forever-sim/${release}/mage#${"A".repeat(80)}`,
    `http://user:password@localhost:3017/forever-sim/${release}/warrior#${"A".repeat(80)}`,
  ])("rejects foreign, partial-category and mismatched-profile links: %s", async (link) => {
    const f = await fixture();
    await f.updateShare(() => {
      f.share.link = link;
    });
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow("share URL");
  });
  it("rejects referenced files and symlinks outside the evidence archive", async () => {
    const f = await fixture();
    const outside = join(f.directory, "outside.json");
    await writeFile(outside, await readFile(f.feedback.path));
    await rm(f.feedback.path);
    await symlink(outside, f.feedback.path);
    await expect(readLocalSimulatorReviews(f.directory, true)).rejects.toThrow(
      "escaped its evidence directory",
    );
  });
});
