import rawFacts from "./dungeon-facts.json" with { type: "json" };
import rawReference from "./dungeon-reference.json" with { type: "json" };
import { z } from "zod";
import {
  dungeonFactsSchema,
  validateDungeonGraph,
  type DungeonQuest,
  type DungeonVisit,
  type DungeonGate,
} from "./dungeon-model.js";

export const LEGACY_DUNGEON_RELEASE = "dungeons-v1-build-70205-oct-01";
export const DUNGEON_RELEASE = "dungeons-v2-build-70205-at-level";
export const DUNGEON_FACTS = dungeonFactsSchema.parse(rawFacts);
const source = "ForeverDungeonJournal 1.4.4";
export const DUNGEON_REFERENCE = z
  .object({
    schemaVersion: z.literal(1),
    source: z.string().url(),
    reviewedAt: z.string(),
    sourceSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    associations: z.array(
      z
        .object({
          dungeon: z.string(),
          wing: z.string().nullable(),
          questId: z.number().int().positive(),
        })
        .strict(),
    ),
    quests: z.array(
      z
        .object({
          id: z.number().int().positive(),
          title: z.string(),
          faction: z.enum(["alliance", "horde", "both"]).nullable(),
          classSlug: z
            .enum([
              "warrior",
              "paladin",
              "hunter",
              "rogue",
              "priest",
              "shaman",
              "mage",
              "warlock",
              "druid",
            ])
            .nullable(),
          classRestrictionUnresolved: z.boolean(),
          restrictionNotes: z.array(z.string()).default([]),
          minimumLevel: z.number().int().min(1).max(60).nullable(),
        })
        .strict(),
    ),
  })
  .strict()
  .parse(rawReference);
const insideStarts = new Set([
  96395, 98423, 6981, 95250, 97288, 95195, 95189, 95204, 92415, 373, 5724, 1200, 6561, 6564, 95809,
  95664, 95810, 95795, 1144, 1142, 1051, 2951, 2945,
]);
const afterStarts = new Set([1806, 92819, 98823, 98824]);
const multiVisit = new Set([1654, 1740]);
const notes: Readonly<Record<number, readonly string[]>> = {
  214: [
    "Red Leather Bandanas (153) is disputed in the reference. Confirm eligibility in game; it is not silently assumed.",
  ],
  92753: [
    "Plant the explosives at the forge. Check the quest's exit instruction before using Hearthstone. The detonator follow-up (92819) is after this stage, not a prerequisite.",
  ],
  1806: [
    "The final weapon reward is earned only after collection quest 1654 and the forging hand-in. It is not earned separately in each dungeon.",
  ],
  2843: [
    "Rig Wars need only be accepted. The transport chain does not require a completed dungeon run.",
  ],
  2930: [
    "Collect and upgrade the White, Yellow, Blue, Red and Prismatic Punch Cards at the terminals. The reference's placeholder numbers are not real quest IDs.",
  ],
  98824: [
    "Titan Relic starts Lost Relic Carry inside the dungeon. The Ironforge follow-up is after its Wetlands hand-in.",
  ],
  98823: [
    "Titan Relic starts Elder Knowledge inside the dungeon. Earthen Echo follows the Thunder Bluff hand-in.",
  ],
  98815: [
    "The current guide requires Daily Delivery first. This gate has not yet been confirmed in game.",
  ],
  95682: ["Dragonmaw Rumors is a possible lead-in, not a verified mandatory prerequisite."],
};
const gates = new Map<number, DungeonGate>();
for (const quest of DUNGEON_FACTS.quests) {
  const chain = quest.chain.filter(
    (id) => id !== quest.id && !(quest.id === 92753 && id === 92819),
  );
  let previous: number | undefined;
  for (const id of chain) {
    if (previous !== undefined && !gates.has(id))
      gates.set(id, {
        kind: "quest",
        questId: previous,
        state: quest.id === 2843 && previous === 2841 ? "accepted" : "rewarded",
      });
    previous = id;
  }
  if (previous !== undefined)
    gates.set(quest.id, { kind: "quest", questId: previous, state: "rewarded" });
}
gates.set(92819, { kind: "quest", questId: 92753, state: "rewarded" });
gates.set(1200, { kind: "quest", questId: 1198, state: "rewarded" });
gates.set(5724, { kind: "quest", questId: 5722, state: "rewarded" });
gates.set(2930, {
  kind: "confirmation",
  id: "prismatic-punch-card",
  label: "Prismatic Punch Card obtained through the four terminals",
});
gates.set(98815, {
  kind: "confirmation",
  id: "daily-delivery-rewarded",
  label: "Daily Delivery prerequisite rewarded (reference; verify in game)",
});
gates.set(214, {
  kind: "all",
  gates: [
    gates.get(214)!,
    {
      kind: "confirmation",
      id: "red-silk-eligibility",
      label: "Scout Riell offers Red Silk Bandanas; disputed 153 gate checked",
    },
  ],
});
gates.set(1806, { kind: "quest", questId: 1654, state: "rewarded" });
const allianceChains = new Set([
  96391, 65, 132, 135, 141, 142, 155, 153, 303, 389, 1651, 1652, 1653, 1654, 92742, 92744, 92745,
  92747, 92748, 92749, 92750, 92751, 92752, 92819, 95647, 95810, 2041,
]);
const hordeChains = new Set([870, 877, 880, 1489, 1490, 5726, 5727, 2842, 95664]);
const supplementalQuests: readonly DungeonQuest[] = DUNGEON_FACTS.quests.map(
  (quest): DungeonQuest => ({
    ...quest,
    title:
      quest.id === 1198
        ? "In Search of Thaelrid"
        : quest.id === 1200
          ? "Blackfathom Villainy"
          : (DUNGEON_REFERENCE.quests.find((reference) => reference.id === quest.id)?.title ??
            quest.title),
    faction: allianceChains.has(quest.id)
      ? "alliance"
      : hordeChains.has(quest.id)
        ? "horde"
        : quest.faction,
    classSlug: [1651, 1652, 1653, 1654, 1806].includes(quest.id) ? "paladin" : quest.classSlug,
    raceIds: [1651, 1652, 1653, 1654, 1806].includes(quest.id) ? ["human", "dwarf"] : [],
    restrictionsKnown: true,
    minimumLevel:
      Math.max(
        quest.minimumLevel ?? 0,
        DUNGEON_REFERENCE.quests.find((reference) => reference.id === quest.id)?.minimumLevel ?? 0,
      ) || null,
    minimumLevelClaims: [
      ...(quest.minimumLevel === null ? [] : [{ value: quest.minimumLevel, source }]),
      ...DUNGEON_REFERENCE.quests
        .filter((reference) => reference.id === quest.id && reference.minimumLevel !== null)
        .map((reference) => ({ value: reference.minimumLevel!, source: DUNGEON_REFERENCE.source })),
    ],
    pickupStage: afterStarts.has(quest.id)
      ? "after"
      : insideStarts.has(quest.id)
        ? "inside"
        : "before",
    pickup:
      quest.id === 1198
        ? "Dawnwatcher Shaedlass, Craftsmen's Terrace, Darnassus"
        : quest.id === 1200
          ? "Argent Guard Thaelrid, inside Blackfathom Deeps"
          : quest.pickup,
    turnin:
      quest.id === 1198
        ? "Argent Guard Thaelrid, inside Blackfathom Deeps"
        : quest.id === 1200
          ? "Dawnwatcher Selgorm, Darnassus"
          : quest.turnin,
    objective:
      quest.id === 1198
        ? "Find Argent Guard Thaelrid inside Blackfathom Deeps."
        : quest.id === 1200
          ? "Bring Twilight Lord Kelris's head to Dawnwatcher Selgorm."
          : quest.objective,
    objectiveStage: multiVisit.has(quest.id)
      ? "multiple-visits"
      : DUNGEON_FACTS.associations.some((entry) => entry.questId === quest.id)
        ? "inside"
        : "before",
    // 6981's addon coordinate belongs to a later hand-in, not the item pickup.
    position: insideStarts.has(quest.id) ? null : quest.position,
    gate: gates.get(quest.id) ?? { kind: "all", gates: [] },
    notes: [
      ...(notes[quest.id] ?? []),
      ...DUNGEON_REFERENCE.quests
        .filter(
          (reference) =>
            reference.id === quest.id &&
            reference.minimumLevel !== null &&
            reference.minimumLevel !== quest.minimumLevel,
        )
        .map(
          (reference) =>
            `Pickup-level conflict: supplemental ${quest.minimumLevel ?? "unknown"}, current guide ${reference.minimumLevel}. Use the conservative gate and confirm in game.`,
        ),
    ],
    evidence: { source, build: null, effectiveDate: "2026-10-04", status: "reference" },
  }),
);
const supplementalIds = new Set(supplementalQuests.map((quest) => quest.id));
export const DUNGEON_QUESTS: readonly DungeonQuest[] = [
  ...supplementalQuests,
  ...DUNGEON_REFERENCE.quests
    .filter((quest) => !supplementalIds.has(quest.id))
    .map((quest): DungeonQuest => ({
      id: quest.id,
      title: quest.title,
      faction: quest.faction ?? "both",
      classSlug: quest.classSlug,
      raceIds: quest.id === 1049 ? ["orc", "troll", "tauren", "skyborne"] : [],
      restrictionsKnown: quest.faction !== null && !quest.classRestrictionUnresolved,
      minimumLevel: quest.minimumLevel,
      questLevel: null,
      pickup: null,
      turnin: null,
      objective: null,
      position: null,
      pickupStage: "unknown",
      objectiveStage: "unknown",
      gate: {
        kind: "confirmation",
        id: `lifecycle-${quest.id}`,
        label:
          "Pickup, prerequisite chain, objective scope and hand-in need lifecycle review; not a runnable recommendation",
      },
      referenceXp: null,
      shareable: null,
      rewards: { fixed: [], choices: [] },
      requiredItems: [],
      notes: [
        "Quest identity is cataloged from the current guide. Exact preparation and current rewards remain unconfirmed; use its Wowhead link for details.",
        ...quest.restrictionNotes,
      ],
      evidence: {
        source: DUNGEON_REFERENCE.source,
        build: null,
        effectiveDate: DUNGEON_REFERENCE.reviewedAt,
        status: "reference",
      },
      minimumLevelClaims:
        quest.minimumLevel === null
          ? []
          : [{ value: quest.minimumLevel, source: DUNGEON_REFERENCE.source }],
    })),
];
validateDungeonGraph(DUNGEON_QUESTS);

function visit(
  id: string,
  name: string,
  levels: readonly [number, number, number, number],
  faction: DungeonVisit["faction"] = "both",
  sourceTag: string | null = null,
  availability: DungeonVisit["availability"] = "beta",
  extraNotes: readonly string[] = [],
  groupSize = 5,
): DungeonVisit {
  const aliases: Readonly<Record<string, string>> = {
    thanes: "The Hall of Thanes",
    stockade: "The Stockades",
    excavation: "Excavation Site: Wetlands",
    "sunken-temple": "Temple of Atal'Hakkar - Sunken Temple",
    "brd-emperor": "Blackrock Depths BRD",
    "lower-blackrock": "Lower Blackrock Spire - LBRS",
    "upper-blackrock": "Upper Blackrock Spire - UBRS",
  };
  const wing: Readonly<Record<string, string>> = {
    "sm-graveyard": "Graveyard",
    "sm-library": "Library",
    "sm-all-wings": "All Wings",
    "dire-maul-east": "Dire Maul East - Warpwood Quarter Dungeon Quests",
    "dire-maul-west": "Dire Maul West Capital Gardens Dungeon Quests",
    "dire-maul-north": "Dire Maul North - Gordoks Commons Dungeon Quests",
    "stratholme-live": "Stratholme Live Side Quests",
    "stratholme-undead": "Stratholme Undead Side Quests",
  };
  const referenceName = id.startsWith("sm-")
    ? "Scarlet Monastery"
    : id.startsWith("dire-maul-")
      ? "Dire Maul"
      : id.startsWith("stratholme-")
        ? "Stratholme"
        : (aliases[id] ?? name);
  const referenceIds = ["sm-armory", "sm-cathedral"].includes(id)
    ? []
    : DUNGEON_REFERENCE.associations
        .filter(
          (entry) => entry.dungeon === referenceName && (!wing[id] || entry.wing === wing[id]),
        )
        .map((entry) => entry.questId);
  return {
    id,
    name,
    levels:
      id === "dalaran"
        ? null
        : { hard: levels[0], medium: levels[1], atLevel: levels[2], easy: levels[3] },
    faction,
    sourceTag: sourceTag?.toUpperCase() ?? null,
    availability,
    groupSize: id === "upper-blackrock" ? null : groupSize,
    questIds: [
      ...new Set([
        ...DUNGEON_FACTS.associations
          .filter((entry) => entry.dungeon === name)
          .map((entry) => entry.questId),
        ...referenceIds,
      ]),
    ],
    notes: extraNotes,
  };
}
export const DUNGEON_VISITS: readonly DungeonVisit[] = [
  visit("ragefire", "Ragefire Chasm", [9, 12, 14, 19], "horde", "RFC"),
  visit("thanes", "Hall of Thanes", [11, 13, 14, 19], "both", null, "beta", [
    "Pickup minima differ between sources; reference gates require in-game confirmation.",
  ]),
  visit("wailing-caverns", "Wailing Caverns", [15, 17, 19, 24], "both", "WC"),
  visit("deadmines", "The Deadmines", [14, 17, 19, 24], "both", "DM"),
  visit("lordaeron", "Ruins of Lordaeron", [15, 17, 19, 24]),
  visit("shadowfang", "Shadowfang Keep", [18, 21, 23, 28], "both", "SFK"),
  visit("blackfathom", "Blackfathom Deeps", [21, 23, 25, 30], "both", "BFD"),
  visit("stockade", "The Stockade", [22, 24, 26, 30], "alliance", "Stockades"),
  visit("excavation", "Excavation Site: Wetlands", [24, 27, 29, 31]),
  visit("gnomeregan", "Gnomeregan", [25, 30, 33, 38], "both", "Gnomer", "beta", [
    "Back-door access requires a Workshop Key or Lockpicking 150; the normal entrance remains a separate route.",
  ]),
  visit("razorfen-kraul", "Razorfen Kraul", [25, 28, 31, 34], "both", "RFK"),
  visit("sm-graveyard", "Scarlet Monastery: Graveyard", [26, 32, 37, 45], "both", "SM"),
  visit("sm-library", "Scarlet Monastery: Library", [26, 32, 37, 45], "both", "SM"),
  visit(
    "sm-all-wings",
    "Scarlet Monastery: Multi-wing clear",
    [26, 32, 37, 45],
    "both",
    "SM",
    "reference-only",
    [
      "All-wings quests require the appropriate bosses across wings. Do not count them for an isolated Graveyard run.",
    ],
  ),
  visit("sm-armory", "Scarlet Monastery: Armory", [26, 32, 37, 45], "both", "SM", "beta", [
    "Scarlet Key or Lockpicking 175 required for the locked entrance.",
  ]),
  visit("sm-cathedral", "Scarlet Monastery: Cathedral", [26, 32, 37, 45], "both", "SM", "beta", [
    "Scarlet Key or Lockpicking 175 required for the locked entrance.",
  ]),
  visit("razorfen-downs", "Razorfen Downs", [35, 37, 39, 44], "both", "RFD", "beta", [
    "October 1 beta access starts at 25; the older reference visit band is not a current-run recommendation.",
  ]),
  visit("uldaman", "Uldaman", [37, 40, 42, 47], "both", "ULDA", "beta", [
    "October 1 beta access starts at 30; the older reference visit band needs review.",
  ]),
  visit("dalaran", "City of Dalaran", [28, 31, 33, 38], "both", null, "reference-only", [
    "Not present in the October 1 playable-dungeon list. No reviewed visit band is available.",
  ]),
  visit("zul-farrak", "Zul'Farrak", [40, 42, 44, 50], "both", "ZF", "reference-only", [
    "A Mallet of Zul'Farrak is needed to summon Gahz'rilla.",
  ]),
  visit("maraudon", "Maraudon", [41, 44, 46, 50], "both", "Mara", "reference-only"),
  visit("sunken-temple", "Sunken Temple", [46, 49, 51, 54], "both", "ST", "reference-only"),
  visit(
    "brd-prison",
    "Blackrock Depths: Prison",
    [50, 52, 55, 60],
    "both",
    "BRD",
    "reference-only",
    ["A prison subrun is not a full Emperor clear; quest coverage is pending."],
  ),
  visit(
    "brd-emperor",
    "Blackrock Depths: Emperor",
    [50, 52, 55, 60],
    "both",
    "BRD",
    "reference-only",
  ),
  visit("dire-maul-east", "Dire Maul: East", [52, 54, 56, 60], "both", "DME", "reference-only"),
  visit("dire-maul-west", "Dire Maul: West", [54, 56, 60, 60], "both", "DMW", "reference-only"),
  visit("dire-maul-north", "Dire Maul: North", [54, 56, 60, 60], "both", "DMN", "reference-only"),
  visit(
    "lower-blackrock",
    "Lower Blackrock Spire",
    [54, 56, 60, 60],
    "both",
    "LBRS",
    "reference-only",
  ),
  visit(
    "upper-blackrock",
    "Upper Blackrock Spire",
    [54, 56, 60, 60],
    "both",
    "UBRS",
    "reference-only",
    [
      "Historical group-size/access rules need Forever verification; not a five-player recommendation.",
    ],
    10,
  ),
  visit("scholomance", "Scholomance", [54, 56, 60, 60], "both", "Scholo", "reference-only"),
  visit(
    "stratholme-live",
    "Stratholme: Living",
    [54, 56, 60, 60],
    "both",
    "Strat",
    "reference-only",
  ),
  visit(
    "stratholme-undead",
    "Stratholme: Undead",
    [54, 56, 60, 60],
    "both",
    "Strat",
    "reference-only",
  ),
];
