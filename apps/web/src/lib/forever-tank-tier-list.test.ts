import { describe, expect, it } from "vitest";
import solo from "./data/forever-tank-tier-list.solo.json";
import raid from "./data/forever-tank-tier-list.raid.json";
import { rankTankTierEntries, tankTierSnapshotSchema } from "./forever-tank-tier-list";

describe("measured tank ranking", () => {
  it.each([solo, raid])(
    "ranks threat high-first and damage taken low-first without mutating the measurements",
    (source) => {
      const snapshot = tankTierSnapshotSchema.parse(source);
      const before = structuredClone(snapshot);
      const threat = rankTankTierEntries(snapshot, "threat");
      const mitigation = rankTankTierEntries(snapshot, "dtps");
      expect(threat[0]?.profile).toBe("feral_tank_druid");
      expect(mitigation[0]?.profile).toBe("tank_warrior");
      expect(threat.map((entry): number => entry.metrics.threat.avg)).toEqual(
        [...snapshot.entries]
          .sort((left, right): number => right.metrics.threat.avg - left.metrics.threat.avg)
          .map((entry): number => entry.metrics.threat.avg),
      );
      expect(mitigation[0]?.share).toBe(100);
      expect(mitigation[1]?.share).toBeCloseTo(
        (100 * mitigation[0]!.metrics.dtps.avg) / mitigation[1]!.metrics.dtps.avg,
      );
      for (const list of [threat, mitigation]) {
        expect(list[0]?.tier).toBe("S");
        expect(
          list.every(
            (entry): boolean => Number.isFinite(entry.uncertainty95) && entry.uncertainty95 > 0,
          ),
        ).toBe(true);
        expect(list.map((entry): number => entry.rank)).toEqual([1, 2, 3]);
      }
      expect(snapshot).toEqual(before);
    },
  );
  it("includes all three tank starters in separate dungeon and raid encounters", () => {
    const dungeon = tankTierSnapshotSchema.parse(solo);
    const boss = tankTierSnapshotSchema.parse(raid);
    expect(dungeon.policy.targetCount).toBe(3);
    expect(boss.policy.targetCount).toBe(1);
    expect(dungeon.entries.map((entry): string => entry.profile)).toContain("protection_paladin");
    expect(dungeon.entries.map((entry): string => entry.requestSha256)).not.toEqual(
      boss.entries.map((entry): string => entry.requestSha256),
    );
    expect(dungeon.entries.map((entry): string => entry.talents)).toEqual(
      boss.entries.map((entry): string => entry.talents),
    );
  });
  it("shows Righteous Fury on Holy damage and reconciles every action with the measured totals", () => {
    for (const source of [solo, raid]) {
      const snapshot = tankTierSnapshotSchema.parse(source);
      for (const entry of snapshot.entries) {
        expect(
          entry.threatBreakdown.reduce((sum, row): number => sum + row.threatPerSecond, 0),
        ).toBeCloseTo(entry.metrics.threat.avg, 6);
        expect(
          entry.threatBreakdown.reduce((sum, row): number => sum + row.damagePerSecond, 0),
        ).toBeCloseTo(entry.metrics.dps.avg, 6);
      }
      const paladin = snapshot.entries.find(
        (entry): boolean => entry.profile === "protection_paladin",
      )!;
      const consecration = paladin.threatBreakdown.find(
        (row): boolean => row.key === "spell:20924",
      )!;
      expect(consecration.threatPerSecond / consecration.damagePerSecond).toBeCloseTo(1.9, 6);
      const weapon = paladin.threatBreakdown.find(
        (row): boolean => row.key === "other:OtherActionAttack",
      )!;
      expect(weapon.threatPerSecond / weapon.damagePerSecond).toBeCloseTo(1, 6);
    }
  });
  it("rejects invalid metric values, duplicate classes, conflicting scenarios and unsafe imports", () => {
    for (const mutate of [
      (value: typeof solo): void => {
        value.entries[0]!.metrics.dtps.avg = 0;
      },
      (value: typeof solo): void => {
        value.entries[0]!.metrics.threat.stdev = -1;
      },
      (value: typeof solo): void => {
        value.entries[0] = value.entries[1]!;
      },
      (value: typeof solo): void => {
        value.policy.targetCount = 1;
      },
      (value: typeof solo): void => {
        value.entries[0]!.benchmarkHref = "https://untrusted.example/";
      },
      (value: typeof solo): void => {
        value.entries[0]!.benchmarkHref += '" onclick="bad';
      },
      (value: typeof solo): void => {
        value.entries[0]!.threatBreakdown[0]!.threatPerSecond += 1;
      },
    ]) {
      const value = structuredClone(solo);
      mutate(value);
      expect(tankTierSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });
  it("labels statistical near ties without inventing a precise separation", () => {
    const snapshot = tankTierSnapshotSchema.parse(raid);
    snapshot.entries[0]!.metrics.threat.avg = 1000;
    snapshot.entries[1]!.metrics.threat.avg = 1000.001;
    expect(rankTankTierEntries(snapshot)[0]?.closeToNext).toBe(true);
  });
});
