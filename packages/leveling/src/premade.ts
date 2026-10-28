import { z } from "zod";
import baselines from "./premade-baselines.json" with { type: "json" };
import { DUNGEON_QUESTS, DUNGEON_VISITS } from "./dungeon-catalog.js";
import { gateQuestIds, type DungeonQuest } from "./dungeon-model.js";
import { evaluateDungeonGate, emptyDungeonPlan } from "./dungeon-model.js";
import {
  estimateDungeonReward,
  ORDINARY_DUNGEON_XP_MULTIPLIER,
  type DungeonRewardEstimate,
} from "./dungeon-xp.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { xpToCheckpoint } from "./calculator.js";
import { questEligibility } from "./quest-eligibility.js";
import type { QuestRewardFact } from "./quest-rewards.js";
import { dungeonBundleKey, type DungeonBundle } from "./dungeon-bundle-model.js";
import {
  forecastDungeonBundle,
  getDungeonBundle,
  DEFAULT_DUNGEON_BUNDLE_LEVELS,
  type DungeonBundleRewardRow,
} from "./dungeon-bundles.js";
import {
  premadeProgressSchema,
  type PremadeMember,
  type PremadeProgress,
  type PremadeStageId,
} from "./premade-model.js";

const baselineData = z
  .object({
    schemaVersion: z.literal(1),
    records: z.array(
      z
        .object({
          id: z.number().int().positive(),
          title: z.string().nullable(),
          baseXp: z.number().int().nonnegative().nullable(),
          questLevel: z.number().int().min(1).max(60).nullable(),
          minimumLevel: z.number().int().min(1).max(60).nullable(),
          source: z.string().url(),
        })
        .strict(),
    ),
  })
  .strict()
  .parse(baselines);

export type PremadeQuestRole = "core" | "opportunistic" | "raid" | "deferred" | "prerequisite";
export interface PremadeQuestChoice {
  readonly questId: number;
  readonly role: PremadeQuestRole;
}
export interface PremadeStop {
  readonly id: PremadeProgress["selectedStopId"];
  readonly name: string;
  readonly visitIds: readonly string[];
  readonly level: number;
  readonly nextLevel: number;
  readonly zone: string;
  readonly preparation: string;
  readonly clear: string;
  readonly handIn: string;
  readonly bridge: string;
  readonly notes: readonly string[];
  readonly quests: readonly PremadeQuestChoice[];
  readonly dataStatus:
    "journal-reference" | "historical-reference" | "missing-quest-data" | "guaranteed-bundle";
}
function choices(
  core: readonly number[],
  optional: readonly number[] = [],
  raid: readonly number[] = [],
  deferred: readonly number[] = [],
): readonly PremadeQuestChoice[] {
  return [
    ...core.map((questId) => ({ questId, role: "core" as const })),
    ...optional.map((questId) => ({ questId, role: "opportunistic" as const })),
    ...raid.map((questId) => ({ questId, role: "raid" as const })),
    ...deferred.map((questId) => ({ questId, role: "deferred" as const })),
  ];
}
export const PREMADE_STAGES: readonly { readonly id: PremadeStageId; readonly label: string }[] = [
  { id: "prepare", label: "Prepare together" },
  { id: "clear", label: "Dungeon objectives" },
  { id: "hand-in", label: "Deliver rewards" },
  { id: "checkpoint", label: "Next-stop XP check" },
];

const stopDefinitions: readonly Omit<PremadeStop, "nextLevel">[] = [
  {
    id: "thanes",
    name: "Hall of Thanes",
    visitIds: ["thanes"],
    level: 16,
    zone: "Dun Morogh",
    preparation:
      "Meet in Ironforge after your race-specific starting chapters. Finish Underground Map → Old Ironforge Incursion; collect the city quests before entry.",
    clear:
      "Complete the shared spirit kills and boss goals. Pick up Ancient Grudge inside; search the final vault for the Treaty. Collect the ground heirlooms along the required path.",
    handIn:
      "Finish the inside spirit hand-in, then batch Thom, Afadra and Magni in Ironforge. Confirm all five have the required items before leaving.",
    bridge:
      "Use short shared-kill work while preparing the northern Ruins journey; leave only when everyone meets its actual gate.",
    notes: [
      "Starting chapters 1–16 remain on your race route; this circuit does not replace them.",
      "Ground heirlooms are not a low-drop corpse farm, but all five still need their own items.",
    ],
    quests: choices([96403, 96394, 96393, 96395, 98423]),
    dataStatus: "journal-reference",
  },
  {
    id: "lordaeron",
    name: "Ruins of Lordaeron",
    visitIds: ["lordaeron"],
    level: 18,
    zone: "Tirisfal Glades",
    preparation:
      "Plan the northern journey as a group. Alliance quests start inside; bring free quest-log space and check each member's item-start eligibility.",
    clear:
      "Complete the Baron objective, find the Crest and Blood-Stained Letter. Collect insignias on the required clear, without waiting or resetting solely for drops.",
    handIn:
      "Finish Captain Truman inside, then batch the selected Stormwind deliveries. Quest XP arrives at these hand-ins, not when a boss dies.",
    bridge:
      "Prepare the shared Defias chain and the city pickups on the way to Deadmines. Keep the Letter-to-Stockade dependency.",
    notes: [
      "Requested level 18 is below the conservative At-level 19 band. Only the experienced-premade policy exposes this proposal.",
    ],
    quests: choices([95250, 95189, 92415, 95195]),
    dataStatus: "journal-reference",
  },
  {
    id: "deadmines",
    name: "The Deadmines",
    visitIds: ["deadmines"],
    level: 20,
    zone: "Westfall",
    preparation:
      "Prepare Defias 65 → 132 → 135 → 141 → 142 → 155 while doing overlapping shared-kill work. Collect Stormwind quests; the explosives chain is optional, not mandatory collection filler.",
    clear:
      "Do Foreman Thistlenettle before the portal, then Sneed and VanCleef. Loot the Unsent Letter. Collect bandanas/cards on the required path only. If explosives are selected, finish their correct exit stage.",
    handIn:
      "Batch Sentinel Hill and Stormwind. Turn in the Letter once, then take Bazil Thredd → Stockade Riots. Do not pay the Letter again at Stockade.",
    bridge:
      "Prepare the Ironforge, Darkshore and Darnassus BFD pickups on the Kalimdor crossing. Use level-appropriate shared-kill work only for the remaining entry gap.",
    notes: [
      "Personal collections are opportunistic; retain necessary unlocks even if ahead on XP.",
      "Explosives include gills, supplies and ten dynamite per character; prepare beforehand only when worthwhile.",
    ],
    quests: choices([167, 2040, 166, 373], [214, 168, 92753]),
    dataStatus: "journal-reference",
  },
  {
    id: "stockade",
    name: "The Stockade",
    visitIds: ["stockade"],
    level: 26,
    zone: "Stormwind City",
    preparation:
      "Stage Redridge and Duskwood quest heads. Finish Dark Iron War → Fury Runs Deep in Wetlands, and the Letter → Bazil → Riots chain in Stormwind.",
    clear:
      "Complete the shared kill counts and selected named prisoners. Collect wool bandanas during the required clear only.",
    handIn:
      "Finish local Stormwind deliveries together, then batch the selected remote hand-ins with the Wetlands preparation route.",
    bridge:
      "Prepare Greenwarden and the selected Excavation chain instead of unrelated solo collection quests. Actual pickup/access minima still apply.",
    notes: ["Fury's 5,750 XP is already a reported Forever reward; it is never multiplied again."],
    quests: choices([386, 377, 387, 378, 391], [388]),
    dataStatus: "journal-reference",
  },
  {
    id: "excavation",
    name: "Excavation Site: Wetlands",
    visitIds: ["excavation"],
    level: 27,
    zone: "Wetlands",
    preparation:
      "Batch Greenwarden 463 → 276 → 277 → 275 → Horrors, the Redridge Songblade pickup and Caitlin's selected chain. Highland Hides' personal skins are optional.",
    clear:
      "Complete the selected boss and inside-start objectives. Deliver Songblade's stage to Daewyn and pick up its follow-up. Keep the Titan Relic and the Reed-woven Heart for their proper deliveries.",
    handIn:
      "Batch Wetlands rewards, then Ironforge's Prism delivery. The October 8 relic return supports its follow-up without farming another relic.",
    bridge:
      "Finish the relic's Ironforge follow-up on the city return, then prepare the Stormwind and Southshore Dalaran pickups.",
    notes: [
      "Level 27 is an experienced-premade proposal; the conservative band is 29.",
      "Young Crocolisk Skins is in the new Journal chain; Daily Delivery is a disputed breadcrumb, not silently marked done.",
    ],
    quests: choices([95772, 95646, 95809, 98824], [98815, 95795]),
    dataStatus: "journal-reference",
  },
  {
    id: "blackfathom",
    name: "Blackfathom Deeps",
    visitIds: ["blackfathom"],
    level: 25,
    zone: "Ashenvale",
    preparation:
      "Combine Ironforge, Auberdine and Darnassus pickups with the crossing. Keep In Search of Thaelrid before his inside quest; class materials are personal extras.",
    clear:
      "Bring the book, find Thaelrid and complete Kelris. Collect optional stems/pendants during necessary combat, without extra waiting for the last member.",
    handIn:
      "Use the correct Darkshore/Darnassus/Ironforge hubs. Do not count all XP as paid inside the instance.",
    bridge:
      "Return to the Eastern Kingdoms for the Stockade preparations. Batch the Letter/Bazil chain, Redridge and Duskwood pickups, and Wetlands' Dark Iron War before entering Stockade.",
    notes: [
      "Low-level rewards may be reduced at late hand-ins; unknown reductions are not treated as full XP.",
    ],
    quests: choices([971, 1198, 1200], [1275, 1199]),
    dataStatus: "journal-reference",
  },
  {
    id: "dalaran",
    name: "City of Dalaran",
    visitIds: ["dalaran"],
    level: 30,
    zone: "Alterac Mountains",
    preparation:
      "Collect A Green Sample and Power Overwhelming in Stormwind. At level 30, complete An Alarming Request in Southshore before the Modera quests. Collect Past Due for the later SM Library visit.",
    clear:
      "All four quests are selected by default. Complete the garden, boss, key and Starving Arcane objectives you choose to do. If you skip an objective or the dungeon, continue without marking it complete; no extra clear is required by the guide.",
    handIn:
      "Deliver the Modera objectives, then the selected Stormwind rewards. Keep the sewer-key state separate from starting or finishing a quest.",
    bridge:
      "Prepare Lonebrow's Journal and the Thalanaar Crone pickup for Razorfen Kraul. Continue when the party meets that stop's entry checks; do not grind toward the later Gnomeregan stop first.",
    notes: [
      "The conservative band is 31. The introductory quest and key-bearing quest have a recorded level-30 minimum.",
      "Each of the four quests has a collected full reward of 9,400 XP, for 37,600 before hand-in-level reductions. These final rewards are not multiplied again.",
    ],
    quests: choices([92456, 92489, 92457, 92458]),
    dataStatus: "journal-reference",
  },
  {
    id: "gnomeregan",
    name: "Gnomeregan",
    visitIds: ["gnomeregan"],
    level: 33,
    zone: "Dun Morogh",
    preparation:
      "Batch Stormwind, Ironforge and Kharanos. Collect the first punch card before entry; follow its terminal upgrades in order. Green Glow requires a prior outside hand-in, not an instant second reward.",
    clear:
      "Complete the selected Techbot/terminal/Thermaplugg objectives. Ground artificials, robot guts, ring and escort goals are optional detours; some lower-level rewards are already overleveled.",
    handIn:
      "Batch Ironforge/Kharanos and only selected remote rewards. Do not send everyone to Booty Bay solely for an unmeasured escort reward.",
    bridge:
      "Prepare the SM Desolace chain before the northern Monastery visit, then continue through the selected STV work and optional Drowned City stop.",
    notes: [
      "Techbot is outside the portal. A keyed shortcut is a different route from the normal entrance.",
    ],
    quests: choices([2922, 2930, 2929], [2926, 2962, 2928, 2924, 2904, 2948]),
    dataStatus: "journal-reference",
  },
  {
    id: "razorfen-kraul",
    name: "Razorfen Kraul",
    visitIds: ["razorfen-kraul"],
    level: 31,
    zone: "The Barrens",
    preparation:
      "Prepare Lonebrow's Journal → Crone at Thalanaar. Bring starting items only if selecting Blueleaf. Do not import the Horde Unholy Alliance chain into the Alliance plan.",
    clear:
      "Complete Crone and compatible inside-start Willix work; confirm the whole party is ready before the escort. Mortality's pendant and tubers are opportunistic, not mandatory speed filler.",
    handIn:
      "Deliver the selected faction and escort rewards together. Class materials remain separate personal goals.",
    bridge:
      "Return the selected rewards, then batch the Ironforge and Kharanos Gnomeregan pickups. The later Scarlet Monastery chain is prepared after Gnomeregan, not as a prerequisite for this run.",
    notes: [
      "Entering later does not restore full XP to low-level tuber rewards.",
      "Mortality needs a personal pendant drop and a Darnassus hand-in; include it only with an existing drop and an already planned city visit.",
    ],
    quests: choices([1101, 1144], [1142, 1221]),
    dataStatus: "journal-reference",
  },
  {
    id: "drowned-city",
    name: "The Drowned City",
    visitIds: [],
    level: 37,
    zone: "Stranglethorn Vale",
    preparation:
      "Plan the optional STV visit with all four faction quest slots selected. Exact pickups and access requirements are pending identification; no locations or prerequisites are invented.",
    clear:
      "Four quests are guaranteed by the owner. Their IDs and objectives remain pending; review the planning slots, or skip this dungeon without reporting completion.",
    handIn: `Forecast four level-${DEFAULT_DUNGEON_BUNDLE_LEVELS["drowned-city"]} rewards using the Dalaran reward tier. Record actual XP after any real hand-ins; estimates never update your character.`,
    bridge:
      "Carry the planned rewards into the next checkpoint. If you skip the dungeon, use your actual XP and the outdoor continuation instead.",
    notes: [
      `Four owner-confirmed quests per faction; quest level ${DEFAULT_DUNGEON_BUNDLE_LEVELS["drowned-city"]} is an editable planning input, not a proven pickup gate. IDs, objectives and access instructions remain pending.`,
    ],
    quests: [],
    dataStatus: "guaranteed-bundle",
  },
  {
    id: "scarlet-monastery",
    name: "Scarlet Monastery · 3 wings",
    visitIds: ["sm-library", "sm-armory", "sm-cathedral", "sm-all-wings"],
    level: 38,
    zone: "Tirisfal Glades",
    preparation:
      "Prepare Down the Scarlet Path in Desolace before 38 and its Southshore handoff. Collect Mythology in Ironforge and the new Past Due from Magus Olvek in Dalaran.",
    clear:
      "Library first: finish the books and secure the Scarlet Key. Then Armory and Cathedral. Pay the shared four-boss quest once, not once per wing.",
    handIn:
      "Batch Southshore, Dalaran and Ironforge deliveries with the continuation. Confirm all five have their books before leaving Library.",
    bridge:
      "Prepare the Stormwind Bring the Light pickup and the Razorfen Downs journey. Use shared-kill work only if the party still needs its entry level.",
    notes: [
      "Past Due 96800 is new Alliance content missing from the old all-dungeon list.",
      "A multi-wing itinerary is not one short dungeon clear.",
    ],
    quests: choices([1053, 1050, 96800]),
    dataStatus: "journal-reference",
  },
  {
    id: "kroldok",
    name: "Krol'dok Stronghold",
    visitIds: [],
    level: 42,
    zone: "Riverglades",
    preparation:
      "Plan the optional Riverglades visit with all four faction quest slots selected. Confirm real access separately; no attunement is inferred.",
    clear:
      "Four guaranteed quest slots are included in planning; quest IDs and objectives are pending. Skip the dungeon if desired without recording a completed run.",
    handIn: `Forecast four level-${DEFAULT_DUNGEON_BUNDLE_LEVELS.kroldok} rewards using the Dalaran reward tier, then replace the forecast with actual party XP after playing.`,
    bridge:
      "Prepare the Ironforge, Loch Modan and Badlands Uldaman leads next, whether you visit or skip Krol'dok.",
    notes: [
      `Four owner-confirmed quests per faction; quest level ${DEFAULT_DUNGEON_BUNDLE_LEVELS.kroldok} is an editable planning input. No invented quest IDs, pickups or objectives.`,
    ],
    quests: [],
    dataStatus: "guaranteed-bundle",
  },
  {
    id: "razorfen-downs",
    name: "Razorfen Downs",
    visitIds: ["razorfen-downs"],
    level: 39,
    zone: "The Barrens",
    preparation:
      "Collect Bring the Light in Stormwind. Reserve the inside Belnistrasz stages and check all five are ready before the escort; no Horde RFK chain is required.",
    clear:
      "Complete the selected boss goal and Scourge → Idol sequence. Do not trigger the escort before every participating player has the prior stage complete.",
    handIn: "Finish inside deliveries and batch the Stormwind reward with later travel.",
    bridge:
      "Return the selected rewards, then continue through the eastern shared-kill work toward optional Krol'dok and Uldaman. Do not delay this lower-level dungeon until after those stops.",
    notes: [
      "The core Bring the Light quest has a recorded level-39 minimum. Earlier access does not make that selected quest available sooner.",
    ],
    quests: choices([3636, 3523, 3525], [6626]),
    dataStatus: "historical-reference",
  },
  {
    id: "uldaman",
    name: "Uldaman",
    visitIds: ["uldaman"],
    level: 42,
    zone: "Badlands",
    preparation:
      "Batch Ironforge, Loch Modan and Badlands. Prepare selected dwarf/tablet stages and any required outside probe/city-return leg before the main clear.",
    clear:
      "Complete the selected artifact, dwarf and disc path. Avoid farming five sets of low-drop outer stones/reagents. Necklace follow-ups are a separate return/re-entry scope.",
    handIn:
      "Deliver the selected artifacts at their actual hubs; do not count deferred necklace stages as first-clear XP.",
    bridge:
      "Prepare the Tanaris and Hinterlands Zul'Farrak chains on the continuation. Maraudon's higher-level first visit follows Zul'Farrak.",
    notes: ["Historical reward estimates are not current Forever observations."],
    quests: choices([1360, 2398, 2240, 1139, 2278], [17, 704, 2418, 709], [], [2198]),
    dataStatus: "historical-reference",
  },
  {
    id: "maraudon",
    name: "Maraudon",
    visitIds: ["maraudon"],
    level: 46,
    zone: "Desolace",
    preparation:
      "Batch Desolace pickups and selected remote chains. Shadowshard/Pariah farming is not routine speed work; only include it when prepared or worthwhile.",
    clear:
      "Use the first-time orange/purple/Celebras/Princess scope required by the selected quests. The portal-only Princess shortcut is different. Collect optional evils on the required clear only.",
    handIn:
      "Batch the main Desolace rewards. Seed of Life's remote delivery is optional unless its total journey fits the plan.",
    bridge:
      "Continue toward optional Alcaz Prison and the remaining Sunken Temple preparations. Keep the earlier Zul'Farrak chain progress; do not repeat its rewards.",
    notes: [
      "Individual quest items and both entrance paths need their real scope, not an instant all-quest total.",
    ],
    quests: choices([7041, 7065, 7044, 7046], [7028, 7070, 7067, 7066]),
    dataStatus: "historical-reference",
  },
  {
    id: "zul-farrak",
    name: "Zul'Farrak",
    visitIds: ["zul-farrak"],
    level: 44,
    zone: "Tanaris",
    preparation:
      "Prepare remote pickups, Screecher Spirits → Mosh'aru and the Hinterlands Nekrum chain. Bring the summon item only if selecting Gahz'rilla.",
    clear:
      "Complete the selected pyramid/boss/tablet objectives. Shells and temper are opportunistic; summoned-boss work requires actual access/items.",
    handIn:
      "Batch Tanaris and the selected Hinterlands deliveries. Preserve Yeh'kinya's continuation for Sunken Temple.",
    bridge:
      "Keep Yeh'kinya's Sunken Temple continuation, then prepare Maraudon's Desolace pickups for its higher-level first visit. No completion checkbox awards XP.",
    notes: ["Gahz'rilla's current reward is unknown in this audit."],
    quests: choices([2991, 2768, 2846, 3527], [2770, 2865, 3042]),
    dataStatus: "historical-reference",
  },
  {
    id: "alcaz",
    name: "Alcaz Prison",
    visitIds: [],
    level: 50,
    zone: "Dustwallow Marsh",
    preparation:
      "Plan the optional Dustwallow visit with four faction quest slots. Access and identities are pending; Missing Diplomat is not assumed to unlock it.",
    clear:
      "All four guaranteed quest slots are selected for planning. Exact objectives remain pending; you may skip the dungeon without reporting quest completion.",
    handIn: `Forecast four level-${DEFAULT_DUNGEON_BUNDLE_LEVELS.alcaz} rewards from the Dalaran reward tier. These estimates are not earned XP; save actual bars after real hand-ins.`,
    bridge:
      "Retain the ZF→ST world chain and use actual XP for the Temple gate, including when you skip Alcaz.",
    notes: [
      `Four owner-confirmed quests per faction; quest level ${DEFAULT_DUNGEON_BUNDLE_LEVELS.alcaz} is an editable planning input. Exact pickup, objective and hand-in details are pending.`,
    ],
    quests: [],
    dataStatus: "guaranteed-bundle",
  },
  {
    id: "sunken-temple",
    name: "Sunken Temple",
    visitIds: ["sunken-temple"],
    level: 51,
    zone: "Swamp of Sorrows",
    preparation:
      "Prepare the Brohann/Marvon stages and ZF→Yeh'kinya→Hakkar chain before the level-51 visit. Verify summon materials; class quests are separate personal additions.",
    clear:
      "Follow the selected temple, circle, prophet and summoned-boss objectives. Do not promise every class's quest reward to all five members.",
    handIn:
      "Include the real remote hand-ins and chain items. Avoid an unrelated long Haze detour unless prepared or selected.",
    bridge:
      "Batch Burning Steppes and BRD preparation with shared-kill XP. The historical bundle does not establish two levels from one clear.",
    notes: ["ZF completion alone is not the entire Hakkar/Final Tablets prerequisite chain."],
    quests: choices([1475, 1446, 3373, 3446, 3447, 3528], [4143]),
    dataStatus: "historical-reference",
  },
  {
    id: "blackrock-depths",
    name: "Blackrock Depths + raid preparation",
    visitIds: ["brd-prison", "brd-emperor"],
    level: 55,
    zone: "Burning Steppes",
    preparation:
      "Batch SW/IF/Burning Steppes. Separate the prison/unlock probe, outside hand-ins and main route for Windsor and the royal chain. Prepare Incendius' outside Pyron stage.",
    clear:
      "Complete the scoped main quest route. With raid goals enabled, retrieve the MC fragment, finish Shadowforge and the available Windsor/royal legs, with any required returns.",
    handIn:
      "Hand in at the actual chain hubs. The full Onyxia attunement continues through outside work and UBRS; it is not complete at BRD 55.",
    bridge:
      "Prepare the LBRS pickups and Final Tablets chain; fill the measured XP gap without Love Potion material farming or unprepared Taste of Flame detours.",
    notes: [
      "This composite contains multiple route legs, not all rewards from a single entry.",
      "Raid preparation adds time; it is a selected goal, not free XP.",
    ],
    quests: choices(
      [4263, 4126, 4136, 4123],
      [4286, 4201, 4024],
      [7848, 3802, 4241, 4322, 4341, 4362],
    ),
    dataStatus: "historical-reference",
  },
  {
    id: "lower-blackrock",
    name: "Lower Blackrock Spire · conditional second visit",
    visitIds: ["lower-blackrock"],
    level: 57,
    zone: "Burning Steppes",
    preparation:
      "Stage Burning Steppes quests and the ST-linked Final Tablets. Assign a key holder; everyone-keyed is a different goal from one party key.",
    clear:
      "Complete the selected first-visit quests. A second gem visit is conditional on missing inventory; its one-time quest rewards never pay again. Extra RNG attempts may still be needed.",
    handIn:
      "Deliver the selected rewards; Seal forging at Emberstrife and Vaelan's return are separate outside steps. Mother's Milk is an optional risky transport goal.",
    bridge:
      "Batch Plaguelands preparations and actual XP until the selected Stratholme bundle can finish the group. Do not force entry at fresh 58.",
    notes: [
      "Requested 57 is below the conservative At-level 60 band.",
      "Two clears do not guarantee three personal gems for all five.",
    ],
    quests: choices([4701, 5089, 5001, 4867, 4788], [4862, 4729, 4866], [4742]),
    dataStatus: "historical-reference",
  },
  {
    id: "stratholme",
    name: "Stratholme · adaptive finish to 60",
    visitIds: ["stratholme-live", "stratholme-undead"],
    level: 59,
    zone: "Eastern Plaguelands",
    preparation:
      "Prepare the selected WPL/EPL bundle and Egan's item. Love and Family is an optional prepared branch, not part of the four-quest speed core. Choose living/dead/both-side scope explicitly.",
    clear:
      "Complete the selected tobacco, soul, Archivist and supply objectives. Painting/samples are optional prepared branches, not free core rewards.",
    handIn:
      "Batch the actual outside deliveries. Archivist/sample follow-ups and cross-instance/Dungeon Set 2 stages are deferred rather than counted in the first visit.",
    bridge:
      "Confirm all five reached 60 using actual XP. If short, use a reviewed shared-kill top-up; predictions do not mark the guide complete.",
    notes: [
      "The four historical speed-core rewards estimate 76,700 XP before kills: approximately level 59 + 64% entry for a quest-only finish. Current reward evidence and actual XP still apply.",
      "The current conservative band is 60; pre-60 entry is an explicitly selected expert proposal.",
    ],
    quests: choices(
      [5214, 5251, 5282, 5243],
      [5212, 5122, 5125, 5848],
      [],
      [5262, 5213, 5263, 5463, 8945],
    ),
    dataStatus: "historical-reference",
  },
];

// The compiler, reader and legacy checklist share one level-ordered circuit.
// Derive the next checkpoint so moving a dungeon cannot retain its old successor.
const orderedStops = [...stopDefinitions].sort((left, right) => left.level - right.level);
export const PREMADE_STOPS: readonly PremadeStop[] = orderedStops.map((stop, index) => ({
  ...stop,
  nextLevel: orderedStops[index + 1]?.level ?? 60,
}));

export function getPremadeStop(id: string): PremadeStop | null {
  return PREMADE_STOPS.find((stop) => stop.id === id) ?? null;
}
export function updatePremadeDungeonBundle(
  progress: PremadeProgress,
  bundle: DungeonBundle,
): PremadeProgress {
  return premadeProgressSchema.parse({
    ...progress,
    guaranteedBundles: {
      ...progress.guaranteedBundles,
      [dungeonBundleKey(bundle.dungeonId, bundle.faction)]: bundle,
    },
  });
}
export function getPremadeQuest(id: number): DungeonQuest | null {
  return DUNGEON_QUESTS.find((quest) => quest.id === id) ?? null;
}

export function selectedPremadeQuests(
  stop: PremadeStop,
  progress: PremadeProgress,
): readonly PremadeQuestChoice[] {
  return stop.quests.filter((quest) => premadeQuestSelected(quest, progress));
}

const separatePreparationQuests = new Set([92753, 2962, 4143, 4201, 5848]);

export function premadeQuestSelected(
  choice: PremadeQuestChoice,
  progress: PremadeProgress,
): boolean {
  if (choice.role === "core") return true;
  if (choice.role === "raid") return progress.raidGoals;
  if (choice.role !== "opportunistic") return false;
  return (
    progress.selectedExtras[String(choice.questId)] ??
    !separatePreparationQuests.has(choice.questId)
  );
}

export function setPremadeQuestPackage(
  stop: PremadeStop,
  progress: PremadeProgress,
  includeOptional: boolean,
): PremadeProgress {
  const selectedExtras = { ...progress.selectedExtras };
  for (const choice of stop.quests)
    if (choice.role === "opportunistic") selectedExtras[String(choice.questId)] = includeOptional;
  return premadeProgressSchema.parse({ ...progress, selectedExtras });
}

export function premadePreparationQuests(
  stop: PremadeStop,
  progress: PremadeProgress,
): readonly DungeonQuest[] {
  const result = new Map<number, DungeonQuest>();
  const selected = new Set(selectedPremadeQuests(stop, progress).map((quest) => quest.questId));
  function collect(id: number): void {
    const quest = getPremadeQuest(id);
    if (!quest || result.has(id)) return;
    for (const parent of gateQuestIds(quest.gate)) collect(parent);
    result.set(id, quest);
  }
  for (const id of selected) {
    const quest = getPremadeQuest(id);
    if (quest) for (const parent of gateQuestIds(quest.gate)) collect(parent);
  }
  return [...result.values()].filter((quest) => !selected.has(quest.id));
}
export function premadeEntryLevel(
  stop: PremadeStop,
  progress: PremadeProgress,
  facts: readonly QuestRewardFact[] = [],
): number {
  const atLevel = Math.max(
    stop.id === "dalaran" ? 31 : stop.level,
    ...stop.visitIds.map(
      (id) => DUNGEON_VISITS.find((visit) => visit.id === id)?.levels?.atLevel ?? stop.level,
    ),
  );
  return Math.max(
    progress.difficultyPolicy === "at-level" ? atLevel : stop.level,
    ...selectedPremadeQuests(stop, progress).map(
      (choice) => questEligibility(choice.questId, facts).minimumLevel ?? stop.level,
    ),
  );
}
export interface PremadeRewardReference {
  readonly baseXp: number | null;
  readonly questLevel: number | null;
  readonly source: string;
}

export function getPremadeRewardReference(questId: number): PremadeRewardReference | null {
  const reference = baselineData.records.find((quest) => quest.id === questId);
  return reference
    ? {
        baseXp: reference.baseXp,
        questLevel: reference.questLevel,
        source: `Historical reference: ${reference.source}`,
      }
    : null;
}

export function premadeReward(choice: PremadeQuestChoice, level: number): DungeonRewardEstimate {
  return estimateDungeonReward(
    choice.questId,
    level,
    getPremadeRewardReference(choice.questId) ?? undefined,
  );
}
export interface PremadeMemberForecast {
  readonly knownQuestXp: number;
  readonly bundleQuestXp: number;
  readonly bundleRewards: readonly DungeonBundleRewardRow[];
  readonly unknownBundleSlotKeys: readonly string[];
  readonly unknownQuestIds: readonly number[];
  readonly requiredXp: number | null;
  readonly gapXp: number | null;
  readonly parityGapXp: number | null;
  readonly endpoint: {
    readonly level: number;
    readonly currentXp: number;
    readonly percent: number;
  } | null;
  readonly actualReady: boolean;
}
export function forecastPremadeMember(
  stop: PremadeStop,
  progress: PremadeProgress,
  member: PremadeMember,
  resolveReward: (
    choice: PremadeQuestChoice,
    level: number,
  ) => DungeonRewardEstimate = premadeReward,
): PremadeMemberForecast {
  const valid =
    member.level !== null &&
    member.currentXp !== null &&
    (member.level === 60
      ? member.currentXp === 0
      : member.currentXp < (FOREVER_XP_CURVE[member.level] ?? 0));
  const atLevel = member.level ?? premadeEntryLevel(stop, progress);
  const choices = selectedPremadeQuests(stop, progress).filter(
    (choice) =>
      member.questStates[String(choice.questId)] !== "rewarded" &&
      (!getPremadeQuest(choice.questId)?.classSlug ||
        getPremadeQuest(choice.questId)?.classSlug === member.classSlug),
  );
  let handInLevel = atLevel,
    handInXp = valid ? member.currentXp! : 0;
  const rewards = choices.map((choice) => {
    const minimum = getPremadeQuest(choice.questId)?.minimumLevel;
    const reward: DungeonRewardEstimate =
      minimum !== null && minimum !== undefined && atLevel < minimum
        ? {
            xp: null,
            basis: "unknown",
            source: "The pickup gate must be met before this reward can be planned.",
          }
        : resolveReward(choice, handInLevel);
    handInXp += reward.xp ?? 0;
    while (handInLevel < 60 && handInXp >= FOREVER_XP_CURVE[handInLevel]!) {
      handInXp -= FOREVER_XP_CURVE[handInLevel]!;
      handInLevel++;
    }
    return { choice, reward };
  });
  const knownQuestXp = rewards.reduce((sum, entry) => sum + (entry.reward.xp ?? 0), 0);
  const bundle =
    stop.dataStatus === "guaranteed-bundle"
      ? getDungeonBundle(stop.id, "alliance", progress.guaranteedBundles)
      : null;
  const bundleForecast = bundle
    ? forecastDungeonBundle(
        bundle,
        valid ? { level: handInLevel, currentXp: handInXp } : null,
        {
          ...member,
          questStates: {
            ...member.questStates,
            ...Object.fromEntries(
              rewards
                .filter((entry) => entry.reward.xp !== null)
                .map((entry) => [entry.choice.questId, "rewarded"]),
            ),
          },
        },
        (questId, level) => resolveReward({ questId, role: "core" }, level),
      )
    : null;
  const bundleQuestXp = (bundleForecast?.referenceXp ?? 0) + (bundleForecast?.estimatedXp ?? 0);
  const unknownQuestIds = rewards
    .filter((entry) => entry.reward.xp === null)
    .map((entry) => entry.choice.questId);
  const nextStop = PREMADE_STOPS[PREMADE_STOPS.findIndex((entry) => entry.id === stop.id) + 1];
  const target = nextStop ? premadeEntryLevel(nextStop, progress) : 60;
  const requiredXp =
    valid && !member.xpNeedsUpdate
      ? xpToCheckpoint(member.level!, member.currentXp!, target, FOREVER_XP_CURVE)
      : null;
  const gapXp =
    requiredXp === null || bundleForecast?.unknownSlotKeys.length
      ? null
      : Math.max(0, requiredXp - knownQuestXp - bundleQuestXp);
  const parity = progress.parityScenarios[stop.id];
  const parityXp =
    !parity || parity.baseXp === null
      ? null
      : parity.extraQuests *
        (50 * Math.round((parity.baseXp * ORDINARY_DUNGEON_XP_MULTIPLIER) / 50));
  let endpoint: PremadeMemberForecast["endpoint"] = null;
  if (valid && !member.xpNeedsUpdate && !bundleForecast?.unknownSlotKeys.length) {
    let level = member.level!,
      xp = member.currentXp! + knownQuestXp + bundleQuestXp;
    while (level < 60 && xp >= FOREVER_XP_CURVE[level]!) {
      xp -= FOREVER_XP_CURVE[level]!;
      level++;
    }
    endpoint = {
      level,
      currentXp: level === 60 ? 0 : xp,
      percent: level === 60 ? 100 : Math.floor((xp / FOREVER_XP_CURVE[level]!) * 1000) / 10,
    };
  }
  return {
    knownQuestXp,
    bundleQuestXp,
    bundleRewards: bundleForecast?.rows ?? [],
    unknownBundleSlotKeys: bundleForecast?.unknownSlotKeys ?? [],
    unknownQuestIds,
    requiredXp,
    gapXp,
    parityGapXp: gapXp === null || parityXp === null ? null : Math.max(0, gapXp - parityXp),
    endpoint,
    actualReady: valid && !member.xpNeedsUpdate && member.level! >= target,
  };
}
export function premadeCheckpointReasons(
  stop: PremadeStop,
  progress: PremadeProgress,
): readonly string[] {
  const reasons: string[] = [];
  if (stop.dataStatus === "missing-quest-data" || stop.dataStatus === "guaranteed-bundle")
    reasons.push(
      "The guaranteed quest count is included in planning, but exact quest/access details are pending. Use Next without Done to skip; do not report an unidentified bundle as a verified completed run.",
    );
  if (
    !progress.members.every((member) => forecastPremadeMember(stop, progress, member).actualReady)
  )
    reasons.push("Save fresh actual level/XP for all five at or above the next stop's gate.");
  const mandatory = selectedPremadeQuests(stop, progress).filter(
    (choice) => choice.role === "core" || choice.role === "raid",
  );
  for (const [index, member] of progress.members.entries()) {
    if (mandatory.some((choice) => member.questStates[String(choice.questId)] !== "rewarded"))
      reasons.push(
        `Player ${index + 1}: required quest/selected key stages still need their real hand-ins.`,
      );
    const plan = {
      ...emptyDungeonPlan(),
      questStates: member.questStates,
      confirmations: member.confirmations,
    };
    if (
      mandatory.some((choice) => {
        const quest = getPremadeQuest(choice.questId);
        return (
          quest &&
          quest.pickupStage !== "unknown" &&
          evaluateDungeonGate(quest.gate, plan) !== "ready"
        );
      })
    )
      reasons.push(`Player ${index + 1}: prerequisite or item eligibility has not been confirmed.`);
  }
  return reasons;
}
export function updatePremadeQuestState(
  progress: PremadeProgress,
  memberIndex: number,
  questId: number,
  state: PremadeMember["questStates"][string],
): PremadeProgress {
  if (!getPremadeQuest(questId) || !progress.members[memberIndex])
    throw new Error("Invalid party member or quest identity.");
  return premadeProgressSchema.parse({
    ...progress,
    members: progress.members.map((member, index) =>
      index === memberIndex
        ? {
            ...member,
            questStates: { ...member.questStates, [questId]: state },
            xpNeedsUpdate:
              member.xpNeedsUpdate ||
              (member.questStates[String(questId)] === "rewarded") !== (state === "rewarded"),
          }
        : member,
    ),
  });
}
export function recordPremadeXp(
  progress: PremadeProgress,
  memberIndex: number,
  level: number,
  currentXp: number,
): PremadeProgress {
  if (
    !progress.members[memberIndex] ||
    !Number.isInteger(level) ||
    level < 1 ||
    level > 60 ||
    !Number.isInteger(currentXp) ||
    currentXp < 0 ||
    (level === 60 ? currentXp !== 0 : currentXp >= FOREVER_XP_CURVE[level]!)
  )
    throw new Error("Enter a level from 1–60 and XP below the next-level requirement (0 at 60).");
  return premadeProgressSchema.parse({
    ...progress,
    members: progress.members.map((member, index) => {
      if (index !== memberIndex) return member;
      const updated = { ...member, level, currentXp, xpNeedsUpdate: false };
      delete updated.guideXpAnchor;
      return updated;
    }),
  });
}
export function advancePremadeStage(progress: PremadeProgress, done: boolean): PremadeProgress {
  const stopIndex = PREMADE_STOPS.findIndex((stop) => stop.id === progress.selectedStopId);
  const stop = PREMADE_STOPS[stopIndex];
  if (!stop) throw new Error("Unknown circuit stop.");
  const stageIndex = PREMADE_STAGES.findIndex((stage) => stage.id === progress.selectedStage);
  const next = PREMADE_STAGES[stageIndex + 1];
  if (done && !next && premadeCheckpointReasons(stop, progress).length > 0)
    throw new Error(premadeCheckpointReasons(stop, progress)[0]);
  const nextStop = PREMADE_STOPS[stopIndex + 1];
  return premadeProgressSchema.parse({
    ...progress,
    stages: done
      ? { ...progress.stages, [`${stop.id}-${progress.selectedStage}`]: true }
      : progress.stages,
    selectedStage: next?.id ?? (nextStop ? "prepare" : "checkpoint"),
    selectedStopId: next ? stop.id : (nextStop?.id ?? stop.id),
  });
}
