"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BUY_POLICY } from "@wow-trader/market";

import type { MarketItemBrowserData, MarketItemSort } from "../lib/market-item-browser-data";
import type { SupportedClientProduct } from "../lib/game-versions";
import { getExternalItemReference } from "../lib/item-reference";
import { ItemIcon } from "./item-icon";
import { MarketHistoryChart } from "./market-history-chart";
import { MarketWatchButton } from "./market-watchlist";

interface MarketItemBrowserProps {
  readonly basePath: string;
  readonly clientProduct: SupportedClientProduct;
  readonly data: MarketItemBrowserData;
  readonly encyclopediaItemPath: string | null;
  readonly market: string;
  readonly preservedParameters: readonly { readonly name: string; readonly value: string }[];
  readonly query: string;
}

const sortOptions: readonly { readonly value: MarketItemSort; readonly label: string }[] = [
  { value: "deal", label: "Buying opportunities first" },
  { value: "discount", label: "Largest discount vs normal" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
  { value: "supply", label: "Most listed supply" },
  { value: "name", label: "Item name" },
];

export function MarketItemBrowser({
  basePath,
  clientProduct,
  data,
  encyclopediaItemPath,
  market,
  preservedParameters,
  query,
}: MarketItemBrowserProps): React.JSX.Element {
  const router = useRouter();
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!data.scannedAt) return;
    const remaining =
      Date.parse(data.scannedAt) + BUY_POLICY.maximumScanAgeMilliseconds + 1 - Date.now();
    const expire = (): void => {
      setExpired(true);
      if (remaining > 0) router.refresh();
    };
    if (!Number.isFinite(remaining) || remaining <= 0) {
      setExpired(true);
      return;
    }
    setExpired(false);
    const timer = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timer);
  }, [data.scannedAt, router]);
  const pageCount = Math.max(1, Math.ceil(data.totalCount / data.pageSize));
  const firstResult = data.totalCount === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const lastResult = Math.min(data.page * data.pageSize, data.totalCount);
  return (
    <>
      <section className="workspace-toolbar market-item-toolbar" aria-label="Item market filters">
        <div className="market-item-method-summary">
          <strong>Buyer intelligence</strong>
          <span>Seven-day price history · buy limits · profit after the AH cut</span>
        </div>
        <form className="sort-form market-buy-filters">
          <input type="hidden" name="mode" value="items" />
          <input type="hidden" name="market" value={market} />
          <input type="hidden" name="q" value={query} />
          {preservedParameters.map((parameter) => (
            <input
              type="hidden"
              name={parameter.name}
              value={parameter.value}
              key={parameter.name}
            />
          ))}
          <label htmlFor="market-buy-filter">
            Show
            <select id="market-buy-filter" name="itemFilter" defaultValue={data.filter ?? "all"}>
              <option value="all">All items</option>
              <option value="buy">Buy opportunities</option>
            </select>
          </label>
          <label htmlFor="market-item-kind">
            Items
            <select
              id="market-item-kind"
              name="itemKind"
              defaultValue={data.materialsOnly ? "materials" : "all"}
            >
              <option value="all">Everything</option>
              <option value="materials">Materials only</option>
            </select>
          </label>
          <label htmlFor="market-buy-budget">
            Budget per item (gold)
            <input
              id="market-buy-budget"
              name="buyBudget"
              type="number"
              min="0"
              max="999999999"
              step="0.0001"
              placeholder="No budget limit"
              defaultValue={data.budget ?? ""}
            />
          </label>
          <label htmlFor="market-buy-quantity">
            Maximum units
            <input
              id="market-buy-quantity"
              name="buyQuantity"
              type="number"
              min="1"
              max="100"
              step="1"
              defaultValue={data.quantityLimit ?? 100}
            />
          </label>
          <label htmlFor="market-item-sort">
            Sort
            <select id="market-item-sort" name="itemSort" defaultValue={data.sort}>
              {sortOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Apply filters</button>
        </form>
        {data.budgetError ? <p role="alert">{data.budgetError}</p> : null}
      </section>

      <aside className="workspace-limitation market-item-boundary">
        <strong>How to read the verdict</strong>
        <p>
          Buy suggestions need six independent half-hour observations and a scan under one hour old.
          They target the lower end of the seven-day normal range, subtract the AH cut and require
          at least 20% return with a 15% discount. Quantity is capped at 10% of normal listed supply
          and 100 units. Profit assumes resale at the target; deposits, expired listings and demand
          remain unknown. Budgets apply to each item separately.
        </p>
      </aside>

      <section className="market-item-results" aria-labelledby="market-item-heading">
        <div className="result-summary">
          <div>
            <span className="eyebrow">Auction House search</span>
            <h2 id="market-item-heading">
              {query ? `Results for “${query}”` : "All listed items"}
            </h2>
          </div>
          <span>
            {firstResult}–{lastResult} of {data.totalCount} items
          </span>
        </div>

        {data.rows.length === 0 ? (
          <div className="workspace-empty">
            <strong>No listed item matches this search</strong>
            <p>
              {data.filter === "buy"
                ? "No purchase currently meets the history, freshness, discount and return requirements. Try all items to inspect the evidence, or upload a fresh scan."
                : "Try part of the item name, its numeric item ID, or another scanned market."}
            </p>
          </div>
        ) : (
          <div className="market-item-list">
            <div className="market-item-head" aria-hidden="true">
              <span>Item</span>
              <span>Verdict</span>
              <span>Representative ask</span>
              <span>Buy ceiling</span>
              <span>Potential profit</span>
            </div>
            {data.rows.map((source) => {
              const item = expired
                ? {
                    ...source,
                    buy: {
                      ...source.buy,
                      state: "stale" as const,
                      quantity: 0,
                      profit: "0c",
                      buyCost: "0c",
                      auctionFee: "0c",
                      reason: "Scan again: buy suggestions require prices less than one hour old.",
                    },
                    verdict: {
                      ...source.verdict,
                      tone: "warning" as const,
                      label: "Stale scan",
                      guidance: "Refresh prices before buying.",
                    },
                  }
                : source;
              const externalReference = getExternalItemReference(clientProduct, item.itemId);
              const itemHref =
                encyclopediaItemPath && item.catalogVerified !== false
                  ? `${encyclopediaItemPath}/${item.itemId}`
                  : externalReference?.href;
              return (
                <details className="market-item-card" key={item.itemId}>
                  <summary>
                    <span className="market-item-identity">
                      <ItemIcon
                        fileDataId={item.iconFileDataId}
                        product={clientProduct}
                        quality={item.quality}
                      />
                      <span>
                        <strong className={`quality-text-${item.quality}`}>{item.name}</strong>
                        <small>
                          Item {item.itemId}
                          {item.catalogVerified === false ? " · Catalog pending" : ""}
                        </small>
                      </span>
                    </span>
                    <span>
                      <strong className={`market-item-verdict ${item.verdict.tone}`}>
                        {item.buy.state === "opportunity" ? "Buy opportunity" : item.verdict.label}
                      </strong>
                      <small>
                        {item.differenceFromNormal ?? `${item.signal.observationCount}/6 scans`}
                      </small>
                    </span>
                    <span>
                      <strong>{item.representativeAsk}</strong>
                      <small>Cheapest {item.minimumAsk}</small>
                    </span>
                    <span>
                      <strong>{item.buy.maximumBuyPrice ?? "Collecting"}</strong>
                      <small>Normal {item.normalPrice ?? "not established"}</small>
                    </span>
                    <span>
                      <strong>
                        {item.buy.state === "opportunity" ? `+${item.buy.profit}` : "—"}
                      </strong>
                      <small>
                        {item.buy.state === "opportunity"
                          ? `${item.buy.quantity} units · ${item.buy.returnPercent} return`
                          : `${item.availableQuantity.toLocaleString()} listed units`}
                      </small>
                    </span>
                    <span className="market-item-expand" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <div className="market-item-detail">
                    <MarketWatchButton
                      item={{
                        product: clientProduct,
                        market,
                        itemId: item.itemId,
                        name: item.name,
                      }}
                    />
                    <div className="market-item-guidance">
                      <div>
                        <span className="eyebrow">Current verdict</span>
                        <strong>{item.verdict.label}</strong>
                        <p>{item.verdict.guidance}</p>
                      </div>
                      {itemHref ? (
                        <Link
                          href={itemHref}
                          {...(externalReference &&
                          (!encyclopediaItemPath || item.catalogVerified === false)
                            ? {
                                target: "_blank",
                                rel: "noopener noreferrer",
                                referrerPolicy: "no-referrer" as const,
                              }
                            : {})}
                        >
                          Open item details
                          {externalReference &&
                          (!encyclopediaItemPath || item.catalogVerified === false)
                            ? " ↗"
                            : ""}
                        </Link>
                      ) : null}
                    </div>
                    <section
                      className={`market-buy-plan ${item.buy.state}`}
                      aria-label={`Buying plan for ${item.name}`}
                    >
                      <strong>
                        {item.buy.state === "opportunity"
                          ? "Buying plan"
                          : item.buy.state === "stale"
                            ? "Refresh prices before buying"
                            : "Buying guidance"}
                      </strong>
                      <p>{item.buy.reason}</p>
                      <dl className="market-item-facts">
                        <div>
                          <dt>Maximum buy / unit</dt>
                          <dd>{item.buy.maximumBuyPrice ?? "History needed"}</dd>
                        </div>
                        <div>
                          <dt>Target resale / unit</dt>
                          <dd>{item.buy.targetResalePrice ?? "History needed"}</dd>
                        </div>
                        <div>
                          <dt>Suggested quantity cap</dt>
                          <dd>{item.buy.quantity} units</dd>
                        </div>
                        <div>
                          <dt>Total purchase cost</dt>
                          <dd>{item.buy.buyCost}</dd>
                        </div>
                        <div>
                          <dt>AH sale cut ({item.buy.feePercent ?? "unknown"})</dt>
                          <dd>{item.buy.auctionFee}</dd>
                        </div>
                        <div>
                          <dt>Profit before deposits</dt>
                          <dd>
                            {item.buy.state === "opportunity"
                              ? `+${item.buy.profit}`
                              : "No qualified purchase"}
                          </dd>
                        </div>
                      </dl>
                      <small>
                        Quotes are per unit. Verify whole auction stacks in game. Listed supply is
                        not sales volume.
                      </small>
                    </section>
                    <dl className="market-item-facts">
                      <div>
                        <dt>Cheapest listing</dt>
                        <dd>{item.minimumAsk}</dd>
                      </div>
                      <div>
                        <dt>Representative p10</dt>
                        <dd>{item.representativeAsk}</dd>
                      </div>
                      <div>
                        <dt>Current median ask</dt>
                        <dd>{item.medianAsk}</dd>
                      </div>
                      <div>
                        <dt>Current upper p90</dt>
                        <dd>{item.upperAsk}</dd>
                      </div>
                      <div>
                        <dt>Supply within +5%</dt>
                        <dd>{item.quantityWithinFivePercent.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Supply within +10%</dt>
                        <dd>{item.quantityWithinTenPercent.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Vendor sell value</dt>
                        <dd>
                          {item.vendorSellPrice ??
                            (item.catalogVerified === false ? "Not verified" : "No vendor value")}
                        </dd>
                      </div>
                      <div>
                        <dt>Vendor floor margin</dt>
                        <dd>{item.vendorProfit ? `+${item.vendorProfit}` : "None"}</dd>
                      </div>
                    </dl>
                    <MarketHistoryChart
                      context="item"
                      history={null}
                      signal={item.signal}
                      subjectName={item.name}
                    />
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {pageCount > 1 ? (
          <nav className="workspace-pagination" aria-label="Auction House item pages">
            {data.page > 1 ? (
              <Link
                href={itemHref(
                  basePath,
                  market,
                  query,
                  data.sort,
                  data.page - 1,
                  preservedParameters,
                  data,
                )}
                prefetch={false}
              >
                ← Previous
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
            <span>
              Page {data.page} of {pageCount}
            </span>
            {data.page < pageCount ? (
              <Link
                href={itemHref(
                  basePath,
                  market,
                  query,
                  data.sort,
                  data.page + 1,
                  preservedParameters,
                  data,
                )}
                prefetch={false}
              >
                Next →
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
          </nav>
        ) : null}
      </section>
    </>
  );
}

function itemHref(
  basePath: string,
  market: string,
  query: string,
  sort: MarketItemSort,
  page: number,
  preservedParameters: readonly { readonly name: string; readonly value: string }[],
  data: MarketItemBrowserData,
): string {
  const search = new URLSearchParams({ mode: "items", market });
  if (query) search.set("q", query);
  if (sort !== "deal") search.set("itemSort", sort);
  if (page > 1) search.set("page", String(page));
  if (data.filter === "buy") search.set("itemFilter", "buy");
  if (data.materialsOnly) search.set("itemKind", "materials");
  if (data.budget) search.set("buyBudget", data.budget);
  if (data.quantityLimit !== undefined && data.quantityLimit !== 100)
    search.set("buyQuantity", String(data.quantityLimit));
  for (const parameter of preservedParameters) search.set(parameter.name, parameter.value);
  return `${basePath}?${search.toString()}`;
}
