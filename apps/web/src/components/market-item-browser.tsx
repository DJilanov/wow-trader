import Link from "next/link";

import type { MarketItemBrowserData, MarketItemSort } from "../lib/market-item-browser-data";
import type { SupportedClientProduct } from "../lib/game-versions";
import { getExternalItemReference } from "../lib/item-reference";
import { ItemIcon } from "./item-icon";
import { MarketHistoryChart } from "./market-history-chart";

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
  { value: "deal", label: "Best buyer opportunity" },
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
  const pageCount = Math.max(1, Math.ceil(data.totalCount / data.pageSize));
  const firstResult = data.totalCount === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const lastResult = Math.min(data.page * data.pageSize, data.totalCount);
  return (
    <>
      <section className="workspace-toolbar market-item-toolbar" aria-label="Item market filters">
        <div className="market-item-method-summary">
          <strong>Buyer intelligence</strong>
          <span>Representative p10 asks · listed supply · historical normal range</span>
        </div>
        <form className="sort-form">
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
          <label htmlFor="market-item-sort">Sort</label>
          <select id="market-item-sort" name="itemSort" defaultValue={data.sort}>
            {sortOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="submit">Apply</button>
        </form>
      </section>

      <aside className="workspace-limitation market-item-boundary">
        <strong>How to read the verdict</strong>
        <p>
          “Good deal” unlocks only after six independent half-hour observations. Prices are Auction
          House asks, not confirmed sales. The cheapest listing is shown separately from the
          quantity-weighted p10 ask so one bait listing cannot define the whole market.
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
            <p>Try part of the item name, its numeric item ID, or another scanned market.</p>
          </div>
        ) : (
          <div className="market-item-list">
            <div className="market-item-head" aria-hidden="true">
              <span>Item</span>
              <span>Verdict</span>
              <span>Representative ask</span>
              <span>Normal price</span>
              <span>Listed supply</span>
            </div>
            {data.rows.map((item) => {
              const externalReference = getExternalItemReference(clientProduct, item.itemId);
              const itemHref = encyclopediaItemPath
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
                        <small>Item {item.itemId}</small>
                      </span>
                    </span>
                    <span>
                      <strong className={`market-item-verdict ${item.verdict.tone}`}>
                        {item.verdict.label}
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
                      <strong>{item.normalPrice ?? "Collecting"}</strong>
                      <small>{item.normalRange ?? "Guidance locked"}</small>
                    </span>
                    <span>
                      <strong>{item.availableQuantity.toLocaleString()}</strong>
                      <small>{item.listingCount.toLocaleString()} listings</small>
                    </span>
                    <span className="market-item-expand" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <div className="market-item-detail">
                    <div className="market-item-guidance">
                      <div>
                        <span className="eyebrow">Current verdict</span>
                        <strong>{item.verdict.label}</strong>
                        <p>{item.verdict.guidance}</p>
                      </div>
                      {itemHref ? (
                        <Link
                          href={itemHref}
                          {...(externalReference && !encyclopediaItemPath
                            ? {
                                target: "_blank",
                                rel: "noopener noreferrer",
                                referrerPolicy: "no-referrer" as const,
                              }
                            : {})}
                        >
                          Open item details{externalReference && !encyclopediaItemPath ? " ↗" : ""}
                        </Link>
                      ) : null}
                    </div>
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
                        <dd>{item.vendorSellPrice ?? "No vendor value"}</dd>
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
): string {
  const search = new URLSearchParams({ mode: "items", market });
  if (query) search.set("q", query);
  if (sort !== "deal") search.set("itemSort", sort);
  if (page > 1) search.set("page", String(page));
  for (const parameter of preservedParameters) search.set(parameter.name, parameter.value);
  return `${basePath}?${search.toString()}`;
}
