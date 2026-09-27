import Link from "next/link";
import { notFound } from "next/navigation";

import { getMarketOverview } from "../lib/data";
import { formatCopper, formatRelativeTime } from "../lib/format";
import { DataUnavailable } from "./data-unavailable";

export interface MarketPageProps {
  readonly params: Promise<{ readonly region: string; readonly realm: string }>;
}

export interface MarketOverviewPageConfig {
  readonly clientProduct: string;
  readonly gameLabel: string;
  readonly traderPath: string;
  readonly itemBasePath: string | null;
  readonly displayRegion: (region: string) => string;
}

export async function MarketOverviewPage({
  params,
  config,
}: MarketPageProps & { readonly config: MarketOverviewPageConfig }): Promise<React.JSX.Element> {
  const { region, realm } = await params;
  if (!isSafeMarketRouteValue(region) || !isSafeMarketRouteValue(realm)) notFound();

  try {
    const market = await getMarketOverview(region, realm, config.clientProduct);
    if (!market) notFound();
    return (
      <article className="detail-page">
        <header className="page-intro">
          <div>
            <span className="eyebrow">Auction House depth</span>
            <h1>
              {config.displayRegion(region)} / {realm}
            </h1>
            <p>The 250 markets with the greatest available quantity in the latest accepted scan.</p>
          </div>
        </header>
        <section className="scan-banner" aria-label="Market scan status">
          <div>
            <span>Observed</span>
            <strong>{formatRelativeTime(market.scan.completedAt)}</strong>
          </div>
          <div>
            <span>Auction House</span>
            <strong>{market.scan.auctionHouseType}</strong>
          </div>
          <div>
            <span>Client build</span>
            <strong>{market.scan.clientBuild}</strong>
          </div>
          <div>
            <span>Completeness</span>
            <strong>{(market.scan.completeness * 100).toFixed(0)}%</strong>
          </div>
        </section>
        {!market.catalogAvailable ? (
          <aside className="workspace-limitation">
            <strong>Exact catalog review pending</strong>
            <p>
              These prices and quantities come from the accepted in-game scan. Names and crafting
              links stay disabled until the matching build {market.scan.clientBuild} catalog is
              published. <Link href={config.traderPath}>Return to {config.gameLabel} Trader.</Link>
            </p>
          </aside>
        ) : null}
        {market.rows.length === 0 ? (
          <p className="inline-empty">
            The matching catalog build is not published, so item names cannot be joined safely.
          </p>
        ) : (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Market key</th>
                  <th>Minimum</th>
                  <th>Quantity</th>
                  <th>Listings</th>
                </tr>
              </thead>
              <tbody>
                {market.rows.map((row) => (
                  <tr key={row.marketKey}>
                    <td>
                      {market.catalogAvailable && config.itemBasePath ? (
                        <Link href={`${config.itemBasePath}/${row.itemId}`}>
                          <strong>{row.itemName}</strong>
                          <small>Item {row.itemId}</small>
                        </Link>
                      ) : (
                        <span>
                          <strong>{row.itemName}</strong>
                          <small>Catalog name pending</small>
                        </span>
                      )}
                    </td>
                    <td>{row.marketKey}</td>
                    <td>{formatCopper(row.minimumPriceCopper)}</td>
                    <td>{row.availableQuantity.toLocaleString()}</td>
                    <td>{row.listingCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    );
  } catch (error) {
    if (isNextNavigationError(error)) throw error;
    return <DataUnavailable title="Market data is unavailable" />;
  }
}

export function isSafeMarketRouteValue(value: string): boolean {
  return value.length >= 1 && value.length <= 128 && !value.includes("/") && !value.includes("\\");
}

function isNextNavigationError(error: unknown): boolean {
  return error instanceof Error && "digest" in error;
}
