import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CHAPTER_REFERENCES,
  LEVELING_RACES,
  campaignRace,
  getLevelingRace,
} from "@wow-trader/leveling";
import { LevelingRouteDashboard } from "../../../../../components/leveling-route-dashboard";
import { getLevelingCampaign } from "../../../../../lib/leveling-campaign";
import { campaignLeaderClass } from "../../../../../lib/leveling-route-plan";
import { restedXpReviewExportAvailable } from "../../../../../lib/leveling-restedxp-export";
import { JsonLd } from "../../../../../components/json-ld";
import { levelingRouteId, profileForRouteId } from "../../../../../lib/leveling-experience";
import { createBreadcrumbJsonLd, createHelperMetadata } from "../../../../../lib/seo";
import {
  getLevelingArchiveManifest,
  getLevelingChapterActivities,
} from "../../../../../lib/leveling-archive";

export const dynamic = "force-dynamic";

interface RouteProps {
  readonly params: Promise<{ readonly routeId: string }>;
  readonly searchParams: Promise<{
    readonly plan?: string | string[];
    readonly class?: string | string[];
  }>;
}
export function generateStaticParams(): { routeId: string }[] {
  return LEVELING_RACES.map((race) => ({ routeId: levelingRouteId(race.faction, race.id) }));
}
export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { routeId } = await params;
  const profile = profileForRouteId(routeId);
  if (!profile) notFound();
  const race = getLevelingRace(profile.faction, profile.raceId);
  return createHelperMetadata({
    title: `${race?.name} 1–60 Quest Route — WoW Forever`,
    description: `Follow ${race?.name}'s ordered leveling chapters: original outdoor questing or a premade-five dungeon-quest route with prerequisite chains, maps and saved progress.`,
    path: `/forever/leveling/routes/${routeId}`,
    noIndex: routeId !== "alliance-human",
  });
}
export default async function LevelingRoutePage({
  params,
  searchParams,
}: RouteProps): Promise<React.JSX.Element> {
  const { routeId } = await params;
  const profile = profileForRouteId(routeId);
  if (!profile) notFound();
  const manifest = await getLevelingArchiveManifest();
  const activities = await getLevelingChapterActivities();
  const query = await searchParams;
  const campaign =
    profile.faction === "alliance"
      ? await getLevelingCampaign(
          campaignRace(profile.raceId),
          campaignLeaderClass(profile, query.class),
        )
      : null;
  return (
    <>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: "KFC Helper", path: "/" },
          { name: "Forever Leveling", path: "/forever/leveling" },
          { name: "Chapter path", path: `/forever/leveling/routes/${routeId}` },
        ])}
      />
      <LevelingRouteDashboard
        reviewExportEnabled={restedXpReviewExportAvailable()}
        campaign={campaign}
        requestedMode={typeof query.plan === "string" ? query.plan : undefined}
        defaultProfile={profile}
        archiveChapters={manifest?.chapters ?? []}
        archiveBuild={manifest?.targetBuild ?? null}
        activities={activities.filter((activity) =>
          CHAPTER_REFERENCES.some(
            (entry) => entry.id === activity.chapterId && entry.factions.includes(profile.faction),
          ),
        )}
      />
    </>
  );
}
