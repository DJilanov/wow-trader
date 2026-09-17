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
  title: "WoW Forever Zones",
  description: "Browse WoW Forever world and zone maps extracted from the installed Beta client.",
  path: "/forever/encyclopedia/zones",
  keywords: ["WoW Forever zones", "WoW Forever areas"],
});

export default async function ForeverZonesPage(): Promise<React.JSX.Element> {
  try {
    const [overview, maps] = await Promise.all([
      getForeverWorldOverview(),
      getForeverMapDirectory(),
    ]);
    if (!overview) return <DataUnavailable title="The Forever zone directory is not available" />;
    const zones = maps.filter((map) => map.type >= 2 && map.system === 0);
    return (
      <article className="forever-reference-page forever-world-page">
        <header className="forever-reference-hero forever-world-hero compact">
          <div>
            <Link className="helper-back-link" href="/forever/encyclopedia">
              <span aria-hidden="true">←</span> Forever Encyclopedia
            </Link>
            <span className="eyebrow">Client zone hierarchy</span>
            <h1>Zones</h1>
            <p>
              Player-facing zone maps, including new Beta territories, without claiming hidden
              availability.
            </p>
          </div>
          <ForeverWorldState build={overview.build} />
        </header>
        <ForeverEncyclopediaNav active="zones" />
        <ForeverMapDirectory buildNumber={overview.build.buildNumber} maps={zones} />
      </article>
    );
  } catch {
    return <DataUnavailable title="Forever zones are temporarily unavailable" />;
  }
}
