import type { Metadata } from "next";
import Link from "next/link";
import { DUNGEON_QUESTS, PREMADE_ROUTE_REVISION } from "@wow-trader/leveling";
import { LevelingPremade } from "../../../../../components/leveling-premade";
import { getLevelingMaps } from "../../../../../lib/leveling-maps";
import { createHelperMetadata } from "../../../../../lib/seo";
import { getLevelingRewardSnapshot } from "../../../../../lib/leveling-quest-xp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = createHelperMetadata({
  title: "Premade Dungeon Reference — Forever Leveling",
  description:
    "Detailed individual dungeon quest ledgers and XP scenarios alongside the complete 1–60 campaign.",
  path: "/forever/leveling/premade/dungeons",
  noIndex: true,
});

export default async function DungeonReferencePage(): Promise<React.JSX.Element> {
  const rewards = await getLevelingRewardSnapshot(DUNGEON_QUESTS.map((quest) => quest.id));
  const maps = await getLevelingMaps(
    DUNGEON_QUESTS.filter((quest) => quest.position && quest.faction !== "horde").map((quest) => ({
      id: `premade-quest-${quest.id}`,
      positions: [
        {
          sourceLine: 0,
          position: {
            zone: String(quest.position!.mapId),
            floor: null,
            space: "map-percent" as const,
            x: quest.position!.x,
            y: quest.position!.y,
          },
        },
      ],
      quests: [],
    })),
    70205,
  );
  return (
    <>
      <Link href="/forever/leveling/premade">← Whole 1–60 leveling plan</Link>
      <LevelingPremade
        revision={PREMADE_ROUTE_REVISION}
        rewardFacts={rewards.facts}
        maps={{
          ...maps,
          points: maps.points.map((point) => ({ ...point, evidence: "reference_pickup" as const })),
        }}
      />
    </>
  );
}
