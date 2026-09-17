import type { Metadata } from "next";
import Link from "next/link";

import { DataUnavailable } from "../../../../components/data-unavailable";
import { ForeverEncyclopediaNav } from "../../../../components/forever-encyclopedia-nav";
import { ForeverWorldState } from "../../../../components/forever-world-state";
import { getForeverQuestDirectory } from "../../../../lib/forever-world";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Quests and Quest Lines",
  description:
    "Browse WoW Forever quest IDs, named quest lines, map evidence, and transparent server-query coverage.",
  path: "/forever/encyclopedia/quests",
  keywords: ["WoW Forever quests", "WoW Forever quest lines", "WoW Forever quest database"],
});

export default async function ForeverQuestsPage(): Promise<React.JSX.Element> {
  try {
    const data = await getForeverQuestDirectory();
    if (!data) return <DataUnavailable title="The Forever quest index is not available" />;
    return (
      <article className="forever-reference-page forever-world-page">
        <header className="forever-reference-hero forever-world-hero compact">
          <div>
            <Link className="helper-back-link" href="/forever/encyclopedia">
              <span aria-hidden="true">←</span> Forever Encyclopedia
            </Link>
            <span className="eyebrow">Quest identity and availability are separate</span>
            <h1>Quests</h1>
            <p>
              The client supplies a large structural ID index but not a complete static quest cache.
              Titled pages appear only after a successful server query or an in-game observation.
            </p>
          </div>
          <ForeverWorldState build={data.build} />
        </header>
        <ForeverEncyclopediaNav active="quests" />
        <section className="forever-world-metrics" aria-label="Quest coverage">
          <Metric value={data.questCount} label="Readable quest IDs" />
          <Metric value={data.poiQuestCount} label="Quests with client POIs" />
          <Metric value={data.lines.length} label="Named quest lines" />
          <Metric value={data.discoverableQuestIds.length} label="Browsable structural quests" />
        </section>
        <section className="forever-quest-lines">
          <div className="forever-section-heading">
            <div>
              <span className="eyebrow">Explicit client relationships</span>
              <h2>Quest lines</h2>
            </div>
            <p>
              Line membership and ordering are client facts; they are not automatically hard
              prerequisites.
            </p>
          </div>
          <div>
            {data.lines.map(({ questLine, members }) => (
              <article key={questLine.questLineId}>
                <small>Quest line {questLine.questLineId}</small>
                <h3>{questLine.name}</h3>
                {questLine.description ? <p>{questLine.description}</p> : null}
                <ol>
                  {members.map((member) => (
                    <li key={member.relationId}>
                      <span>{member.orderIndex + 1}</span>
                      <Link href={`/forever/encyclopedia/quests/${member.questId}`}>
                        Quest {member.questId}
                      </Link>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>
        <section className="forever-quest-discovery">
          <div className="forever-section-heading">
            <div>
              <span className="eyebrow">POI or line evidence</span>
              <h2>Structurally discoverable IDs</h2>
            </div>
            <p>Untitled IDs are intentionally excluded from search-engine indexing.</p>
          </div>
          <div>
            {data.discoverableQuestIds.map((questId) => (
              <Link href={`/forever/encyclopedia/quests/${questId}`} key={questId}>
                #{questId}
              </Link>
            ))}
          </div>
        </section>
      </article>
    );
  } catch {
    return <DataUnavailable title="Forever quests are temporarily unavailable" />;
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
