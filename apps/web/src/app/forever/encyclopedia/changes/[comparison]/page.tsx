import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { DataUnavailable } from "../../../../../components/data-unavailable";
import { ForeverEncyclopediaNav } from "../../../../../components/forever-encyclopedia-nav";
import {
  getForeverObservatoryReport,
  type CatalogChangeSet,
} from "../../../../../lib/forever-observatory";
import { createHelperMetadata } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

const getCachedObservatory = cache(getForeverObservatoryReport);

interface ChangeComparisonPageProps {
  readonly params: Promise<{ readonly comparison: string }>;
}

export async function generateMetadata({ params }: ChangeComparisonPageProps): Promise<Metadata> {
  const comparison = (await params).comparison;
  const builds = parseComparison(comparison);
  const changeSet = builds ? await getMatchingChangeSet(builds.from, builds.to) : null;
  return createHelperMetadata({
    title: changeSet
      ? `WoW Forever Build ${changeSet.from.buildNumber} to ${changeSet.to.buildNumber}`
      : `WoW Forever Build Comparison ${comparison}`,
    description: changeSet
      ? `Reviewed, immutable item and recipe changes from WoW Forever build ${changeSet.from.buildNumber} to ${changeSet.to.buildNumber}.`
      : "A build-scoped WoW Forever catalog comparison.",
    path: `/forever/encyclopedia/changes/${comparison}`,
    noIndex: !changeSet,
  });
}

export default async function ForeverChangeComparisonPage({
  params,
}: ChangeComparisonPageProps): Promise<React.JSX.Element> {
  const comparison = (await params).comparison;
  const builds = parseComparison(comparison);
  if (!builds) notFound();
  try {
    const changeSet = await getMatchingChangeSet(builds.from, builds.to);
    if (!changeSet) notFound();
    return (
      <article className="forever-reference-page forever-world-page">
        <header className="forever-reference-hero forever-world-hero compact">
          <div>
            <Link className="helper-back-link" href="/forever/encyclopedia/changes">
              <span aria-hidden="true">←</span> Forever changes
            </Link>
            <span className="eyebrow">Reviewed catalog-change-set.v1</span>
            <h1>
              Build {changeSet.from.buildNumber} → {changeSet.to.buildNumber}
            </h1>
            <p>
              This comparison is bound to two published catalog snapshots. IDs link back to their
              build-aware entity pages; no unreviewed runtime inference is included.
            </p>
          </div>
          <div className="build-stamp">
            <span>Immutable receipt</span>
            <strong>{changeSet.contentHash.slice(0, 12)}</strong>
            <small>{changeSet.review.approvedAt.slice(0, 10)} UTC</small>
          </div>
        </header>
        <ForeverEncyclopediaNav active="changes" />
        <section className="forever-map-evidence-grid community-entity-summary">
          <BuildCard label="Previous build" build={changeSet.from} />
          <BuildCard label="Current build" build={changeSet.to} />
        </section>
        <ChangeGroup
          basePath="/forever/encyclopedia/items"
          entityLabel="items"
          changes={changeSet.entities.items}
        />
        <ChangeGroup
          basePath="/forever/encyclopedia/recipes"
          entityLabel="recipes"
          changes={changeSet.entities.recipes}
        />
        <aside className="evidence-note">
          <strong>Publication receipt</strong>
          <p>
            {changeSet.id} · SHA-256 {changeSet.contentHash}. Approval means both exact catalog
            builds passed the existing publication gate; it does not imply that every gameplay
            consequence was manually interpreted.
          </p>
        </aside>
      </article>
    );
  } catch (error: unknown) {
    if (error instanceof Error && "digest" in error) throw error;
    return <DataUnavailable title="The catalog comparison is temporarily unavailable" />;
  }
}

function BuildCard({
  build,
  label,
}: {
  readonly build: CatalogChangeSet["from"];
  readonly label: string;
}): React.JSX.Element {
  return (
    <article>
      <span className="eyebrow">{label}</span>
      <h2>Build {build.buildNumber}</h2>
      <dl>
        <div>
          <dt>Client</dt>
          <dd>{build.version}</dd>
        </div>
        <div>
          <dt>Snapshot</dt>
          <dd>{build.snapshotKey}</dd>
        </div>
        <div>
          <dt>Published</dt>
          <dd>{build.publishedAt?.slice(0, 10)} UTC</dd>
        </div>
      </dl>
    </article>
  );
}

function ChangeGroup({
  basePath,
  changes,
  entityLabel,
}: {
  readonly basePath: string;
  readonly changes: CatalogChangeSet["entities"]["items"];
  readonly entityLabel: string;
}): React.JSX.Element {
  return (
    <section className="forever-boss-panel forever-boss-wide-panel">
      <div className="forever-section-heading">
        <div>
          <span className="eyebrow">Normalized player-facing fields</span>
          <h2>
            {entityLabel[0]?.toUpperCase()}
            {entityLabel.slice(1)}
          </h2>
        </div>
        <p>
          {changes.added.length} added · {changes.changed.length} changed · {changes.removed.length}{" "}
          removed
        </p>
      </div>
      {(["added", "changed", "removed"] as const).map((state) => (
        <div className="community-change-group" key={state}>
          <h3>
            {state[0]?.toUpperCase()}
            {state.slice(1)}
          </h3>
          {changes[state].length ? (
            <ul className="forever-evidence-list compact">
              {changes[state].slice(0, 250).map((id) => (
                <li key={id}>
                  <strong>
                    <Link href={`${basePath}/${id}`}>
                      {entityLabel.slice(0, -1)} {id}
                    </Link>
                  </strong>
                  <span>{state} in this build pair</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="forever-honest-empty">
              No {entityLabel} were {state}.
            </p>
          )}
          {changes[state].length > 250 ? (
            <small>
              Showing the first 250 of {changes[state].length.toLocaleString("en-GB")} IDs.
            </small>
          ) : null}
        </div>
      ))}
    </section>
  );
}

async function getMatchingChangeSet(from: number, to: number): Promise<CatalogChangeSet | null> {
  const report = await getCachedObservatory().catch(() => null);
  const changeSet = report?.catalog.changeSet ?? null;
  return changeSet?.from.buildNumber === from && changeSet.to.buildNumber === to ? changeSet : null;
}

function parseComparison(value: string): { readonly from: number; readonly to: number } | null {
  const match = /^(\d+)-to-(\d+)$/.exec(value);
  if (!match) return null;
  const from = Number(match[1]);
  const to = Number(match[2]);
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) && from > 0 && to > from
    ? { from, to }
    : null;
}
