import {
  classSlugs,
  validateRoute,
  type DungeonLevelProfile,
  type LevelingQuest,
  type RouteStep,
} from "./model.js";

export const DUNGEON_LEVEL_SOURCE =
  "https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location";
export const BETA_NOTES_SOURCE =
  "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-1/2360696/4";
export const LEVELING_EVIDENCE = {
  clientBuild: 70205,
  capturedAt: "2026-10-04T10:18:48.000Z",
  definitionsRevision: "3e46d21a41a07ce7e63835fd79c561e0d5dce92b",
  hotfixSha256: "513d4ee593b2b2d9d24819288b5316383ece102cef988a64a3978f21c65fef4b",
  curveSha256: "935253a23756f0ab7a760e8e4ab22184e1aca49285944ea68efc0a8820e459e6",
  curveSource: "gametables/xp.txt · Total column · current client extraction",
  runtimeCurveConfirmed: false,
  questRewardsConfirmed: false,
  betaLevelCap: 30,
} as const;

const curveValues = [
  400, 900, 1400, 2100, 2800, 3600, 4500, 5400, 6500, 7600, 8800, 10100, 11400, 12900, 14400, 16000,
  17700, 19400, 21300, 23200, 25200, 27300, 29400, 31700, 34000, 36400, 38900, 41400, 44300, 47400,
];
export const FOREVER_XP_CURVE: Readonly<Record<number, number>> = Object.fromEntries(
  curveValues.map((xp, index) => [index + 1, xp]),
);

export const DUNGEON_LEVELS: readonly DungeonLevelProfile[] = [
  {
    id: "ragefire",
    name: "Ragefire Chasm",
    hard: 9,
    medium: 12,
    atLevel: 14,
    easy: 19,
    availableInBeta: true,
    questIds: [],
  },
  {
    id: "thanes",
    name: "Hall of Thanes",
    hard: 11,
    medium: 13,
    atLevel: 14,
    easy: 19,
    availableInBeta: true,
    questIds: [96395, 96403, 96394, 96393, 98423],
  },
  {
    id: "wailing",
    name: "Wailing Caverns",
    hard: 15,
    medium: 17,
    atLevel: 19,
    easy: 24,
    availableInBeta: true,
    questIds: [],
  },
  {
    id: "deadmines",
    name: "The Deadmines",
    hard: 14,
    medium: 17,
    atLevel: 19,
    easy: 24,
    availableInBeta: true,
    questIds: [168, 167, 2040, 214, 166, 92753],
  },
  {
    id: "lordaeron",
    name: "Ruins of Lordaeron",
    hard: 15,
    medium: 17,
    atLevel: 19,
    easy: 24,
    availableInBeta: true,
    questIds: [],
  },
  {
    id: "shadowfang",
    name: "Shadowfang Keep",
    hard: 18,
    medium: 21,
    atLevel: 23,
    easy: 28,
    availableInBeta: true,
    questIds: [],
  },
  {
    id: "blackfathom",
    name: "Blackfathom Deeps",
    hard: 21,
    medium: 23,
    atLevel: 25,
    easy: 30,
    availableInBeta: true,
    questIds: [],
  },
  {
    id: "stockade",
    name: "The Stockade",
    hard: 22,
    medium: 24,
    atLevel: 26,
    easy: 30,
    availableInBeta: true,
    questIds: [],
  },
  {
    id: "excavation",
    name: "Excavation Site: Wetlands",
    hard: 24,
    medium: 27,
    atLevel: 29,
    easy: 31,
    availableInBeta: true,
    questIds: [],
  },
  {
    id: "gnomeregan",
    name: "Gnomeregan",
    hard: 25,
    medium: 30,
    atLevel: 33,
    easy: 38,
    availableInBeta: true,
    questIds: [],
  },
  {
    id: "razorfen-kraul",
    name: "Razorfen Kraul",
    hard: 25,
    medium: 28,
    atLevel: 31,
    easy: 34,
    availableInBeta: true,
    questIds: [],
  },
  {
    id: "scarlet",
    name: "Scarlet Monastery (all wings)",
    hard: 26,
    medium: 32,
    atLevel: 37,
    easy: 45,
    availableInBeta: true,
    questIds: [],
  },
  {
    id: "razorfen-downs",
    name: "Razorfen Downs",
    hard: 35,
    medium: 37,
    atLevel: 39,
    easy: 44,
    availableInBeta: true,
    questIds: [],
  },
  {
    id: "uldaman",
    name: "Uldaman",
    hard: 37,
    medium: 40,
    atLevel: 42,
    easy: 47,
    availableInBeta: true,
    questIds: [],
  },
];

function quest(
  id: number,
  title: string,
  minimumLevel: number,
  pickup: string,
  objective: string,
  turnin: string,
  sharedWork = "",
  prerequisiteIds: number[] = [],
): LevelingQuest {
  return {
    id,
    title,
    minimumLevel,
    pickup,
    objective,
    objectiveIndexes: id === 38 ? [1, 2, 3, 4] : [1],
    turnin,
    sharedWork,
    prerequisiteIds,
    faction: "alliance",
    evidence: "reference",
    xp: null,
  };
}

const defias = [65, 132, 135, 141, 142, 155];
const toxicSoil = [92742, 92744, 92745, 92747, 92748, 92749, 92750, 92751, 92752];
const quests: LevelingQuest[] = [
  quest(
    64,
    "The Forgotten Heirloom",
    9,
    "Farmer Furlbrow · northern Westfall",
    "Recover the pocket watch from Furlbrow's Wardrobe.",
    "Farmer Furlbrow",
    "Check the wardrobe while passing; include only your remaining wait.",
  ),
  quest(
    151,
    "Poor Old Blanchy",
    9,
    "Verna Furlbrow · northern Westfall",
    "Gather eight handfuls of oats.",
    "Verna Furlbrow",
    "Gather on an existing path before budgeting a dedicated oats loop.",
  ),
  quest(
    9,
    "The Killing Fields",
    9,
    "Farmer Saldean · Saldean's Farm",
    "Defeat twenty Harvest Watchers.",
    "Farmer Saldean",
    "Watchers also provide Okra for Westfall Stew and oil for Keeper of the Flame.",
  ),
  quest(
    22,
    "Goretusk Liver Pie",
    9,
    "Salma Saldean · Saldean's Farm",
    "Collect eight Goretusk Livers.",
    "Salma Saldean",
    "Boar kills overlap with the snouts needed for Westfall Stew.",
  ),
  quest(
    38,
    "Westfall Stew",
    9,
    "Salma Saldean · Saldean's Farm",
    "Collect the stew ingredients.",
    "Salma Saldean",
    "Combine birds, boars, Watchers and murlocs into one outdoor block.",
  ),
  quest(
    102,
    "Patrolling Westfall",
    8,
    "Captain Danuvin · Sentinel Hill",
    "Collect eight Gnoll Paws.",
    "Captain Danuvin",
    "Include only the gnoll kill XP you will actually lose by skipping.",
  ),
  quest(
    103,
    "Keeper of the Flame",
    10,
    "Captain Grayson · Westfall Lighthouse",
    "Gather five Flasks of Oil.",
    "Captain Grayson",
    "Retain the oil already collected during Watcher kills.",
  ),
  quest(
    153,
    "Red Leather Bandanas",
    9,
    "Gryan Stoutmantle · Sentinel Hill",
    "Collect Red Leather Bandanas from Defias.",
    "Gryan Stoutmantle",
    "Keep pending confirmation of the Red Silk Bandanas unlock condition.",
  ),
  ...defias.map((id, index) =>
    quest(
      id,
      "The Defias Brotherhood",
      14,
      "Defias storyline · Sentinel Hill / Lakeshire / Stormwind",
      "Follow the named NPC directions; retain this quest before claiming the final dungeon reward.",
      "The next named NPC in the chain",
      "This preparation remains in the route.",
      index === 0 ? [] : [defias[index - 1]!],
    ),
  ),
  ...toxicSoil.map((id, index) =>
    quest(
      id,
      [
        "Testing the Wells",
        "Murloc Gills",
        "The State of the Mines",
        "Moonbrook Espionage",
        "Explosive Consultation",
        "A Dynamite Plan",
        "Detonation at a Distance",
        "Detonation at a Distance",
        "Explosive Consultation",
      ][index]!,
      9,
      "Alba Fairmoon storyline · Sentinel Hill / Stormwind",
      "Finish this preparation before counting the explosives dungeon reward.",
      "The next named NPC in the chain",
      "Add its time only when the detour introduces this work.",
      index === 0 ? [] : [toxicSoil[index - 1]!],
    ),
  ),
  quest(
    96391,
    "Underground Map",
    9,
    "Dark Iron Map drop · Dun Morogh",
    "Deliver the map to start the incursion lead.",
    "Earthseer Farsen · Dun Morogh",
  ),
  quest(
    96395,
    "An Ancient Grudge",
    14,
    "Ghostly Attendant · Hall of Thanes",
    "Put Faldrim Anvilmar's spirit to rest.",
    "Ghostly Attendant · Hall of Thanes",
  ),
  quest(
    96403,
    "Important Heirlooms",
    14,
    "Thom Filch · Ironforge",
    "Collect the requested heirlooms during this visit.",
    "Thom Filch · Ironforge",
  ),
  quest(
    96394,
    "The Restless Dead",
    15,
    "Afadra Dunwall · Ironforge",
    "Complete the requested kills and Anvilmar objective.",
    "Afadra Dunwall · Ironforge",
  ),
  quest(
    96393,
    "Old Ironforge Incursion",
    15,
    "Earthseer Farsen · Dun Morogh",
    "Defeat Durgen Dirgehammer and recover his head.",
    "King Magni Bronzebeard · Ironforge",
    "Travel for Underground Map is extra unless already planned.",
    [96391],
  ),
  quest(
    98423,
    "The Treaty of Understanding",
    16,
    "Tablet · Reliquary of Kings, Hall of Thanes",
    "Recover the tablet from the vault.",
    "King Magni Bronzebeard · Ironforge",
  ),
  quest(
    168,
    "Collecting Memories",
    14,
    "Wilder Thistlenettle · Stormwind",
    "Recover four Miners' Union Cards in the undead side tunnels.",
    "Wilder Thistlenettle · Stormwind",
    "The side tunnels are before the instance; count their time and kills separately from the clear.",
  ),
  quest(
    167,
    "Oh Brother…",
    15,
    "Wilder Thistlenettle · Stormwind",
    "Recover Thistlenettle's Badge in the side tunnels.",
    "Wilder Thistlenettle · Stormwind",
  ),
  quest(
    2040,
    "Underground Assault",
    15,
    "Shoni the Shilent · Stormwind",
    "Recover the Gnoam Sprecklesprocket from Sneed's Shredder.",
    "Shoni the Shilent · Stormwind",
  ),
  quest(
    214,
    "Red Silk Bandanas",
    14,
    "Scout Riell · Sentinel Hill",
    "Collect ten Red Silk Bandanas in the dungeon.",
    "Scout Riell · Sentinel Hill",
    "Preserve the escort and the conservative leather-bandana gate.",
    [155, 153],
  ),
  quest(
    166,
    "The Defias Brotherhood",
    14,
    "Gryan Stoutmantle · Sentinel Hill",
    "Recover Edwin VanCleef's head.",
    "Gryan Stoutmantle · Sentinel Hill",
    "Earlier Defias stages are mandatory preparation.",
    [155],
  ),
  quest(
    92753,
    "Destruction in Deadmines",
    9,
    "Extra-Destructive Explosives quest item",
    "Plant the explosives at the dungeon forge.",
    "Alba Fairmoon · Sentinel Hill",
    "Charge the full preparation chain if the retained route did not include it.",
    [92752],
  ),
];

function step(
  id: string,
  title: string,
  text: string,
  action: RouteStep["action"] = "instruction",
  questId: number | null = null,
  optional = false,
): RouteStep {
  return { id, title, text, action, questId, optional, level: null, position: null };
}

export const WESTFALL_ROUTE = validateRoute({
  id: "alliance-westfall-13-15",
  version: "0.1.0",
  path: "/forever/leveling/routes/alliance-human/chapters/chapter-125-13-15-westfall",
  title: "Westfall 13–15: a crowd-aware route",
  faction: "alliance",
  classes: [...classSlugs],
  minimumLevel: 13,
  maximumLevel: 15,
  clientBuild: LEVELING_EVIDENCE.clientBuild,
  interfaceVersion: 16001,
  reviewedAt: "2026-10-04T10:18:48.000Z",
  state: "preview",
  quests,
  omittedCandidates: [64, 151, 9, 22, 38, 102],
  rejoin:
    "Sentinel Hill: resume the retained Defias preparation at level 14 or above, then continue to the level-15 checkpoint. Save the Deadmines clear for the level-19 comparison.",
  steps: [
    {
      ...step(
        "arrival",
        "Start at the northern road",
        "Enter Westfall at level 13. Review completed quests, your current XP, training and supplies before choosing a detour.",
        "travel",
      ),
      position: { zone: "Westfall", x: 60, y: 19.4 },
    },
    step(
      "heirloom-pickup",
      "Check the wardrobe opportunity",
      "Take the pocket-watch quest if available. Inspect the crowd before spending time on a separate trip.",
      "accept",
      64,
      true,
    ),
    step(
      "oats-pickup",
      "Gather oats on your existing path",
      "Take Blanchy's quest if you want the outdoor branch. Oats collected while travelling reduce the remaining work.",
      "accept",
      151,
      true,
    ),
    {
      ...step(
        "farm",
        "Move to Saldean's Farm",
        "Review the ingredient quests together. Their overlapping kills belong to one remaining outdoor block.",
        "travel",
      ),
      position: { zone: "Westfall", x: 56.2, y: 30.9 },
    },
    step(
      "watcher-pickup",
      "Review Harvest Watchers",
      "Accept this only for the outdoor branch. Preserve Watcher oil or ingredient work still required by retained quests.",
      "accept",
      9,
      true,
    ),
    step(
      "liver-pickup",
      "Combine boar objectives",
      "Accept the liver task only for the outdoor branch; the same boar kills can also yield stew ingredients.",
      "accept",
      22,
      true,
    ),
    step(
      "stew-pickup",
      "Check stew availability",
      "Ask Salma for the stew task. If she offers the earlier delivery, finish it before continuing; do not assume every breadcrumb is completed.",
      "accept",
      38,
      true,
    ),
    {
      ...step(
        "sentinel",
        "Secure the Sentinel Hill hub",
        "Obtain the flight path and choose a hearth bind that suits your return. Keep class training and essential supplies in the route.",
        "travel",
      ),
      position: { zone: "Westfall", x: 56.5, y: 47.5 },
    },
    step(
      "gnoll-pickup",
      "Review the gnoll block",
      "Accept Captain Danuvin's task for the outdoor branch; add only the remaining kills and paws to the comparison.",
      "accept",
      102,
      true,
    ),
    step(
      "bandana-pickup",
      "Preserve the bandana lead",
      "Keep this preparation if you intend to collect Red Silk Bandanas later. The current unlock condition still needs a beta check.",
      "accept",
      153,
      true,
    ),
    step(
      "remaining-block",
      "Complete or replace the remaining outdoor block",
      "Group boars, birds, Watchers, murlocs and travel. Count completed work once. Replace this block only after the planner passes the visit checkpoint.",
    ),
    step(
      "outdoor-completion",
      "Track the outdoor objectives",
      "Finish only the objectives retained in your plan. Optional rows can be skipped when you take the reviewed alternative.",
    ),
    ...[64, 151, 9, 22, 38, 102].map((id) =>
      step(
        `finish-${id}`,
        `Finish ${quests.find((entry) => entry.id === id)!.title}`,
        quests.find((entry) => entry.id === id)!.objective,
        "complete",
        id,
        true,
      ),
    ),
    step(
      "outdoor-turnins",
      "Collect the retained outdoor rewards",
      "Return to the relevant quest givers for completed tasks. Already earned rewards are excluded from the detour calculation.",
    ),
    ...[9, 22, 38, 64, 151, 102].map((id) =>
      step(
        `reward-${id}`,
        `Turn in ${quests.find((entry) => entry.id === id)!.title}`,
        `Return to ${quests.find((entry) => entry.id === id)!.turnin} when this task is complete.`,
        "turnin",
        id,
        true,
      ),
    ),
    {
      ...step(
        "level-fourteen",
        "Reach level 14 before the default dungeon branch",
        "Retain outdoor XP until level 14. Later Hall of Thanes rewards cannot be used to pass this entry checkpoint.",
        "checkpoint",
      ),
      level: 14,
    },
    step(
      "thanes-detour",
      "Compare Hall of Thanes at level 14",
      "Use the planner to compare Ironforge travel, pickups, group wait, clear and return. Only the two level-14 quests are selected initially; later quest bundles move the visit to 15 or 16.",
    ),
    step(
      "defias-preservation",
      "Retain the Defias unlock chain",
      "At level 14 or above, follow 65 → 132 → 135 → 141 → 142 → 155 when Gryan offers it. A Deadmines reward is unavailable without its preparation.",
    ),
    step(
      "toxic-soil-review",
      "Budget the explosives preparation separately",
      "The Toxic Soil chain is optional for this slice. Keep its earlier murloc work if you plan the explosives quest, and charge new travel and preparation before counting its reward.",
    ),
    step(
      "rejoin",
      "Return to Sentinel Hill",
      "Resume the preserved preparation, check class training and finish remaining retained quests. Do not enter Deadmines solely because a quest can be picked up early.",
    ),
    {
      ...step(
        "level-fifteen",
        "Finish the level-15 checkpoint",
        "Reach level 15 using the retained route or measured catch-up work. This release ends here; it does not provide the next zone route.",
        "checkpoint",
      ),
      level: 15,
    },
  ],
});

export const THANES_ROUTE = validateRoute({
  ...WESTFALL_ROUTE,
  id: "alliance-thanes-14",
  title: "Hall of Thanes: level-14 alternative",
  omittedCandidates: [],
  steps: [
    {
      ...step(
        "entry-check",
        "Reach the planned visit level",
        "Start this alternative only after reaching level 14 and confirming the party and return route.",
        "checkpoint",
      ),
      level: 14,
    },
    step(
      "ironforge",
      "Travel to Ironforge",
      "Use your available flight paths and tram connection. Include the return to Westfall when comparing the trip.",
      "travel",
    ),
    step(
      "heirlooms",
      "Pick up Important Heirlooms",
      "Locate Thom Filch in Old Ironforge and confirm the level-14 pickup on this build.",
      "accept",
      96403,
    ),
    step(
      "group-check",
      "Prepare the five-player party",
      "Check tank, healing, supplies and entrance directions. Record your actual group wait; productive questing is not idle time.",
    ),
    step(
      "grudge",
      "Take An Ancient Grudge inside",
      "Speak with the Ghostly Attendant after the opening room; confirm that this quest is offered at level 14.",
      "accept",
      96395,
    ),
    step(
      "heirloom-objective",
      "Collect the heirlooms during the clear",
      "Gather the quest heirlooms while progressing with the party.",
      "complete",
      96403,
    ),
    step(
      "grudge-objective",
      "Finish the spirit objective",
      "Complete the quest objective with the party.",
      "complete",
      96395,
    ),
    step(
      "grudge-reward",
      "Turn in the spirit quest",
      "Return to the Ghostly Attendant before leaving. Record the actual reward XP and your turn-in level.",
      "turnin",
      96395,
    ),
    step(
      "heirloom-reward",
      "Turn in the heirlooms",
      "Return to Thom Filch and record the actual XP. Later-level quests require a different planned bundle.",
      "turnin",
      96403,
    ),
    step("return-westfall", "Rejoin at Sentinel Hill", WESTFALL_ROUTE.rejoin, "travel"),
  ],
});

export function createThanesBranch(selectedQuestIds: readonly number[]): readonly RouteStep[] {
  const profile = DUNGEON_LEVELS.find((entry) => entry.id === "thanes")!;
  if (selectedQuestIds.some((id) => !profile.questIds.includes(id)))
    throw new Error("Unknown Hall of Thanes quest");
  const selected = new Set(selectedQuestIds);
  const extraQuests = WESTFALL_ROUTE.quests.filter(
    (quest) => selected.has(quest.id) && ![96395, 96403].includes(quest.id),
  );
  const visitLevel = planDungeonLevel(profile, selectedQuestIds, WESTFALL_ROUTE.quests);
  const steps: RouteStep[] = [];
  function questStep(quest: LevelingQuest, action: "accept" | "complete" | "turnin"): RouteStep {
    return step(
      `${action}-${quest.id}`,
      `${action === "accept" ? "Pick up" : action === "complete" ? "Complete" : "Turn in"} ${quest.title}`,
      action === "accept"
        ? `Confirm the quest is offered at level ${quest.minimumLevel}. Pickup: ${quest.pickup}.`
        : action === "complete"
          ? quest.objective
          : `Return to ${quest.turnin} and record your actual reward XP.`,
      action,
      quest.id,
    );
  }
  for (const original of THANES_ROUTE.steps) {
    if (original.id === "group-check")
      steps.push(
        ...extraQuests
          .filter((quest) => quest.id !== 98423)
          .map((quest) => questStep(quest, "accept")),
      );
    if (original.id === "heirloom-objective")
      steps.push(
        ...extraQuests
          .filter((quest) => quest.id === 98423)
          .map((quest) => questStep(quest, "accept")),
      );
    if (original.id === "grudge-reward")
      steps.push(...extraQuests.map((quest) => questStep(quest, "complete")));
    if (original.id === "return-westfall")
      steps.push(...extraQuests.map((quest) => questStep(quest, "turnin")));
    if (original.questId !== null && !selected.has(original.questId)) continue;
    steps.push(
      original.id === "entry-check"
        ? {
            ...original,
            level: visitLevel,
            text: `Reach level ${visitLevel} before entry. Finish selected prerequisites, confirm the party and include the return route.`,
          }
        : original,
    );
  }
  return steps;
}

export function planDungeonLevel(
  profile: DungeonLevelProfile,
  selectedQuestIds: readonly number[],
  questDefinitions: readonly LevelingQuest[],
): number {
  return Math.max(
    profile.atLevel,
    ...questDefinitions
      .filter((quest) => selectedQuestIds.includes(quest.id))
      .map((quest) => quest.minimumLevel),
  );
}

export function missingPrerequisites(
  questId: number,
  readyIds: ReadonlySet<number>,
  questDefinitions: readonly LevelingQuest[],
): readonly number[] {
  const quests = new Map(questDefinitions.map((quest) => [quest.id, quest]));
  const missing = new Set<number>();
  function visit(id: number): void {
    for (const prerequisiteId of quests.get(id)?.prerequisiteIds ?? []) {
      if (!readyIds.has(prerequisiteId)) {
        missing.add(prerequisiteId);
        visit(prerequisiteId);
      }
    }
  }
  visit(questId);
  return [...missing];
}
