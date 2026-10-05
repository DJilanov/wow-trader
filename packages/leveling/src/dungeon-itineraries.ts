import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import {
  dungeonRouteOption,
  chapterDungeonOptions,
  dungeonTripKey,
  createDungeonTrip,
  type DungeonRouteOption,
  type DungeonTrip,
} from "./dungeon-route-options.js";
import { dungeonPrerequisiteClosure, getDungeonQuest } from "./dungeon-planner.js";
import { getChapterLabel, chapterEligibility, type ChapterReference } from "./chapter-catalog.js";
import { FOREVER_XP_CURVE, LEVELING_EVIDENCE } from "./westfall.js";
import { getGuideStepView, type ImportedChapter, type GuideStepView } from "./guide-archive.js";
import type { CharacterProfile } from "./profile.js";
import type { PersonalDungeonPlan } from "./dungeon-model.js";

export interface DungeonItineraryDefinition {
  readonly area: string;
  readonly scope: string;
  readonly preparation: string;
  readonly exit: string;
  readonly allianceFit: string;
  readonly hordeFit: string;
}

export const DUNGEON_ITINERARIES: Readonly<Record<string, DungeonItineraryDefinition>> = {
  ragefire: {
    area: "Orgrimmar",
    scope: "Complete the selected RFC objectives and the inside-start quest.",
    preparation:
      "Collect the Orgrimmar, Undercity and Thunder Bluff quests; finish the outside lead-ins first.",
    exit: "Hand in around Orgrimmar and include remaining Undercity / Thunder Bluff journeys.",
    allianceFit: "Horde quest plan; not an Alliance XP alternative.",
    hordeFit:
      "A local option when the route passes Orgrimmar; Thunder Bluff preparation still counts.",
  },
  thanes: {
    area: "Old Ironforge",
    scope: "Four-quest level-15 run; the level-16 Treaty is a separate bonus.",
    preparation: "Finish Underground Map and collect the compatible Ironforge quests.",
    exit: "Keep the Darkshore carryovers and check actual level before the level-16 continuation.",
    allianceFit: "Reviewed Darkshore 15→16 replacement; Ironforge travel belongs in the trip.",
    hordeFit:
      "Cross-faction travel and quest eligibility need review; not the Alliance replacement.",
  },
  "wailing-caverns": {
    area: "The Barrens",
    scope: "Selected cavern objectives, then the Naralex event if collecting the Glowing Shard.",
    preparation:
      "Pick up the cave and Ratchet quests. Add Smart Drinks or Leaders of the Fang only with their remaining chains.",
    exit: "Complete the Ratchet/shard handoff, cave hand-ins and applicable Thunder Bluff rewards.",
    allianceFit:
      "Prefer the authored Ashenvale 21–23 branch, not a special trip from Stormwind at 19.",
    hordeFit: "Fits a Barrens route; account for Ratchet, the oasis chain and Thunder Bluff.",
  },
  deadmines: {
    area: "Westfall",
    scope:
      "Outer mine objectives plus the VanCleef clear and Unsent Letter; explosives are an optional prepared chain.",
    preparation:
      "Stormwind pickups, Defias handoffs and Sentinel Hill escort. Do not require the long explosives chain unless prepared.",
    exit: "Sentinel Hill and Stormwind hand-ins. With explosives, use the back exit and meet Alba before leaving.",
    allianceFit:
      "A source-authored 19→20 candidate from Stormwind/Westfall, with retained route preparations.",
    hordeFit: "No compatible general Horde XP bundle; not a leveling alternative.",
  },
  lordaeron: {
    area: "Tirisfal Glades",
    scope:
      "Find the selected quest objects and complete their bosses; optional boss events are separate detours.",
    preparation:
      "Alliance quests start inside. Horde needs Brill, Undercity and The Sepulcher pickups.",
    exit: "Alliance rewards include Stormwind hand-ins; Horde returns through its northern quest hubs.",
    allianceFit:
      "New-content adventure with a long northern journey; compare full travel before choosing it for speed.",
    hordeFit:
      "Strong geographic fit when already in Tirisfal/Silverpine, not automatically when leveling in the Barrens.",
  },
  shadowfang: {
    area: "Silverpine Forest",
    scope:
      "Horde general boss objectives; Paladin and Warlock collection chains are separate goals.",
    preparation:
      "Collect the Undercity and Sepulcher quests. Do not count multi-dungeon class rewards as this run's XP.",
    exit: "Return to the Sepulcher and Undercity; keep any class materials for their later hand-in.",
    allianceFit: "Usually a class/gear trip rather than a general Alliance quest-XP replacement.",
    hordeFit: "A northern 23+ option if the source route and party are nearby.",
  },
  blackfathom: {
    area: "Ashenvale",
    scope:
      "Complete the selected BFD objectives and inside Thaelrid handoff; Aquanis requires its own objective.",
    preparation:
      "Alliance: Ironforge, Darnassus and Darkshore work. Horde: Zoram'gar. Class collections are optional.",
    exit: "Finish faction-specific hand-ins; an inside pickup does not mean the reward is paid inside.",
    allianceFit:
      "Fits the Ashenvale/Darkshore journey after level 25; remote city pickups are not free.",
    hordeFit: "Fits Zoram'gar/Ashenvale at 25+ with prepared quests.",
  },
  stockade: {
    area: "Stormwind",
    scope:
      "One selected Stockades clear; do not include later justice-chain rewards in the same clear.",
    preparation:
      "Collect Stormwind quests, stage Redridge/Duskwood/Wetlands pickups and finish the Unsent Letter chain if needed.",
    exit: "Stormwind hand-ins first, then only the remote rewards actually selected.",
    allianceFit:
      "Local 26+ option while passing Stormwind; remote preparation can outweigh the short clear.",
    hordeFit: "Alliance quest plan; not a Horde XP alternative.",
  },
  excavation: {
    area: "Wetlands",
    scope:
      "Selected Wetlands objectives; relic starts and their later follow-ups are separate stages.",
    preparation:
      "Stage Menethil, Redridge and any Ashenvale lead-ins. Review Daily Delivery and faction restrictions.",
    exit: "Hand in the relic's first stage before its faction-specific follow-up; do not pay both on pickup.",
    allianceFit: "A 29→30 candidate when the route is already in Wetlands, after chain review.",
    hordeFit: "Travel and faction-specific chains need review before an XP replacement.",
  },
  gnomeregan: {
    area: "Dun Morogh",
    scope:
      "One scoped run; upgraded punch cards, escort and ring work can add detours or another visit.",
    preparation:
      "Stage faction city pickups. Review the Horde transport chain and normal versus keyed back entrance.",
    exit: "Complete city hand-ins; do not assume one clear completes later green-glow or ring stages.",
    allianceFit: "Future 33+ plan near Ironforge/Dun Morogh.",
    hordeFit:
      "Future 33+ plan with the reviewed Scooty transport chain, not a guessed overland journey.",
  },
  "razorfen-kraul": {
    area: "Southern Barrens",
    scope: "Selected RFK objectives and inside escort; the RFD follow-up belongs to another trip.",
    preparation:
      "Stage Thunder Bluff, Ratchet, Undercity or Feralas quests for the compatible bundle.",
    exit: "Hand in only this stage; preserve Guano/Unholy Alliance for later dungeon chains.",
    allianceFit: "Future 31+ Barrens detour; include Feralas preparation and return.",
    hordeFit: "Future 31+ Barrens option with its actual city pickups.",
  },
  "sm-graveyard": {
    area: "Tirisfal Glades",
    scope: "Graveyard only, not an all-wings completion.",
    preparation: "Stage the RFK-dependent Hearts of Zeal and check inside Vorrel work.",
    exit: "Vorrel's outdoor stage and hand-in need a separate journey; other wings do not pay here.",
    allianceFit: "Future 37+ northern detour with limited standalone general quest XP.",
    hordeFit: "Future 37+ local wing plan; shared rewards must remain scoped.",
  },
  "sm-library": {
    area: "Tirisfal Glades",
    scope: "Library objectives only; class books and long lore chains are separate bundle choices.",
    preparation: "Review lore, race restrictions, Ironforge and Mage preparation before entry.",
    exit: "Return books to their actual quest hubs; no rewards from uncleared wings.",
    allianceFit: "Future 37+ northern Library plan.",
    hordeFit: "Future 37+ Library plan; Undead restrictions need explicit filtering.",
  },
  "sm-all-wings": {
    area: "Tirisfal Glades",
    scope: "A composite itinerary across every wing required by the chosen quest, not one clear.",
    preparation: "Complete the faction's long lead-ins and check locked-wing access.",
    exit: "Pay shared boss quests once after all their objectives and the final hand-in.",
    allianceFit: "Future 37+ full monastery adventure with northern travel.",
    hordeFit: "Future 37+ composite plan, with each wing and travel segment charged once.",
  },
  "sm-armory": {
    area: "Tirisfal Glades",
    scope: "Armory boss scope; compatible all-wings work remains incomplete after this wing alone.",
    preparation:
      "Confirm Scarlet Key or reviewed lockpicking access and the composite quest state.",
    exit: "Continue to required wings or hand in only independently completed objectives.",
    allianceFit: "Future 37+ wing/gear plan, not a standalone all-wings XP total.",
    hordeFit: "Future 37+ scoped wing plan.",
  },
  "sm-cathedral": {
    area: "Tirisfal Glades",
    scope:
      "Cathedral boss scope; complete shared quests only if the other required bosses are done.",
    preparation: "Confirm locked entrance access and the remaining composite objectives.",
    exit: "Finish compatible complete quests at their faction hub.",
    allianceFit: "Future 37+ final-wing or gear plan.",
    hordeFit: "Future 37+ final-wing plan; no duplicate shared rewards.",
  },
  "razorfen-downs": {
    area: "Southern Barrens",
    scope: "Selected RFD objectives and the Belnistrasz escort sequence.",
    preparation: "Prepare the RFK follow-up, faction pickups and required party-wide escort stage.",
    exit: "Finish faction hand-ins; keep one-time shared quest rewards separate from the earlier RFK run.",
    allianceFit: "Future 39+ plan; beta access at 25 does not authorize an earlier recommendation.",
    hordeFit: "Future 39+ plan with RFK prerequisite work retained.",
  },
  uldaman: {
    area: "Badlands",
    scope:
      "One reviewed objective route; necklace recovery, tablets and discs may have different visit stages.",
    preparation: "Collect the Badlands/Loch Modan/city bundle and inspect its prerequisite stages.",
    exit: "Return each artifact to its proper hub; later necklace stages are not this run's rewards.",
    allianceFit: "Future 42+ Badlands plan; access at 30 does not lower the schedule.",
    hordeFit: "Future 42+ Badlands/Kargath plan after lifecycle review.",
  },
  dalaran: {
    area: "Dalaran",
    scope: "Reference quest itinerary only until the visit level and access are reviewed.",
    preparation:
      "Review faction pickups and the current content release; do not infer entry from quest minima.",
    exit: "Review the compatible faction hand-ins before comparing a trip.",
    allianceFit: "Unscheduled reference, not an automatic chapter replacement.",
    hordeFit: "Unscheduled reference, not an automatic chapter replacement.",
  },
  "zul-farrak": {
    area: "Tanaris",
    scope: "Selected full-clear/escort objectives; Gahz'rilla is an optional gated summon.",
    preparation:
      "Stage Gadgetzan and remote chains; include Mallet preparation only for the selected summon.",
    exit: "Tanaris and remote hand-ins belong in total time, not just the clear.",
    allianceFit: "Future 44+ Tanaris XP-segment candidate, not the whole Feralas chapter.",
    hordeFit: "Future 44+ Tanaris plan with faction chains staged on the route.",
  },
  maraudon: {
    area: "Desolace",
    scope:
      "Separate purple/orange/Princess objectives; a shortcut run is not the full quest bundle.",
    preparation: "Review faction lead-ins, access/shortcut state and each objective's wing.",
    exit: "Complete Desolace and distant rewards only after their required scope.",
    allianceFit: "Future 46+ wing-specific Desolace plan.",
    hordeFit: "Future 46+ wing-specific Desolace plan.",
  },
  "sunken-temple": {
    area: "Swamp of Sorrows",
    scope: "A selected boss/summon route; class collection goals are not interchangeable.",
    preparation: "Finish the selected long faction/class chains and acquire summon materials.",
    exit: "Hand in at the relevant class/faction hubs; count final rewards only once.",
    allianceFit: "Future 51+ plan with substantial remote preparation.",
    hordeFit: "Future 51+ plan with substantial remote preparation.",
  },
  "brd-prison": {
    area: "Blackrock Mountain",
    scope: "Prison subrun only; Emperor/forge/arena objectives are not silently included.",
    preparation: "Review prison objective membership and applicable access/attunement stages.",
    exit: "Hand in completed prison stages; continue elsewhere only as a separate scoped run.",
    allianceFit: "Future 55+ prison plan; quest-to-subrun binding still needs review.",
    hordeFit: "Future 55+ prison plan; quest-to-subrun binding still needs review.",
  },
  "brd-emperor": {
    area: "Blackrock Mountain",
    scope: "A full Emperor route, with prison/arena/forge detours included only when selected.",
    preparation:
      "Check keys, attunements, faction/profession gates and the selected path through BRD.",
    exit: "Separate immediate rewards from later stages and remote hand-ins.",
    allianceFit: "Future 55+ full-run plan, not the short prison itinerary.",
    hordeFit: "Future 55+ full-run plan, not the short prison itinerary.",
  },
  "dire-maul-east": {
    area: "Feralas",
    scope: "East-wing objectives and any explicitly selected summon/access work.",
    preparation: "Stage Feralas and distant quest hubs; keep West/North chains separate.",
    exit: "Hand in East-compatible objectives; later wings belong to another trip.",
    allianceFit: "Future 56+ East-wing plan near Feralas.",
    hordeFit: "Future 56+ East-wing plan near Feralas.",
  },
  "dire-maul-west": {
    area: "Feralas",
    scope: "West-wing endgame objectives, with access and summon scope checked.",
    preparation: "Prepare keys and compatible endgame quest stages.",
    exit: "Complete the selected endgame hand-ins, not a level-61 checkpoint.",
    allianceFit: "Level-60 gear/quest plan, not pre-60 leveling.",
    hordeFit: "Level-60 gear/quest plan, not pre-60 leveling.",
  },
  "dire-maul-north": {
    area: "Feralas",
    scope: "Choose a normal or tribute-style North route; do not combine contradictory objectives.",
    preparation: "Check required items and compatible route/quest state.",
    exit: "Hand in only rewards available from the chosen clear.",
    allianceFit: "Level-60 gear/quest plan, not pre-60 leveling.",
    hordeFit: "Level-60 gear/quest plan, not pre-60 leveling.",
  },
  "lower-blackrock": {
    area: "Blackrock Mountain",
    scope: "LBRS objectives and the applicable first attunement stages.",
    preparation: "Prepare faction endgame quests and retain UBRS follow-up requirements.",
    exit: "Complete this stage before linking a later UBRS itinerary.",
    allianceFit: "Level-60 gear/attunement plan.",
    hordeFit: "Level-60 gear/attunement plan.",
  },
  "upper-blackrock": {
    area: "Blackrock Mountain",
    scope: "UBRS endgame objectives after reviewed group size and access.",
    preparation:
      "Review the twelve source quest identities, keys and LBRS prerequisites; do not assume a five-player run.",
    exit: "Finish the compatible faction/attunement rewards once.",
    allianceFit: "Level-60 reference until Forever access/group rules are confirmed.",
    hordeFit: "Level-60 reference until Forever access/group rules are confirmed.",
  },
  scholomance: {
    area: "Western Plaguelands",
    scope: "Selected Scholomance objectives, with multi-visit stages separate.",
    preparation: "Check key/unlock work and applicable class/faction lead-ins.",
    exit: "Complete only the finished quest stages at their actual hubs.",
    allianceFit: "Level-60 gear/quest plan.",
    hordeFit: "Level-60 gear/quest plan.",
  },
  "stratholme-live": {
    area: "Eastern Plaguelands",
    scope:
      "Living-wing objectives; cross-wing work remains incomplete until its full scope is done.",
    preparation: "Stage Plaguelands quests and required access/summon items.",
    exit: "Finish Living-compatible rewards; do not pay shared quests twice.",
    allianceFit: "Level-60 Living-wing gear/quest plan.",
    hordeFit: "Level-60 Living-wing gear/quest plan.",
  },
  "stratholme-undead": {
    area: "Eastern Plaguelands",
    scope:
      "Undead-wing objectives, with timed/summon and cross-instance chains reviewed separately.",
    preparation: "Check access, party readiness and which timed objectives are actually selected.",
    exit: "Complete this wing's valid rewards, retaining later cross-instance work.",
    allianceFit: "Level-60 Undead-wing gear/quest plan.",
    hordeFit: "Level-60 Undead-wing gear/quest plan.",
  },
};

export interface XpEndpoint {
  readonly level: number;
  readonly currentXp: number;
  readonly percent: number;
}

export function dungeonXpEndpoint(
  level: number,
  currentXp: number,
  gainedXp: number,
): XpEndpoint | null {
  if (
    !Number.isInteger(level) ||
    level < 1 ||
    level > 60 ||
    !Number.isSafeInteger(currentXp) ||
    currentXp < 0 ||
    (level === 60 ? currentXp !== 0 : currentXp >= (FOREVER_XP_CURVE[level] ?? 0)) ||
    !Number.isSafeInteger(gainedXp) ||
    gainedXp < 0
  )
    return null;
  let remaining = currentXp + gainedXp;
  if (!Number.isSafeInteger(remaining)) return null;
  let resultLevel = level;
  while (resultLevel < 60 && remaining >= FOREVER_XP_CURVE[resultLevel]!) {
    remaining -= FOREVER_XP_CURVE[resultLevel]!;
    resultLevel++;
  }
  return {
    level: resultLevel,
    currentXp: resultLevel === 60 ? 0 : remaining,
    percent:
      resultLevel === 60 ? 0 : Math.floor((100 * remaining) / FOREVER_XP_CURVE[resultLevel]!),
  };
}

export function itineraryDungeonOption(
  visitId: string,
  profile: CharacterProfile,
  plan: PersonalDungeonPlan,
): DungeonRouteOption {
  const visit = DUNGEON_VISITS.find((entry) => entry.id === visitId);
  if (!visit) throw new Error("Unknown dungeon itinerary");
  let option = dungeonRouteOption(visit, profile, plan);
  if (
    visitId === "deadmines" &&
    !plan.selectedQuests[visitId] &&
    plan.questStates["92752"] !== "rewarded" &&
    !["accepted", "objectives-complete", "rewarded"].includes(plan.questStates["92753"] ?? "")
  ) {
    option = dungeonRouteOption(visit, profile, {
      ...plan,
      selectedQuests: {
        ...plan.selectedQuests,
        [visitId]: option.questIds.filter((id) => id !== 92753),
      },
    });
  }
  if (
    visitId === "wailing-caverns" &&
    profile.faction === "alliance" &&
    !plan.selectedQuests[visitId] &&
    plan.questStates["865"] !== "rewarded" &&
    !["accepted", "objectives-complete", "rewarded"].includes(plan.questStates["1491"] ?? "")
  ) {
    option = dungeonRouteOption(visit, profile, {
      ...plan,
      selectedQuests: {
        ...plan.selectedQuests,
        [visitId]: option.questIds.filter((id) => id !== 1491),
      },
    });
  }
  if (
    visitId === "wailing-caverns" &&
    profile.faction === "alliance" &&
    option.schedule.state !== "reference-only"
  ) {
    const level = Math.max(21, option.schedule.level ?? 21);
    const schedule =
      profile.level === null
        ? {
            level,
            state: "unknown-level" as const,
            reasons: [`Confirm actual level ${level}+ for this Ashenvale alternative.`],
          }
        : profile.level < level
          ? {
              level,
              state: "too-early" as const,
              reasons: [
                `Continue to actual level ${level}; this Alliance itinerary starts from Ashenvale, not Stormwind.`,
              ],
            }
          : { level, state: "ready" as const, reasons: [] };
    option = {
      ...option,
      schedule,
      reasons: [
        ...option.reasons.filter((reason) => !option.schedule.reasons.includes(reason)),
        ...schedule.reasons,
      ],
    };
  }
  return option;
}

export function chapterDungeonItineraries(
  chapter: ChapterReference,
  profile: CharacterProfile,
  plan: PersonalDungeonPlan,
): readonly DungeonRouteOption[] {
  let options = chapterDungeonOptions(chapter, profile, plan).map((option) =>
    itineraryDungeonOption(option.visit.id, profile, plan),
  );
  if (profile.faction === "alliance") {
    options = options.filter((option) => option.visit.id !== "wailing-caverns");
    if (
      chapter.family === "questing" &&
      chapterEligibility(chapter, profile) !== "exclude" &&
      chapter.id === "chapter-8-21-23-stonetalon-ashenvale"
    ) {
      options = [...options, itineraryDungeonOption("wailing-caverns", profile, plan)];
    }
  }
  return options
    .filter((option) => option.questIds.length > 0 || option.schedule.state === "reference-only")
    .sort((a, b) => {
      const rank = (option: DungeonRouteOption): number => {
        const zone = getChapterLabel(chapter, profile).zone.toLowerCase();
        if (profile.faction === "alliance" && option.visit.id === "deadmines") return 0;
        if (
          profile.faction === "horde" &&
          option.visit.id === "wailing-caverns" &&
          /barrens|stonetalon/.test(zone)
        )
          return 0;
        if (option.visit.id === "lordaeron" && profile.faction === "alliance") return 3;
        return option.schedule.state === "reference-only" ? 4 : 1;
      };
      return rank(a) - rank(b) || a.visit.name.localeCompare(b.visit.name);
    });
}

export interface DungeonItineraryStage {
  readonly id: "prepare" | "travel" | "clear" | "hand-ins" | "bridge";
  readonly title: string;
  readonly description: string;
  readonly questIds: readonly number[];
}

export function dungeonItineraryStages(
  option: DungeonRouteOption,
  profile: CharacterProfile,
  plan: PersonalDungeonPlan,
): readonly DungeonItineraryStage[] {
  const definition = DUNGEON_ITINERARIES[option.visit.id];
  if (!definition) throw new Error("Dungeon itinerary definition missing");
  const pending = dungeonPrerequisiteClosure(option.questIds, plan).filter(
    (q) => plan.questStates[String(q.id)] !== "rewarded",
  );
  return [
    {
      id: "prepare",
      title: "Prepare on your route",
      description: definition.preparation,
      questIds: pending.filter((q) => q.pickupStage === "before").map((q) => q.id),
    },
    {
      id: "travel",
      title: `Meet at ${definition.area}`,
      description: profile.faction === "alliance" ? definition.allianceFit : definition.hordeFit,
      questIds: [],
    },
    {
      id: "clear",
      title: "Complete the selected run",
      description: definition.scope,
      questIds: option.questIds,
    },
    {
      id: "hand-ins",
      title: "Collect the actual quest rewards",
      description: definition.exit,
      questIds: option.questIds.filter((id) => plan.questStates[String(id)] !== "rewarded"),
    },
    {
      id: "bridge",
      title: "Check XP and continue",
      description:
        "Record your actual level and XP. Preserve required outdoor chains; use the reviewed continuation when available, otherwise resume your saved route.",
      questIds: [],
    },
  ];
}

export const REDRIDGE_DUNGEON_ALTERNATIVE = {
  id: "redridge-20-v1-70205",
  chapterId: "chapter-128-19-20-redridge",
  continuationId: "chapter-130-20-21-darkshore-ashenvale",
  targetLevel: 20,
  visitIds: ["deadmines", "lordaeron"],
  sourceSha256: "33e80ad167b461aa6b2d407406ef19f9a0f026f1c074b4272a4702b898a7a9b1",
  continuationSha256: "bb5c150b99b358f57840f1406ec62892c1cb986d232bd97598521d2243ce0695",
  carryoverIds: ["124", "3765", "cooking-50"],
} as const;

export interface DungeonContinuation {
  readonly definitionId: typeof REDRIDGE_DUNGEON_ALTERNATIVE.id;
  readonly chapterId: typeof REDRIDGE_DUNGEON_ALTERNATIVE.continuationId;
  readonly sourceVersion: string;
  readonly sourceSha256: string;
  readonly stepId: string;
  readonly targetLevel: number;
  readonly retainedSteps: readonly GuideStepView[];
  readonly carryoverQuestIds: readonly number[];
}

export function dungeonContinuation(
  visitId: string,
  source: ImportedChapter,
  next: ImportedChapter | null,
  profile: CharacterProfile,
): DungeonContinuation | null {
  // The ordinal bridge is reviewed only for this exact import and character variant.
  const definition = REDRIDGE_DUNGEON_ALTERNATIVE;
  if (
    !definition.visitIds.some((id) => id === visitId) ||
    source.chapterId !== definition.chapterId ||
    next?.chapterId !== definition.continuationId ||
    source.sourceSha256 !== definition.sourceSha256 ||
    next.sourceSha256 !== definition.continuationSha256 ||
    source.targetBuild !== LEVELING_EVIDENCE.clientBuild ||
    next.targetBuild !== source.targetBuild ||
    profile.faction !== "alliance" ||
    profile.raceId !== "human" ||
    profile.classSlug !== "warrior" ||
    profile.xpRate !== 1
  )
    return null;
  const nextViews = next.steps
    .map((step) => getGuideStepView(step, profile, { dungeons: [] }))
    .filter((view) => view.condition !== "exclude");
  const first = nextViews.find((view) => view.condition === "match");
  if (
    !first ||
    !nextViews.some((view) =>
      view.directives.some((d) => d.tag === ".turnin" && d.questId === 3765),
    )
  )
    return null;
  const retainedSteps = source.steps
    .map((step) => getGuideStepView(step, profile, { dungeons: [] }))
    .filter(
      (view) =>
        view.condition !== "exclude" &&
        ((view.step.ordinal < 37 && view.step.ordinal !== 23) ||
          (view.step.ordinal >= 160 && view.step.ordinal < 200) ||
          [110, 202, 206, 218, 221, 222].includes(view.step.ordinal)),
    );
  const scopedSteps = retainedSteps.map((view) =>
    [218, 222].includes(view.step.ordinal)
      ? {
          ...view,
          directives: view.directives.filter(
            (directive) =>
              (directive.questId === null || directive.questId === 124) &&
              (view.step.ordinal !== 218 || directive.tag !== "text"),
          ),
        }
      : view,
  );
  if (retainedSteps.some((view) => view.condition !== "match")) return null;
  if (
    !retainedSteps.some((view) =>
      view.directives.some((d) => d.tag === ".accept" && d.questId === 3765),
    )
  )
    return null;
  return {
    definitionId: definition.id,
    chapterId: definition.continuationId,
    sourceVersion: next.version,
    sourceSha256: next.sourceSha256,
    stepId: first.step.id,
    targetLevel: definition.targetLevel,
    retainedSteps: scopedSteps,
    carryoverQuestIds: [124, 3765],
  };
}

export function dungeonAlternativeKey(chapterId: string, visitId: string): string {
  return `${dungeonTripKey(chapterId, visitId)}--alternative`;
}

export function dungeonAlternativeSourceReasons(
  trip: DungeonTrip,
  continuation: DungeonContinuation | null,
): readonly string[] {
  if (!trip.alternative) return [];
  const saved = trip.alternative;
  return continuation &&
    saved.definitionId === continuation.definitionId &&
    saved.chapterId === continuation.chapterId &&
    saved.sourceVersion === continuation.sourceVersion &&
    saved.sourceSha256 === continuation.sourceSha256 &&
    saved.stepId === continuation.stepId &&
    trip.targetLevel === continuation.targetLevel
    ? []
    : [
        "The reviewed continuation no longer matches this source or character. Your trip and outdoor bookmark are preserved; use the original route until reviewed.",
      ];
}

export function createDungeonItineraryTrip(
  visitId: string,
  chapter: ChapterReference,
  guide: ImportedChapter,
  profile: CharacterProfile,
  plan: PersonalDungeonPlan,
  returnStepId: string,
): DungeonTrip {
  const option = itineraryDungeonOption(visitId, profile, plan);
  if (option.schedule.state !== "ready")
    throw new Error("The itinerary's actual-level gate is not met.");
  return {
    ...createDungeonTrip(
      option.visit,
      chapter,
      guide,
      profile,
      { ...plan, selectedQuests: { ...plan.selectedQuests, [visitId]: [...option.questIds] } },
      returnStepId,
    ),
    itinerary: true,
  };
}

export function createDungeonAlternativeTrip(
  visitId: string,
  chapter: ChapterReference,
  guide: ImportedChapter,
  next: ImportedChapter | null,
  profile: CharacterProfile,
  plan: PersonalDungeonPlan,
  returnStepId: string,
): DungeonTrip {
  const continuation = dungeonContinuation(visitId, guide, next, profile);
  if (!continuation)
    throw new Error("No reviewed continuation for this source and character variant.");
  const trip = createDungeonItineraryTrip(visitId, chapter, guide, profile, plan, returnStepId);
  return {
    ...trip,
    itinerary: true,
    targetLevel: continuation.targetLevel,
    alternative: {
      definitionId: continuation.definitionId,
      chapterId: continuation.chapterId,
      sourceVersion: continuation.sourceVersion,
      sourceSha256: continuation.sourceSha256,
      stepId: continuation.stepId,
      carryover: {},
    },
  };
}

export function dungeonAlternativeReturnReady(
  trip: DungeonTrip,
  continuation: DungeonContinuation | null,
): boolean {
  return Boolean(
    trip.alternative &&
    continuation &&
    dungeonAlternativeSourceReasons(trip, continuation).length === 0 &&
    !trip.xpNeedsUpdate &&
    trip.returnLevel !== null &&
    trip.returnLevel >= trip.targetLevel &&
    trip.returnLevel <= LEVELING_EVIDENCE.betaLevelCap &&
    trip.returnXp !== null &&
    dungeonXpEndpoint(trip.returnLevel, trip.returnXp, 0) !== null &&
    trip.sourceRetained &&
    REDRIDGE_DUNGEON_ALTERNATIVE.carryoverIds.every(
      (id) => trip.alternative?.carryover[id] === true,
    ),
  );
}

export function itineraryQuestTitle(id: number): string {
  return getDungeonQuest(id)?.title ?? `Quest ${id}`;
}
