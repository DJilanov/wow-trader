import type { Metadata } from "next";

import { DataUnavailable } from "../../components/data-unavailable";
import { StatusPill } from "../../components/status-pill";
import { getDashboardData } from "../../lib/data";
import { createHelperMetadata } from "../../lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = createHelperMetadata({
  title: "Data Status",
  description: "Operational catalog and Auction House data freshness for KFC Helper.",
  path: "/data-status",
  noIndex: true,
});

export default async function DataStatusPage(): Promise<React.JSX.Element> {
  try {
    const data = await getDashboardData();
    return (
      <article className="detail-page">
        <header className="page-intro">
          <div>
            <span className="eyebrow">Provenance first</span>
            <h1>Data status</h1>
            <p>The exact catalog and scan state behind every recommendation.</p>
          </div>
        </header>
        <section className="detail-grid">
          <div className="panel">
            <h2>Published catalog</h2>
            {data.build ? (
              <dl className="metric-list">
                <div>
                  <dt>Product</dt>
                  <dd>{data.build.product}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{data.build.version}</dd>
                </div>
                <div>
                  <dt>Build</dt>
                  <dd>{data.build.buildNumber}</dd>
                </div>
                <div>
                  <dt>Hotfix overlay</dt>
                  <dd>
                    <StatusPill value={data.build.hotfixStatus} />
                  </dd>
                </div>
                <div>
                  <dt>Items</dt>
                  <dd>{data.counts.items.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Recipes</dt>
                  <dd>{data.counts.recipes.toLocaleString()}</dd>
                </div>
              </dl>
            ) : (
              <p className="inline-empty">No build has passed review and publication.</p>
            )}
          </div>
          <div className="panel">
            <h2>Latest market scan</h2>
            {data.market ? (
              <dl className="metric-list">
                <div>
                  <dt>Region / realm</dt>
                  <dd>
                    {data.market.region} / {data.market.realmId}
                  </dd>
                </div>
                <div>
                  <dt>House</dt>
                  <dd>{data.market.auctionHouseType}</dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>
                    <time dateTime={data.market.completedAt.toISOString()}>
                      {data.market.completedAt.toLocaleString()}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Completeness</dt>
                  <dd>{Math.round(data.market.completeness * 100)}%</dd>
                </div>
                <div>
                  <dt>Items observed</dt>
                  <dd>{data.market.itemCount.toLocaleString()}</dd>
                </div>
              </dl>
            ) : (
              <p className="inline-empty">No Auction House scan has been accepted.</p>
            )}
          </div>
        </section>
        <aside className="evidence-note">
          <strong>Status semantics</strong>
          <p>
            “Present in client” is not the same as “available on a realm.” Source, phase,
            probability, freshness, and market completeness stay separate throughout the system.
          </p>
        </aside>
      </article>
    );
  } catch {
    return <DataUnavailable />;
  }
}
