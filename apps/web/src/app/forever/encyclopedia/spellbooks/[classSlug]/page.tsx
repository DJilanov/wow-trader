import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";

import { DataUnavailable } from "../../../../../components/data-unavailable";
import { ForeverSnapshotNotice } from "../../../../../components/forever-snapshot-notice";
import { ForeverEncyclopediaNav } from "../../../../../components/forever-encyclopedia-nav";
import { ForeverIcon } from "../../../../../components/forever-icon";
import { ForeverSpellbook } from "../../../../../components/forever-spellbook";
import {
  getForeverClassDirectory,
  getForeverClassPageData,
  getForeverSnapshot,
} from "../../../../../lib/forever";
import { createHelperMetadata } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface ForeverSpellbookPageProps {
  readonly params: Promise<{ readonly classSlug: string }>;
}

export async function generateMetadata({ params }: ForeverSpellbookPageProps): Promise<Metadata> {
  const { classSlug } = await params;
  const className = `${classSlug[0]?.toUpperCase() ?? ""}${classSlug.slice(1).toLowerCase()}`;
  return createHelperMetadata({
    title: `WoW Forever ${className} Spellbook`,
    description: `Browse the captured level-38 WoW Forever ${className} spellbook by tab, rank, training level, tooltip evidence, and Classic comparison.`,
    path: `/forever/encyclopedia/spellbooks/${classSlug}`,
    keywords: [`WoW Forever ${className} spells`, `WoW Forever ${className} spellbook`],
  });
}

export default async function ForeverSpellbookPage({
  params,
}: ForeverSpellbookPageProps): Promise<React.JSX.Element> {
  const { classSlug } = await params;
  try {
    const pageData = await getForeverClassPageData(classSlug);
    if (!pageData) notFound();
    const spellbook = pageData.snapshot.data.spellbooks[pageData.className];
    if (!spellbook) notFound();
    const directory = getForeverClassDirectory(pageData.snapshot.data);
    return (
      <article className="forever-talent-page forever-spellbook-page">
        <header className="forever-class-hero">
          <div>
            <Link className="helper-back-link" href="/forever/encyclopedia">
              <span aria-hidden="true">←</span> Forever Encyclopedia
            </Link>
            <span className="eyebrow">Captured at BlizzCon 2026</span>
            <h1>{pageData.className} spellbook</h1>
            <p>
              Every observed tab and rank from the level {spellbook.level} {spellbook.race} demo
              character, with visible Classic fallbacks where Forever text was not captured.
            </p>
          </div>
          <ForeverIcon
            alt={`${pageData.className} class`}
            iconKey={pageData.classData.icon}
            snapshotChecksum={pageData.snapshot.checksum}
          />
        </header>
        <ForeverEncyclopediaNav active="spellbooks" classSlug={pageData.classSlug} />
        <nav className="forever-class-tabs" aria-label="Choose a class spellbook">
          {directory.map((entry) => (
            <Link
              className={entry.slug === pageData.classSlug ? "active" : undefined}
              href={`/forever/encyclopedia/spellbooks/${entry.slug}`}
              key={entry.slug}
              style={{ "--forever-class": entry.color } as React.CSSProperties}
            >
              <ForeverIcon
                alt=""
                iconKey={entry.icon}
                snapshotChecksum={pageData.snapshot.checksum}
              />
              {entry.name}
            </Link>
          ))}
        </nav>
        <ForeverSpellbook
          classData={pageData.classData}
          className={pageData.className}
          color={pageData.color}
          descriptions={pageData.snapshot.data.spell_desc}
          icons={pageData.snapshot.supplemental.spellbookIcons}
          snapshotChecksum={pageData.snapshot.checksum}
          spellbook={spellbook}
        />
        <ForeverSnapshotNotice
          generated={pageData.snapshot.generated}
          checksum={pageData.snapshot.checksum}
        />
      </article>
    );
  } catch (error: unknown) {
    unstable_rethrow(error);
    return <DataUnavailable title="This Forever spellbook is temporarily unavailable" />;
  }
}

export async function generateStaticParams(): Promise<{ classSlug: string }[]> {
  try {
    const snapshot = await getForeverSnapshot();
    return snapshot
      ? getForeverClassDirectory(snapshot.data).map(({ slug }) => ({ classSlug: slug }))
      : [];
  } catch {
    return [];
  }
}
