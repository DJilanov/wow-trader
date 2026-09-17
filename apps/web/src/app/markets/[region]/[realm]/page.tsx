import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "../../../../components/data-unavailable";
import { getMarketOverview } from "../../../../lib/data";
import { formatCopper, formatRelativeTime } from "../../../../lib/format";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

interface MarketPageProps {
  readonly params: Promise<{ readonly region: string; readonly realm: string }>;
}

export async function generateMetadata({ params }: MarketPageProps): Promise<Metadata> {
  const { region, realm } = await params;
  return createHelperMetadata({
    title: `${realm} ${region.toUpperCase()} TBC Auction House`,
    description: `Latest accepted TBC Auction House scan for ${realm} ${region.toUpperCase()}, with item prices, available quantity, listing depth, and build provenance.`,
    path: `/markets/${encodeURIComponent(region)}/${encodeURIComponent(realm)}`,
    keywords: [
      `${realm} Auction House`,
      `${realm} TBC prices`,
      `${region.toUpperCase()} TBC Auction House`,
    ],
    noIndex: !isSafeRouteValue(region) || !isSafeRouteValue(realm),
  });
}

export default async function MarketPage({ params }: MarketPageProps): Promise<React.JSX.Element> {
  const { region, realm } = await params;
  if (!isSafeRouteValue(region) || !isSafeRouteValue(realm)) notFound();

  try {
    const market = await getMarketOverview(region, realm);
    if (!market) notFound();
    return (
      <article className="detail-page">
        <header className="page-intro">
          <div>
            <span className="eyebrow">Auction House depth</span>
            <h1>
              {region} / {realm}
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
                      <Link href={`/tbc/encyclopedia/items/${row.itemId}`}>
                        <strong>{row.itemName}</strong>
                        <small>Item {row.itemId}</small>
                      </Link>
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

function isSafeRouteValue(value: string): boolean {
  return value.length >= 1 && value.length <= 128 && !value.includes("/") && !value.includes("\\");
}

function isNextNavigationError(error: unknown): boolean {
  return error instanceof Error && "digest" in error;
}
