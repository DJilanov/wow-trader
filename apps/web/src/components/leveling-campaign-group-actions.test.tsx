import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createCharacterProfile } from "@wow-trader/leveling";
import { LevelingCampaignPath } from "./leveling-campaign-path";
import { guideTestPlan } from "./leveling-guide.test-fixture";
import { decodeToolGroupDraft } from "../lib/tool-group-draft";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./leveling-provider", () => ({
  useLeveling: () => ({
    session: null,
    loaded: true,
    notice: null,
    storageStatus: "saved",
    workspace: { sessions: [] },
    setDungeonPlan: vi.fn(),
  }),
}));

describe("premade campaign community handoff", (): void => {
  it("keeps the five-player setup and revised campaign in both group actions", (): void => {
    const profile = {
      ...createCharacterProfile("alliance", "human"),
      classSlug: "warrior" as const,
      party: {
        size: 5,
        readiness: "recruiting" as const,
        tank: "unknown" as const,
        healer: "unknown" as const,
      },
    };
    const before = JSON.stringify(profile);
    const html = renderToStaticMarkup(
      <LevelingCampaignPath plan={guideTestPlan()} profile={profile} />,
    );
    const links = [...html.matchAll(/href="([^"]+)"/g)]
      .map((match) => match[1]!.replaceAll("&amp;", "&"))
      .filter((href) => href.startsWith("https://www.wowforeverdiscord.online/"));
    expect(links).toHaveLength(2);
    expect(html).toContain("Find a group");
    expect(html).toContain("Host this plan");
    for (const href of links) {
      const url = new URL(href);
      const draft = decodeToolGroupDraft(url.searchParams.get("draft"));
      expect(draft).toMatchObject({
        version: 1,
        kind: "leveling",
        faction: "Alliance",
        capacity: 5,
        label: "Human premade leveling",
      });
      const source = new URL(draft!.sourceUrl);
      expect(source.pathname).toBe("/tools/forever/leveling/routes/alliance-human");
      expect(source.searchParams.get("plan")).toBe("premade");
      expect(source.searchParams.get("class")).toBe("warrior");
      expect(JSON.parse(source.searchParams.get("setup")!)).toEqual(profile);
      expect([...source.searchParams.keys()].sort()).toEqual(["class", "plan", "setup"]);
      expect(source.hash).toBe("");
    }
    expect(JSON.stringify(profile)).toBe(before);
  });

  it("does not advertise an implicit group from a solo browsing profile", (): void => {
    const html = renderToStaticMarkup(
      <LevelingCampaignPath
        plan={guideTestPlan()}
        profile={createCharacterProfile("alliance", "human")}
      />,
    );
    expect(html).not.toContain("Play this plan with other people");
    expect(html).not.toContain("Host this plan");
  });
});
