import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";

import { DataUnavailable } from "../../../../../components/data-unavailable";
import { ForeverSnapshotNotice } from "../../../../../components/forever-snapshot-notice";
import { ForeverEncyclopediaNav } from "../../../../../components/forever-encyclopedia-nav";
import { ForeverIcon } from "../../../../../components/forever-icon";
import { ForeverSpellbook } from "../../../../../components/forever-spellbook";
import { ForeverTalentCalculator } from "../../../../../components/forever-talent-calculator";
import {
  getForeverClassDirectory,
  getForeverClassPageData,
  getForeverSnapshot,
} from "../../../../../lib/forever";
import { createHelperMetadata } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface ForeverTalentPageProps {
  readonly params: Promise<{ readonly classSlug: string }>;
  readonly searchParams: Promise<{ readonly build?: string | readonly string[] }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: ForeverTalentPageProps): Promise<Metadata> {
  const { classSlug } = await params;
  const query = await searchParams;
  const build = firstValue(query.build);
  const className = titleCase(classSlug);
  return createHelperMetadata({
    title: `WoW Forever ${className} Talent Calculator & Spellbook`,
    description: `Build and share WoW Forever ${className} talent trees, compare them with Classic, and browse the captured level-38 spellbook with evidence-aware tooltips.`,
    path: `/forever/encyclopedia/talents/${classSlug}`,
    keywords: [
      `WoW Forever ${className} talents`,
      `${className} talent calculator Forever`,
      `WoW Forever ${className} spellbook`,
    ],
    noIndex: Boolean(build),
  });
}

export default async function ForeverTalentPage({
  params,
  searchParams,
}: ForeverTalentPageProps): Promise<React.JSX.Element> {
  const [{ classSlug }, query] = await Promise.all([params, searchParams]);
  const build = firstValue(query.build);
  const checksum = buildChecksum(build);
  try {
    const pageData = await getForeverClassPageData(classSlug, checksum ?? undefined);
    if (!pageData) {
      if (checksum) return <DataUnavailable title="That historical Forever build is unavailable" />;
      notFound();
    }
    const { classData, className, snapshot } = pageData;
    const spellbook = snapshot.data.spellbooks[className];
    const directory = getForeverClassDirectory(snapshot.data);
    return (
      <article className="forever-talent-page">
        <header className="forever-class-hero">
          <div>
            <Link className="helper-back-link" href="/forever/encyclopedia">
              <span aria-hidden="true">←</span> Forever Encyclopedia
            </Link>
            <span className="eyebrow">Interactive demo talent archive</span>
            <h1>{className}</h1>
            <p>{classData.source}</p>
          </div>
          <ForeverIcon
            alt={`${className} class`}
            iconKey={classData.icon}
            snapshotChecksum={snapshot.checksum}
          />
        </header>

        <ForeverEncyclopediaNav active="talents" classSlug={pageData.classSlug} />

        <nav className="forever-class-tabs" aria-label="Choose a class">
          {directory.map((entry) => (
            <Link
              aria-current={entry.slug === pageData.classSlug ? "page" : undefined}
              className={entry.slug === pageData.classSlug ? "active" : undefined}
              href={`/forever/encyclopedia/talents/${entry.slug}`}
              key={entry.slug}
              style={{ "--forever-class": entry.color } as React.CSSProperties}
            >
              <ForeverIcon alt="" iconKey={entry.icon} snapshotChecksum={snapshot.checksum} />
              {entry.name}
            </Link>
          ))}
        </nav>

        <ForeverTalentCalculator
          classData={classData}
          className={className}
          classSlug={pageData.classSlug}
          color={pageData.color}
          snapshotChecksum={snapshot.checksum}
          {...(build ? { initialBuild: build } : {})}
        />

        {spellbook ? (
          <ForeverSpellbook
            classData={classData}
            className={className}
            color={pageData.color}
            descriptions={snapshot.data.spell_desc}
            icons={snapshot.supplemental.spellbookIcons}
            snapshotChecksum={snapshot.checksum}
            spellbook={spellbook}
          />
        ) : null}

        <ForeverSnapshotNotice generated={snapshot.generated} checksum={snapshot.checksum} />
      </article>
    );
  } catch (error: unknown) {
    unstable_rethrow(error);
    return <DataUnavailable title="This Forever class archive is temporarily unavailable" />;
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

function firstValue(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

function buildChecksum(build: string | undefined): string | null {
  if (!build) return null;
  const checksum = build.split(".")[1];
  return checksum && /^[a-f0-9]{64}$/.test(checksum) ? checksum : null;
}

function titleCase(value: string): string {
  return value.length > 0 ? `${value[0]?.toUpperCase()}${value.slice(1).toLowerCase()}` : value;
}
