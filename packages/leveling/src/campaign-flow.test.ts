import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { attachCampaignMovements, campaignTravelActions } from "./campaign-flow.js";
import { campaignGroundJourney, campaignJourneyInstructions } from "./campaign-transport.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { attachCampaignLocations } from "./campaign-flow-locations.js";

function action(id: string, zone?: string): CampaignAction {
  return {
    id,
    legId: "start-117",
    kind: "instructions",
    title: id,
    instructions: [],
    questChanges: [],
    positions: [],
    source: null,
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
    ...(zone ? { location: { zone } } : {}),
  };
}

function plan(actions: readonly CampaignAction[]): CampaignPlan {
  return {
    release: "flow-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions,
    legs: [
      {
        id: "start-117",
        title: "Loch Modan",
        from: 11,
        to: 13,
        kind: "starter",
        stopId: null,
        actionIds: actions.map((entry) => entry.id),
        questIds: [],
        unresolvedQuestIds: [],
      },
    ],
  };
}

describe("the selected player's travel route", () => {
  it("replaces the final solo Westfall flight with the actual Darkshore handoff, preserving its bookmark", () => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 117)!;
    const guide = parseGuideChapter(
      "step\n.goto Stormwind City,66,62\n.fly Westfall >> Fly to Westfall",
      reference.id,
      "a".repeat(64),
      70205,
    );
    const source: CampaignSource = { reference, guide };
    const transfer = {
      ...action("117-source-step-0084", "1453"),
      source: {
        chapterId: guide.chapterId,
        version: guide.version,
        stepId: guide.steps[0]!.id,
      },
    };
    const route = attachCampaignMovements(plan([action("train", "1453"), transfer]), [source]);
    const next = { ...action("meet", "1439"), legId: "early-darkshore-kills" };
    const result = campaignTravelActions(route, [...route.actions, next]);
    expect(result[1]).toMatchObject({
      id: transfer.id,
      title: "Travel to Darkshore",
      positions: [],
    });
    expect(result[1]!.travelInstructions?.join(" ")).toContain("Stormwind Harbor");
    expect(result[1]!.travelInstructions?.join(" ")).not.toContain("Menethil");
    expect(campaignNativeInstructions(route, [source])(route.actions[1]!)).toBeNull();
  });

  it("does not use a skipped XP-only visit as the origin of the next journey", () => {
    const actions = [action("start", "1453"), action("optional", "1444"), action("next", "1439")];
    const result = campaignTravelActions(
      plan(actions),
      actions,
      (entry) => entry.id !== "optional",
    );
    expect(result[2]!.travelInstructions?.join(" ")).toContain("Stormwind Harbor");
    expect(result[2]!.travelInstructions?.join(" ")).not.toContain("Feralas");
    expect(actions[2]!.travelInstructions).toBeUndefined();
  });

  it("uses named outside returns rather than an inherited solo chapter location", () => {
    const reward: CampaignAction = {
      ...action("return"),
      kind: "quests",
      questChanges: [
        { questId: 2990, title: "Thadius Grimshade", state: "rewarded", objectiveIndex: null },
      ],
    };
    const located = attachCampaignLocations(plan([reward]), []);
    expect(located.actions[0]!.location).toEqual({ zone: "1419" });
  });

  it("gives fresh-server transport fallbacks without assuming flights or a hearth binding", () => {
    expect(campaignGroundJourney("Stormwind", "Ironforge")?.map((leg) => leg.mode)).toEqual([
      "tram",
    ]);
    expect(campaignGroundJourney("1439", "1455")?.[0]?.mode).toBe("boat");
    expect(campaignGroundJourney("Darkshore", "Ironforge")?.map((leg) => leg.mode)).toEqual([
      "boat",
      "tram",
    ]);
    expect(campaignGroundJourney("unknown", "Ironforge")).toBeNull();
    expect(
      campaignGroundJourney("Arathi Highlands", "Stranglethorn Vale")?.every(
        (leg) => leg.mode !== "boat",
      ),
    ).toBe(true);
    expect(campaignJourneyInstructions("Stormwind", "Darkshore", "warrior").join(" ")).toContain(
      "already-unlocked",
    );
    expect(
      campaignJourneyInstructions("The Barrens", "Thousand Needles", null).join(" "),
    ).toContain("instead of jumping");
    expect(campaignJourneyInstructions("Stormwind", "Moonglade", "druid").join(" ")).toContain(
      "Teleport: Moonglade",
    );
    expect(campaignJourneyInstructions("Stormwind", "Stormwind City", null)).toEqual([]);
  });
});
