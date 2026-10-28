import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ForeverHelperPage from "../app/forever/page";
import ForeverSimulatorPage from "../app/forever/simulator/page";

vi.mock("../lib/forever-simulator", () => ({ readSimulatorManifest: vi.fn(async () => null) }));
vi.mock("../lib/healer-simulator", () => ({
  isHealerSimulatorAvailable: vi.fn(async () => false),
}));
vi.mock("../lib/paladin-healer-simulator", () => ({
  isPaladinHealerAvailable: vi.fn(async () => false),
}));
vi.mock("../lib/shaman-healer-simulator", () => ({
  isShamanHealerAvailable: vi.fn(async () => false),
}));

describe("crawlable DPS ranking discovery", () => {
  it("links both scenarios from the Forever hub and simulator directory without requiring hydration", async () => {
    for (const page of [
      ForeverHelperPage(),
      await ForeverSimulatorPage({ searchParams: Promise.resolve({}) }),
    ]) {
      const html = renderToStaticMarkup(page);
      expect(html).toMatch(
        /href="\/forever\/tier-list\/solo"[^>]*>.*?WoW Forever Solo DPS rankings/s,
      );
      expect(html).toMatch(/href="\/forever\/tier-list"[^>]*>.*?WoW Forever Raid DPS rankings/s);
      expect(html).toContain('aria-label="Compare WoW Forever DPS"');
      expect(html).toContain('href="/forever/tier-list/healers"');
    }
  });
});
