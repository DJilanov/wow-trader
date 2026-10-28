import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import solo from "./data/forever-dps-tier-list.current.solo.json";
import raid from "./data/forever-dps-tier-list.current.raid.json";
import tanksSolo from "./data/forever-tank-tier-list.current.solo.json";
import tanksRaid from "./data/forever-tank-tier-list.current.raid.json";
import healers from "./data/forever-healer-tier-list.json";
import { dpsTierSnapshotSchema, rankDpsTierEntries } from "./forever-dps-tier-list";
import { tankTierSnapshotSchema, rankTankTierEntries } from "./forever-tank-tier-list";
import { healerTierSnapshotSchema, rankHealerTierEntries } from "./forever-healer-tier-list";
import { readDpsTierScenarioSnapshot } from "./forever-dps-tier-list-data";
import { readTankTierSnapshot } from "./forever-tank-tier-list-data";
import { readHealerTierSnapshot } from "./forever-healer-tier-list-data";
import { verifyTierSourceBindings } from "./forever-tier-source-bindings";

const paths: string[] = [];
afterEach(async (): Promise<void> => {
  vi.restoreAllMocks();
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture<T extends { sourceBindings: { path: string; sha256: string }[] }>(
  input: T,
): Promise<{ directory: string; source: T }> {
  const directory = await mkdtemp(join(tmpdir(), "kfc-current-tiers-"));
  paths.push(directory);
  const source = structuredClone(input);
  const dps = dpsTierSnapshotSchema.safeParse(source);
  const tank = tankTierSnapshotSchema.safeParse(source);
  const healing = healerTierSnapshotSchema.safeParse(source);
  const hash = (bytes: string): string => createHash("sha256").update(bytes).digest("hex");
  for (const entry of source.sourceBindings) {
    let value: unknown = { fixture: entry.path };
    const publication = dps.success
      ? Object.entries(dps.data.sourcePublications ?? {}).find(
          ([, reference]) => reference.path === entry.path,
        )
      : undefined;
    if (publication && dps.success) {
      const [profile] = publication,
        entries = dps.data.entries.filter((row) => row.profile === profile);
      value = {
        profile,
        release: entries[0]!.release,
        builds: entries.map((row) => ({
          id: row.id,
          href: "/fixture/" + row.id,
          requiresProvisionalEnchantOptIn: false,
        })),
      };
    }
    if (
      healing.success &&
      entry.path.startsWith("healing/") &&
      entry.path.endsWith("/active.json")
    ) {
      const profile =
        entry.path === "healing/active.json" ? "healing-priest" : entry.path.split("/")[1];
      const row = healing.data.entries.find((row) => row.profile === profile)!;
      value = {
        release: row.release,
        modelIdentity: row.modelIdentity,
        files: { "healing.wasm": { sha256: row.wasmSha256 } },
      };
    }
    const bytes = JSON.stringify(value);
    entry.sha256 = hash(bytes);
    if (publication && dps.success) {
      publication[1].sha256 = entry.sha256;
      for (const row of dps.data.entries.filter((row) => row.profile === publication[0])) {
        row.publicationSha256 = entry.sha256;
        row.originalHrefSha256 = hash("/fixture/" + row.id);
      }
    }
    if (tank.success && tank.data.schema === "kfc-forever-tank-tier-list.v4")
      for (const row of tank.data.entries) {
        if (entry.path === row.release + "/manifest.json") row.manifestSha256 = entry.sha256;
        if (entry.path === row.release + "/kfc-qualified-tank-model.json")
          row.proofSha256 = entry.sha256;
      }
    await mkdir(dirname(join(directory, entry.path)), { recursive: true });
    await writeFile(join(directory, entry.path), bytes);
  }
  if (dps.success)
    Object.assign(source, {
      entries: dps.data.entries,
      sourcePublications: dps.data.sourcePublications,
    });
  if (tank.success) Object.assign(source, { entries: tank.data.entries });
  return { directory, source };
}
describe("current all-role tier publications", () => {
  it("covers every current DPS spec, including Paladin and all four Warlock builds", () => {
    const a = rankDpsTierEntries(dpsTierSnapshotSchema.parse(solo)),
      b = rankDpsTierEntries(dpsTierSnapshotSchema.parse(raid));
    expect(a).toHaveLength(25);
    expect(a.map((row) => row.id).sort()).toEqual(b.map((row) => row.id).sort());
    expect(new Set(a.map((row) => row.classSlug)).size).toBe(9);
    expect(a.filter((row) => row.classSlug === "warlock")).toHaveLength(4);
    expect(a.filter((row) => row.classSlug === "paladin")).toHaveLength(2);
    expect(a.find((row) => row.id === "arms-standard")?.release).toBe("b245938481ca2c015266d4d9");
  });
  it("uses all three current tanks and reconciles every measured threat action", () => {
    for (const raw of [tanksSolo, tanksRaid]) {
      const snapshot = tankTierSnapshotSchema.parse(raw);
      expect(snapshot.schema).toBe("kfc-forever-tank-tier-list.v4");
      for (const metric of ["threat", "dtps"] as const) {
        const entries = rankTankTierEntries(snapshot, metric);
        expect(entries).toHaveLength(3);
        expect(entries.every((row) => row.iterations === 5000)).toBe(true);
        expect(
          entries.every((row) =>
            row.simulatorHref.includes(`?build=${row.id}-${snapshot.policy.scenario}-`),
          ),
        ).toBe(true);
      }
    }
  });
  it("includes all healer archetypes and keeps assignments, survival and overhealing separate", () => {
    const snapshot = healerTierSnapshotSchema.parse(healers);
    expect(snapshot.entries).toHaveLength(39);
    for (const assignment of ["tank", "group", "burst"] as const) {
      const entries = rankHealerTierEntries(snapshot, assignment);
      expect(entries).toHaveLength(13);
      expect(new Set(entries.map((row) => row.profile)).size).toBe(4);
      expect(entries.every((row) => row.uncertainty95 >= 0)).toBe(true);
      for (const row of entries) {
        expect(row.metrics.hps).toBeCloseTo(
          row.metrics.effectiveHealingHps + row.metrics.absorbedHps,
          6,
        );
        if (!row.survivalPassed) expect(row.tier).toBe("D");
      }
    }
    const changed = structuredClone(snapshot);
    changed.entries[0]!.metrics.overhealingHps += 1_000_000;
    expect(rankHealerTierEntries(changed, "tank").map((row) => row.id)).toEqual(
      rankHealerTierEntries(snapshot, "tank").map((row) => row.id),
    );
    changed.entries[0]!.demandSha256 = "0".repeat(64);
    expect(healerTierSnapshotSchema.safeParse(changed).success).toBe(false);
  });
  it("loads current rankings without starting engines and hides stale selections", async (): Promise<void> => {
    vi.spyOn(console, "warn").mockImplementation((): void => {});
    const dps = await fixture(raid),
      tank = await fixture(tanksRaid),
      healing = await fixture(healers);
    expect(await readDpsTierScenarioSnapshot("raid", dps.directory, dps.source)).not.toBeNull();
    expect(await readTankTierSnapshot("raid", tank.directory, tank.source)).not.toBeNull();
    expect(await readHealerTierSnapshot(healing.directory, healing.source)).not.toBeNull();
    for (const row of [dps, tank, healing])
      await writeFile(join(row.directory, "qualified-dps-models.json"), "{}");
    expect(await readDpsTierScenarioSnapshot("raid", dps.directory, dps.source)).toBeNull();
    expect(await readTankTierSnapshot("raid", tank.directory, tank.source)).toBeNull();
    expect(await readHealerTierSnapshot(healing.directory, healing.source)).toBeNull();
  });
  it("rejects relabeled support, changed workloads, duplicate and escaped bindings", async (): Promise<void> => {
    vi.spyOn(console, "warn").mockImplementation((): void => {});
    const value = await fixture(healers);
    value.source.entries[0]!.metrics.plannedIncomingPostMitigationDamage += 1;
    expect(await readHealerTierSnapshot(value.directory, value.source)).toBeNull();
    const dps = await fixture(raid);
    expect(await readDpsTierScenarioSnapshot("solo", dps.directory, dps.source)).toBeNull();
    await expect(
      verifyTierSourceBindings(value.directory, [
        { path: "../outside.json", sha256: "0".repeat(64) },
      ]),
    ).rejects.toThrow(/escaped/);
    const entry = value.source.sourceBindings[0]!;
    await expect(verifyTierSourceBindings(value.directory, [entry, entry])).rejects.toThrow(
      /Duplicate/,
    );
  });
  it("rejects scores relabeled to another build or model even when selection bindings match", async (): Promise<void> => {
    vi.spyOn(console, "warn").mockImplementation((): void => {});
    const dps = await fixture(raid);
    dps.source.entries[0]!.originalHrefSha256 = "0".repeat(64);
    expect(await readDpsTierScenarioSnapshot("raid", dps.directory, dps.source)).toBeNull();
    const tank = await fixture(tanksRaid);
    tank.source.entries[0]!.proofSha256 = "0".repeat(64);
    expect(await readTankTierSnapshot("raid", tank.directory, tank.source)).toBeNull();
    const healer = await fixture(healers);
    healer.source.entries[0]!.modelIdentity = "0".repeat(64);
    expect(await readHealerTierSnapshot(healer.directory, healer.source)).toBeNull();
  });
});
