import type { Metadata } from "next";
import Link from "next/link";

import { DataUnavailable } from "../../../../components/data-unavailable";
import { ForeverEncyclopediaNav } from "../../../../components/forever-encyclopedia-nav";
import { ForeverMapDirectory } from "../../../../components/forever-map-directory";
import { ForeverWorldState } from "../../../../components/forever-world-state";
import { getForeverMapDirectory, getForeverWorldOverview } from "../../../../lib/forever-world";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Maps and Interactive Zone Browser",
  description:
    "Browse authentic WoW Forever client map art, zones, flight points, points of interest, and evidence-labelled world data.",
  path: "/forever/encyclopedia/maps",
  keywords: ["WoW Forever maps", "WoW Forever zones", "WoW Forever interactive map"],
});

export default async function ForeverMapsPage(): Promise<React.JSX.Element> {
  try {
    const [overview, maps] = await Promise.all([
      getForeverWorldOverview(),
      getForeverMapDirectory(),
    ]);
    if (!overview) return <DataUnavailable title="The Forever world snapshot is not available" />;
    const nativeMaps = maps.filter((map) => map.hasArt);
    return (
      <article className="forever-reference-page forever-world-page">
        <header className="forever-reference-hero forever-world-hero compact">
          <div>
            <Link className="helper-back-link" href="/forever/encyclopedia">
              <span aria-hidden="true">←</span> Forever Encyclopedia
            </Link>
            <span className="eyebrow">Extracted from the installed client</span>
            <h1>World maps</h1>
            <p>
              Authentic map tiles with client POIs, flight points, quest coverage, and explicit
              location precision. Realm creature spawns are not invented from absent client tables.
            </p>
          </div>
          <ForeverWorldState build={overview.build} />
        </header>
        <ForeverEncyclopediaNav active="maps" />
        <section className="forever-world-metrics" aria-label="World map coverage">
          <Metric
            value={maps.filter((map) => map.system === 0).length}
            label="Player-facing maps"
          />
          <Metric value={nativeMaps.length} label="Native art maps" />
          <Metric
            value={maps.reduce((sum, map) => sum + map.markerCount, 0)}
            label="Rendered marker records"
          />
          <Metric value={overview.counts.questPois} label="Quest POI shapes" />
        </section>
        <ForeverMapDirectory buildNumber={overview.build.buildNumber} maps={maps} />
      </article>
    );
  } catch {
    return <DataUnavailable title="Forever maps are temporarily unavailable" />;
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
