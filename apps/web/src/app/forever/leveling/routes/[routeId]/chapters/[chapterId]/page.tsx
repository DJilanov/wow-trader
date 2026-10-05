import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CHAPTER_REFERENCES,
  LEVELING_RACES,
  evaluateChapterCondition,
  getChapterLabel,
  DUNGEON_QUESTS,
  THANES_REPLACEMENT,
} from "@wow-trader/leveling";
import { LevelingReader } from "../../../../../../../components/leveling-reader";
import { ImportedLevelingReader } from "../../../../../../../components/imported-leveling-reader";
import {
  getImportedLevelingChapter,
  getLevelingArchiveManifest,
} from "../../../../../../../lib/leveling-archive";
import { JsonLd } from "../../../../../../../components/json-ld";
import {
  importedMapSteps,
  originalMapSteps,
  emptyLevelingMaps,
} from "../../../../../../../lib/leveling-map-data";
import { getLevelingMaps } from "../../../../../../../lib/leveling-maps";
import {
  WESTFALL_CHAPTER_ID,
  WESTFALL_READER_PATH,
  getPublicChapter,
  levelingRouteId,
  profileForRouteId,
} from "../../../../../../../lib/leveling-experience";
import {
  HELPER_SITE_URL,
  createBreadcrumbJsonLd,
  createHelperMetadata,
} from "../../../../../../../lib/seo";

interface ChapterProps {
  readonly params: Promise<{ readonly routeId: string; readonly chapterId: string }>;
  readonly searchParams: Promise<{ readonly edition?: string; readonly outdoor?: string }>;
}
export const dynamic = "force-dynamic";
function resolveChapter(
  routeId: string,
  chapterId: string,
): {
  profile: NonNullable<ReturnType<typeof profileForRouteId>>;
  chapter: (typeof CHAPTER_REFERENCES)[number];
} {
  const profile = profileForRouteId(routeId);
  const chapter = CHAPTER_REFERENCES.find((entry) => entry.id === chapterId);
  if (
    !profile ||
    !chapter ||
    !chapter.factions.includes(profile.faction) ||
    (chapter.family !== "questing" && profile.classSlug !== null && profile.classSlug !== "mage") ||
    (!getPublicChapter(chapter, profile) &&
      evaluateChapterCondition(chapter.condition, profile) === "exclude")
  )
    notFound();
  return { profile, chapter };
}
export function generateStaticParams(): { routeId: string; chapterId: string }[] {
  return LEVELING_RACES.filter((race) => race.faction === "alliance").map((race) => ({
    routeId: levelingRouteId(race.faction, race.id),
    chapterId: WESTFALL_CHAPTER_ID,
  }));
}
export async function generateMetadata({ params, searchParams }: ChapterProps): Promise<Metadata> {
  const { routeId, chapterId } = await params;
  const { profile, chapter } = resolveChapter(routeId, chapterId);
  const label = getChapterLabel(chapter, profile);
  const route = getPublicChapter(chapter, profile);
  const imported =
    (await searchParams).edition !== "kfc" &&
    (await getLevelingArchiveManifest())?.chapters.some((entry) => entry.chapterId === chapterId);
  return createHelperMetadata({
    title: `${label.zone} ${label.minimumLevel}–${label.maximumLevel} — WoW Forever Leveling`,
    description: imported
      ? "Read the full authorized Forever source guide, preserve original quest order and track progress locally. Conditional branches and game-state checks remain explicit; runtime validation is pending."
      : route
        ? "Read the original KFC Westfall leveling preview. Keep quest order and prerequisites intact, track steps locally, and compare optional Hall of Thanes visits."
        : "Extracted chapter bracket and public guide coverage. Instructions and a current-build playthrough remain pending.",
    path: route
      ? WESTFALL_READER_PATH
      : `/forever/leveling/routes/${routeId}/chapters/${chapterId}`,
    noIndex: route === null || routeId !== "alliance-human",
  });
}
export default async function LevelingChapterPage({
  params,
  searchParams,
}: ChapterProps): Promise<React.JSX.Element> {
  const { routeId, chapterId } = await params;
  const { profile, chapter } = resolveChapter(routeId, chapterId);
  const path = `/forever/leveling/routes/${routeId}/chapters/${chapterId}`;
  const route = getPublicChapter(chapter, profile);
  const imported =
    (await searchParams).edition === "kfc" ? null : await getImportedLevelingChapter(chapterId);
  const continuation =
    imported && chapterId === THANES_REPLACEMENT.chapterId
      ? await getImportedLevelingChapter(THANES_REPLACEMENT.continuationId)
      : null;
  const publishedIds =
    (await getLevelingArchiveManifest())?.chapters.map((entry) => entry.chapterId) ?? [];
  const maps = imported
    ? await getLevelingMaps(
        [
          ...importedMapSteps(imported),
          ...DUNGEON_QUESTS.filter(
            (quest) =>
              quest.position && (quest.faction === "both" || quest.faction === profile.faction),
          ).map((quest) => ({
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
        imported.targetBuild,
      )
    : route
      ? await getLevelingMaps(originalMapSteps(route), route.clientBuild)
      : emptyLevelingMaps(70205);
  return (
    <>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: "KFC Helper", path: "/" },
          { name: "Forever Leveling", path: "/forever/leveling" },
          { name: "Chapter path", path: `/forever/leveling/routes/${routeId}` },
          { name: getChapterLabel(chapter, profile).title, path },
        ])}
      />
      {route && !imported && routeId === "alliance-human" && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Article",
            "@id": `${HELPER_SITE_URL}${WESTFALL_READER_PATH}#article`,
            headline: "WoW Forever: original Alliance Westfall 13–15 leveling preview",
            description:
              "Ordered KFC quest instructions, local progress and optional full-trip dungeon comparison. Live beta validation remains pending.",
            datePublished: route.reviewedAt,
            dateModified: route.reviewedAt,
            author: { "@type": "Organization", name: "KFC Guild", url: "https://kfcguild.online" },
            publisher: { "@type": "Organization", name: "KFC Helper", url: HELPER_SITE_URL },
            mainEntityOfPage: `${HELPER_SITE_URL}${WESTFALL_READER_PATH}`,
          }}
        />
      )}
      {imported ? (
        <ImportedLevelingReader
          chapter={chapter}
          guide={imported}
          defaultProfile={profile}
          maps={{
            ...maps,
            points: maps.points.map((point) =>
              point.stepId.startsWith("dungeon-pickup-")
                ? { ...point, evidence: "reference_pickup" as const }
                : point,
            ),
          }}
          publishedIds={publishedIds}
          continuation={continuation}
          preferOutdoor={(await searchParams).outdoor === "1"}
        />
      ) : (
        <LevelingReader
          chapter={chapter}
          defaultProfile={profile}
          maps={maps}
          publishedIds={publishedIds}
        />
      )}
    </>
  );
}
