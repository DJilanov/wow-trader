import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import {
  activeCampaignActions,
  buildCampaignPlan,
  campaignIncludedLegs,
  type CampaignSource,
} from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { premadeEntryLevel, PREMADE_STOPS, getPremadeQuest } from "./premade.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { prepareCampaignPlan } from "./campaign-preparation.js";
import { gateQuestIds } from "./dungeon-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";

function fixture(): { plan: ReturnType<typeof buildCampaignPlan>; sources: CampaignSource[] } {
  const sources = [115, 116, 117, 10, 11, 13].map((sourceId): CampaignSource => {
    const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === sourceId)!;
    const body =
      sourceId === 13
        ? "step\n.accept 58\nstep\n.complete 58,1\nstep\n.turnin 58"
        : "step\n>>Travel together";
    return { reference, guide: parseGuideChapter(body, reference.id, "a".repeat(64), 70205) };
  });
  return {
    sources,
    plan: prepareCampaignPlan(
      buildCampaignPlan("human", "a".repeat(64), sources, "warrior", { includeLibrary: false }),
      sources,
      {
        starters: { entries: [], routes: [] },
        rewardFacts: [],
        rewardRevision: "synthetic-structure-only",
        rewardBuild: null,
        rewardNotice: null,
        combat: null,
      },
    ),
  };
}

describe("Stockade before the Wetlands preparation", () => {
  it("keeps the Lakeshire pickup briefing readable across an optional XP boundary", () => {
    const { plan } = fixture();
    const initial = emptyPremadeProgress();
    const progress = {
      ...initial,
      members: initial.members.map((member) => ({
        ...member,
        level: 23,
        currentXp: 26841,
        xpNeedsUpdate: false,
      })),
    };
    const briefing = plan.actions.find((action) => action.id === "redridge-kill-batch-brief")!;
    const leg = plan.legs.find((entry) => entry.id === briefing.legId)!;
    const forecast = forecastCampaignXp(
      { ...plan, actions: [briefing], legs: [{ ...leg, actionIds: [briefing.id], questIds: [] }] },
      progress,
      {
        initialBounds: progress.members.map(() => ({
          minimum: { level: 23, currentXp: 26841 },
          maximum: { level: 24, currentXp: 2911 },
        })),
      },
    );
    for (const member of forecast.flatMap((section) => section.members)) {
      expect(member.blockedAtActionId).toBeNull();
      expect(member.knownEndpoint).toEqual({ level: 23, currentXp: 26841 });
      expect(member.combatXp + member.referenceQuestXp + member.estimatedQuestXp).toBe(0);
    }
  });

  it("keeps four first-run pickups before entry and moves the higher-level work afterward", () => {
    const { plan } = fixture(),
      progress = emptyPremadeProgress();
    const actions = activeCampaignActions(plan, progress);
    const entry = actions.findIndex((action) => action.id === "dungeon-stockade-entry");
    expect(entry).toBeGreaterThan(0);
    for (const questId of [386, 377, 387, 391]) {
      const pickup = actions.findIndex((action) =>
        action.questChanges.some(
          (change) => change.questId === questId && change.state === "accepted",
        ),
      );
      expect(pickup, `Missing first-run pickup ${questId}`).toBeGreaterThanOrEqual(0);
      expect(pickup).toBeLessThan(entry);
    }
    expect(actions[entry]!.requiredQuestIds).toEqual([389]);
    expect(
      actions.some((action) =>
        action.questChanges.some((change) => [303, 378].includes(change.questId)),
      ),
    ).toBe(false);
    for (const id of ["stockade-world-returns", "wetlands-early-kills", "wetlands-prerequisites"]) {
      expect(plan.legs.findIndex((leg) => leg.id === id)).toBeGreaterThan(
        plan.legs.findIndex((leg) => leg.id === "dungeon-stockade"),
      );
    }
    const finalWatch = actions.filter((action) =>
      action.questChanges.some((change) => change.questId === 58),
    );
    expect(finalWatch.map((action) => action.questChanges[0]!.state)).toEqual([
      "accepted",
      "objectives-complete",
      "rewarded",
    ]);
    expect(finalWatch.every((action) => action.legId === "stockade-world-returns")).toBe(true);
  });

  it("preserves the opt-in Fury prerequisite and its actual combat preparation floor", () => {
    const { plan } = fixture(),
      progress = { ...emptyPremadeProgress(), selectedExtras: { "378": true } };
    const actions = activeCampaignActions(plan, progress);
    expect(
      campaignIncludedLegs(plan, progress).some((leg) => leg.id === "stockade-fury-preparation"),
    ).toBe(true);
    expect(
      premadeEntryLevel(
        PREMADE_STOPS.find((stop) => stop.id === "stockade")!,
        progress,
      ),
    ).toBe(27);
    const parentReward = actions.findIndex((action) =>
      action.questChanges.some((change) => change.questId === 303 && change.state === "rewarded"),
    );
    const pickup = actions.findIndex((action) =>
      action.questChanges.some((change) => change.questId === 378 && change.state === "accepted"),
    );
    expect(parentReward).toBeGreaterThanOrEqual(0);
    expect(pickup).toBeGreaterThan(parentReward);
    expect(gateQuestIds(getPremadeQuest(378)!.gate)).toContain(303);
  });

  it.each([false, true])("keeps native Fury selection consistent when included=%s", (included) => {
    const { plan, sources } = fixture();
    const progress = { ...emptyPremadeProgress(), selectedExtras: { "378": included } };
    const actions = activeCampaignActions(plan, progress);
    const compiled = compileCampaignAddon(plan, actions, {
      version: "0.1.0-test",
      runtimeBuild: 70450,
      interfaceVersion: 16001,
      restedXpVersion: "v4.11.27",
      nativeSources: sources,
      includeObservers: false,
      partyStarter: { race: "human", classSlug: "warrior" },
    });
    const text = compiled.documents
      .filter((document) => document.role === "party")
      .map((document) => document.content)
      .join("\n");
    for (const questId of [303, 378])
      for (const tag of ["accept", "turnin"])
        expect([...text.matchAll(new RegExp(`\\.${tag} ${questId}\\b`, "g"))]).toHaveLength(
          included ? 1 : 0,
        );
  });
});
