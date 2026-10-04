import { z } from "zod";
import { classSlugs, type ClassSlug, type Faction } from "./model.js";

export const raceIds = [
  "human",
  "dwarf",
  "gnome",
  "night-elf",
  "orc",
  "troll",
  "tauren",
  "undead",
  "skyborne",
] as const;
export type RaceId = (typeof raceIds)[number];
export const RACE_CLASS_SOURCE =
  "https://news.blizzard.com/en-us/article/24304075/create-the-hero-you-want-to-be-in-world-of-warcraft-forever";

export interface LevelingRace {
  readonly id: RaceId;
  readonly faction: Faction;
  readonly name: string;
  readonly startZone: string;
  readonly icon: string;
  readonly classes: readonly ClassSlug[];
}

export const LEVELING_RACES: readonly LevelingRace[] = [
  {
    id: "human",
    faction: "alliance",
    name: "Human",
    startZone: "Northshire · Elwynn Forest",
    icon: "race_human_male",
    classes: ["warrior", "paladin", "hunter", "rogue", "priest", "mage", "warlock"],
  },
  {
    id: "dwarf",
    faction: "alliance",
    name: "Dwarf",
    startZone: "Coldridge Valley · Dun Morogh",
    icon: "race_dwarf_male",
    classes: ["warrior", "paladin", "hunter", "rogue", "priest", "shaman"],
  },
  {
    id: "gnome",
    faction: "alliance",
    name: "Gnome",
    startZone: "Coldridge Valley · Dun Morogh",
    icon: "race_gnome_male",
    classes: ["warrior", "rogue", "priest", "mage", "warlock"],
  },
  {
    id: "night-elf",
    faction: "alliance",
    name: "Night Elf",
    startZone: "Shadowglen · Teldrassil",
    icon: "race_nightelf_male",
    classes: ["warrior", "hunter", "rogue", "priest", "druid"],
  },
  {
    id: "skyborne",
    faction: "alliance",
    name: "Skyborne · High Order",
    startZone: "Zephras Isle",
    icon: "inv_misc_head_elf_01",
    classes: ["warrior", "hunter", "mage", "rogue", "druid"],
  },
  {
    id: "orc",
    faction: "horde",
    name: "Orc",
    startZone: "Valley of Trials · Durotar",
    icon: "race_orc_male",
    classes: ["warrior", "hunter", "mage", "rogue", "shaman", "warlock"],
  },
  {
    id: "troll",
    faction: "horde",
    name: "Troll",
    startZone: "Valley of Trials · Durotar",
    icon: "race_troll_male",
    classes: ["warrior", "hunter", "mage", "priest", "rogue", "shaman", "warlock"],
  },
  {
    id: "tauren",
    faction: "horde",
    name: "Tauren",
    startZone: "Red Cloud Mesa · Mulgore",
    icon: "race_tauren_male",
    classes: ["warrior", "hunter", "druid", "shaman"],
  },
  {
    id: "undead",
    faction: "horde",
    name: "Undead",
    startZone: "Deathknell · Tirisfal Glades",
    icon: "race_scourge_male",
    classes: ["warrior", "paladin", "mage", "priest", "rogue", "warlock"],
  },
  {
    id: "skyborne",
    faction: "horde",
    name: "Skyborne · Windshaper",
    startZone: "Zephras Isle",
    icon: "inv_misc_head_elf_02",
    classes: ["warrior", "hunter", "rogue", "shaman", "druid"],
  },
];

export function getLevelingRace(faction: Faction, raceId: RaceId): LevelingRace | null {
  return LEVELING_RACES.find((race) => race.faction === faction && race.id === raceId) ?? null;
}

export const characterProfileSchema = z
  .object({
    faction: z.enum(["alliance", "horde"]),
    raceId: z.enum(raceIds),
    classSlug: z.enum(classSlugs).nullable(),
    level: z.number().int().min(1).max(60).nullable(),
    xpRate: z.number().min(0.1).max(10).nullable(),
    pace: z.enum(["fast", "relaxed"]),
    party: z
      .object({
        size: z.number().int().min(1).max(5),
        readiness: z.enum(["together", "meet-later", "recruiting"]),
        tank: z.enum(["yes", "no", "unknown"]),
        healer: z.enum(["yes", "no", "unknown"]),
      })
      .strict(),
  })
  .strict()
  .superRefine((profile, context) => {
    const race = getLevelingRace(profile.faction, profile.raceId);
    if (!race || (profile.classSlug !== null && !race.classes.includes(profile.classSlug))) {
      context.addIssue({
        code: "custom",
        message: "Race/class is not available for this faction",
        path: ["raceId"],
      });
    }
  });
export type CharacterProfile = z.infer<typeof characterProfileSchema>;

export function createCharacterProfile(
  faction: Faction = "alliance",
  raceId: RaceId = faction === "alliance" ? "human" : "orc",
): CharacterProfile {
  return characterProfileSchema.parse({
    faction,
    raceId,
    classSlug: null,
    level: null,
    xpRate: null,
    pace: "fast",
    party: { size: 1, readiness: "recruiting", tank: "unknown", healer: "unknown" },
  });
}

export interface PartyGuidance {
  readonly title: string;
  readonly text: string;
  readonly recruitmentMinutes: 0 | null;
  readonly earlierCandidate: boolean;
}

export function getPartyGuidance(profile: CharacterProfile): PartyGuidance {
  const { party } = profile;
  if (party.size === 1)
    return {
      title: profile.pace === "fast" ? "Keep moving solo" : "Take the comfortable path",
      text:
        profile.pace === "fast"
          ? "Quest outdoors by default. A dungeon must earn back the travel, preparation and time finding a group."
          : "Keep dungeons optional, around their At-level or Easy reference bands. There is no need to interrupt your route to recruit.",
      recruitmentMinutes: null,
      earlierCandidate: false,
    };
  if (party.size < 5)
    return {
      title: "Friends, not yet a full dungeon party",
      text: "Reviewed group objectives may suit you. Do not assume a full dungeon clear or zero recruitment time for a smaller party.",
      recruitmentMinutes: null,
      earlierCandidate: false,
    };
  if (party.readiness !== "together")
    return {
      title:
        party.readiness === "meet-later"
          ? "Meet up before the dungeon"
          : "Keep leveling while you recruit",
      text: "Different starting zones and missing players add time. Follow your outdoor chapters until everyone is together and eligible.",
      recruitmentMinutes: null,
      earlierCandidate: false,
    };
  if (party.tank !== "yes" || party.healer !== "yes")
    return {
      title: "Confirm tanking and healing first",
      text: "Five players alone do not establish readiness for earlier, harder content. Travel, roles and everyone's quest requirements still matter.",
      recruitmentMinutes: 0,
      earlierCandidate: false,
    };
  return {
    title: "Five together, ready to explore",
    text: "Recruitment wait can be zero. Earlier dungeon or group-quest candidates still need reviewed level gates, per-player XP and clear-time evidence; travel and turn-ins remain.",
    recruitmentMinutes: 0,
    earlierCandidate: true,
  };
}
