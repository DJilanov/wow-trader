import type { Metadata } from "next";
import Link from "next/link";

import { DataUnavailable } from "../../../components/data-unavailable";
import { ForeverSnapshotNotice } from "../../../components/forever-snapshot-notice";
import { ForeverEncyclopediaNav } from "../../../components/forever-encyclopedia-nav";
import { ForeverExplorerSearch } from "../../../components/forever-explorer-search";
import { ForeverIcon } from "../../../components/forever-icon";
import { JsonLd } from "../../../components/json-ld";
import {
  formatSourceDate,
  getForeverClassDirectory,
  getForeverSnapshot,
} from "../../../lib/forever";
import { getForeverSearchDirectory, getForeverWorldOverview } from "../../../lib/forever-world";
import { createBreadcrumbJsonLd, createHelperMetadata } from "../../../lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Database: Talents, Maps, Bosses & Quests",
  description:
    "Search the WoW Forever encyclopedia for talent trees, spellbooks, maps, dungeons, bosses, quests, racials, and Legacy perks with transparent source evidence.",
  path: "/forever/encyclopedia",
  keywords: [
    "WoW Forever talents",
    "WoW Forever talent calculator",
    "WoW Forever spellbook",
    "WoW Forever racials",
    "WoW Forever Legacy perks",
    "WoW Forever maps",
    "WoW Forever bosses",
  ],
});

export default async function ForeverEncyclopediaPage(): Promise<React.JSX.Element> {
  try {
    const [snapshot, world, worldSearch] = await Promise.all([
      getForeverSnapshot(),
      getForeverWorldOverview().catch(() => null),
      getForeverSearchDirectory().catch(() => []),
    ]);
    if (!snapshot) {
      return <DataUnavailable title="The Forever preview archive is waiting for review" />;
    }
    const classes = getForeverClassDirectory(snapshot.data);
    const counts = snapshot.validation.counts;
    return (
      <>
        <JsonLd
          data={createBreadcrumbJsonLd([
            { name: "KFC Helper", path: "/" },
            { name: "WoW Forever", path: "/forever" },
            { name: "Forever Encyclopedia", path: "/forever/encyclopedia" },
          ])}
        />
        <article className="forever-encyclopedia-page">
          <header className="forever-encyclopedia-hero">
            <div>
              <Link className="helper-back-link" href="/forever">
                <span aria-hidden="true">←</span> Forever tools
              </Link>
              <span className="eyebrow">Reviewed BlizzCon demo archive</span>
              <h1>Forever, reconstructed.</h1>
              <p>
                Explore every publicly exported talent, spellbook page, racial ability, class
                change, and Legacy perk—without hiding which facts are incomplete or estimated.
              </p>
            </div>
            <div className="forever-preview-stamp">
              <span>Source snapshot</span>
              <strong>{formatSourceDate(snapshot.generated)}</strong>
              <small>{snapshot.checksum.slice(0, 12)}</small>
            </div>
          </header>

          <ForeverEncyclopediaNav active="home" />

          {world ? <ForeverExplorerSearch entries={worldSearch} /> : null}

          <section className="forever-coverage-strip" aria-label="Forever preview coverage">
            <div>
              <strong>{counts.talents}</strong>
              <span>Talents</span>
            </div>
            <div>
              <strong>{counts.trees}</strong>
              <span>Talent trees</span>
            </div>
            <div>
              <strong>{counts.spellbookEntries}</strong>
              <span>Spellbook entries</span>
            </div>
            <div>
              <strong>{counts.racialAbilities}</strong>
              <span>Racial abilities</span>
            </div>
            <div>
              <strong>{counts.legacyPerks}</strong>
              <span>Legacy perks</span>
            </div>
          </section>

          <section className="forever-class-directory" aria-labelledby="forever-classes-heading">
            <div className="forever-section-heading">
              <div>
                <span className="eyebrow">Build a character</span>
                <h2 id="forever-classes-heading">Talent trees by class</h2>
              </div>
              <p>{counts.completeTalents} talents are marked complete by the source.</p>
            </div>
            <div className="forever-class-grid">
              {classes.map((entry) => (
                <Link
                  href={`/forever/encyclopedia/talents/${entry.slug}`}
                  key={entry.slug}
                  style={{ "--forever-class": entry.color } as React.CSSProperties}
                >
                  <ForeverIcon alt="" iconKey={entry.icon} snapshotChecksum={snapshot.checksum} />
                  <span>
                    <strong>{entry.name}</strong>
                    <small>{entry.treeNames.join(" · ")}</small>
                    <span>
                      {entry.completeTalentCount}/{entry.talentCount} marked complete
                    </span>
                  </span>
                  <b aria-hidden="true">→</b>
                </Link>
              ))}
            </div>
          </section>

          <section className="forever-library-grid" aria-label="Forever encyclopedia collections">
            <LibraryCard
              href="/forever/encyclopedia/spellbooks/warrior"
              count={counts.spellbookEntries}
              eyebrow="Captured at level 38"
              title="Spellbooks"
            >
              Browse spell tabs, ranks, training levels, in-game-style tooltips, and known gaps for
              every demo class.
            </LibraryCard>
            <LibraryCard
              href="/forever/encyclopedia/racials"
              count={counts.racialAbilities}
              eyebrow="Alliance and Horde"
              title="Racials"
            >
              Compare ten races, class eligibility, ordinary racials, and Priest race abilities.
            </LibraryCard>
            <LibraryCard
              href="/forever/encyclopedia/abilities"
              count={counts.classAbilities}
              eyebrow="New or newly baseline"
              title="Class abilities"
            >
              See the ability changes observed outside the talent trees, grouped by class.
            </LibraryCard>
            <LibraryCard
              href="/forever/encyclopedia/legacy"
              count={counts.legacyPerks}
              eyebrow="Account-wide progression"
              title="Legacy perks"
            >
              Read the Adventure, Resourcefulness, and Professions trees without treating their
              preview text as verified economy mechanics.
            </LibraryCard>
            {world ? (
              <LibraryCard
                href="/forever/encyclopedia/maps"
                count={world.counts.uiMaps}
                eyebrow="Authentic client map art"
                title="World maps"
              >
                Explore zones, points of interest, flight paths, quest coverage, and evidence-aware
                location layers.
              </LibraryCard>
            ) : null}
            {world ? (
              <LibraryCard
                href="/forever/encyclopedia/instances"
                count={world.counts.canonicalEncounters}
                eyebrow="Dungeons and raids"
                title="Instances"
              >
                Browse canonical encounter order, difficulty variants, and linked boss identities.
              </LibraryCard>
            ) : null}
            {world ? (
              <LibraryCard
                href="/forever/encyclopedia/bosses"
                count={world.counts.bosses}
                eyebrow="Criteria-backed creature IDs"
                title="Bosses"
              >
                Investigate boss identities, map relationships, possible abilities, and item-source
                leads without confusing candidates with verified facts.
              </LibraryCard>
            ) : null}
            {world ? (
              <LibraryCard
                href="/forever/encyclopedia/quests"
                count={world.counts.quests}
                eyebrow="Build-scoped identities"
                title="Quest index"
              >
                Track which quest IDs are shipped, queryable, mapped, observed, and genuinely
                available.
              </LibraryCard>
            ) : null}
          </section>

          <ForeverSnapshotNotice generated={snapshot.generated} checksum={snapshot.checksum} />
        </article>
      </>
    );
  } catch {
    return <DataUnavailable title="The Forever Encyclopedia is temporarily unavailable" />;
  }
}

function LibraryCard({
  children,
  count,
  eyebrow,
  href,
  title,
}: {
  readonly children: React.ReactNode;
  readonly count: number;
  readonly eyebrow: string;
  readonly href: string;
  readonly title: string;
}): React.JSX.Element {
  return (
    <Link href={href}>
      <span className="eyebrow">{eyebrow}</span>
      <strong>{title}</strong>
      <p>{children}</p>
      <small>{count} indexed records</small>
    </Link>
  );
}
