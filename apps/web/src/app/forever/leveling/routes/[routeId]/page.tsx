import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEVELING_RACES, getLevelingRace } from "@wow-trader/leveling";
import { LevelingDashboard } from "../../../../../components/leveling-dashboard";
import { JsonLd } from "../../../../../components/json-ld";
import { levelingRouteId, profileForRouteId } from "../../../../../lib/leveling-experience";
import { createBreadcrumbJsonLd, createHelperMetadata } from "../../../../../lib/seo";
import { getLevelingArchiveManifest } from "../../../../../lib/leveling-archive";

export const dynamic = "force-dynamic";

interface RouteProps {
  readonly params: Promise<{ readonly routeId: string }>;
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
    title: `${race?.name} Leveling Chapters — WoW Forever`,
    description: `Browse ${race?.name}'s extracted starting brackets and current KFC guide coverage. Choose your pace and party setup without changing the reviewed quest order.`,
    path: `/forever/leveling/routes/${routeId}`,
    noIndex: routeId !== "alliance-human",
  });
}
export default async function LevelingRoutePage({
  params,
}: RouteProps): Promise<React.JSX.Element> {
  const { routeId } = await params;
  const profile = profileForRouteId(routeId);
  if (!profile) notFound();
  return (
    <>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: "KFC Helper", path: "/" },
          { name: "Forever Leveling", path: "/forever/leveling" },
          { name: "Chapter path", path: `/forever/leveling/routes/${routeId}` },
        ])}
      />
      <LevelingDashboard
        defaultProfile={profile}
        archiveChapters={(await getLevelingArchiveManifest())?.chapters ?? []}
      />
    </>
  );
}
