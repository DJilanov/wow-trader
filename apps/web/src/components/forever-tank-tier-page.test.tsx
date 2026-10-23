import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import solo from "../lib/data/forever-tank-tier-list.solo.json";
import raid from "../lib/data/forever-tank-tier-list.raid.json";
import { optimizedTankRankingFixture } from "../lib/fixtures/optimized-tank-ranking";
import { createOptimizedTankTierSnapshot } from "../lib/forever-optimized-tank-tier-list";
import { tankTierSnapshotSchema } from "../lib/forever-tank-tier-list";
import { readTankTierSnapshot } from "../lib/forever-tank-tier-list-data";
import { ForeverTankTierPage, tankTierMetadata } from "./forever-tank-tier-page";
import { ForeverTankRankingLinks } from "./forever-tank-ranking-links";

vi.mock("../lib/forever-tank-tier-list-data", () => ({ readTankTierSnapshot: vi.fn() }));
beforeEach(() => {
  vi.mocked(readTankTierSnapshot).mockImplementation(async (scenario) =>
    tankTierSnapshotSchema.parse(scenario === "solo" ? solo : raid),
  );
});
describe("tank ranking pages", () => {
  it.each(["solo", "raid"] as const)(
    "renders %s scores, evidence, all four ranking links and indexable metadata in server HTML",
    async (scenario): Promise<void> => {
      const html = renderToStaticMarkup(await ForeverTankTierPage({ scenario }));
      expect(html).toContain(`data-tank-scenario="${scenario}"`);
      expect(html).toContain('aria-label="Tank tier board"');
      expect(html.match(/data-tier-build=/g)).toHaveLength(3);
      expect(html).toContain("Threat generation");
      expect(html).toContain("Damage taken");
      expect(html).toContain("Detailed tank rankings");
      expect(html).not.toContain("Not ranked yet");
      expect(html).toContain('data-tier-build="protection-paladin"');
      expect(html).toContain("How this build generates threat");
      expect(html).toContain("inherited and unverified");
      expect(html).toContain("Feral Instinct increases Swipe damage, not Bear threat");
      for (const entry of scenario === "solo" ? solo.entries : raid.entries) {
        expect(html).toContain(`/tools${entry.benchmarkHref}`);
        expect(html).toContain(entry.metrics.threat.avg.toFixed(1));
        expect(html).toContain(entry.metrics.dtps.avg.toFixed(1));
      }
      for (const path of [
        "/forever/tier-list",
        "/forever/tier-list/solo",
        "/forever/tier-list/tanks",
        "/forever/tier-list/tanks/solo",
      ])
        expect(html).toContain(`href="${path}"`);
      const metadata = await tankTierMetadata(scenario);
      expect(metadata.alternates?.canonical).toBe(
        `https://kfcguild.online/tools/forever/tier-list/tanks${scenario === "solo" ? "/solo" : ""}`,
      );
      expect(metadata.robots).not.toEqual(expect.objectContaining({ index: false }));
      expect(html).toContain('"numberOfItems":3');
    },
  );
  it("describes optimized setups and independent validation consistently in HTML and metadata", async (): Promise<void> => {
    const snapshot = createOptimizedTankTierSnapshot("raid", await optimizedTankRankingFixture());
    vi.mocked(readTankTierSnapshot).mockResolvedValue(snapshot);
    const html = renderToStaticMarkup(await ForeverTankTierPage({ scenario: "raid" }));
    expect(html).toContain("Optimized setups");
    expect(html).toContain("40,000 fights per setup");
    expect(html).toContain("Every admitted item is compared");
    expect(html).toContain("no minimum-health requirement");
    expect(html).not.toContain("Same starter foundation");
    expect(html).toContain('"numberOfItems":3');
    expect((await tankTierMetadata("raid")).description).toContain(
      "40,000 validation fights per optimized setup",
    );
  });
  it("hides stale scores and disables indexing if the tank engine or measurements are unavailable", async (): Promise<void> => {
    vi.mocked(readTankTierSnapshot).mockResolvedValue(null);
    const html = renderToStaticMarkup(await ForeverTankTierPage({ scenario: "raid" }));
    expect(html).toContain("Tank rankings are being refreshed");
    expect(html).not.toContain("Tank tier board");
    expect((await tankTierMetadata("raid")).robots).toEqual(
      expect.objectContaining({ index: false }),
    );
  });
  it("makes both lists discoverable from the Helper and simulator entry points", () => {
    const html = renderToStaticMarkup(createElement(ForeverTankRankingLinks));
    expect(html).toContain('href="/forever/tier-list/tanks/solo"');
    expect(html).toContain('href="/forever/tier-list/tanks"');
  });
  it("ships all three tank portraits with their recorded source checksums", async (): Promise<void> => {
    for (const [name, expected] of [
      ["protection-warrior", "4f68d5dc8edaed51c9d1498c107b188b6d05b81910161e3fd91d8e42cf53d3c3"],
      ["feral-bear", "1021a85689bddb50cd690567030c2b9cc3644ee32f9d64c2f636036c33417261"],
      ["protection-paladin", "d439c66886b477670deecdcfa228663131bc6c086541b3933667fa3f8fe7ba9e"],
    ]) {
      const bytes = await readFile(
        new URL(`../../public/wow-assets/tank-icons/${name}.jpg`, import.meta.url),
      );
      expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected);
    }
  });
});
