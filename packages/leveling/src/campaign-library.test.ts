import { describe, expect, it } from "vitest";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter } from "./guide-archive.js";
import { createCharacterProfile } from "./profile.js";
import { buildCampaignQuestLibrary, classifyLibraryObjective } from "./campaign-library.js";
import { integrateCampaignQuestLibrary, nearbyLibraryQuest } from "./campaign-library-route.js";
import {
  campaignOptionalXpReady,
  activeCampaignActions,
  type CampaignPlan,
  type CampaignAction,
} from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";

const profile = {
  ...createCharacterProfile(),
  xpRate: 1,
  classSlug: "warrior" as const,
  party: { size: 5, readiness: "together" as const, tank: "yes" as const, healer: "yes" as const },
};
function library(body: string): ReturnType<typeof buildCampaignQuestLibrary> {
  const reference = CHAPTER_REFERENCES.find((entry) => entry.sourceId === 128)!;
  return buildCampaignQuestLibrary(
    [{ reference, guide: parseGuideChapter(body, reference.id, "a".repeat(64), 70205) }],
    profile,
    [],
  );
}
function step(id: string): CampaignAction {
  return {
    id,
    legId: "redridge-kill-batch",
    title: id,
    instructions: [],
    questChanges: [],
    positions: [],
    source: null,
    kind: "instructions",
    leaderOnly: false,
    targetLevel: null,
    targetStopId: null,
    raidOnly: false,
  };
}
function base(): CampaignPlan {
  return {
    release: "library-test",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions: [step("brief")],
    legs: [
      {
        id: "redridge-kill-batch",
        title: "Redridge",
        from: 20,
        to: 26,
        kind: "xp-bridge",
        stopId: null,
        actionIds: ["brief"],
        questIds: [],
        unresolvedQuestIds: [],
      },
    ],
  };
}
const kills =
  "step\n.accept 400001 >> Accept Gnoll Patrol\nstep\n>>Kill gnolls\n.complete 400001,1\n.mob Redridge Gnoll\nstep\n.turnin 400001 >> Turn in Gnoll Patrol";

describe("full source kill-first quest backbone", () => {
  it("inserts complete kill quests even while numeric reward collection is pending", () => {
    const original = base();
    const plan = integrateCampaignQuestLibrary(original, library(kills), new Set());
    expect(plan.library?.choices).toMatchObject([
      { questId: 400001, role: "kill-loop", legId: "redridge-kill-batch" },
    ]);
    expect(plan.actions).toHaveLength(4);
    expect(plan.actions[0]).toEqual(original.actions[0]);
    expect(plan.release).toBe(original.release);
    expect(
      plan.actions.flatMap((action) => action.questChanges.map((change) => change.state)),
    ).toEqual(["accepted", "objectives-complete", "rewarded"]);
    expect(plan.rewardFacts).toBeUndefined();
  });
  it("distinguishes named trophies from multi-item farms without claiming guaranteed drops", () => {
    const quests = library(kills.replace("Kill gnolls", "Kill Gnarl. Loot him for his Head"));
    expect(quests[0]?.objective).toBe("named-trophy");
    const plan = integrateCampaignQuestLibrary(base(), quests, new Set());
    expect(
      plan.actions.some((action) =>
        action.instructions.some((line) => line.includes("No guaranteed drop rate")),
      ),
    ).toBe(true);
    const farm = library(kills.replace("Kill gnolls", "Kill gnolls. Loot them for 10 Claws"));
    expect(farm[0]?.objective).toBe("collection");
    expect(integrateCampaignQuestLibrary(base(), farm, new Set()).actions).toHaveLength(1);
  });
  it("does not confuse event combat, escorts or item use with a shared-kill objective", () => {
    expect(classifyLibraryObjective("Use the widget\nKill enemies if they aggro", [])).toBe(
      "unclassified",
    );
    expect(classifyLibraryObjective("Escort the scholar\nKill the attackers", [])).toBe(
      "unclassified",
    );
    expect(
      library(kills.replace(".complete 400001,1", ".use 123\n.complete 400001,1"))[0]?.objective,
    ).toBe("unclassified");
  });
  it("uses a clear alternate objective instead of an ambiguous mixed-quest step", () => {
    const body =
      kills.replace(
        ">>Kill gnolls\n.complete 400001,1",
        ">>Kill gnolls and loot supplies\n.complete 400002,1\n.complete 400001,1",
      ) + "\nstep\n>>Kill gnolls\n.complete 400001,1\n.mob Redridge Gnoll";
    expect(library(body).find((quest) => quest.questId === 400001)?.objective).toBe("shared-kills");
  });
  it("recognizes explicit NPC kill counters without treating a neighboring item quota as a kill quest", () => {
    const body = kills.replace(
      ">>Kill gnolls\n.complete 400001,1\n.mob Redridge Gnoll",
      ">>Kill gnolls and loot their claws\n.complete 400001,1 >> Redridge Gnoll (10)\n.mob Redridge Gnoll\n.complete 400002,1 >> Gnoll Claw (10)\n.mob Redridge Gnoll",
    );
    const quests = library(body);
    expect(quests.find((quest) => quest.questId === 400001)?.objective).toBe("shared-kills");
    expect(quests.find((quest) => quest.questId === 400002)?.objective).toBe("unclassified");
  });
  it("retains source-chain lead-ins and their order instead of offering a locked child alone", () => {
    const body =
      "step\n.accept 400010 >> Accept Report\nstep\n.turnin 400010 >> Turn in Report\n.accept 400001 >> Accept Gnoll Patrol\nstep\n>>Kill gnolls\n.complete 400001,1\nstep\n.turnin 400001 >> Turn in Gnoll Patrol";
    const plan = integrateCampaignQuestLibrary(base(), library(body), new Set());
    const index = (id: number, state: string): number =>
      plan.actions.findIndex((action) =>
        action.questChanges.some((change) => change.questId === id && change.state === state),
      );
    expect(index(400010, "rewarded")).toBeLessThan(index(400001, "accepted"));
    expect(plan.library?.choices.find((choice) => choice.questId === 400010)?.role).toBe(
      "prerequisite",
    );
    expect(
      plan.actions.find((action) => action.libraryQuestId === 400001)?.requiredQuestIds,
    ).toEqual([400010]);
  });
  it("holds low-drop prerequisite farms for optional kills but preserves required dungeon unlocks", () => {
    const body =
      "step\n.accept 400010 >> Accept Claws\nstep\n>>Loot 10 claws\n.complete 400010,1\nstep\n.turnin 400010 >> Turn in Claws\n.accept 400001 >> Accept Gnoll Patrol\nstep\n>>Kill gnolls\n.complete 400001,1\nstep\n.turnin 400001 >> Turn in Gnoll Patrol";
    const quests = library(body);
    expect(integrateCampaignQuestLibrary(base(), quests, new Set()).actions).toHaveLength(1);
    const original = {
      ...base(),
      actions: [
        ...base().actions,
        {
          ...step("required"),
          questChanges: [
            {
              questId: 400001,
              title: "Required",
              state: "accepted" as const,
              objectiveIndex: null,
            },
          ],
        },
      ],
    };
    const mandatory = integrateCampaignQuestLibrary(original, quests, new Set([400001]));
    expect(
      mandatory.actions.some(
        (action) => action.libraryQuestId === 400010 && action.libraryRequired,
      ),
    ).toBe(true);
  });
  it("does not mistake .collect-only personal quotas for free courier XP", () => {
    const body =
      "step\n.accept 400010 >> Accept Necklaces\nstep\n.collect 1234,10,400010\nstep\n.turnin 400010 >> Turn in Necklaces";
    expect(library(body)[0]?.objective).toBe("collection");
  });
  it("holds missing objectives and timed events instead of inventing a short free hand-in", () => {
    const quest = library(
      "step\n.accept 400020 >> Accept Unknown Trial\nstep\n.isQuestComplete 400020\n.turnin 400020 >> Turn in Unknown Trial",
    )[0]!;
    expect(quest.held).toBe(true);
    expect(classifyLibraryObjective("Click the altar\nWait for three waves", [])).toBe(
      "unclassified",
    );
  });
  it("includes nearby short hand-ins but does not add a distant courier trip", () => {
    const body =
      "step\n.goto Redridge,50,50\n.accept 400020 >> Accept Report\nstep\n.goto Redridge,52,51\n.turnin 400020 >> Turn in Report";
    const quests = library(body);
    const camp = {
      ...step("camp"),
      positions: quests[0]!.actions[0]!.positions,
      questChanges: [
        {
          questId: 400030,
          title: "Camp",
          state: "objectives-complete" as const,
          objectiveIndex: 1,
        },
      ],
    };
    const original = { ...base(), actions: [...base().actions, camp] };
    expect(nearbyLibraryQuest(quests[0]!, [camp])).toBe(true);
    expect(
      integrateCampaignQuestLibrary(original, quests, new Set()).library?.choices[0]?.role,
    ).toBe("nearby-quest");
    const distant = library(body.replace("52,51", "85,85"));
    expect(nearbyLibraryQuest(distant[0]!, [camp])).toBe(false);
    expect(
      integrateCampaignQuestLibrary(original, distant, new Set()).library?.choices[0]?.role,
    ).toBe("held");
    const otherZone = library(body.replaceAll("Redridge", "Wetlands"));
    expect(nearbyLibraryQuest(otherZone[0]!, [camp])).toBe(false);
    const longSpan = {
      ...quests[0]!,
      actions: quests[0]!.actions.map((action, index) =>
        index === 1
          ? { ...action, source: { ...action.source!, stepId: "source-step-0100" } }
          : action,
      ),
    };
    expect(nearbyLibraryQuest(longSpan, [camp])).toBe(false);
  });
  it("hides lead-ins used exclusively by optional raid goals when those goals are off", () => {
    const quests = library(
      "step\n.accept 400020 >> Accept Raid Letter\nstep\n.turnin 400020 >> Turn in Raid Letter\n.accept 400001 >> Accept Raid Mission\nstep\n>>Kill enemies\n.complete 400001,1\nstep\n.turnin 400001 >> Turn in Raid Mission",
    );
    const original = {
      ...base(),
      actions: [
        ...base().actions,
        {
          ...step("raid"),
          raidOnly: true,
          questChanges: [
            {
              questId: 400001,
              title: "Raid Mission",
              state: "accepted" as const,
              objectiveIndex: null,
            },
          ],
        },
      ],
    };
    const plan = integrateCampaignQuestLibrary(original, quests, new Set([400001]));
    expect(plan.actions.some((action) => action.libraryQuestId === 400020 && action.raidOnly)).toBe(
      true,
    );
    expect(
      activeCampaignActions(plan, { ...emptyPremadeProgress(), raidGoals: false }).some(
        (action) => action.libraryQuestId === 400020,
      ),
    ).toBe(false);
  });
  it("holds class-specific work instead of giving five different classes the same class quest", () => {
    const quests = library(kills.replace("step\n.accept", "step << Warrior\n.accept"));
    expect(quests[0]?.held).toBe(true);
    expect(integrateCampaignQuestLibrary(base(), quests, new Set()).actions).toHaveLength(1);
  });
  it("skips unstarted XP loops after dungeon gains, but never abandons an accepted chain or stale member", () => {
    const plan = integrateCampaignQuestLibrary(base(), library(kills), new Set());
    const action = plan.actions.find((entry) => entry.libraryQuestId === 400001)!;
    const state = emptyPremadeProgress();
    state.members = state.members.map((member) => ({
      ...member,
      level: 60,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    expect(campaignOptionalXpReady(plan, state, action)).toBe(true);
    state.members[4]!.xpNeedsUpdate = true;
    expect(campaignOptionalXpReady(plan, state, action)).toBe(false);
    state.members[4]!.xpNeedsUpdate = false;
    state.members[0]!.questStates[400001] = "accepted";
    expect(campaignOptionalXpReady(plan, state, action)).toBe(false);
  });
  it("pays a library reward once and does not change the actual party state", () => {
    const plan = {
      ...integrateCampaignQuestLibrary(base(), library(kills), new Set()),
      rewardFacts: [
        {
          questId: 400001,
          minimumLevel: 20,
          questLevel: 25,
          fullXp: 2500,
          xpByLevel: [],
          status: "available" as const,
          sourceUrl: "https://www.wowhead.com/forever/quest=400001",
          capturedAt: "2026-10-15T00:00:00.000Z",
        },
      ],
    };
    const state = emptyPremadeProgress();
    state.members = state.members.map((member) => ({
      ...member,
      level: 20,
      currentXp: 0,
      xpNeedsUpdate: false,
    }));
    state.members[0]!.questStates[400001] = "rewarded";
    const saved = JSON.stringify(state);
    const forecast = forecastCampaignXp(plan, state)[0]!;
    expect(forecast.members[0]?.referenceQuestXp).toBe(0);
    expect(forecast.members[4]?.referenceQuestXp).toBe(2500);
    expect(forecast.members[4]?.combatXp).toBe(0);
    expect(JSON.stringify(state)).toBe(saved);
    expect(activeCampaignActions(plan, state)).toHaveLength(plan.actions.length);
  });
});
