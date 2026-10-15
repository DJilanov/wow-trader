import type { Metadata } from "next";
import Link from "next/link";
import { campaignRace, getLevelingRace } from "@wow-trader/leveling";
import { LevelingCampaign } from "../../../../components/leveling-campaign";
import { getLevelingCampaign, getLevelingCampaignMaps } from "../../../../lib/leveling-campaign";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = createHelperMetadata({
  title: "Premade 5 Full 1–60 Leveling Plan — Forever Leveling",
  description:
    "Follow an ordered Alliance 1–60 plan with race-specific starts, dungeon preparations, grouped outdoor quest batches, dungeon objectives and actual five-player XP checkpoints.",
  path: "/forever/leveling/premade",
  noIndex: true,
});

export default async function PremadePage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly race?: string | string[];
    readonly class?: string | string[];
  }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const race = campaignRace(typeof params.race === "string" ? params.race : undefined);
  const leaderClass =
    getLevelingRace("alliance", race)?.classes.find((slug) => slug === params.class) ?? null;
  const plan = await getLevelingCampaign(race, leaderClass);
  if (!plan)
    return (
      <section>
        <h1>Premade 5 leveling plan unavailable</h1>
        <p>
          The authorized quest archive is unavailable or uses an unreviewed build. No replacement
          quest instructions are invented.
        </p>
        <Link href="/forever/leveling/premade/dungeons">Open the dungeon reference</Link>
      </section>
    );
  const maps = await getLevelingCampaignMaps(plan);
  return <LevelingCampaign plan={plan} maps={maps} />;
}
