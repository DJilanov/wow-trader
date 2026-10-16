import type { Metadata } from "next";
import Link from "next/link";

import { DataUnavailable } from "../../../../components/data-unavailable";
import { ForeverSnapshotNotice } from "../../../../components/forever-snapshot-notice";
import { ForeverEncyclopediaNav } from "../../../../components/forever-encyclopedia-nav";
import { ForeverOfficialUpdates } from "../../../../components/forever-official-updates";
import { FOREVER_CLASSES } from "@wow-trader/forever-data/updates";
import { getForeverSnapshot, sourceText } from "../../../../lib/forever";
import { getForeverOfficialUpdates } from "../../../../lib/forever-updates";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Patch Notes & Data Changes",
  description:
    "Follow daily official WoW Forever development updates alongside client-catalog changes and talent-source history, with separate build evidence and original source links.",
  path: "/forever/encyclopedia/changes",
  keywords: [
    "WoW Forever changes",
    "WoW Forever talents changes",
    "WoW Forever beta data",
  ],
});

export default async function ForeverChangesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly class?: string }>;
}): Promise<React.JSX.Element> {
  try {
    const requestedClass = (await searchParams).class;
    const selectedClass =
      FOREVER_CLASSES.find((value) => value === requestedClass) ?? null;
    const [snapshot, official] = await Promise.all([
      getForeverSnapshot().catch(() => null),
      getForeverOfficialUpdates(),
    ]);
    if (!snapshot && !official.publication) {
      return (
        <DataUnavailable title="Forever change history is waiting for review" />
      );
    }
    return (
      <article className="forever-reference-page">
        <header className="forever-reference-hero">
          <Link className="helper-back-link" href="/forever/encyclopedia">
            <span aria-hidden="true">←</span> Forever Encyclopedia
          </Link>
          <span className="eyebrow">Official updates and source history</span>
          <h1>Forever changes</h1>
          <p>
            Follow Blizzard&apos;s development updates, compare extracted client
            builds and review the exact talent snapshot available in the
            Encyclopedia. Announcements and verified game data are shown
            separately.
          </p>
        </header>
        <ForeverEncyclopediaNav active="changes" />
        <nav
          className="official-updates-filters"
          aria-label="Filter official notes by class"
        >
          <Link
            aria-current={!selectedClass ? "page" : undefined}
            href="/forever/encyclopedia/changes"
          >
            All classes
          </Link>
          {FOREVER_CLASSES.map((name) => (
            <Link
              key={name}
              aria-current={selectedClass === name ? "page" : undefined}
              href={`/forever/encyclopedia/changes?class=${name}`}
            >
              {name}
            </Link>
          ))}
        </nav>
        <ForeverOfficialUpdates {...official} selectedClass={selectedClass} />
        {snapshot ? (
          <>
            <div className="forever-change-list">
              {snapshot.data.changelog.map((entry, index) => (
                <article key={`${entry.date}:${entry.title}:${index}`}>
                  <time dateTime={entry.date}>{entry.date}</time>
                  <h2>{entry.title}</h2>
                  <p>{sourceText(entry.text)}</p>
                </article>
              ))}
            </div>
            <ForeverSnapshotNotice
              data={snapshot.data}
              generated={snapshot.generated}
              checksum={snapshot.checksum}
            />
          </>
        ) : (
          <section className="panel">
            <h2>Preview-source history is unavailable</h2>
            <p>Official development notes remain available independently.</p>
          </section>
        )}
      </article>
    );
  } catch {
    return (
      <DataUnavailable title="Forever change history is temporarily unavailable" />
    );
  }
}
