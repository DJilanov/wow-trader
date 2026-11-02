import type { DungeonFinishId } from "./dungeon-finish-model.js";

export interface FinishRouteStep {
  readonly questId?: number;
  readonly phase?: "accepted" | "objectives-complete" | "rewarded";
  readonly objectives?: readonly number[];
  readonly inside?: DungeonFinishId;
  readonly zone?: string;
  readonly text?: string;
}

export interface FinishRouteWing {
  readonly id: DungeonFinishId;
  readonly steps: readonly FinishRouteStep[];
}

export const FINISH_PROVIDER_REVISION = "e9a67d1a2753a0e64c4c96bf7864788fac7b765f";

const accept = (questId: number, inside?: DungeonFinishId): FinishRouteStep => ({
  questId,
  phase: "accepted",
  ...(inside ? { inside } : {}),
});
const turnIn = (questId: number, inside?: DungeonFinishId): FinishRouteStep => ({
  questId,
  phase: "rewarded",
  ...(inside ? { inside } : {}),
});
const complete = (
  questId: number,
  objectives: readonly number[],
  inside: DungeonFinishId,
  text: string,
): FinishRouteStep => ({ questId, phase: "objectives-complete", objectives, inside, text });

// Objective slots and quest text: authored Forever QuestieDB export e9a67d1.
// These are historical execution references, not measured drops, clear counts or XP.
export const FINISH_ROUTE: readonly FinishRouteWing[] = [
  {
    id: "lower-blackrock",
    steps: [
      accept(4701),
      accept(4729),
      accept(4862),
      accept(5001, "lower-blackrock"),
      accept(4867, "lower-blackrock"),
      complete(
        5001,
        [1],
        "lower-blackrock",
        "Find Bijou's Belongings in Lower Blackrock Spire. Every player needs their own quest credit.",
      ),
      turnIn(5001, "lower-blackrock"),
      complete(
        4867,
        [1],
        "lower-blackrock",
        "Read Warosh's Scroll. Keep the required event items, summon Urok Doomhowl and recover Warosh's Mojo for every player.",
      ),
      turnIn(4867, "lower-blackrock"),
      complete(
        4729,
        [1],
        "lower-blackrock",
        "Use Kibler's cage on a Bloodaxe Worg Pup. Check every player's Caged Worg Pup objective.",
      ),
      complete(
        4862,
        [1],
        "lower-blackrock",
        "Collect 15 Spire Spider Eggs per player. Check all five quest trackers before leaving.",
      ),
      complete(
        4701,
        [1],
        "lower-blackrock",
        "Defeat Halycon together and ensure everyone receives quest credit.",
      ),
      turnIn(4701),
      turnIn(4729),
      turnIn(4862),
    ],
  },
  {
    id: "dire-maul-east",
    steps: [
      accept(5527),
      {
        questId: 5527,
        phase: "objectives-complete",
        objectives: [1],
        zone: "1451",
        text: "Search Southwind Village in Silithus for a Reliquary of Purity. Every player must collect their own reliquary.",
      },
      turnIn(5527),
      accept(5526),
      accept(7488),
      accept(7482),
      accept(7441),
      complete(
        7441,
        [1],
        "dire-maul-east",
        "Follow Pusillin's chase inside Dire Maul East, defeat him and recover Azj'Tordin's Book of Incantations. Check all five players' books and arrange Crescent Key access for the later wings.",
      ),
      complete(
        7488,
        [1],
        "dire-maul-east",
        "Defeat Lethtendris and recover Lethtendris's Web for every player.",
      ),
      complete(
        5526,
        [1],
        "dire-maul-east",
        "After defeating Alzzin the Wildshaper, collect a Felvine Shard and seal it in the supplied Reliquary of Purity. Everyone must finish the sealed-shard objective.",
      ),
      turnIn(7441),
      turnIn(7488),
    ],
  },
  {
    id: "dire-maul-west",
    steps: [
      {
        text: "Use the prepared Crescent Key or a verified party access alternative for Dire Maul West.",
      },
      accept(7461, "dire-maul-west"),
      complete(
        7461,
        [1, 2],
        "dire-maul-west",
        "Defeat the guardians at all five pylons to release Immol'thar. Defeat Immol'thar, then Prince Tortheldrin in the Athenaeum.",
      ),
      turnIn(7461, "dire-maul-west"),
    ],
  },
  {
    id: "dire-maul-north",
    steps: [
      {
        text: "Complete the Dire Maul North clear. The normal full-clear route and a Tribute route have different rewards; keep their quest eligibility separate.",
      },
      complete(
        7482,
        [1],
        "dire-maul-north",
        "Search Dire Maul's shared library for Telmius Dreamseeker and inspect the remains for Elven Legends. Do this before leaving Dire Maul.",
      ),
      turnIn(7482),
      turnIn(5526),
    ],
  },
  {
    id: "scholomance",
    steps: [
      {
        text: "Arrange Skeleton Key access before entering Scholomance. Keep Jandice Barov and the Kirtonos encounter available for Eva Sarkhoff's follow-ups; the route below leaves and re-enters the same instance without resetting it.",
      },
      accept(5343),
      accept(5529),
      accept(5382),
      complete(
        5343,
        [1, 2, 3, 4],
        "scholomance",
        "Collect all four Barov deeds: Caer Darrow, Brill, Tarren Mill and Southshore. Each player needs all four quest objectives.",
      ),
      complete(
        5529,
        [1],
        "scholomance",
        "Kill 20 Plagued Hatchlings with everyone eligible for shared credit.",
      ),
      complete(
        5382,
        [1, 2, 3],
        "scholomance",
        "Defeat Doctor Theolen Krastinov, then burn the remains of Eva Sarkhoff and Lucien Sarkhoff. Complete all three objectives before returning to Eva.",
      ),
      turnIn(5382),
      accept(5515),
      turnIn(5343),
      turnIn(5529),
      complete(
        5515,
        [1],
        "scholomance",
        "Return to the same Scholomance instance, defeat Jandice Barov and recover Krastinov's Bag of Horrors. Do not reset the instance.",
      ),
      turnIn(5515),
      accept(5384),
      complete(
        5384,
        [1],
        "scholomance",
        "Return with the Blood of Innocents, use it at the porch brazier to summon Kirtonos and defeat him. Keep the same instance; do not reset.",
      ),
      turnIn(5384),
    ],
  },
  {
    id: "stratholme-live",
    steps: [
      {
        text: "Arrange Stratholme access. Collect the Light's Hope quests and Egan's Blaster before the clear. Check every player's personal loot and soul credits.",
      },
      accept(5281),
      turnIn(5281),
      accept(5282),
      accept(5214),
      accept(5251),
      accept(5243),
      complete(
        5214,
        [1],
        "stratholme-live",
        "Recover the tobacco from the smoke shop inside Stratholme. Everyone needs their quest item before leaving.",
      ),
      complete(
        5251,
        [1, 2],
        "stratholme-live",
        "Defeat Archivist Galford and burn the Scarlet Archive. Both objectives are required.",
      ),
      complete(
        5282,
        [1],
        "stratholme-live",
        "Use Egan's Blaster on ghostly or spectral citizens, then use it again on the released Restless Souls. Free 15 souls per player; this is an interaction objective, not assumed kill XP.",
      ),
      turnIn(5214),
      turnIn(5251),
      turnIn(5282),
    ],
  },
  {
    id: "stratholme-undead",
    steps: [
      {
        text: "Continue through Stratholme's undead side in the same visit. Keep the actual entrance and key holder available; complete the inside tasks before the final outside returns.",
      },
      complete(
        5243,
        [1],
        "stratholme-undead",
        "Search supply crates across Stratholme until every player has 5 Stratholme Holy Water. Check all five trackers before leaving.",
      ),
      turnIn(5243),
    ],
  },
];

export const FINISH_DEFERRED: Readonly<Record<number, string>> = {
  5089: "Quest-starting Command drops require confirmed acquisition for every player; its reward is not guaranteed by one clear.",
  4788: "The Lost Tablets of Mosh'aru (5065) must be completed before this pickup; that outside prerequisite is not part of this first-clear package.",
  4742: "Personal Seal of Ascension gems and the forging chain are separate conditional key work.",
  4866: "Mother's Milk requires a live debuff delivery; transport and cure timing are not a guaranteed first-clear reward.",
  7463: "Arcane Refreshment requires level 60 and adds no pre-cap leveling XP.",
  7507: "Foror's Compendium requires level 60 and adds no pre-cap leveling XP.",
  5525: "Free Knot requires the shackle key; its party acquisition is not established by the first-clear route.",
  5518: "The Gordok Ogre Suit requires supplied crafting materials and Ogre Tannin; no material farm or free inventory is assumed.",
  5528: "The Gordok Taste Test requires a compatible friendly Kreeg/Tribute route.",
  7703: "Unfinished Gordok Business requires friendly Kromcrush and a later Tortheldrin objective; it is not the normal full-clear order.",
  5582: "Healthy Dragon Scale is repeatable and unlocks after the Plagued Hatchlings hand-in; no extra first-clear drop is assumed.",
  4771: "Dawn's Gambit requires its separate egg-preparation chain before entry.",
  5466: "Ras Frostwhisper requires the keepsake chain across outdoor zones, Stratholme and a later Scholomance stage.",
  5122: "The repeatable Medallion of Faith route and party acquisition require separate review.",
  5125: "Aurius' Reckoning depends on the separately reviewed Medallion of Faith route.",
  5262: "Balnazzar's quest-starting head requires the Archivist hand-in and confirmed party acquisition.",
  5263: "Above and Beyond follows the outside Balnazzar-head hand-in before Baron Rivendare; it is a separately prepared continuation.",
  5212: "The Flesh Does Not Lie needs a reviewed five-player sample-acquisition plan before counting its reward in one clear.",
  5213: "The Active Agent requires the outside Flesh Does Not Lie hand-in before returning for the Scourge Data.",
  5463: "Menethil's Gift belongs to the cross-instance Ras Frostwhisper keepsake chain.",
  8945: "Dead Man's Plea requires the Dungeon Set 2 preparation and timed rescue; it is not a generic first-clear pickup.",
  5848: "Of Love and Family requires the prepared Tirion chain; it is an optional branch rather than an automatic first-clear reward.",
};
