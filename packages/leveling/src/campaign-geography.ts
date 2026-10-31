import type { CampaignAction, CampaignLeg } from "./campaign.js";

interface CampaignZone {
  readonly id: string;
  readonly name: string;
  readonly aliases?: readonly string[];
}

const zones: readonly CampaignZone[] = [
  { id: "1413", name: "The Barrens", aliases: ["Barrens", "Ratchet"] },
  { id: "1416", name: "Alterac Mountains", aliases: ["Lordamere Lake"] },
  { id: "1417", name: "Arathi Highlands" },
  { id: "1418", name: "Badlands" },
  { id: "1420", name: "Tirisfal Glades" },
  { id: "1421", name: "Silverpine Forest" },
  { id: "1422", name: "Western Plaguelands" },
  { id: "1423", name: "Eastern Plaguelands" },
  { id: "1424", name: "Hillsbrad Foothills", aliases: ["Hillsbrad", "Southshore"] },
  { id: "1425", name: "The Hinterlands", aliases: ["Hinterlands", "Aerie Peak"] },
  { id: "1426", name: "Dun Morogh", aliases: ["Kharanos"] },
  { id: "1427", name: "Searing Gorge", aliases: ["Thorium Point"] },
  { id: "1428", name: "Burning Steppes", aliases: ["Morgan's Vigil"] },
  { id: "1429", name: "Elwynn Forest", aliases: ["Goldshire", "Northshire"] },
  { id: "1431", name: "Duskwood", aliases: ["Darkshire"] },
  { id: "1432", name: "Loch Modan", aliases: ["Thelsamar"] },
  { id: "1433", name: "Redridge Mountains", aliases: ["Redridge", "Lakeshire"] },
  { id: "1434", name: "Stranglethorn Vale", aliases: ["STV", "Booty Bay"] },
  { id: "1436", name: "Westfall", aliases: ["Sentinel Hill"] },
  { id: "1437", name: "Wetlands", aliases: ["Menethil", "Menethil Harbor", "Menethil Harbour"] },
  { id: "1438", name: "Teldrassil", aliases: ["Rut'theran", "Rut'theran Village"] },
  { id: "1439", name: "Darkshore", aliases: ["Auberdine"] },
  { id: "1440", name: "Ashenvale", aliases: ["Astranaar"] },
  { id: "1441", name: "Thousand Needles", aliases: ["Shimmering Flats"] },
  { id: "1442", name: "Stonetalon Mountains", aliases: ["Stonetalon", "Stonetalon Peak"] },
  { id: "1443", name: "Desolace", aliases: ["Nijel's Point"] },
  { id: "1444", name: "Feralas", aliases: ["Thalanaar", "Feathermoon Stronghold"] },
  { id: "1445", name: "Dustwallow Marsh", aliases: ["Theramore", "Theramore Isle"] },
  { id: "1446", name: "Tanaris", aliases: ["Gadgetzan", "Steamwheedle Port"] },
  { id: "1447", name: "Azshara", aliases: ["Talrendis Point"] },
  { id: "1448", name: "Felwood", aliases: ["Emerald Sanctuary", "Talonbranch Glade"] },
  { id: "1449", name: "Un'Goro Crater", aliases: ["UnGoro Crater", "Marshal's Refuge"] },
  { id: "1450", name: "Moonglade" },
  { id: "1451", name: "Silithus", aliases: ["Cenarion Hold"] },
  { id: "1452", name: "Winterspring", aliases: ["Everlook"] },
  { id: "1453", name: "Stormwind City", aliases: ["Stormwind"] },
  { id: "1455", name: "Ironforge" },
  { id: "1457", name: "Darnassus" },
  { id: "1419", name: "Blasted Lands", aliases: ["Nethergarde Keep"] },
  { id: "1435", name: "Swamp of Sorrows" },
];

const key = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases = new Map(
  zones.flatMap((zone) =>
    [zone.id, zone.name, ...(zone.aliases ?? [])].map((name) => [key(name), zone.id]),
  ),
);

export function campaignZoneId(value: string): string | null {
  return aliases.get(key(value.split("/")[0]!)) ?? null;
}

export function campaignZoneName(value: string): string {
  return zones.find((zone) => zone.id === campaignZoneId(value))?.name ?? value;
}

export function campaignZoneInText(value: string): string | null {
  const text = value.toLowerCase();
  const matches = new Set(
    zones.flatMap((zone) =>
      [zone.name, ...(zone.aliases ?? [])].flatMap((name) => {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`, "i").test(text) ? [zone.id] : [];
      }),
    ),
  );
  return matches.size === 1 ? [...matches][0]! : null;
}

export function campaignActionZones(action: CampaignAction): readonly string[] {
  return [
    ...new Set(action.positions.flatMap(({ position }) => campaignZoneId(position.zone) ?? [])),
  ];
}

export function campaignLegZones(
  leg: CampaignLeg,
  actions: readonly CampaignAction[],
): readonly string[] {
  const positions = [
    ...new Set(actions.filter((action) => action.legId === leg.id).flatMap(campaignActionZones)),
  ];
  const title = campaignZoneId(leg.title);
  return positions.length ? positions : title ? [title] : [];
}
