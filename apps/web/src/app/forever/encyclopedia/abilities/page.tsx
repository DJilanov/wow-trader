import type { Metadata } from "next";
import Link from "next/link";

import { DataUnavailable } from "../../../../components/data-unavailable";
import { ForeverSnapshotNotice } from "../../../../components/forever-snapshot-notice";
import { ForeverEncyclopediaNav } from "../../../../components/forever-encyclopedia-nav";
import { ForeverIcon } from "../../../../components/forever-icon";
import { getForeverClassDirectory, getForeverSnapshot } from "../../../../lib/forever";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever New Class Abilities",
  description:
    "Browse WoW Forever class abilities observed as new, changed, or newly baseline outside the talent trees.",
  path: "/forever/encyclopedia/abilities",
  keywords: ["WoW Forever class abilities", "WoW Forever spells", "WoW Forever class changes"],
});

export default async function ForeverAbilitiesPage(): Promise<React.JSX.Element> {
  try {
    const snapshot = await getForeverSnapshot();
    if (!snapshot)
      return <DataUnavailable title="Forever class abilities are waiting for review" />;
    const directory = getForeverClassDirectory(snapshot.data);
    return (
      <article className="forever-reference-page">
        <header className="forever-reference-hero">
          <Link className="helper-back-link" href="/forever/encyclopedia">
            <span aria-hidden="true">←</span> Forever Encyclopedia
          </Link>
          <span className="eyebrow">Outside the talent trees</span>
          <h1>New and baseline abilities</h1>
          <p>
            These are class abilities specifically called out by the source. The exact wording below
            remains preview evidence until it is reconciled with a public client build.
          </p>
        </header>
        <ForeverEncyclopediaNav active="abilities" />
        <div className="forever-ability-class-grid">
          {directory.map((entry) => {
            const abilities = snapshot.data.class_abilities[entry.name] ?? [];
            return (
              <section
                key={entry.slug}
                style={{ "--forever-class": entry.color } as React.CSSProperties}
              >
                <header>
                  <ForeverIcon alt="" iconKey={entry.icon} snapshotChecksum={snapshot.checksum} />
                  <span>
                    <h2>{entry.name}</h2>
                    <small>{abilities.length} observed abilities</small>
                  </span>
                </header>
                {abilities.length > 0 ? (
                  <ul className="forever-ability-list">
                    {abilities.map(([name, description, icon]) => (
                      <li key={name}>
                        <ForeverIcon alt="" iconKey={icon} snapshotChecksum={snapshot.checksum} />
                        <span>
                          <strong>{name}</strong>
                          <small>{description}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No separate ability observation is present for this class.</p>
                )}
              </section>
            );
          })}
        </div>
        <ForeverSnapshotNotice generated={snapshot.generated} checksum={snapshot.checksum} />
      </article>
    );
  } catch {
    return <DataUnavailable title="Forever class abilities are temporarily unavailable" />;
  }
}
