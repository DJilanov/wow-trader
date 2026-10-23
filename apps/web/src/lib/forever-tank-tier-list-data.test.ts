import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SIMULATOR_SPECS, simulatorManifestSchema } from "@wow-trader/forever-data/simulator";
import solo from "./data/forever-tank-tier-list.solo.json";
import raid from "./data/forever-tank-tier-list.raid.json";
import { readTankTierSnapshot } from "./forever-tank-tier-list-data";
import { tankTierSnapshotSchema, type TankTierScenario } from "./forever-tank-tier-list";

const paths: string[] = [];
afterEach(async (): Promise<void> => {
  vi.restoreAllMocks();
  await Promise.all(
    paths.splice(0).map((path): Promise<void> => rm(path, { recursive: true, force: true })),
  );
});
async function fixture(
  scenario: TankTierScenario,
): Promise<{ readonly directory: string; readonly source: typeof solo }> {
  const directory = await mkdtemp(join(tmpdir(), "kfc-tank-tiers-"));
  paths.push(directory);
  const source = structuredClone(scenario === "solo" ? solo : raid);
  const entry = tankTierSnapshotSchema.parse(source).entries[0]!;
  const manifest = simulatorManifestSchema.parse({
    schema: "kfc-forever-simulator.v1",
    release: entry.release,
    upstream: "https://github.com/gunba/wow-forever-sim",
    revision: "9a27c3d6af91d1ca0dbcf94a124b8869ad522108",
    preparedAt: "2026-10-23T00:00:00.000Z",
    itemCount: 1,
    excludedModeledItems: 0,
    pages: SIMULATOR_SPECS.map((spec): string => spec.page),
    mechanicsStatus: "beta_model",
    dataProvenance: "pinned-upstream-forever-data",
    files: {
      "lib.wasm": { bytes: 1, sha256: entry.wasmSha256 },
      "assets/database/db.json": { bytes: 1, sha256: entry.databaseSha256 },
      "kfc-tank-starters.json": { bytes: 1, sha256: entry.starterSha256 },
    },
  });
  await mkdir(join(directory, entry.release));
  await writeFile(join(directory, entry.release, "manifest.json"), JSON.stringify(manifest));
  const sha = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  for (const value of source.entries) value.manifestSha256 = sha;
  const active = { ...manifest, release: "a".repeat(24) };
  const selection = { schema: "kfc-simulator-model-update-selection.v1", release: entry.release };
  const hash = (value: unknown): string =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  source.approvedSelection = {
    activeManifestSha256: hash(active),
    modelSelectionSha256: hash(selection),
  };
  await writeFile(join(directory, "active.json"), JSON.stringify(active));
  await writeFile(join(directory, "model-update.json"), JSON.stringify(selection));
  await writeFile(
    join(directory, "profile-model-updates.json"),
    JSON.stringify({ schema: "kfc-simulator-profile-model-selection.v1", profiles: {} }),
  );
  return { directory, source };
}
describe("tank ranking admission", () => {
  it.each(["solo", "raid"] as const)(
    "accepts %s scores only for the matching selected tank manifests",
    async (scenario): Promise<void> => {
      const { directory, source } = await fixture(scenario);
      expect(await readTankTierSnapshot(scenario, directory, source)).not.toBeNull();
    },
  );
  it("fails closed for unavailable, changed or unselected tank models", async (): Promise<void> => {
    vi.spyOn(console, "warn").mockImplementation((): void => {});
    const { directory, source } = await fixture("solo");
    await unlink(join(directory, "model-update.json"));
    expect(await readTankTierSnapshot("solo", directory, source)).toBeNull();
    const fresh = await fixture("solo");
    fresh.source.entries[0]!.wasmSha256 = "0".repeat(64);
    expect(await readTankTierSnapshot("solo", fresh.directory, fresh.source)).toBeNull();
    const changed = await fixture("raid");
    changed.source.entries[0]!.release = "0".repeat(24);
    expect(await readTankTierSnapshot("raid", changed.directory, changed.source)).toBeNull();
  });
  it("rejects changed approval pointers and tank-specific overrides without invalidating unrelated class work", async (): Promise<void> => {
    vi.spyOn(console, "warn").mockImplementation((): void => {});
    const { directory, source } = await fixture("raid");
    await writeFile(
      join(directory, "profile-model-updates.json"),
      JSON.stringify({
        schema: "kfc-simulator-profile-model-selection.v1",
        profiles: { warlock: {} },
      }),
    );
    expect(await readTankTierSnapshot("raid", directory, source)).not.toBeNull();
    await writeFile(
      join(directory, "profile-model-updates.json"),
      JSON.stringify({
        schema: "kfc-simulator-profile-model-selection.v1",
        profiles: { tank_warrior: {} },
      }),
    );
    expect(await readTankTierSnapshot("raid", directory, source)).toBeNull();
    const changed = await fixture("solo");
    await writeFile(
      join(changed.directory, "model-update.json"),
      JSON.stringify({
        schema: "kfc-simulator-model-update-selection.v1",
        release: "b".repeat(24),
      }),
    );
    expect(await readTankTierSnapshot("solo", changed.directory, changed.source)).toBeNull();
  });
  it("rejects scenario relabeling, policy changes and altered exclusion reasons", async (): Promise<void> => {
    vi.spyOn(console, "warn").mockImplementation((): void => {});
    const { directory, source } = await fixture("solo");
    expect(await readTankTierSnapshot("raid", directory, source)).toBeNull();
    source.policy.support = "pretend raid support";
    expect(await readTankTierSnapshot("solo", directory, source)).toBeNull();
    const changed = await fixture("raid");
    changed.source.supportSha256 = "0".repeat(64);
    expect(await readTankTierSnapshot("raid", changed.directory, changed.source)).toBeNull();
    const altered = await fixture("raid");
    altered.source.unranked[0]!.reason = "missing evidence is fine";
    expect(await readTankTierSnapshot("raid", altered.directory, altered.source)).toBeNull();
  });
});
