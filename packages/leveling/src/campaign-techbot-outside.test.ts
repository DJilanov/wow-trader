import { expect, it } from "vitest";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import { emptyPremadeProgress } from "./premade-model.js";
import {
  applyCampaignCombat,
  attachCampaignCombat,
  createCampaignCombatState,
} from "./campaign-combat.js";

it("uses outdoor payout evidence for Techbot's entrance objective in a dungeon package", () => {
  const action: CampaignAction = {
    id: "techbot-objective",
    legId: "dungeon-gnomeregan",
    title: "Save Techbot's Brain!",
    kind: "quests",
    instructions: [],
    source: null,
    positions: [],
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    questChanges: [
      {
        questId: 2922,
        title: "Save Techbot's Brain!",
        state: "objectives-complete",
        objectiveIndex: 1,
      },
    ],
  };
  const plan: CampaignPlan = {
    release: "techbot-environment-control",
    race: "human",
    leaderClass: "warrior",
    targetBuild: 70205,
    actions: [action],
    legs: [
      {
        id: action.legId,
        title: "Gnomeregan",
        from: 26,
        to: 30,
        kind: "dungeon",
        stopId: "gnomeregan",
        actionIds: [action.id],
        questIds: [2922],
        unresolvedQuestIds: [],
      },
    ],
  };
  const reference: CombatDataset = {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "Synthetic environment-selection test; not a server payout sample.",
    provider: {
      repository: "https://example.test/techbot",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      questSha256: "b".repeat(64),
      npcSha256: "c".repeat(64),
      itemSha256: "d".repeat(64),
      limitations: ["Synthetic environment-selection fixture"],
    },
    npcs: [
      {
        id: 6231,
        name: "Techbot",
        minimumLevel: 26,
        maximumLevel: 26,
        rank: 1,
        zoneIds: [1],
        xpEligibility: "assumed",
      },
    ],
    quests: [
      {
        questId: 2922,
        creatureIds: [6231],
        itemCreatureIds: [],
        onlyCreatureObjectives: true,
        objectiveText: ["Defeat Techbot."],
        killQuotas: [{ objectiveIndex: 1, npcId: 6231, kills: 1, source: "Synthetic quota" }],
      },
    ],
    killXpEvidence: (["outdoor", "dungeon"] as const).map((environment) => ({
      npcId: 6231,
      build: 70205,
      playerLevel: 26,
      mobLevel: 26,
      partySize: 5,
      partyLevels: [26, 26, 26, 26, 26],
      environment,
      unrestedXpPerPlayer: environment === "outdoor" ? 100 : 24,
      sampleCount: 3,
      contextVerified: true,
      source: `Synthetic ${environment} test control`,
    })),
    dungeons: [],
  };
  const attached = attachCampaignCombat(plan, [], reference, "techbot-environment-test");
  expect(attached.combat!.activities).toHaveLength(1);
  const activity = attached.combat!.activities[0]!;
  expect(activity.environment).toBe("outdoor");
  const result = applyCampaignCombat({
    activity,
    combat: attached.combat!,
    state: createCampaignCombatState(attached.combat!, emptyPremadeProgress().members[0]!),
    questStates: { "2922": "accepted" },
    position: { level: 26, currentXp: 0 },
    partySize: 5,
    partyLevels: [26, 26, 26, 26, 26],
    playerIndex: 0,
    synchronizedParty: true,
  });
  expect(result.xp).toBe(100);
  expect(result.rows[0]).toMatchObject({
    npcId: 6231,
    environment: "outdoor",
    kills: 1,
    basis: "observed",
  });
});
