import type { ClassSlug } from "./model.js";
import { campaignZoneId, campaignZoneName } from "./campaign-geography.js";

export interface CampaignTransportLeg {
  readonly from: string;
  readonly to: string;
  readonly mode: "road" | "boat" | "tram" | "portal";
  readonly instruction: string;
}

function road(
  from: string,
  to: string,
  outward: string,
  inward: string,
): readonly CampaignTransportLeg[] {
  return [
    { from, to, mode: "road", instruction: outward },
    { from: to, to: from, mode: "road", instruction: inward },
  ];
}

// Guaranteed ground/public transport links; learned flights and hearth bindings are never assumed.
const links: readonly CampaignTransportLeg[] = [
  ...road(
    "1453",
    "1429",
    "Leave Stormwind through the main gate into Elwynn Forest.",
    "Follow the Goldshire road northwest through Stormwind's main gate.",
  ),
  ...road(
    "1429",
    "1436",
    "Follow the western road from Goldshire across the bridge into Westfall.",
    "Take the eastern road out of Westfall, cross the bridge and continue toward Goldshire.",
  ),
  ...road(
    "1429",
    "1433",
    "Follow Elwynn's eastern road into Redridge Mountains and continue to Lakeshire.",
    "Follow the western road from Lakeshire into Elwynn Forest.",
  ),
  ...road(
    "1429",
    "1431",
    "Use the southern bridge from Elwynn into Duskwood and follow the road toward Darkshire.",
    "Follow Duskwood's northern road and cross the bridge into Elwynn Forest.",
  ),
  ...road(
    "1433",
    "1431",
    "Follow the southern road from Redridge into Duskwood.",
    "Follow the eastern road from Duskwood into Redridge Mountains.",
  ),
  ...road(
    "1431",
    "1434",
    "Take Duskwood's southern road into Stranglethorn Vale. Stay on the road and avoid hostile camps.",
    "Follow Stranglethorn's northern road into Duskwood.",
  ),
  ...road(
    "1455",
    "1426",
    "Leave Ironforge through its main gate into Dun Morogh.",
    "Follow the road to Ironforge and enter through the main gate.",
  ),
  ...road(
    "1426",
    "1432",
    "Follow Dun Morogh's eastern road through the tunnels into Loch Modan.",
    "Follow Loch Modan's western road through the tunnels into Dun Morogh.",
  ),
  ...road(
    "1432",
    "1437",
    "Follow the northern road through Dun Algaz into Wetlands. Continue to Menethil Harbor; avoid leaving the road among higher-level creatures.",
    "Leave Menethil Harbor by the road, cross Wetlands and climb through Dun Algaz into Loch Modan.",
  ),
  ...road(
    "1437",
    "1417",
    "Follow Wetlands' northern road across the Thandol Span into Arathi Highlands.",
    "Follow Arathi's southern road across the Thandol Span into Wetlands.",
  ),
  ...road(
    "1417",
    "1424",
    "Take the western road through Thoradin's Wall into Hillsbrad Foothills. Learn the Southshore flight path when you reach town.",
    "Follow Hillsbrad's eastern road through Thoradin's Wall into Arathi Highlands.",
  ),
  ...road(
    "1424",
    "1416",
    "Follow the northern road from Hillsbrad into Alterac Mountains.",
    "Follow the southern road from Alterac into Hillsbrad Foothills.",
  ),
  ...road(
    "1416",
    "1422",
    "Use the northeastern pass toward Chillwind Camp in Western Plaguelands. Learn its flight path.",
    "Return through the pass from Chillwind Camp toward Alterac Mountains.",
  ),
  ...road(
    "1422",
    "1423",
    "Follow the eastern road into Eastern Plaguelands. Learn the Light's Hope Chapel flight path when you reach the camp.",
    "Follow the western road from Eastern Plaguelands into Western Plaguelands.",
  ),
  ...road(
    "1424",
    "1421",
    "Follow the western road into Silverpine Forest. Avoid Horde settlements and their guards.",
    "Follow Silverpine's southern road into Hillsbrad Foothills, avoiding Horde settlements.",
  ),
  ...road(
    "1421",
    "1420",
    "Take Silverpine's northern road into Tirisfal Glades. Avoid Brill and Undercity's guards; regroup before the dungeon approach.",
    "Return south from Tirisfal into Silverpine Forest, avoiding Horde settlements and guards.",
  ),
  ...road(
    "1424",
    "1425",
    "Use the mountain passage north of Durnholde Keep to reach The Hinterlands and Aerie Peak.",
    "Return through the passage from Aerie Peak toward Durnholde Keep in Hillsbrad.",
  ),
  ...road(
    "1432",
    "1418",
    "Follow Loch Modan's southern pass into Badlands.",
    "Follow the northern pass from Badlands into Loch Modan.",
  ),
  ...road(
    "1418",
    "1427",
    "Use Badlands' western road into Searing Gorge. Learn the Thorium Point flight path when you reach the camp.",
    "Return east from Searing Gorge into Badlands.",
  ),
  ...road(
    "1427",
    "1428",
    "Use the Blackrock Mountain passage from Searing Gorge into Burning Steppes.",
    "Return through Blackrock Mountain from Burning Steppes to Searing Gorge.",
  ),
  ...road(
    "1428",
    "1433",
    "Take the southern pass from Burning Steppes into Redridge Mountains.",
    "Follow Redridge's northern road through the pass into Burning Steppes.",
  ),
  ...road(
    "1431",
    "1435",
    "Follow Deadwind Pass east from Duskwood into Swamp of Sorrows. Stay on the road.",
    "Return west through Deadwind Pass into Duskwood.",
  ),
  ...road(
    "1435",
    "1419",
    "Follow the southern road from Swamp of Sorrows into Blasted Lands and continue to Nethergarde Keep.",
    "Follow the northern road from Blasted Lands into Swamp of Sorrows.",
  ),
  ...road(
    "1439",
    "1440",
    "Follow Darkshore's southern road into Ashenvale. For Blackfathom Deeps, use the coastal approach to Zoram Strand; Astranaar is inland and is not an entrance prerequisite.",
    "Follow Ashenvale's northern road into Darkshore and continue to Auberdine.",
  ),
  ...road(
    "1440",
    "1442",
    "Use Talondeep Path from Ashenvale into Stonetalon Mountains.",
    "Return through Talondeep Path from Stonetalon into Ashenvale.",
  ),
  ...road(
    "1442",
    "1443",
    "Follow the southern route through the Charred Vale into Desolace. Learn the Nijel's Point flight path when you reach the camp.",
    "Return through the northern pass from Desolace into Stonetalon Mountains.",
  ),
  ...road(
    "1440",
    "1413",
    "Use the southern Ashenvale route into the Barrens, keeping clear of Horde guards at Mor'shan Rampart.",
    "Follow the northern Barrens route into Ashenvale, keeping clear of Horde guards at Mor'shan Rampart.",
  ),
  ...road(
    "1413",
    "1445",
    "Take the eastern road into Dustwallow Marsh and continue to Theramore. Learn its flight path.",
    "Follow the western road from Theramore through Dustwallow into the Barrens.",
  ),
  ...road(
    "1413",
    "1441",
    "Follow the southern Barrens road to the Great Lift. Use the lift into Thousand Needles; regroup at the bottom instead of jumping.",
    "Return to the Great Lift and ride it up into the Barrens.",
  ),
  ...road(
    "1441",
    "1444",
    "Follow Thousand Needles' western road through Thalanaar into Feralas.",
    "Return east through Thalanaar into Thousand Needles.",
  ),
  ...road(
    "1443",
    "1444",
    "Follow Desolace's southern road through the mountain pass into Feralas.",
    "Follow Feralas' northern road through the pass into Desolace.",
  ),
  ...road(
    "1441",
    "1446",
    "Cross the Shimmering Flats by the road and continue south into Tanaris. Learn Gadgetzan's flight path.",
    "Take Tanaris' northern road through the Shimmering Flats into Thousand Needles.",
  ),
  ...road(
    "1446",
    "1449",
    "Use the western pass and its slope into Un'Goro Crater; do not jump down the cliffs.",
    "Use Un'Goro's eastern slope and pass back into Tanaris.",
  ),
  ...road(
    "1449",
    "1451",
    "Use the western mountain pass from Un'Goro into Silithus.",
    "Return through the eastern mountain pass from Silithus into Un'Goro.",
  ),
  ...road(
    "1440",
    "1448",
    "Follow Ashenvale's northern road into Felwood.",
    "Follow Felwood's southern road into Ashenvale.",
  ),
  ...road(
    "1440",
    "1447",
    "Follow Ashenvale's eastern road into Azshara. Keep clear of Horde settlements.",
    "Return west from Azshara into Ashenvale.",
  ),
  {
    from: "1453",
    to: "1455",
    mode: "tram",
    instruction: "Take the Deeprun Tram from Stormwind's Dwarven District to Ironforge.",
  },
  {
    from: "1455",
    to: "1453",
    mode: "tram",
    instruction: "Take the Deeprun Tram from Ironforge's Tinker Town to Stormwind.",
  },
  {
    from: "1453",
    to: "1439",
    mode: "boat",
    instruction:
      "At Stormwind Harbor, take the ship to Darkshore. Regroup after docking and continue to Auberdine.",
  },
  {
    from: "1439",
    to: "1453",
    mode: "boat",
    instruction:
      "At Auberdine's docks, take the Stormwind Harbor ship. Regroup at the harbor before continuing through the city.",
  },
  {
    from: "1437",
    to: "1439",
    mode: "boat",
    instruction:
      "At Menethil Harbor, take the boat whose destination is Auberdine. Wait for the whole party to arrive.",
  },
  {
    from: "1439",
    to: "1437",
    mode: "boat",
    instruction:
      "At Auberdine's docks, take the Menethil Harbor boat. Wait for the whole party to arrive.",
  },
  {
    from: "1437",
    to: "1445",
    mode: "boat",
    instruction: "At Menethil Harbor, take the Theramore boat and regroup at Theramore's docks.",
  },
  {
    from: "1445",
    to: "1437",
    mode: "boat",
    instruction: "Take the boat from Theramore to Menethil Harbor and regroup at the docks.",
  },
  {
    from: "1434",
    to: "1413",
    mode: "boat",
    instruction:
      "Follow the road to Booty Bay in southern Stranglethorn, then take the Ratchet boat. Regroup on arrival.",
  },
  {
    from: "1413",
    to: "1434",
    mode: "boat",
    instruction: "Travel to Ratchet and take the Booty Bay boat. Regroup at Booty Bay's docks.",
  },
  {
    from: "1439",
    to: "1438",
    mode: "boat",
    instruction: "Take the Auberdine boat to Rut'theran Village.",
  },
  {
    from: "1438",
    to: "1439",
    mode: "boat",
    instruction: "Take the Rut'theran Village boat to Auberdine.",
  },
  {
    from: "1438",
    to: "1457",
    mode: "portal",
    instruction: "Use Rut'theran Village's pink portal to enter Darnassus.",
  },
  {
    from: "1457",
    to: "1438",
    mode: "portal",
    instruction: "Use Darnassus' pink portal to Rut'theran Village.",
  },
];

export function campaignGroundJourney(
  from: string,
  to: string,
): readonly CampaignTransportLeg[] | null {
  const start = campaignZoneId(from),
    end = campaignZoneId(to);
  if (!start || !end) return null;
  const eastern = new Set([
    "1416",
    "1417",
    "1418",
    "1419",
    "1420",
    "1421",
    "1422",
    "1423",
    "1424",
    "1425",
    "1426",
    "1427",
    "1428",
    "1429",
    "1431",
    "1432",
    "1433",
    "1434",
    "1435",
    "1436",
    "1437",
    "1453",
    "1455",
  ]);
  const sameContinent = eastern.has(start) === eastern.has(end);
  const pending: { zone: string; legs: readonly CampaignTransportLeg[] }[] = [
    { zone: start, legs: [] },
  ];
  const visited = new Set([start]);
  for (const path of pending) {
    if (path.zone === end) return path.legs;
    for (const leg of links.filter((entry) => entry.from === path.zone)) {
      if (sameContinent && eastern.has(leg.from) !== eastern.has(leg.to)) continue;
      if (visited.has(leg.to)) continue;
      visited.add(leg.to);
      pending.push({ zone: leg.to, legs: [...path.legs, leg] });
    }
  }
  return null;
}

export function campaignJourneyInstructions(
  from: string,
  to: string,
  classSlug: ClassSlug | null,
): readonly string[] {
  if (campaignZoneId(from) === campaignZoneId(to)) return [];
  if (campaignZoneId(to) === "1450" && classSlug === "druid")
    return [
      "After learning Teleport: Moonglade, use it for your class quest. Do not attempt a low-level run through Felwood.",
    ];
  if (campaignZoneId(from) === "1450" && classSlug === "druid")
    return [
      "Return using your Hearthstone if it is bound to the intended inn, or take the Druid flight master to Rut'theran Village.",
      ...(campaignGroundJourney("1438", to)?.map((leg) => leg.instruction) ?? [
        `Continue to ${campaignZoneName(to)} using your unlocked travel network.`,
      ]),
    ];
  const route = campaignGroundJourney(from, to);
  return route
    ? [
        `Travel from ${campaignZoneName(from)} to ${campaignZoneName(to)}. Use an already-unlocked flight where available; otherwise follow this route:`,
        ...route.map((leg) => leg.instruction),
      ]
    : [
        `Travel to ${campaignZoneName(to)} using the current in-game entrance or transport instructions. This route has no verified ground connection for that stop.`,
      ];
}
