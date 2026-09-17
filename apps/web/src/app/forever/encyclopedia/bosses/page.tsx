import type { Metadata } from "next";
import Link from "next/link";

import { DataUnavailable } from "../../../../components/data-unavailable";
import { ForeverBossDirectory } from "../../../../components/forever-boss-directory";
import { ForeverEncyclopediaNav } from "../../../../components/forever-encyclopedia-nav";
import { ForeverWorldState } from "../../../../components/forever-world-state";
import { getForeverBossDirectory, getForeverWorldOverview } from "../../../../lib/forever-world";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Boss Database",
  description:
    "Search WoW Forever boss creature IDs, encounters, map relationships, possible spells, and evidence-labelled item source leads.",
  path: "/forever/encyclopedia/bosses",
  keywords: ["WoW Forever bosses", "WoW Forever boss database", "WoW Forever creature IDs"],
});

export default async function ForeverBossesPage(): Promise<React.JSX.Element> {
  try {
    const [overview, bosses] = await Promise.all([
      getForeverWorldOverview(),
      getForeverBossDirectory(),
    ]);
    if (!overview) return <DataUnavailable title="The Forever boss directory is not available" />;
    return (
      <article className="forever-reference-page forever-world-page">
        <header className="forever-reference-hero forever-world-hero compact">
          <div>
            <Link className="helper-back-link" href="/forever/encyclopedia">
              <span aria-hidden="true">←</span> Forever Encyclopedia
            </Link>
            <span className="eyebrow">Achievement criteria and encounter evidence</span>
            <h1>Bosses</h1>
            <p>
              Discover client-authored boss identities before the content is playable. Every map,
              spell, model, and item relationship states exactly how strong its evidence is.
            </p>
          </div>
          <ForeverWorldState build={overview.build} />
        </header>
        <ForeverEncyclopediaNav active="bosses" />
        <section className="forever-world-metrics" aria-label="Boss data coverage">
          <Metric label="Boss identities" value={bosses.length} />
          <Metric
            label="Forever creature IDs"
            value={bosses.filter((boss) => boss.creatureId >= 200_000).length}
          />
          <Metric label="Map relationships" value={overview.counts.bossLocations} />
          <Metric label="Possible spell links" value={overview.counts.bossSpellCandidates} />
        </section>
        <ForeverBossDirectory bosses={bosses} />
      </article>
    );
  } catch {
    return <DataUnavailable title="Forever bosses are temporarily unavailable" />;
  }
}

function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}): React.JSX.Element {
  return (
    <div>
      <strong>{value.toLocaleString("en-GB")}</strong>
      <span>{label}</span>
    </div>
  );
}
