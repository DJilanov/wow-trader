import type { DungeonQuest } from "./dungeon-model.js";
import { getPremadeQuest } from "./premade.js";

type Lifecycle = Pick<
  DungeonQuest,
  "pickup" | "objective" | "turnin" | "pickupStage" | "objectiveStage"
> &
  Partial<Pick<DungeonQuest, "gate">>;

// Historical execution details, never XP evidence or a claim of a current Forever observation.
// Reviewed against the authorized guide archive: chapters 29, 38–39, 79–81;
// Classic quest records 2240, 2278, 2398, 2418, 2991, 3523 and 3525 supplement its gaps.
// Thanes room order and object pickups: Wowhead's Hall of Thanes overview, checked Nov 2.
const details: Readonly<Record<number, Lifecycle>> = {
  5001: {
    pickup: "Bijou, inside Lower Blackrock Spire.",
    objective: "Collect 1 Bijou's Belongings from its container inside Lower Blackrock Spire. Every player needs their own quest item.",
    turnin: "Bijou, inside Lower Blackrock Spire.",
    pickupStage: "inside", objectiveStage: "inside", gate: { kind: "all", gates: [] },
  },
  5243: {
    pickup: "Leonid Barthalomew the Revered, Light's Hope Chapel, Eastern Plaguelands.",
    objective: "Collect 5 Stratholme Holy Water from supply crates across Stratholme. Every player needs all five.",
    turnin: "Leonid Barthalomew the Revered, Light's Hope Chapel, Eastern Plaguelands.",
    pickupStage: "before", objectiveStage: "inside", gate: { kind: "all", gates: [] },
  },
  484: {
    pickup: "James Halloran, Menethil Harbor, Wetlands.",
    objective: "Collect 6 Young Crocolisk Skins per player in Wetlands, following the matching 70205/70450 client counters; the older four-skin wording is outdated.",
    turnin: "James Halloran, Menethil Harbor, Wetlands. Accept Highland Hides on this visit when eligible.",
    pickupStage: "before", objectiveStage: "before",
  },
  2924: {
    pickup: "Klockmort Spannerspan, Ironforge.",
    objective: "Collect 12 Essential Artificials from the Artificial Extrapolators inside Gnomeregan.",
    turnin: "Klockmort Spannerspan, Ironforge.", pickupStage: "before", objectiveStage: "inside",
  },
  2945: {
    pickup: "Use the Grime-Encrusted Ring dropped by Dark Iron Agent inside Gnomeregan.",
    objective: "Take the Grime-Encrusted Ring to the Sparklematic 5200 in the Clean Zone inside Gnomeregan. Each player pays 3 silver to clean their own ring.",
    turnin: "The Sparklematic 5200, inside Gnomeregan. Accept Return of the Ring before leaving.",
    pickupStage: "inside", objectiveStage: "inside", gate: { kind: "all", gates: [] },
  },
  2947: {
    pickup: "The Sparklematic 5200, inside Gnomeregan, after cleaning the ring.",
    objective: "Carry the Brilliant Gold Ring to Talvash del Kissel in Ironforge.",
    turnin: "Talvash del Kissel, Mystic Ward, Ironforge.",
    pickupStage: "inside", objectiveStage: "before", gate: { kind: "quest", questId: 2945, state: "rewarded" },
  },
  2948: {
    pickup: "Talvash del Kissel, Mystic Ward, Ironforge, after returning the Brilliant Gold Ring.",
    objective: "Keep the Brilliant Gold Ring. Buy or trade for 1 Silver Bar and 1 Moss Agate per player in Ironforge, and reserve 30 silver each for Talvash. No mining, extra kills or AH price is assumed.",
    turnin: "Talvash del Kissel, Mystic Ward, Ironforge. Each player brings the Brilliant Gold Ring, 1 Silver Bar, 1 Moss Agate and pays 30 silver. Keep the ring until the hand-in; the upgraded reward may be vendored afterward.",
    pickupStage: "after", objectiveStage: "before", gate: { kind: "quest", questId: 2947, state: "rewarded" },
  },
  2951: {
    pickup: "The Sparklematic 5200, inside Gnomeregan.",
    objective: "Each player inserts one Grime-Encrusted Object and pays 3 silver at the Sparklematic 5200 inside Gnomeregan. This cleaning task is separate from the ring quest.",
    turnin: "The Sparklematic 5200, inside Gnomeregan.", pickupStage: "inside", objectiveStage: "inside",
  },
  95772: {
    pickup: "Dorin Songblade, Lakeshire, Redridge Mountains.",
    objective: "Find Daewyn's body inside Excavation Site: Wetlands.",
    turnin:
      "Daewyn Songblade's body, inside Excavation Site: Wetlands. Each player takes Fallen in the Fen before leaving.",
    pickupStage: "before",
    objectiveStage: "inside",
  },
  95795: {
    pickup:
      "Daewyn Songblade's body, inside Excavation Site: Wetlands, after returning Songblade Search. Each player accepts before leaving.",
    objective: "Return to Dorin Songblade in Lakeshire, Redridge Mountains.",
    turnin: "Dorin Songblade, Lakeshire, Redridge Mountains. Tell him what happened to Daewyn.",
    pickupStage: "inside",
    objectiveStage: "before",
    gate: { kind: "quest", questId: 95772, state: "rewarded" },
  },
  96395: {
    pickup: "Ghostly Attendant, inside Hall of Thanes, after the first room.",
    objective: "Defeat Faldrim Anvilmar in Anvilmar's Rest.",
    turnin:
      "Ghostly Attendant, inside Hall of Thanes. Return after finishing the vaults, before leaving the instance.",
    pickupStage: "inside",
    objectiveStage: "inside",
  },
  96403: {
    pickup: "Thom Filch, by the bridge to Old Ironforge in Ironforge.",
    objective: "Collect 8 Dwarven Heirlooms from the Hall of Thanes.",
    turnin: "Thom Filch, by the bridge to Old Ironforge in Ironforge.",
    pickupStage: "before",
    objectiveStage: "inside",
  },
  98423: {
    pickup:
      "Stone tablet inside a vault in the Reliquary of Kings, after defeating Durgen Dirgehammer in Hall of Thanes.",
    objective: "Deliver the Treaty of Understanding to Magni Bronzebeard in Ironforge.",
    turnin: "King Magni Bronzebeard, Ironforge.",
    pickupStage: "inside",
    objectiveStage: "before",
  },
  709: {
    pickup: "Theldurin the Lost, Badlands.",
    objective:
      "Recover the Tablet of Ryun'eh from the Ancient Chest in Uldaman's entrance caves, outside the instance portal. Do this before the instanced clear.",
    turnin: "Theldurin the Lost, Badlands.",
    pickupStage: "before",
    objectiveStage: "before",
    gate: { kind: "all", gates: [] },
  },
  373: {
    pickup: "Use An Unsent Letter looted from Edwin VanCleef inside The Deadmines.",
    objective: "Take An Unsent Letter to Baros Alexston, Cathedral Square, Stormwind.",
    turnin: "Baros Alexston, Cathedral Square, Stormwind.",
    pickupStage: "inside",
    objectiveStage: "before",
    gate: { kind: "all", gates: [] },
  },
  95647: {
    pickup: "Caitlin Grassman, Menethil Harbor, Wetlands, after her earlier lead-in.",
    objective: "Find Ardin Grassman inside Excavation Site: Wetlands and speak with him.",
    turnin: "Ardin Grassman, inside Excavation Site: Wetlands. Accept Heartwoven before leaving.",
    pickupStage: "before",
    objectiveStage: "inside",
  },
  1360: {
    pickup: "Krom Stoutarm, Hall of Explorers, Ironforge.",
    objective:
      "Recover Krom Stoutarm's Treasure in the North Common Hall outside Uldaman's instance portal. Complete this entrance-cave task before the instanced clear.",
    turnin: "Krom Stoutarm, Hall of Explorers, Ironforge.",
    pickupStage: "before",
    objectiveStage: "before",
    gate: { kind: "all", gates: [] },
  },
  1053: {
    pickup:
      "Raleigh the Devout, Southshore, Hillsbrad Foothills, after delivering Brother Anton's follow-up.",
    objective:
      "Defeat Houndmaster Loksey, Herod, High Inquisitor Whitemane and Scarlet Commander Mograine inside Scarlet Monastery. This requires Library, Armory and Cathedral.",
    turnin: "Raleigh the Devout, Southshore, Hillsbrad Foothills.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "quest", questId: 1052, state: "rewarded" },
  },
  3636: {
    pickup: "Archbishop Benedictus, Cathedral of Light, Stormwind.",
    objective: "Defeat Amnennar the Coldbringer inside Razorfen Downs.",
    turnin: "Archbishop Benedictus, Cathedral of Light, Stormwind.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "all", gates: [] },
  },
  95810: {
    pickup: "Use the Titan Relic dropped by the Relic Guardian inside Excavation Site: Wetlands.",
    objective:
      "Carry the Titan Relic to Prospector Whelgar at Whelgar's Excavation Site, Wetlands.",
    turnin:
      "Prospector Whelgar, Whelgar's Excavation Site, Wetlands. Accept Prehistoric Prism on this visit.",
    pickupStage: "inside",
    objectiveStage: "before",
    gate: { kind: "all", gates: [] },
  },
  98824: {
    pickup:
      "Prospector Whelgar, Whelgar's Excavation Site, Wetlands, after returning Lost Relic Carry.",
    objective: "Deliver the Titan Relic to High Explorer Magellas, Hall of Explorers, Ironforge.",
    turnin: "High Explorer Magellas, Hall of Explorers, Ironforge.",
    pickupStage: "after",
    objectiveStage: "before",
    gate: { kind: "quest", questId: 95810, state: "rewarded" },
  },
  1475: {
    pickup: "Brohann Caskbelly, Dwarven District, Stormwind, after delivering Rhapsody's Tale.",
    objective:
      "Collect the required Atal'ai Tablets inside Sunken Temple. Check each player's quest tracker before leaving.",
    turnin: "Brohann Caskbelly, Dwarven District, Stormwind.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "quest", questId: 1469, state: "rewarded" },
  },
  2768: {
    pickup: "Chief Engineer Bilgewhizzle, Gadgetzan, Tanaris.",
    objective:
      "Recover the Divino-matic Rod from Sergeant Bly inside Zul'Farrak. Complete the stair event before confronting him.",
    turnin: "Chief Engineer Bilgewhizzle, Gadgetzan, Tanaris.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "all", gates: [] },
  },
  2846: {
    pickup: "Tabetha, Dustwallow Marsh.",
    objective: "Recover the Tiara of the Deep from Hydromancer Velratha inside Zul'Farrak.",
    turnin: "Tabetha, Dustwallow Marsh.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "all", gates: [] },
  },
  3523: {
    pickup: "Belnistrasz, inside Razorfen Downs. Speak to him after clearing his cell.",
    objective:
      "Agree to help Belnistrasz and return the Oathstone he gives you. This is the lead-in to his escort.",
    turnin:
      "Belnistrasz, inside Razorfen Downs. Accept Extinguishing the Idol before starting the escort.",
    pickupStage: "inside",
    objectiveStage: "inside",
    gate: { kind: "all", gates: [] },
  },
  3525: {
    pickup: "Belnistrasz, inside Razorfen Downs, after returning Scourge of the Downs.",
    objective:
      "Escort Belnistrasz and defend him through the idol event. Stay together until everyone's tracker is complete.",
    turnin: "Belnistrasz's Brazier, inside Razorfen Downs, after the escort event.",
    pickupStage: "inside",
    objectiveStage: "inside",
    gate: { kind: "quest", questId: 3523, state: "rewarded" },
  },
  2398: {
    pickup: "Prospector Stormpike, Hall of Explorers, Ironforge.",
    objective: "Find Baelog and the lost dwarves inside Uldaman.",
    turnin: "Baelog, inside Uldaman. Take The Hidden Chamber before continuing.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "all", gates: [] },
  },
  2240: {
    pickup: "Baelog, inside Uldaman, after returning The Lost Dwarves.",
    objective:
      "Read Baelog's Journal. Combine Gni'kiv Medallion and the Shaft of Tsol into the Staff of Prehistoria, open Ironaya's chamber and explore it.",
    turnin: "Prospector Stormpike, Hall of Explorers, Ironforge.",
    pickupStage: "inside",
    objectiveStage: "inside",
    gate: { kind: "quest", questId: 2398, state: "rewarded" },
  },
  2278: {
    pickup: "The Discs of Norgannon, inside Uldaman, after defeating Archaedas.",
    objective:
      "Speak with the Lore Keeper and read the discs. Finish the dialogue before leaving the chamber.",
    turnin: "The Discs of Norgannon, inside Uldaman.",
    pickupStage: "inside",
    objectiveStage: "inside",
    gate: { kind: "all", gates: [] },
  },
  2418: {
    pickup: "Rigglefuzz, Badlands.",
    objective:
      "Collect the required Dentrium and An'Alleum Power Stones in Uldaman. These are personal collections, so check every player before leaving.",
    turnin: "Rigglefuzz, Badlands.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "all", gates: [] },
  },
  2991: {
    pickup:
      "Thadius Grimshade, Nethergarde Keep, Blasted Lands, after delivering Sharpbeak's Feather.",
    objective:
      "Defeat Nekrum Gutchewer during Zul'Farrak's stair event and collect Nekrum's Medallion.",
    turnin: "Thadius Grimshade, Nethergarde Keep, Blasted Lands.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "quest", questId: 2990, state: "rewarded" },
  },
  3527: {
    pickup: "Yeh'kinya, Steamwheedle Port, Tanaris, after returning Screecher Spirits.",
    objective:
      "Collect the first Mosh'aru tablet from Theka the Martyr and the second from Hydromancer Velratha inside Zul'Farrak. Check both tablets for each player.",
    turnin: "Yeh'kinya, Steamwheedle Port, Tanaris. Accept The Ancient Egg on this same visit.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "quest", questId: 3520, state: "rewarded" },
  },
  7041: {
    pickup: "Talendria, near the Maraudon entrance in Desolace. Keep the supplied vial.",
    objective:
      "Fill the Cerulean Vial at the orange-side pool, then use it on the required plants and defeat the spawned Noxxious Scions. Finish both quest objectives before leaving Maraudon.",
    turnin: "Talendria, near the Maraudon entrance in Desolace.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "all", gates: [] },
  },
  7065: {
    pickup: "Keeper Marandis, near the Maraudon entrance in Desolace.",
    objective: "Defeat Princess Theradras inside Maraudon.",
    turnin: "Keeper Marandis, near the Maraudon entrance in Desolace.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "all", gates: [] },
  },
  7044: {
    pickup:
      "Cavindra, orange-side entrance caves of Maraudon, Desolace. Accept before collecting the scepter pieces.",
    objective:
      "Collect the Celebrian Rod from Noxxion on the orange side and the Celebrian Diamond from Lord Vyletongue on the purple side. Continue to Celebras with both pieces.",
    turnin: "Celebras the Redeemed, inside Maraudon, after defeating Celebras the Cursed.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "all", gates: [] },
  },
  7046: {
    pickup: "Celebras the Redeemed, inside Maraudon, after returning Legends of Maraudon.",
    objective: "Stay with Celebras and complete his scepter ritual.",
    turnin:
      "Celebras the Redeemed, inside Maraudon. Finish before leaving for the outside rewards.",
    pickupStage: "inside",
    objectiveStage: "inside",
    gate: { kind: "quest", questId: 7044, state: "rewarded" },
  },
  1446: {
    pickup:
      "Atal'ai Exile, Shadra'Alor, The Hinterlands. Pick up before departing for Sunken Temple; a party member can share it if eligible.",
    objective:
      "Defeat the six upper-platform trolls to unlock Jammal'an the Prophet, then defeat him and collect his head inside Sunken Temple.",
    turnin: "Atal'ai Exile, Shadra'Alor, The Hinterlands.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "all", gates: [] },
  },
  3373: {
    pickup:
      "Use the Essence of Eranikus looted from the Shade of Eranikus inside Sunken Temple to start this quest.",
    objective: "Carry the Essence of Eranikus to the Essence Font inside Sunken Temple.",
    turnin: "The Essence Font, inside Sunken Temple. Complete this before leaving the instance.",
    pickupStage: "inside",
    objectiveStage: "inside",
    gate: { kind: "all", gates: [] },
  },
  3446: {
    pickup:
      "Marvon Rivetseeker, Tanaris, after returning The Stone Circle. Keep the Atal'ai Stone Circle.",
    objective:
      "Find the Altar of Hakkar on Sunken Temple's lower level with the Atal'ai Stone Circle.",
    turnin: "Altar of Hakkar, inside Sunken Temple's lower level.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "quest", questId: 3444, state: "rewarded" },
  },
  3447: {
    pickup: "Marvon Rivetseeker, Tanaris, after returning The Stone Circle.",
    objective:
      "Activate the Atal'ai statues, defeat Atal'alarion and inspect the Idol of Hakkar on Sunken Temple's lower level.",
    turnin: "Idol of Hakkar, inside Sunken Temple's lower level.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "quest", questId: 3444, state: "rewarded" },
  },
  3528: {
    pickup:
      "Yeh'kinya, Steamwheedle Port, Tanaris, after returning The Ancient Egg. Keep the Egg of Hakkar until the Temple run.",
    objective:
      "Use the Egg of Hakkar at the Dragonflayer Skeleton inside Sunken Temple. Complete the event, defeat the Avatar of Hakkar and use its Essence of Hakkar to fill the egg.",
    turnin: "Yeh'kinya, Steamwheedle Port, Tanaris.",
    pickupStage: "before",
    objectiveStage: "inside",
    gate: { kind: "quest", questId: 4787, state: "rewarded" },
  },
};

export function campaignDungeonQuest(id: number): DungeonQuest | null {
  const quest = getPremadeQuest(id);
  const lifecycle = details[id];
  return quest && lifecycle ? { ...quest, ...lifecycle } : quest;
}
