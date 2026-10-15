import type { RaceId } from "./profile.js";

export const CAMPAIGN_VERSION = "campaign-20261013-v1";
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
      "After the Deadmines Letter hand-in, take Bazil Thredd in Stormwind and deliver it to the Stockade warden. Keep this unlock even if all five are ahead on XP; the later city quest is not unlocked merely by being level 26.",
    ],
  },
  {
    id: "early-party-kills",
    title: "Only if needed: finish the early party XP gap",
    from: 13,
    to: 16,
    purpose: "xp-bridge",
    sourceIds: [116, 119],
    quests: [432, 433],
    instructions: [
      "After the required map preparation, use unfinished Dun Morogh trogg quests only if anyone remains below the entry level. Do not return to Westfall just to repeat quests already rewarded. Each listed player must confirm actual pickup eligibility.",
      "If these quests are already rewarded or do not fill the remaining gap, fight nearby shared mobs together and record actual XP until everyone meets the gate. No assumed reward or universal mob-XP value fills the gap automatically.",
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
      "Finish your personal starting branch and travel to Dun Morogh on the Ironforge approach. Players with different starting zones keep their own class/race instructions; confirm all five can take the selected quests before reporting shared progress.",
      "Finish class training and required pet/combat unlocks on your personal race route. Set useful hearths, buy supplies and learn flight paths on the journeys you actually make.",
      "Follow Farsen's Watch and Nip 'Em in the Bud, then collect the Dark Iron Map from the spies and use it to start Underground Map. Every player needs their own map and actual hand-in; the unlock remains required even when ahead on XP.",
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
      "After the Deadmines hand-ins, move as five to Lakeshire. Take the overlapping gnoll objectives and finish them on one loop before returning.",
      "These are XP work, not a requirement to replay every Redridge quest. Skip fish, scales and stew farms; stop taking filler once all five can reach the next planned gate.",
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
      "Collect the Stockade quest Crime and Punishment while passing Darkshire, and What Comes Around while passing Lakeshire.",
      "Run the Night Watch kill stages in order, returning each stage before accepting the next. Group kill credit must be checked for everyone; five players do not multiply a quest reward.",
      "Use the selected wolf, spider and Blackrock kill objectives only for the remaining gap. Do not add Totem of Infliction, Rot Blossoms or tiger-blood-style collections.",
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
      "Do Dark Iron War before Stockade so Fury Runs Deep is actually available. This shared-kill batch is required preparation, not optional XP filler.",
      "Prepare Excavation on the same Wetlands journey: Greenwarden → Tramping Paws → Fire Taboo → Blisters on the Land.",
      "Fire Taboo's Crude Flints are an unavoidable selected unlock, not a general collection recommendation. Check all five, batch nearby kills while waiting, and do not pretend the chain is complete without it.",
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
    title: "Relic return, BFD pickups and the Kalimdor crossing",
    from: 27,
    to: 28,
    purpose: "preparation",
    sourceIds: [8, 12, 130],
    quests: [1020, 1033],
    instructions: [
      "Deliver Excavation's relic stage before its Ironforge follow-up. Keep the returned relic for the follow-up instead of planning a second farm.",
      "Collect the Ironforge BFD pickup on that city return, then batch the Darkshore/Darnassus pickups on the actual crossing to Ashenvale.",
      "Use the selected Astranaar shared-kill work for any XP still missing. Do not detour to Wailing Caverns; this is the owner's chosen circuit.",
    ],
  },
  {
    id: "dalaran-approach",
    title: "BFD rewards, Stormwind and Southshore's Dalaran unlock",
    from: 28,
    to: 30,
    purpose: "preparation",
    sourceIds: [13, 14],
    quests: [536, 505, 92432],
    instructions: [
      "Finish the selected BFD rewards before leaving Kalimdor. Combine the next Stormwind stop with A Green Sample and Power Overwhelming.",
      "At the recorded pickup minimum, take An Alarming Request in Southshore and hand it in to Modera before her Dalaran quest.",
      "Use the Southshore coastal and Syndicate kill work if XP is missing. The conservative Dalaran gate is 31; expert target is 30. Do not apply the dungeon-kill bonus to quest rewards.",
    ],
  },
  {
    id: "hillsbrad-gnomer",
    title: "Hillsbrad/Arathi kills and Gnomeregan preparation",
    from: 30,
    to: 33,
    purpose: "xp-bridge",
    sourceIds: [14],
    quests: [681, 564],
    instructions: [
      "Return the Dalaran rewards and collect Past Due now for the later Scarlet Library visit. Do not reset Dalaran only for missing optional Starving Arcane spawns.",
      "Batch Southshore/Arathi named and shared-kill work, then use the Ironforge/Kharanos visit for Gnomeregan pickups.",
      "The first punch card and its terminal upgrade order are required for the selected Gnomer quest. Personal robot guts, samples and the distant escort are not forced filler.",
    ],
  },
  {
    id: "desolace-scarlet-unlock",
    title: "Prepare Scarlet Monastery before RFK",
    from: 33,
    to: 35,
    purpose: "preparation",
    sourceIds: [17, 18],
    quests: [261, 1052],
    deferHandIns: [1052],
    instructions: [
      "After Gnomer, batch the city rewards and take Mythology of the Titans. Complete Brother Anton's Down the Scarlet Path in Desolace before the later Monastery visit.",
      "The Ravager kills are fast group work. Hand in the kill stage, carry its follow-up north and collect In the Name of the Light; do not discover this missing chain at the Monastery door.",
      "Stage Thalanaar's Lonebrow/Crone preparation on the Kalimdor journey. RFK's pendant/Darnassus return remains optional, and tubers are not a speed requirement.",
    ],
  },
  {
    id: "lonebrow-rfk-preparation",
    title: "Lonebrow's Journal → Thalanaar → Crone of the Kraul",
    from: 34,
    to: 35,
    purpose: "preparation",
    sourceIds: [],
    quests: [1100],
    instructions: [
      "On the actual RFK journey, take the journal near the Great Lift, read it and deliver it to Falfindel Waywarder in Thalanaar before collecting the Crone quest. This is a historical Classic prerequisite: verify the current Forever pickup and every player's personal journal state. Object availability is not zero waiting time.",
    ],
  },
  {
    id: "stv-group-batch",
    title: "STV group kills and the Drowned City approach",
    from: 35,
    to: 37,
    purpose: "xp-bridge",
    sourceIds: [16, 19],
    quests: [185, 186, 187, 188, 190, 191, 192, 193, 194, 195, 196, 574, 202],
    instructions: [
      "Deliver RFK's selected rewards, then use the hunt kill stages and Kurzen objectives on one coordinated STV loop. Do not farm ears, tusks, pages or tiger blood.",
      "The selected boss hunt stages may require a guaranteed quest trophy for each character; check all five before returning.",
      "Drowned City has no verified quest bundle yet. Its proposed stop is kept in the path, with this outdoor batch as the real XP fallback rather than invented dungeon quests.",
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
    id: "post-scarlet-east",
    title: "SM deliveries and the eastern shared-kill bridge",
    from: 38,
    to: 42,
    purpose: "xp-bridge",
    sourceIds: [20, 21, 28],
    quests: [1396, 684, 685, 523, 537, 512, 600],
    instructions: [
      "Batch the SM book/finale deliveries before selecting more XP work. Use the sourced Arathi/Alterac named and shared-kill sequence below, then the relevant eastern route toward the next stop.",
      "Krol'dok's quest/access bundle is not in the validated catalog. Review its proposed level-42 stop, but do not award it imagined XP or claim a verified Riverglades unlock.",
    ],
  },
  {
    id: "tanaris-rfd-crossing",
    title: "Tanaris kill batches and the RFD crossing",
    from: 42,
    to: 45,
    purpose: "xp-bridge",
    sourceIds: [29, 30, 31, 33],
    quests: [1690, 1691, 8366, 2982, 2970],
    instructions: [
      "Use Wastewander kill stages and the selected Feralas ogre objectives on the crossing, not water-pouch, pirate-hat or beast-hide farms.",
      "Keep the chosen RFD target 45 visible. Several RFD rewards are overleveled by then; their unknown reductions cannot fill the XP gap on paper.",
      "Prepare Uldaman's city/Badlands leads on the next eastern return. Avoid repeated transcontinental deliveries for unselected quests.",
    ],
  },
  {
    id: "badlands-uldaman",
    title: "Badlands unlocks and Uldaman preparation",
    from: 45,
    to: 47,
    purpose: "preparation",
    sourceIds: [27, 31],
    quests: [707, 738, 739, 709, 719, 720],
    instructions: [
      "Deliver the selected RFD rewards, then batch Ironforge and Badlands leads. Retain the selected tablet/chamber unlocks; skip outer reagent and low-drop necklace farms unless already prepared.",
      "Check the below source steps against each player's quest log. Later dungeon chains remain historical references where current Journal lifecycle details are absent.",
    ],
  },
  {
    id: "desolace-maraudon",
    title: "Uldaman returns and Maraudon's full first visit",
    from: 47,
    to: 48,
    purpose: "preparation",
    sourceIds: [18, 25, 31],
    quests: [1437, 1465, 1438, 1439, 1440, 1384],
    instructions: [
      "Batch the selected Uldaman follow-ups, then take Maraudon's chosen Desolace pickups. The planned first visit covers the entrances needed by the chosen objectives, not only the Princess shortcut.",
      "Use the selected Desolace rescue/kill work only for the actual gap. Do not repeat already rewarded early quests or collect Shadowshards for everyone as mandatory filler.",
    ],
  },
  {
    id: "tanaris-zulfarrak",
    title: "Tanaris/Hinterlands: ZF and Sunken Temple preparation",
    from: 48,
    to: 49,
    purpose: "preparation",
    sourceIds: [29, 32, 33],
    quests: [3520, 2988, 2989],
    instructions: [
      "On the Mara return, batch the selected Tanaris/Hinterlands work. Prepare The Prophecy of Mosh'aru for ZF before entry; its later stages support the selected Sunken Temple objective.",
      "The spirits/temple unlock work stays required for the selected chain. Scarab shells and Troll Temper are opportunistic and do not justify waiting for five personal sets.",
    ],
  },
  {
    id: "dustwallow-alcaz",
    title: "ZF hand-ins and the Alcaz decision",
    from: 49,
    to: 50,
    purpose: "xp-bridge",
    sourceIds: [29, 32, 33],
    quests: [5863, 2781, 2875, 3362],
    instructions: [
      "Return the ZF quest bundle and carry the Mosh'aru chain forward. Use only still-unrewarded adjacent kill objectives for any remaining level-50 gap.",
      "Alcaz Prison's verified access/quest bundle is missing. Do not send the group through The Missing Diplomat on an unsupported assumption that it unlocks this dungeon.",
    ],
  },
  {
    id: "searing-group-kills",
    title: "Only if needed: Thorium Point's grouped kill loop",
    from: 50,
    to: 53,
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
    to: 53,
    purpose: "preparation",
    sourceIds: [31, 33, 35, 37, 41, 44],
    quests: [3445, 3444, 1475],
    instructions: [
      "Batch Thorium Point's selected golem/spider/dinosaur/Dark Iron kill objectives. Leave spyglass/tuyere and unrelated material farms out of the core path.",
      "Prepare the selected Temple chain before 53, including its earlier ZF dependencies. These unlocks cannot be skipped merely because dungeon XP brought someone ahead.",
      "Class-specific Temple rewards remain personal goals. Required rune/material stages of a selected chain are kept explicitly; they are not shared-kill objectives.",
    ],
  },
  {
    id: "burning-group-kills",
    title: "Only if needed: Burning Steppes Firegut batch",
    from: 53,
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
    from: 53,
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
