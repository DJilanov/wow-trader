import type { Metadata } from "next";
import Link from "next/link";

import { DataUnavailable } from "../../../../components/data-unavailable";
import { ForeverSnapshotNotice } from "../../../../components/forever-snapshot-notice";
import { ForeverEncyclopediaNav } from "../../../../components/forever-encyclopedia-nav";
import { ForeverIcon } from "../../../../components/forever-icon";
import { getForeverSnapshot } from "../../../../lib/forever";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Legacy Perks",
  description:
    "Explore WoW Forever Adventure, Resourcefulness, and Professions Legacy perks with rank caps and preview evidence.",
  path: "/forever/encyclopedia/legacy",
  keywords: ["WoW Forever Legacy", "WoW Forever Legacy perks", "WoW Forever profession perks"],
});

export default async function ForeverLegacyPage(): Promise<React.JSX.Element> {
  try {
    const snapshot = await getForeverSnapshot();
    if (!snapshot) return <DataUnavailable title="Forever Legacy data is waiting for review" />;
    return (
      <article className="forever-reference-page">
        <header className="forever-reference-hero">
          <Link className="helper-back-link" href="/forever/encyclopedia">
            <span aria-hidden="true">←</span> Forever Encyclopedia
          </Link>
          <span className="eyebrow">Account-wide progression</span>
          <h1>Legacy perk trees</h1>
          <p>{snapshot.data.legacy.note}</p>
        </header>
        <ForeverEncyclopediaNav active="legacy" />
        <div className="forever-legacy-grid">
          {snapshot.data.legacy.trees.map((tree) => (
            <section key={tree.name}>
              <header>
                <ForeverIcon alt="" iconKey={tree.icon} snapshotChecksum={snapshot.checksum} />
                <h2>{tree.name}</h2>
              </header>
              <ol>
                {tree.perks.map(([name, maximumRank, description, icon]) => (
                  <li key={name}>
                    <ForeverIcon alt="" iconKey={icon} snapshotChecksum={snapshot.checksum} />
                    <span>
                      <strong>{name}</strong>
                      <b>
                        {maximumRank} rank{maximumRank === 1 ? "" : "s"}
                      </b>
                      <small>{description}</small>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <aside className="forever-mechanics-warning">
          <strong>Economy boundary</strong>
          <p>
            Profession perk descriptions are visible here, but KFC Trader will not apply them to
            profit calculations until their proc, yield, eligibility, and cooldown behavior is
            represented by verified mechanics rules.
          </p>
        </aside>
        <ForeverSnapshotNotice generated={snapshot.generated} checksum={snapshot.checksum} />
      </article>
    );
  } catch {
    return <DataUnavailable title="Forever Legacy data is temporarily unavailable" />;
  }
}
