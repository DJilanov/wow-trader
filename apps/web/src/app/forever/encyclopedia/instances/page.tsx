import type { Metadata } from "next";
import Link from "next/link";

import { DataUnavailable } from "../../../../components/data-unavailable";
import { ForeverEncyclopediaNav } from "../../../../components/forever-encyclopedia-nav";
import { ForeverInstanceDirectory } from "../../../../components/forever-instance-directory";
import { ForeverWorldState } from "../../../../components/forever-world-state";
import {
  getForeverInstanceDirectory,
  getForeverWorldOverview,
} from "../../../../lib/forever-world";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Dungeons, Raids and Bosses",
  description:
    "Browse WoW Forever dungeons, raids, encounter order, client source hints, and evidence-labelled observed loot.",
  path: "/forever/encyclopedia/instances",
  keywords: ["WoW Forever dungeons", "WoW Forever raids", "WoW Forever bosses"],
});

export default async function ForeverInstancesPage(): Promise<React.JSX.Element> {
  try {
    const [overview, instances] = await Promise.all([
      getForeverWorldOverview(),
      getForeverInstanceDirectory(),
    ]);
    if (!overview)
      return <DataUnavailable title="The Forever instance directory is not available" />;
    return (
      <article className="forever-reference-page forever-world-page">
        <header className="forever-reference-hero forever-world-hero compact">
          <div>
            <Link className="helper-back-link" href="/forever/encyclopedia">
              <span aria-hidden="true">←</span> Forever Encyclopedia
            </Link>
            <span className="eyebrow">DungeonEncounter mapped to Map</span>
            <h1>Dungeons & raids</h1>
            <p>
              Encounter order comes directly from the client. Loot is shown only as a labelled
              client hint or an exact in-game observation—never manufactured from table presence.
            </p>
          </div>
          <ForeverWorldState build={overview.build} />
        </header>
        <ForeverEncyclopediaNav active="instances" />
        <section className="forever-world-metrics" aria-label="Instance coverage">
          <Metric value={instances.length} label="Encounter maps" />
          <Metric value={overview.counts.canonicalEncounters} label="Canonical encounters" />
          <Metric value={overview.counts.bosses} label="Boss identities" />
          <Metric value={overview.counts.lootSourceCandidates} label="Item-source leads" />
        </section>
        <ForeverInstanceDirectory instances={instances} />
      </article>
    );
  } catch {
    return <DataUnavailable title="Forever instances are temporarily unavailable" />;
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
