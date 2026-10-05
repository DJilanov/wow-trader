import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CHAPTER_REFERENCES,
  DUNGEON_VISITS,
  DUNGEON_QUESTS,
  REDRIDGE_DUNGEON_ALTERNATIVE,
} from "@wow-trader/leveling";
import { profileForRouteId } from "../../../../../../../lib/leveling-experience";
import { getImportedLevelingChapter } from "../../../../../../../lib/leveling-archive";
import { getLevelingMaps } from "../../../../../../../lib/leveling-maps";
import { importedMapSteps } from "../../../../../../../lib/leveling-map-data";
import { LevelingDungeonTrip } from "../../../../../../../components/leveling-dungeon-trip";
import { createHelperMetadata } from "../../../../../../../lib/seo";

interface DungeonPageProps {
  readonly params: Promise<{ readonly routeId: string; readonly visitId: string }>;
  readonly searchParams: Promise<{ readonly chapter?: string; readonly plan?: string }>;
}
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: DungeonPageProps): Promise<Metadata> {
  const { routeId, visitId } = await params;
  const visit = DUNGEON_VISITS.find((entry) => entry.id === visitId);
  return createHelperMetadata({
    title: `${visit?.name ?? "Dungeon"} — Forever Leveling`,
    description:
      "Review dungeon quests, strict At-level entry, prerequisite chains and estimated XP. Keep your outdoor route and progress intact.",
    path: `/forever/leveling/routes/${routeId}/dungeons/${visitId}`,
    noIndex: true,
  });
}
export default async function DungeonPage({
  params,
  searchParams,
}: DungeonPageProps): Promise<React.JSX.Element> {
  const { routeId, visitId } = await params;
  const profile = profileForRouteId(routeId);
  const visit = DUNGEON_VISITS.find((entry) => entry.id === visitId);
  if (!profile || !visit || (visit.faction !== "both" && visit.faction !== profile.faction))
    notFound();
  const query = await searchParams;
  const chapterId = query.chapter;
  const chapter = chapterId
    ? (CHAPTER_REFERENCES.find(
        (entry) => entry.id === chapterId && entry.factions.includes(profile.faction),
      ) ?? null)
    : null;
  if (chapterId && !chapter) notFound();
  const guide = chapter ? await getImportedLevelingChapter(chapter.id) : null;
  const alternative = query.plan === "alternative";
  const continuationGuide =
    alternative && chapter?.id === REDRIDGE_DUNGEON_ALTERNATIVE.chapterId
      ? await getImportedLevelingChapter(REDRIDGE_DUNGEON_ALTERNATIVE.continuationId)
      : null;
  const quests = DUNGEON_QUESTS.filter(
    (quest) => quest.position && (quest.faction === "both" || quest.faction === profile.faction),
  );
  const maps = await getLevelingMaps(
    [
      ...(guide ? importedMapSteps(guide) : []),
      ...(continuationGuide
        ? importedMapSteps(continuationGuide).map((step) => ({
            ...step,
            id: `continuation-${step.id}`,
          }))
        : []),
      ...quests.map((quest) => ({
        id: `dungeon-pickup-${quest.id}`,
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
    ],
    guide?.targetBuild ?? 70205,
  );
  return (
    <LevelingDungeonTrip
      visitId={visit.id}
      chapter={chapter}
      guide={guide}
      continuationGuide={continuationGuide}
      alternative={alternative}
      maps={{
        ...maps,
        points: maps.points.map((point) =>
          point.stepId.startsWith("dungeon-pickup-")
            ? { ...point, evidence: "reference_pickup" as const }
            : point,
        ),
      }}
      defaultProfile={profile}
    />
  );
}
