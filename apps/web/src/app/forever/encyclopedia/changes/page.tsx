import type { Metadata } from "next";
import Link from "next/link";

import { DataUnavailable } from "../../../../components/data-unavailable";
import { ForeverSnapshotNotice } from "../../../../components/forever-snapshot-notice";
import { ForeverEncyclopediaNav } from "../../../../components/forever-encyclopedia-nav";
import { getForeverSnapshot, sourceText } from "../../../../lib/forever";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Preview Data Changes",
  description:
    "Review the attributed Talents Forever source changelog and KFC Helper's current immutable preview snapshot.",
  path: "/forever/encyclopedia/changes",
  keywords: ["WoW Forever changes", "WoW Forever talents changes", "WoW Forever beta data"],
});

export default async function ForeverChangesPage(): Promise<React.JSX.Element> {
  try {
    const snapshot = await getForeverSnapshot();
    if (!snapshot) return <DataUnavailable title="Forever change history is waiting for review" />;
    return (
      <article className="forever-reference-page">
        <header className="forever-reference-hero">
          <Link className="helper-back-link" href="/forever/encyclopedia">
            <span aria-hidden="true">←</span> Forever Encyclopedia
          </Link>
          <span className="eyebrow">Source history</span>
          <h1>Preview changes</h1>
          <p>
            The source changelog is rendered as untrusted plain text. KFC Helper&apos;s immutable
            hash and publication record remain the authority for exactly which payload is live here.
          </p>
        </header>
        <ForeverEncyclopediaNav active="changes" />
        <div className="forever-change-list">
          {snapshot.data.changelog.map((entry, index) => (
            <article key={`${entry.date}:${entry.title}:${index}`}>
              <time dateTime={entry.date}>{entry.date}</time>
              <h2>{entry.title}</h2>
              <p>{sourceText(entry.text)}</p>
            </article>
          ))}
        </div>
        <ForeverSnapshotNotice generated={snapshot.generated} checksum={snapshot.checksum} />
      </article>
    );
  } catch {
    return <DataUnavailable title="Forever change history is temporarily unavailable" />;
  }
}
