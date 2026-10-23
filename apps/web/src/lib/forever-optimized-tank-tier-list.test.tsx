import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { optimizedTankRankingFixture } from "./fixtures/optimized-tank-ranking";
import { createOptimizedTankTierSnapshot } from "./forever-optimized-tank-tier-list";
import { rankTankTierEntries, tankTierSnapshotSchema } from "./forever-tank-tier-list";
import { ForeverTankTierList } from "../components/forever-tank-tier-list";

// Unit projections use recorded packages for all three classes; runtime publication also verifies the actual files.
describe("optimized tank rankings", () => {
  it.each(["solo", "raid"] as const)(
    "projects both %s objectives from conservative measured builds",
    async (scenario): Promise<void> => {
      const models = await optimizedTankRankingFixture();
      const snapshot = createOptimizedTankTierSnapshot(scenario, models);
      expect(snapshot.entries).toHaveLength(6);
      expect(snapshot.policy.iterations).toBe(40000);
      expect(snapshot.policy.seeds).toEqual([81491001, 82491001]);
      for (const metric of ["threat", "dtps"] as const) {
        const entries = rankTankTierEntries(snapshot, metric);
        expect(entries).toHaveLength(3);
        for (const entry of entries) {
          expect("objective" in entry && entry.objective).toBe(
            metric === "threat" ? "threat" : "mitigation",
          );
          const measured = models
            .find((model): boolean => model.proof.profile === entry.profile)!
            .proof.builds.find(
              (build): boolean =>
                build.scenario === scenario &&
                !build.requiresProvisionalEnchantOptIn &&
                build.objective === (metric === "threat" ? "threat" : "mitigation"),
            )!;
          expect(entry.metrics).toEqual(measured.reference.metrics);
          expect(entry.benchmarkHref).toBe(measured.href);
          expect(entry.threatBreakdown).toEqual(measured.threatBreakdown);
          expect("health" in entry && entry.health).toBe(measured.reference.health);
          expect("gear" in entry && entry.gear.map((item): number => item.id)).toEqual(
            measured.gear.map((item): number => item.id),
          );
        }
      }
      expect(rankTankTierEntries(snapshot, "threat")[0]!.benchmarkHref).not.toBe(
        rankTankTierEntries(snapshot, "dtps")[0]!.benchmarkHref,
      );
    },
  );
  it("renders the measured health, armor, item list and held-out reference explanation", async (): Promise<void> => {
    const snapshot = createOptimizedTankTierSnapshot("raid", await optimizedTankRankingFixture());
    const html = renderToStaticMarkup(createElement(ForeverTankTierList, { snapshot }));
    expect(html).toContain("Pre-raid item search");
    expect(html).toContain("40,000 measured fights");
    expect(html).toContain("Health");
    expect(html).toContain("Armor");
    expect(html).toContain("every item and enchant");
    expect(html).toContain("reference scores pool 40,000 independent validation fights");
    expect(html).toContain("81491001, 82491001");
    expect(html).not.toContain("Blue PvP starters");
    const entry = rankTankTierEntries(snapshot)[0]!;
    expect(html).toContain(`/tools${entry.benchmarkHref}`);
  });
  it("accepts omitted protobuf repeated defaults but rejects actual extra target inputs", async (): Promise<void> => {
    const models = await optimizedTankRankingFixture();
    expect(createOptimizedTankTierSnapshot("raid", models).entries).toHaveLength(6);
    const build = models[0]!.proof.builds.find(
      (candidate): boolean =>
        candidate.scenario === "raid" && !candidate.requiresProvisionalEnchantOptIn,
    )!;
    build.settings.encounter.targets[0]!.targetInputs = [{}];
    expect(() => createOptimizedTankTierSnapshot("raid", models)).toThrow(/encounter/);
  });
  it("rejects incomplete, mismatched and opt-in-only selections", async (): Promise<void> => {
    const models = await optimizedTankRankingFixture();
    expect(() => createOptimizedTankTierSnapshot("raid", models.slice(0, 2))).toThrow(/All three/);
    models[1] = { ...models[1]!, selectionSha256: "0".repeat(64) };
    expect(() => createOptimizedTankTierSnapshot("raid", models)).toThrow(/different engine/);
    const fresh = await optimizedTankRankingFixture();
    fresh[0]!.proof.builds = fresh[0]!.proof.builds.filter(
      (build): boolean => build.requiresProvisionalEnchantOptIn || build.scenario !== "raid",
    );
    expect(() => createOptimizedTankTierSnapshot("raid", fresh)).toThrow(/Missing unique/);
  });
  it("rejects unbalanced encounters, support, healing and malformed score projections", async (): Promise<void> => {
    for (const field of ["encounter", "raidBuffs", "partyBuffs", "debuffs", "tanks"] as const) {
      const models = await optimizedTankRankingFixture();
      const build = models[0]!.proof.builds.find(
        (candidate): boolean =>
          candidate.scenario === "raid" && !candidate.requiresProvisionalEnchantOptIn,
      )!;
      if (field === "encounter") build.settings.encounter.duration = 60;
      else build.settings[field] = {};
      expect(() => createOptimizedTankTierSnapshot("raid", models)).toThrow(/comparison policy/);
    }
    const models = await optimizedTankRankingFixture();
    models[0]!.proof.builds[0]!.settings.player.healingModel = { hps: 9999 };
    expect(() => createOptimizedTankTierSnapshot("raid", models)).toThrow(/healingModel/);
    const snapshot = createOptimizedTankTierSnapshot("raid", await optimizedTankRankingFixture());
    snapshot.entries[0]!.threatBreakdown[0]!.threatPerSecond += 1;
    expect(tankTierSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
});
