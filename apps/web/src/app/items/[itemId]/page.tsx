import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DataUnavailable } from "../../../components/data-unavailable";
import { ItemTooltip } from "../../../components/item-tooltip";
import { JsonLd } from "../../../components/json-ld";
import { getItemDetail, type ItemMarketData } from "../../../lib/data";
import { formatCopper, formatRelativeTime } from "../../../lib/format";
import { createBreadcrumbJsonLd, createHelperMetadata } from "../../../lib/seo";

export const dynamic = "force-dynamic";

interface ItemPageProps {
  readonly params: Promise<{ readonly itemId: string }>;
  readonly searchParams?: Promise<{
    readonly class?: string | readonly string[];
    readonly level?: string | readonly string[];
  }>;
}

export async function generateMetadata({ params }: ItemPageProps): Promise<Metadata> {
  const { itemId } = await params;
  const numericItemId = Number(itemId);
  const fallback = createHelperMetadata({
    title: `TBC Item ${itemId}`,
    description: `TBC Classic item ${itemId} in the build-aware KFC Helper item database.`,
    path: `/tbc/encyclopedia/items/${encodeURIComponent(itemId)}`,
    noIndex: !Number.isSafeInteger(numericItemId) || numericItemId <= 0,
  });
  if (!Number.isSafeInteger(numericItemId) || numericItemId <= 0) return fallback;

  try {
    const item = await getItemDetail(numericItemId);
    if (!item) return { ...fallback, robots: { index: false, follow: true } };
    return createHelperMetadata({
      title: `${item.name} — TBC Item ${item.itemId}`,
      description: `${item.name} (item ${item.itemId}) from TBC Classic: item level ${item.itemLevel}, requirements, stats, effects, sockets, set data, vendor value, and build provenance.`,
      path: `/tbc/encyclopedia/items/${item.itemId}`,
      keywords: [item.name, `${item.name} TBC`, `TBC item ${item.itemId}`],
    });
  } catch {
    return fallback;
  }
}

export default async function ItemPage({
  params,
  searchParams,
}: ItemPageProps): Promise<React.JSX.Element> {
  const itemId = Number((await params).itemId);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) notFound();
  const viewer = parseViewer(await searchParams);

  try {
    const item = await getItemDetail(itemId);
    if (!item) notFound();
    return (
      <>
        <JsonLd
          data={createBreadcrumbJsonLd([
            { name: "KFC Helper", path: "/" },
            { name: "TBC Encyclopedia", path: "/tbc/encyclopedia" },
            { name: item.name, path: `/tbc/encyclopedia/items/${item.itemId}` },
          ])}
        />
        <article className="detail-page">
          <header className="item-library-header">
            <div>
              <span className="eyebrow">TBC Encyclopedia · Item {item.itemId}</span>
              <h2>In-game item inspection</h2>
              <p>
                Client facts are rendered in familiar tooltip order. Change the viewer to evaluate
                level and class restrictions without changing the item data.
              </p>
            </div>
            <div className="build-stamp">
              <span>Catalog source</span>
              <strong>{item.build.version}</strong>
              <small>Build {item.build.number}</small>
            </div>
          </header>

          <section className="item-viewer-panel" aria-labelledby="item-viewer-heading">
            <form method="get" className="item-viewer-form">
              <div>
                <span className="eyebrow" id="item-viewer-heading">
                  Tooltip viewer
                </span>
                <strong>Restriction preview</strong>
              </div>
              <label>
                Class
                <select name="class" defaultValue={viewer.classId ?? ""}>
                  <option value="">No class selected</option>
                  {item.gameClasses.map((gameClass) => (
                    <option key={gameClass.classId} value={gameClass.classId}>
                      {gameClass.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Level
                <input
                  type="number"
                  name="level"
                  min="1"
                  max="80"
                  defaultValue={viewer.level ?? ""}
                  placeholder="70"
                />
              </label>
              <button type="submit" className="button button-secondary">
                Apply viewer
              </button>
            </form>
          </section>

          <ItemTooltip item={item} viewerClassId={viewer.classId} viewerLevel={viewer.level} />

          <section className="detail-grid">
            <div className="panel">
              <h2>Catalog facts</h2>
              <dl className="metric-list">
                <div>
                  <dt>Quality</dt>
                  <dd>{item.quality}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>
                    {item.subclassName ?? item.className ?? `${item.classId} / ${item.subclassId}`}
                  </dd>
                </div>
                <div>
                  <dt>Required level</dt>
                  <dd>{item.requiredLevel || "None"}</dd>
                </div>
                <div>
                  <dt>Item level</dt>
                  <dd>{item.itemLevel}</dd>
                </div>
                <div>
                  <dt>Stack size</dt>
                  <dd>{item.stackSize}</dd>
                </div>
                <div>
                  <dt>Normalized facts</dt>
                  <dd>
                    {item.stats.length} stats · {item.effects.length} effects ·{" "}
                    {item.sockets.length} sockets
                  </dd>
                </div>
                <div>
                  <dt>Vendor buy</dt>
                  <dd>{formatCopper(item.buyPriceCopper)}</dd>
                </div>
                <div>
                  <dt>Vendor sell</dt>
                  <dd>{formatCopper(item.sellPriceCopper)}</dd>
                </div>
              </dl>
            </div>
            <div className="panel loot-info-panel">
              <span className="eyebrow">Next data phase</span>
              <h2>Loot info</h2>
              <div className="loot-info-pending" role="status">
                <span aria-hidden="true">?</span>
                <div>
                  <strong>Acquisition data is not imported yet</strong>
                  <p>
                    Verified drops, quest rewards, vendors, phase availability, and drop-rate
                    evidence will appear here in the next development phase.
                  </p>
                </div>
              </div>
              <dl className="metric-list loot-info-facts">
                <div>
                  <dt>Source</dt>
                  <dd>Pending verification</dd>
                </div>
                <div>
                  <dt>Drop chance</dt>
                  <dd>Unknown</dd>
                </div>
              </dl>
              <a
                className="loot-reference-link"
                href={`https://www.wowhead.com/tbc/item=${item.itemId}`}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                aria-label={`View ${item.name} on Wowhead (opens in a new tab)`}
              >
                <span>View item on Wowhead</span>
                <span aria-hidden="true">↗</span>
              </a>
              <small className="loot-reference-note">
                External community reference. Its source and drop-rate claims are not imported into
                our evidence model.
              </small>
            </div>
          </section>
          <section className="panel item-data-boundary" aria-labelledby="data-boundary-heading">
            <span className="eyebrow">Evidence boundary</span>
            <h2 id="data-boundary-heading">What this page knows</h2>
            <p>
              Identity, restrictions, stats, damage, sockets, durability, set membership, and linked
              spell effects come from the selected client build. Weapon DPS is calculated directly
              from the displayed damage and speed. BiS ranking and acquisition sources are purposely
              not inferred in this phase.
            </p>
          </section>
          <MarketPanel market={item.market} />
        </article>
      </>
    );
  } catch (error) {
    if (isNextNavigationError(error)) throw error;
    return <DataUnavailable title="Item data is unavailable" />;
  }
}

function parseViewer(
  searchParams:
    | { readonly class?: string | readonly string[]; readonly level?: string | readonly string[] }
    | undefined,
): { readonly classId: number | null; readonly level: number | null } {
  return {
    classId: parseBoundedInteger(firstValue(searchParams?.class), 1, 32),
    level: parseBoundedInteger(firstValue(searchParams?.level), 1, 80),
  };
}

function firstValue(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

function parseBoundedInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function MarketPanel({ market }: { readonly market: ItemMarketData | null }): React.JSX.Element {
  if (!market) {
    return (
      <p className="inline-empty">No Auction House history has been uploaded for this item.</p>
    );
  }

  return (
    <section className="panel market-history" aria-labelledby="market-history-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {market.region} / {market.realmId} / {market.auctionHouseType}
          </span>
          <h2 id="market-history-heading">Observed market</h2>
        </div>
        <span>
          {formatRelativeTime(market.latestAt)} · key {market.marketKey}
        </span>
      </div>
      <div className="market-metrics">
        <div>
          <span>Minimum</span>
          <strong>{formatCopper(market.current.minimumPriceCopper)}</strong>
        </div>
        <div>
          <span>Weighted median</span>
          <strong>{formatCopper(market.current.weightedMedianPriceCopper)}</strong>
        </div>
        <div>
          <span>Available</span>
          <strong>{market.current.availableQuantity.toLocaleString()}</strong>
        </div>
        <div>
          <span>Within 5% of floor</span>
          <strong>{market.current.quantityWithinFivePercent.toLocaleString()}</strong>
        </div>
      </div>
      <ForecastSummary market={market} />
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Observed</th>
              <th>Minimum</th>
              <th>Weighted median</th>
              <th>Supply</th>
            </tr>
          </thead>
          <tbody>
            {market.history
              .slice(-8)
              .reverse()
              .map((observation) => (
                <tr key={observation.observedAt.toISOString()}>
                  <td>{observation.observedAt.toLocaleString()}</td>
                  <td>{formatCopper(observation.minimumPriceCopper)}</td>
                  <td>{formatCopper(observation.weightedMedianPriceCopper)}</td>
                  <td>{observation.availableQuantity.toLocaleString()}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ForecastSummary({ market }: { readonly market: ItemMarketData }): React.JSX.Element {
  const forecast = market.forecast;
  if (forecast.status === "insufficient_data") {
    return (
      <p className="forecast-note">
        Baseline forecast needs {forecast.minimumObservationCount} scans;{" "}
        {forecast.observationCount} are available.
      </p>
    );
  }

  return (
    <p className="forecast-note">
      Experimental 30-minute baseline: <strong>{formatCopper(forecast.pointPriceCopper)}</strong>
      {" · range "}
      {formatCopper(forecast.lowerPriceCopper)}–{formatCopper(forecast.upperPriceCopper)}
      {" · direction "}
      {forecast.direction}
      {" · data confidence "}
      {(forecast.dataConfidenceBasisPoints / 100).toFixed(0)}%. This is a rolling-median/EWMA
      baseline, not a guaranteed sale price.
    </p>
  );
}

function isNextNavigationError(error: unknown): boolean {
  return error instanceof Error && "digest" in error;
}
