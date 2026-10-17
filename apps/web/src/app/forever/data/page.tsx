import type { Metadata } from "next";
import Link from "next/link";

import { DataUnavailable } from "../../../components/data-unavailable";
import { JsonLd } from "../../../components/json-ld";
import { getForeverObservatoryReport } from "../../../lib/forever-observatory";
import { createHelperMetadata, HELPER_SITE_URL } from "../../../lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Public Data & Evidence Observatory",
  description:
    "Download build-scoped WoW Forever catalog, profession, market, and world coverage data with explicit evidence and publication rules.",
  path: "/forever/data",
  keywords: [
    "WoW Forever data",
    "WoW Forever API",
    "WoW Forever build changes",
    "WoW Forever market research",
  ],
});

export default async function ForeverDataPage(): Promise<React.JSX.Element> {
  try {
    const report = await getForeverObservatoryReport();
    const build = report.catalog.current;
    return (
      <article className="detail-page">
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: "KFC Helper WoW Forever Evidence Observatory",
            description:
              "Build-scoped catalog coverage, semantic changes, profession recipe coverage, Auction House trend evidence, and world-data coverage.",
            url: `${HELPER_SITE_URL}/forever/data`,
            version: build ? String(build.buildNumber) : "unavailable",
            dateModified: report.generatedAt,
            distribution: {
              "@type": "DataDownload",
              encodingFormat: "application/json",
              contentUrl: `${HELPER_SITE_URL}/api/v1/public/forever/observatory`,
            },
          }}
        />
        <header className="item-library-header">
          <div>
            <Link className="helper-back-link" href="/forever">
              <span aria-hidden="true">←</span> WoW Forever
            </Link>
            <span className="eyebrow">Public evidence · machine-readable</span>
            <h1>Forever data observatory</h1>
            <p>
              Exact client facts, measured market evidence, and unresolved gaps in one versioned
              report. Unknowns stay unknown instead of becoming confident-looking guesses.
            </p>
          </div>
          <div className="build-stamp">
            <span>Current catalog</span>
            <strong>{build?.version ?? "Waiting"}</strong>
            <small>{build ? `Build ${build.buildNumber}` : "No published build"}</small>
          </div>
        </header>

        <section className="detail-grid" aria-label="Forever evidence coverage">
          <div className="panel">
            <span className="eyebrow">Catalog</span>
            <h2>{report.discovery.catalogItems.toLocaleString()} indexed items</h2>
            <p>
              {report.catalog.professions.length.toLocaleString()} professions with{" "}
              {report.catalog.professions
                .reduce((total, profession) => total + profession.recipes, 0)
                .toLocaleString()}{" "}
              normalized recipes in the current published build.
            </p>
            <Link href="/forever/encyclopedia/catalog">Search the catalog →</Link>
          </div>
          <div className="panel">
            <span className="eyebrow">Auction House</span>
            <h2>{marketState(report.market.state)}</h2>
            <p>
              {report.market.eligibleItems.toLocaleString()} items pass the stricter public trend
              gate; {report.market.collectingItems.toLocaleString()} are still collecting history.
            </p>
            <Link href="/forever/trader">Inspect the live market →</Link>
          </div>
          <div className="panel">
            <span className="eyebrow">World evidence</span>
            <h2>{report.discovery.lootSourceCandidates.toLocaleString()} loot leads</h2>
            <p>
              These are candidate relationships, not confirmed drop rates. Confirmed drop-rate
              claims: {report.discovery.confirmedDropRates}.
            </p>
            <Link href="/forever/encyclopedia/bosses">Explore bosses →</Link>
          </div>
        </section>

        <section className="panel" aria-labelledby="public-api-heading">
          <span className="eyebrow">Public API</span>
          <h2 id="public-api-heading">Use the evidence, keep its scope</h2>
          <p>
            Responses include schema versions, exact build identity, canonical entity URLs, and
            cache headers. Copper values that may exceed JavaScript&apos;s safe range are encoded as
            strings.
          </p>
          <ul className="link-list">
            <li>
              <a href="/api/v1/public/forever/observatory">Observatory report (JSON)</a>
            </li>
            <li>
              <code>/api/v1/public/forever/items/{"{itemId}"}</code>
            </li>
            <li>
              <code>/api/v1/public/forever/recipes/{"{spellId}"}</code>
            </li>
            {report.catalog.professions[0] ? (
              <li>
                <a
                  href={`/api/v1/public/forever/professions/${report.catalog.professions[0].slug}`}
                >
                  Profession endpoint example (JSON)
                </a>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel" id="methodology" aria-labelledby="methodology-heading">
          <span className="eyebrow">Methodology</span>
          <h2 id="methodology-heading">Publication gates</h2>
          <ul className="link-list">
            {report.publicationRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          {build ? (
            <dl className="metric-list">
              <div>
                <dt>Snapshot key</dt>
                <dd>{build.snapshotKey}</dd>
              </div>
              <div>
                <dt>Hotfix</dt>
                <dd>{build.hotfixHash?.slice(0, 16) ?? "Not available"}</dd>
              </div>
              <div>
                <dt>Definitions</dt>
                <dd>{build.definitionsRevision.slice(0, 16)}</dd>
              </div>
              <div>
                <dt>Extractor</dt>
                <dd>{build.extractorVersion}</dd>
              </div>
            </dl>
          ) : null}
          <p id="terms">
            Cite KFC Helper and preserve the build, market, timestamp, and evidence status when
            reusing the export. Blizzard game data and imagery remain Blizzard Entertainment&apos;s
            property.
          </p>
        </section>
      </article>
    );
  } catch {
    return <DataUnavailable title="The Forever data observatory is temporarily unavailable" />;
  }
}

function marketState(state: "unavailable" | "collecting" | "reportable"): string {
  if (state === "reportable") return "Trend evidence ready";
  if (state === "collecting") return "History still collecting";
  return "Waiting for accepted scans";
}
