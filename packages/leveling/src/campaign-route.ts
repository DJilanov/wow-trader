import type { RaceId } from "./profile.js";
import type { ClassSlug } from "./model.js";

export const CAMPAIGN_VERSION = "campaign-20261018-v2";
export const CAMPAIGN_RACES = ["human", "dwarf", "gnome", "night-elf", "skyborne"] as const;
export type CampaignRace = (typeof CAMPAIGN_RACES)[number];

export interface CampaignOutdoorBlock {
  readonly id: string;
  readonly title: string;
  readonly from: number;
  readonly to: number;
  readonly purpose: "starter" | "preparation" | "xp-bridge";
  readonly sourceIds: readonly number[];
  readonly quests: readonly number[] | "starter-source";
  readonly deferHandIns?: readonly number[];
  readonly handInOnly?: readonly number[];
  readonly extraPickupIds?: readonly number[];
  readonly instructions: readonly string[];
}

export const CAMPAIGN_STARTS: Readonly<Record<CampaignRace, readonly number[]>> = {
  human: [115, 116, 117, 125],
  dwarf: [118, 119, 122, 125],
  gnome: [118, 119, 122, 125],
  "night-elf": [113, 114, 126],
  skyborne: [157, 125],
};

export function campaignStarterSourceIds(
  race: CampaignRace,
  classSlug: ClassSlug | null,
): readonly number[] {
  if (classSlug === "hunter" && race === "human") return [115, 116, 117, 126];
  if (classSlug === "hunter" && race === "dwarf") return [118, 123, 124, 126];
  return CAMPAIGN_STARTS[race];
}

export const CAMPAIGN_BRIDGES: readonly CampaignOutdoorBlock[] = [
  {
    id: "stockade-letter-unlock",
    title: "The Letter → Bazil Thredd: keep the Stockade unlock",
    from: 20,
    to: 20,
    purpose: "preparation",
    sourceIds: [10, 128],
    quests: [389],
    instructions: [
      "Hand in The Letter in Stormwind, accept Bazil Thredd, then deliver it to the Stockade warden. Everyone needs to finish this quest to unlock the later Stockade chain.",
    ],
  },
  {
    id: "early-party-kills",
    title: "Optional: finish the Dun Morogh trogg quests",
    from: 13,
    to: 16,
    purpose: "xp-bridge",
    sourceIds: [116, 119],
    quests: [432, 433],
    instructions: [
      "If anyone still needs levels for Hall of Thanes, finish the remaining Dun Morogh trogg quests together. Otherwise, continue to the dungeon.",
      "If those quests are already done, defeat nearby enemies until everyone is ready. There is no need to return to Westfall.",
    ],
  },
  {
    id: "ironforge-rendezvous",
    title: "Required Dun Morogh unlocks and Ironforge rendezvous",
    from: 13,
    to: 16,
    purpose: "preparation",
    sourceIds: [116, 119, 125, 126],
    quests: [96392, 96390, 96391],
    instructions: [
      "Finish your own starting route, then travel to Dun Morogh and meet your party near Ironforge.",
      "Train your class skills, finish any required pet quests, buy supplies and learn flight paths on the way.",
      "Complete Farsen's Watch and Nip 'Em in the Bud. Loot a Dark Iron Map from the spies and use it to start Underground Map. Everyone needs to finish the map quest before Hall of Thanes.",
    ],
  },
  {
    id: "northern-approach",
    title: "Darkshore kill batch and the northern approach",
    from: 16,
    to: 18,
    purpose: "xp-bridge",
    sourceIds: [126, 127],
    quests: [984, 985, 2118, 2138, 4762, 4740],
    instructions: [
      "After Thanes, deliver the Ironforge rewards first. Use this short Darkshore batch only for the remaining XP; do not complete the whole solo Darkshore chapter again.",
      "Keep the party together for infected wildlife, furbolg and named-target work. Do not add Buzzbox body-part farms or Gyromast collections.",
      "The Alliance trip to Ruins is still real travel. Use your learned transport and flight network, regroup before entering hostile northern territory, and include that journey in your timing.",
    ],
  },
  {
    id: "defias-unlock",
    title: "Stormwind pickups and the full Defias unlock",
    from: 18,
    to: 20,
    purpose: "preparation",
    sourceIds: [125, 127, 128],
    quests: [65, 132, 135, 141, 142, 155],
    instructions: [
      "Return Ruins' Stormwind deliveries on the same city visit as the Deadmines pickups. Bring Underground Assault and Oh Brother; collection quests remain optional in the dungeon bundle.",
      "Follow the complete Sentinel Hill → Lakeshire → Stormwind → Sentinel Hill → Moonbrook → escort chain below. Being level 20 does not unlock VanCleef's quest by itself.",
      "Do the overlapping Defias kills together. The explosives chain is not part of this core path; it needs personal gills, supplies and dynamite.",
    ],
  },
  {
    id: "redridge-kill-batch",
    title: "Lakeshire: shared gnoll objectives",
    from: 20,
    to: 23,
    purpose: "xp-bridge",
    sourceIds: [128],
    quests: [244, 246, 124],
    extraPickupIds: [386],
    instructions: [
      "After the BFD rewards and eastern return, travel to Lakeshire together and pick up the gnoll quests below for the Stockade preparation.",
      "Complete the gnoll objectives together, then return to Lakeshire for the hand-ins.",
    ],
  },
  {
    id: "duskwood-watch",
    title: "Duskwood: the Night Watch chain",
    from: 23,
    to: 26,
    purpose: "xp-bridge",
    sourceIds: [10, 13],
    quests: [226, 56, 57, 58, 245, 128],
    extraPickupIds: [377],
    instructions: [
      "Pick up Crime and Punishment in Darkshire and What Comes Around in Lakeshire for The Stockade.",
      "Complete each Night Watch stage together. Return it in Darkshire before taking the next stage.",
      "Follow the wolf, spider and Blackrock objectives listed below.",
    ],
  },
  {
    id: "wetlands-early-kills",
    title: "Wetlands: Ormer's shared raptor kills",
    from: 23,
    to: 25,
    purpose: "xp-bridge",
    sourceIds: [7, 11],
    quests: [294, 295],
    instructions: [
      "Travel to Wetlands, learn the Menethil flight path and pick up Ormer's Revenge at Whelgar's Excavation Site.",
      "Finish the first raptor quest together and return it to Ormer. Accept the second quest before starting its raptor kills, and make sure everyone gets credit.",
      "Continue to the Greenwarden and Dun Modr quests below. Skip the skin, banner and trophy collections that are not part of this route.",
    ],
  },
  {
    id: "wetlands-prerequisites",
    title: "Dun Modr and the Greenwarden chain",
    from: 25,
    to: 27,
    purpose: "preparation",
    sourceIds: [11, 14],
    quests: [303, 463, 276, 277, 275],
    instructions: [
      "Finish Dark Iron War before The Stockade to unlock Fury Runs Deep.",
      "While in Wetlands, follow the Greenwarden → Tramping Paws → Fire Taboo → Blisters on the Land chain for Excavation.",
      "Collect Crude Flints for every player's Fire Taboo quest before moving on to Blisters on the Land.",
      "Stage Caitlin's lead-in and Dorin Songblade's pickup; retain the current Journal's item and hand-in rules.",
    ],
  },
  {
    id: "excavation-approach",
    title: "Wetlands hand-ins and Excavation entry",
    from: 26,
    to: 27,
    purpose: "xp-bridge",
    sourceIds: [11, 14],
    quests: [472],
    instructions: [
      "After Stockade, batch the city hand-ins, then the selected Duskwood/Redridge deliveries and the Wetlands return.",
      "Finish the selected Wetlands prerequisites before departure. If using the conservative policy, the entry checkpoint is 29 rather than the requested expert target 27; the adjacent Dun Modr kill work is the top-up option.",
    ],
  },
  {
    id: "ashenvale-crossing",
    title: "BFD pickups and the Kalimdor crossing",
    from: 20,
    to: 25,
    purpose: "preparation",
    sourceIds: [8, 12, 130],
    quests: [1020, 1033],
    instructions: [
      "After Deadmines, collect the Ironforge BFD pickup, then batch the Darkshore/Darnassus pickups on the crossing to Ashenvale. Excavation is a later dungeon, not a prerequisite for BFD.",
      "Finish the selected BFD rewards at their actual Kalimdor and Ironforge hubs before continuing the Stockade preparations in the Eastern Kingdoms.",
      "Use the selected Astranaar shared-kill work for any XP still missing. Do not detour to Wailing Caverns; this is the owner's chosen circuit.",
    ],
  },
  {
    id: "dalaran-approach",
    title: "Excavation rewards, Stormwind and Southshore's Dalaran unlock",
    from: 27,
    to: 30,
    purpose: "preparation",
    sourceIds: [13, 14],
    quests: [536, 505, 92432],
    instructions: [
      "Finish Excavation's Wetlands relic delivery before its Ironforge follow-up. Keep the returned relic instead of planning another farm. Combine the Stormwind stop with A Green Sample and Power Overwhelming.",
      "At the recorded pickup minimum, take An Alarming Request in Southshore and hand it in to Modera before her Dalaran quest.",
      "Use the Southshore coastal and Syndicate kill work if XP is missing. The conservative Dalaran gate is 31; expert target is 30. Do not apply the dungeon-kill bonus to quest rewards.",
    ],
  },
  {
    id: "hillsbrad-gnomer",
    title: "RFK returns, Hillsbrad/Arathi kills and Gnomeregan preparation",
    from: 31,
    to: 33,
    purpose: "xp-bridge",
    sourceIds: [14],
    quests: [681, 564],
    instructions: [
      "Return the selected Razorfen Kraul rewards, then batch the eastern city pickups. Keep Dalaran's Past Due quest for the later Scarlet Library visit; unfinished dungeon objectives remain skipped rather than reported as hand-ins.",
      "Batch Southshore/Arathi named and shared-kill work, then use the Ironforge/Kharanos visit for Gnomeregan pickups.",
      "The first punch card and its terminal upgrade order are required for the selected Gnomer quest. Personal robot guts, samples and the distant escort are not forced filler.",
    ],
  },
  {
    id: "desolace-scarlet-unlock",
    title: "Prepare Scarlet Monastery after Gnomeregan",
    from: 33,
    to: 37,
    purpose: "preparation",
    sourceIds: [17, 18],
    quests: [261, 1052],
    deferHandIns: [1052],
    instructions: [
      "After Gnomer, batch the city rewards and take Mythology of the Titans. Complete Brother Anton's Down the Scarlet Path in Desolace before the later Monastery visit.",
      "The Ravager kills are fast group work. Hand in the kill stage, carry its follow-up north and collect In the Name of the Light; do not discover this missing chain at the Monastery door.",
      "This is preparation for the later Scarlet Monastery visit, not a reason to delay the lower-level Razorfen Kraul run. Keep the completed RFK rewards separate.",
    ],
  },
  {
    id: "lonebrow-rfk-preparation",
    title: "Lonebrow's Journal → Thalanaar → Crone of the Kraul",
    from: 30,
    to: 31,
    purpose: "preparation",
    sourceIds: [],
    quests: [1100],
    instructions: [
      "On the actual RFK journey, take the journal near the Great Lift, read it and deliver it to Falfindel Waywarder in Thalanaar before collecting the Crone quest. This is a historical Classic prerequisite: verify the current Forever pickup and every player's personal journal state. Object availability is not zero waiting time.",
    ],
  },
  {
    id: "stv-group-batch",
    title: "STV group kills and the Scarlet Monastery approach",
    from: 35,
    to: 37,
    purpose: "xp-bridge",
    sourceIds: [16, 19],
    quests: [185, 186, 187, 188, 190, 191, 192, 193, 194, 195, 196, 574, 202],
    instructions: [
      "After Gnomeregan and the Scarlet Monastery lead-in, use the hunt kill stages and Kurzen objectives on one coordinated STV loop. Do not farm ears, tusks, pages or tiger blood.",
      "The selected boss hunt stages may require a guaranteed quest trophy for each character; check all five before returning.",
      "Review Drowned City's optional four-quest planning stop, then continue to Scarlet Monastery preparation. Quest IDs and access details remain pending; skip the dungeon if desired and use actual party XP for the next gate.",
    ],
  },
  {
    id: "scarlet-northern-return",
    title: "Finish northern preparation and enter the three SM wings",
    from: 37,
    to: 38,
    purpose: "preparation",
    sourceIds: [14, 21],
    quests: [1052],
    handInOnly: [1052],
    instructions: [
      "Finish any outstanding Brother Anton follow-up and collect the Southshore finale. Bring both selected Library book quests before heading north.",
      "Use remaining Arathi shared-kill work only if the party is below the entry gate. Prepare Library → Armory → Cathedral, with the Library key before the locked wings.",
    ],
  },
  {
    id: "razorfen-downs-approach",
    title: "Stormwind pickup and the Razorfen Downs journey",
    from: 38,
    to: 39,
    purpose: "preparation",
    sourceIds: [],
    quests: [],
    instructions: [
      "Return the selected Scarlet Monastery rewards and collect Bring the Light in Stormwind when eligible. Continue to Razorfen Downs before the higher-level Riverglades and Badlands stops.",
      "Prepare the inside Belnistrasz stages with the whole party. Do not detour through level-40 Tanaris quests just to unlock this level-39 visit; those quests belong to the later Zul'Farrak preparation.",
    ],
  },
  {
    id: "post-scarlet-east",
    title: "SM deliveries and the eastern shared-kill bridge",
    from: 39,
    to: 42,
    purpose: "xp-bridge",
    sourceIds: [20, 21, 28],
    quests: [1396, 684, 685, 523, 537, 512, 600],
    instructions: [
      "Finish the selected Scarlet Monastery and Razorfen Downs deliveries before selecting more XP work. Use the sourced Arathi/Alterac named and shared-kill sequence below, then continue toward the next stop.",
      "Review Krol'dok's optional four-quest planning stop before Uldaman. Exact quest/access instructions remain pending; planning rewards are not earned XP.",
    ],
  },
  {
    id: "tanaris-rfd-crossing",
    title: "Tanaris kill batches toward Zul'Farrak",
    from: 42,
    to: 44,
    purpose: "xp-bridge",
    sourceIds: [29, 30, 31, 33],
    quests: [1690, 1691, 8366, 2982, 2970],
    instructions: [
      "After Uldaman, use Wastewander kill stages and the selected Feralas ogre objectives on the Zul'Farrak crossing, not water-pouch, pirate-hat or beast-hide farms.",
      "These level-40-and-up quests prepare Zul'Farrak; they must not delay the earlier Razorfen Downs run.",
      "Batch the selected Tanaris and Hinterlands pickups before entering Zul'Farrak. Avoid remote deliveries for unselected quests.",
    ],
  },
  {
    id: "badlands-uldaman",
    title: "Badlands unlocks and Uldaman preparation",
    from: 42,
    to: 42,
    purpose: "preparation",
    sourceIds: [27, 31],
    quests: [707, 738, 739, 709, 719, 720],
    instructions: [
      "Continue from the optional Krol'dok stop and batch Ironforge and Badlands leads. Retain the selected tablet/chamber unlocks; skip outer reagent and low-drop necklace farms unless already prepared.",
      "Check the below source steps against each player's quest log. Later dungeon chains remain historical references where current Journal lifecycle details are absent.",
    ],
  },
  {
    id: "desolace-maraudon",
    title: "Zul'Farrak returns and Maraudon's full first visit",
    from: 44,
    to: 46,
    purpose: "preparation",
    sourceIds: [18, 25, 31],
    quests: [1437, 1465, 1438, 1439, 1440, 1384],
    instructions: [
      "Finish the selected Zul'Farrak rewards and retain Yeh'kinya's continuation, then take Maraudon's chosen Desolace pickups. The planned first visit covers the entrances needed by the chosen objectives, not only the Princess shortcut.",
      "Use the selected Desolace rescue/kill work only for the actual gap. Do not repeat already rewarded early quests or collect Shadowshards for everyone as mandatory filler.",
    ],
  },
  {
    id: "tanaris-zulfarrak",
    title: "Tanaris/Hinterlands: ZF and Sunken Temple preparation",
    from: 42,
    to: 44,
    purpose: "preparation",
    sourceIds: [29, 32, 33],
    quests: [3520, 2988, 2989],
    instructions: [
      "After Uldaman, batch the selected Tanaris/Hinterlands work. Prepare The Prophecy of Mosh'aru for ZF before entry; its later stages support the selected Sunken Temple objective.",
      "The spirits/temple unlock work stays required for the selected chain. Scarab shells and Troll Temper are opportunistic and do not justify waiting for five personal sets.",
    ],
  },
  {
    id: "dustwallow-alcaz",
    title: "Maraudon returns and the Sunken Temple continuation",
    from: 46,
    to: 50,
    purpose: "xp-bridge",
    sourceIds: [29, 32, 33],
    quests: [5863, 2781, 2875, 3362],
    instructions: [
      "Return Maraudon's selected rewards and keep the earlier Mosh'aru chain progress. Use only still-unrewarded adjacent kill objectives for any remaining level-50 gap.",
      "Review Alcaz Prison's optional four-quest planning stop, then retain the Sunken Temple preparation. Quest identities and access are pending; skipped rewards must not be reported as earned XP.",
    ],
  },
  {
    id: "searing-group-kills",
    title: "Only if needed: Thorium Point's grouped kill loop",
    from: 50,
    to: 51,
    purpose: "xp-bridge",
    sourceIds: [35],
    quests: [7723, 7724, 7727, 7729, 7701],
    instructions: [
      "Batch the golem, spider, dinosaur, Dark Iron and named-target objectives at Thorium Point. Skip this XP-only loop if all five are already ready for Sunken Temple; the next chapter still keeps the selected Temple unlocks. No spyglass/tuyere material farming is required.",
    ],
  },
  {
    id: "searing-temple-prep",
    title: "Searing Gorge kills and Sunken Temple unlocks",
    from: 50,
    to: 51,
    purpose: "preparation",
    sourceIds: [31, 33, 35, 37, 40, 41, 44],
    quests: [3445, 3444, 1475],
    instructions: [
      "Batch Thorium Point's selected golem/spider/dinosaur/Dark Iron kill objectives. Leave spyglass/tuyere and unrelated material farms out of the core path.",
      "Prepare the selected Temple chain before the level-51 visit, including its earlier ZF dependencies. These unlocks cannot be skipped merely because dungeon XP brought someone ahead.",
      "Class-specific Temple rewards remain personal goals. Required rune/material stages of a selected chain are kept explicitly; they are not shared-kill objectives.",
    ],
  },
  {
    id: "burning-group-kills",
    title: "Only if needed: Burning Steppes Firegut batch",
    from: 51,
    to: 55,
    purpose: "xp-bridge",
    sourceIds: [44],
    quests: [3823, 3824, 3825],
    instructions: [
      "Use the Firegut kills and named target only for the actual BRD entry gap. Skip this XP-only block if all five are ready; the selected Onyxia prerequisites remain in the next chapter.",
    ],
  },
  {
    id: "burning-onyxia-prep",
    title: "Burning Steppes kill batch and the Alliance Onyxia lead-in",
    from: 51,
    to: 55,
    purpose: "preparation",
    sourceIds: [44],
    quests: [4182, 4183, 4184, 4185, 4186, 4223, 4224],
    instructions: [
      "Batch the Firegut/dragonkin objectives and the required city conversations before BRD. Dragonkin Menace → The True Masters leads to Marshal Windsor; Windsor is not available simply because you enter BRD at 55.",
      "The BRD plan needs a preparation/probe visit, outside return and main run. Jail Break and the Emperor chain are not all immediate first-clear hand-ins.",
      "Do not add Love Potion material farming or the long Taste of Flame chain by default. MC/Core and key goals remain selected preparations, not proof the later UBRS Onyxia tail is finished.",
    ],
  },
  {
    id: "blackrock-world-returns",
    title: "BRD world returns and remaining Blackrock objectives",
    from: 55,
    to: 57,
    purpose: "xp-bridge",
    sourceIds: [44],
    quests: [3371, 3372, 3566, 4296],
    instructions: [
      "The preceding BRD chapter includes the probe, outside returns and eligible main-run obligations in their actual source order. Do not repeat any of their quest rewards here.",
      "Use the nearby Dwarven Justice → Release Them → Rise, Obsidion! and Tablet of the Seven work for the remaining LBRS entry gap. Preserve your selected Core, Shadowforge and Onyxia stages; the later UBRS attunement tail remains separate.",
    ],
  },
  {
    id: "plaguelands-strath-prep",
    title: "WPL/EPL kill batches and Stratholme unlocks",
    from: 57,
    to: 59,
    purpose: "preparation",
    sourceIds: [37, 45],
    quests: [
      5090, 5092, 5401, 5215, 5216, 5217, 5219, 5220, 5222, 5223, 5225, 5226, 5097, 5542, 5543,
      5281,
    ],
    instructions: [
      "After LBRS, schedule visit two only for actual missing objectives or key gems. One-time quest rewards never repeat; two visits do not guarantee the party's personal gems.",
      "Use the cauldron/undead/bat/hound objectives on a grouped Plaguelands loop and prepare Egan plus the selected Stratholme book/holy-water/family quests.",
      "Of Love and Family is optional in this speed campaign because it requires Fordring's full chain including Carrion Grubbage. The dungeon reference's five-quest scenario cannot be used as the default four-quest forecast here.",
      "Before the final clear, compare the remaining selected reward forecast with every actual XP bar. The finish remains adaptive, not a guaranteed 58→60 clear.",
    ],
  },
  {
    id: "final-xp-fallback",
    title: "Finish the actual level-60 gap",
    from: 59,
    to: 60,
    purpose: "xp-bridge",
    sourceIds: [45, 47],
    quests: [6004, 6023, 6025, 6021, 5211],
    instructions: [
      "Deliver Stratholme's selected rewards first. If everyone is 60, skip this XP-only block; quest estimates do not automatically level the party.",
      "Otherwise use the still-unrewarded Plaguelands named/shared-kill work below and recheck actual XP. No quest reward is counted twice, and no universal kill-XP value is invented.",
    ],
  },
];

export function campaignRace(value: string | undefined): CampaignRace {
  return CAMPAIGN_RACES.find((race) => race === value) ?? "human";
}

export function isCampaignRace(race: RaceId): race is CampaignRace {
  return CAMPAIGN_RACES.some((candidate) => candidate === race);
}
