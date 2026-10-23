import { describe, expect, it } from "vitest";
import snapshotData from "./data/forever-dps-tier-list.json";
import soloData from "./data/forever-dps-tier-list.solo.json";
import raidData from "./data/forever-dps-tier-list.raid.json";
import {
  dpsTier,
  dpsTierSnapshotSchema,
  filterDpsTierEntries,
  rankDpsTierEntries,
} from "./forever-dps-tier-list";

describe("measured Forever DPS rankings", () => {
  it("ranks the same 21 published builds independently in Solo and Raid", () => {
    const solo = rankDpsTierEntries(dpsTierSnapshotSchema.parse(soloData));
    const raid = rankDpsTierEntries(dpsTierSnapshotSchema.parse(raidData));
    expect(solo.map((entry) => entry.id).sort()).toEqual(raid.map((entry) => entry.id).sort());
    expect(solo).toHaveLength(21);
    expect(solo[0]?.id).toBe("warlock-demonology-static");
    expect(raid[0]?.id).toBe("hunter-marksmanship-static");
    expect(solo[0]?.share).toBe(100);
    expect(raid[0]?.share).toBe(100);
    expect(solo.find((entry) => entry.id === "fury-horde")?.dps).toBeLessThan(500);
    expect(raid.find((entry) => entry.id === "fury-horde")?.dps).toBeGreaterThan(800);
    expect(solo.every((entry) => entry.scenario === "solo")).toBe(true);
    expect(raid.every((entry) => entry.scenario === "raid")).toBe(true);
  });
  it("rejects swapped, untagged and relabeled scenario measurements", () => {
    expect(
      dpsTierSnapshotSchema.safeParse({ ...soloData, entries: raidData.entries }).success,
    ).toBe(false);
    const missingTags = structuredClone(soloData);
    for (const entry of missingTags.entries) Reflect.deleteProperty(entry, "scenario");
    expect(dpsTierSnapshotSchema.safeParse(missingTags).success).toBe(false);
    expect(
      dpsTierSnapshotSchema.safeParse({
        ...raidData,
        policy: { ...raidData.policy, scenario: "solo" },
      }).success,
    ).toBe(false);
  });
  it("imports every category, including the recorded iteration count and seed", () => {
    for (const data of [soloData, raidData]) {
      for (const entry of data.entries) {
        const url = new URL(entry.benchmarkHref, "https://kfcguild.online");
        expect(url.search).toBe("?i=gtrcmxeu");
      }
      const incomplete = structuredClone(data);
      incomplete.entries[0]!.benchmarkHref = incomplete.entries[0]!.benchmarkHref.replace(
        "?i=gtrcmxeu",
        "",
      );
      expect(dpsTierSnapshotSchema.safeParse(incomplete).success).toBe(false);
    }
  });
  it("validates the actual measurement snapshot and retains every standard build once", () => {
    const snapshot = dpsTierSnapshotSchema.parse(snapshotData);
    const entries = rankDpsTierEntries(snapshot);
    expect(entries).toHaveLength(21);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(21);
    expect(entries.every((entry) => entry.iterations === 5000)).toBe(true);
    expect(entries.some((entry) => entry.id.endsWith("-procs"))).toBe(false);
    expect(entries[0]?.share).toBe(100);
    expect(entries[0]?.tier).toBe("S");
    expect(entries.map((entry) => entry.dps)).toEqual(
      [...entries.map((entry) => entry.dps)].sort((a, b) => b - a),
    );
    expect(entries.every((entry) => entry.simulatorHref.includes(`?build=${entry.id}`))).toBe(true);
  });

  it("uses declared boundaries, including exact boundaries", () => {
    expect([100, 95, 94.99, 85, 84.99, 70, 69.99, 55, 54.99].map(dpsTier)).toEqual([
      "S",
      "S",
      "A",
      "A",
      "B",
      "B",
      "C",
      "C",
      "D",
    ]);
  });

  it("keeps absolute ranks when filtering and matches class or spec without case sensitivity", () => {
    const entries = rankDpsTierEntries(dpsTierSnapshotSchema.parse(snapshotData));
    const priests = filterDpsTierEntries(entries, "  SHADOW priest ", "priest");
    expect(priests.map((entry) => entry.id)).toEqual(["priest-shadow-static"]);
    expect(priests[0]?.rank).toBe(
      entries.find((entry) => entry.id === "priest-shadow-static")?.rank,
    );
    expect(filterDpsTierEntries(entries, "no such spec", "")).toEqual([]);
    expect(filterDpsTierEntries(entries, "Shadow", "mage")).toEqual([]);
  });

  it("marks nearby estimates without claiming a statistically meaningful order", () => {
    const value = dpsTierSnapshotSchema.parse(snapshotData);
    const first = value.entries[0]!,
      second = value.entries[1]!;
    value.entries = [
      { ...first, dps: 500, stdev: 100 },
      { ...second, dps: 499.99, stdev: 100 },
    ];
    const ranked = rankDpsTierEntries(value);
    expect(ranked[0]?.closeToNext).toBe(true);
    expect(ranked[1]?.closeToNext).toBe(false);
    expect(ranked[0]?.uncertainty95).toBeCloseTo((1.96 * 100) / Math.sqrt(5000));
  });

  it("rejects duplicate, foreign-profile, nonfinite and wrong-policy snapshots", () => {
    const value = dpsTierSnapshotSchema.parse(snapshotData);
    expect(
      dpsTierSnapshotSchema.safeParse({ ...value, entries: [...value.entries, value.entries[0]] })
        .success,
    ).toBe(false);
    for (const patch of [
      { dps: Infinity },
      { dps: 0 },
      { profile: "tank_warrior" },
      { iterations: 25 },
      { benchmarkHref: "https://foreign.invalid/" },
    ])
      expect(
        dpsTierSnapshotSchema.safeParse({ ...value, entries: [{ ...value.entries[0], ...patch }] })
          .success,
      ).toBe(false);
  });
});
