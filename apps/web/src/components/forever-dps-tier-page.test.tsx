import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import solo from "../lib/data/forever-dps-tier-list.solo.json";
import raid from "../lib/data/forever-dps-tier-list.raid.json";
import { dpsTierSnapshotSchema } from "../lib/forever-dps-tier-list";
import { readDpsTierScenarioSnapshot } from "../lib/forever-dps-tier-list-data";
import { ForeverDpsTierPage, dpsTierMetadata } from "./forever-dps-tier-page";

vi.mock("../lib/forever-dps-tier-list-data", () => ({ readDpsTierScenarioSnapshot: vi.fn() }));
beforeEach(() => {
  vi.mocked(readDpsTierScenarioSnapshot).mockImplementation(async (scenario) =>
    dpsTierSnapshotSchema.parse(scenario === "solo" ? solo : raid),
  );
});
describe("server-rendered Solo/Raid pages", () => {
  it.each(["solo", "raid"] as const)(
    "renders the %s ranking, canonical and scenario controls consistently",
    async (scenario): Promise<void> => {
      const html = renderToStaticMarkup(await ForeverDpsTierPage({ scenario }));
      const text = html.replace(/<[^>]*>/g, "");
      expect(html).toContain(`data-tier-scenario="${scenario}"`);
      expect(html).toContain("DPS benchmark scenario");
      expect(text).toContain("21 measured builds");
      expect(text).toContain(scenario === "solo" ? "Simulate Solo setup" : "Simulate Raid setup");
      expect(text).not.toContain("no externally supplied boss debuffs");
      const metadata = await dpsTierMetadata(scenario);
      expect(metadata.title).toContain(scenario === "solo" ? "Solo" : "Raid");
      expect(metadata.alternates?.canonical).toBe(
        `https://kfcguild.online/tools/forever/tier-list${scenario === "solo" ? "/solo" : ""}`,
      );
      expect(metadata.robots).not.toEqual(expect.objectContaining({ index: false }));
    },
  );
  it("fails closed with noindex and a useful refresh state when publication evidence is unavailable", async (): Promise<void> => {
    vi.mocked(readDpsTierScenarioSnapshot).mockResolvedValue(null);
    const html = renderToStaticMarkup(await ForeverDpsTierPage({ scenario: "solo" }));
    expect(html).toContain("Rankings are being refreshed");
    expect(html).not.toContain("21 measured builds");
    expect((await dpsTierMetadata("solo")).robots).toEqual(
      expect.objectContaining({ index: false }),
    );
  });
});
