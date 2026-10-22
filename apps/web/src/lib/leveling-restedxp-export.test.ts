import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { restedXpTestFixture } from "./leveling-restedxp.test-fixture";
vi.mock("./leveling-campaign", () => ({
  getLevelingCampaign: vi.fn(),
  getLevelingCampaignExportSources: vi.fn(),
}));
import { getLevelingCampaign, getLevelingCampaignExportSources } from "./leveling-campaign";
import {
  buildCampaignReviewExport,
  campaignReviewAddonZip,
  restedXpReviewExportAvailable,
} from "./leveling-restedxp-export";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getLevelingCampaign).mockResolvedValue(restedXpTestFixture().plan);
  vi.mocked(getLevelingCampaignExportSources).mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe("canonical website RestedXP export", () => {
  it("keeps all export access off by default and never opens an unreviewed public download", () => {
    vi.stubEnv("LEVELING_RESTEDXP_REVIEW_EXPORT", "");
    expect(restedXpReviewExportAvailable()).toBe(false);
    vi.stubEnv("LEVELING_RESTEDXP_REVIEW_EXPORT", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(restedXpReviewExportAvailable()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(restedXpReviewExportAvailable()).toBe(false);
  });
  it("generates the same native documents for a paste import and functional guide-only ZIP", async () => {
    const { input } = restedXpTestFixture();
    const result = await buildCampaignReviewExport(input);
    if ("error" in result) throw new Error(result.error);
    expect(result.documents.publication).toBe("review");
    expect(result.documents.selection).toEqual(input.selection);
    const first = campaignReviewAddonZip(result),
      second = campaignReviewAddonZip(result);
    expect(first).toEqual(second);
    const files = unzipSync(first);
    expect(Object.keys(files).sort()).toEqual([
      "KFCForeverGuides/Guides.lua",
      "KFCForeverGuides/KFCForeverGuides.toc",
      "KFCForeverGuides/README.txt",
      "KFCForeverGuides/review.json",
    ]);
    const lua = strFromU8(files["KFCForeverGuides/Guides.lua"]!);
    for (const document of result.documents.documents) expect(lua).toContain(document.content);
    const toc = strFromU8(files["KFCForeverGuides/KFCForeverGuides.toc"]!);
    expect(toc).toContain("Guides.lua");
    expect(toc).not.toContain("Observer.lua");
    expect(toc).not.toContain("SavedVariables");
    expect(lua).toContain("namespace.runtimeBuild = 70450");
    expect(strFromU8(files["KFCForeverGuides/README.txt"]!)).toContain(
      "does not collect observations",
    );
    expect(JSON.parse(strFromU8(files["KFCForeverGuides/review.json"]!)).identity).toBe(
      result.identity,
    );
    const receipt = JSON.parse(strFromU8(files["KFCForeverGuides/review.json"]!));
    expect(receipt.edition.leader).toEqual({ race: input.race, classSlug: input.classSlug });
    expect(receipt.guideSummaries).toEqual(result.artifact.guides);
    for (const summary of result.artifact.guides) {
      const emittedIds = result.documents.documents
        .filter((document) => document.role === summary.role)
        .flatMap((document) => document.actionIds);
      expect(emittedIds).toEqual(summary.actionIds);
      expect(summary.normalizations).toEqual([]);
      expect(summary.requestedActionIds).toEqual(summary.actionIds);
    }
  });
  it("rejects stale route content or selected actions instead of exporting a different plan", async () => {
    const { input } = restedXpTestFixture();
    expect(await buildCampaignReviewExport({ ...input, routeRelease: "old" })).toEqual({
      error: "route_changed",
    });
    expect(await buildCampaignReviewExport({ ...input, actionSha256: "0".repeat(64) })).toEqual({
      error: "route_changed",
    });
    expect(getLevelingCampaignExportSources).not.toHaveBeenCalled();
  });
  it("does not invent instructions when authorized sources disappear", async () => {
    vi.mocked(getLevelingCampaignExportSources).mockResolvedValue(null);
    expect(await buildCampaignReviewExport(restedXpTestFixture().input)).toEqual({
      error: "export_unavailable",
    });
  });
});
