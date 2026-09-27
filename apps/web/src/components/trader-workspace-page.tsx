import Link from "next/link";

import { CraftingPlanPanel } from "./crafting-plan";
import { DataUnavailable } from "./data-unavailable";
import { MarketItemBrowser } from "./market-item-browser";
import { MarketScanAutoRefresh } from "./market-scan-auto-refresh";
import {
  OpportunityCalculationDetails,
  OpportunitySummary,
} from "./opportunity-calculation-details";
import { TraderTypeahead } from "./trader-typeahead";
import { formatRelativeTime } from "../lib/format";
import {
  getMarketWorkspace,
  type MarketWorkspaceOpportunity,
  type WorkspaceRouteFilter,
  type WorkspaceSort,
} from "../lib/market-workspace-data";
import type { SupportedClientProduct } from "../lib/game-versions";
import { getMarketItemBrowser, type MarketItemSort } from "../lib/market-item-browser-data";
import {
  parseProfessionSpecialization,
  type CraftingSpecializationProfile,
  type SpecializedProfessionSlug,
} from "../lib/specializations";

type SearchParamValue = string | readonly string[] | undefined;

export interface TraderWorkspacePageProps {
  readonly searchParams: Promise<{
    readonly market?: SearchParamValue;
    readonly mode?: SearchParamValue;
    readonly profession?: SearchParamValue;
    readonly q?: SearchParamValue;
    readonly route?: SearchParamValue;
    readonly sort?: SearchParamValue;
    readonly specialization?: SearchParamValue;
    readonly network?: SearchParamValue;
    readonly alchemySpecialization?: SearchParamValue;
    readonly blacksmithingSpecialization?: SearchParamValue;
    readonly engineeringSpecialization?: SearchParamValue;
    readonly leatherworkingSpecialization?: SearchParamValue;
    readonly tailoringSpecialization?: SearchParamValue;
    readonly page?: SearchParamValue;
    readonly itemSort?: SearchParamValue;
  }>;
}

export interface TraderWorkspaceConfig {
  readonly clientProduct: SupportedClientProduct;
  readonly gameLabel: string;
  readonly eyebrow: string;
  readonly basePath: string;
  readonly encyclopediaRecipePath: string | null;
  readonly encyclopediaItemPath: string | null;
  readonly marketBasePath: string;
  readonly opportunityApiBasePath: string;
  readonly collectorPath: string | null;
  readonly displayRegion: (region: string) => string;
  readonly specializationCopy: "supported" | "unverified";
}

interface WorkspaceParameters {
  readonly market: string;
  readonly mode: "crafts" | "items";
  readonly profession: string;
  readonly q: string;
  readonly route: WorkspaceRouteFilter;
  readonly sort: WorkspaceSort;
  readonly specializations: CraftingSpecializationProfile;
  readonly useAltCrafting: boolean;
  readonly page: number;
  readonly itemSort: MarketItemSort;
}

const specializationParameterNames: Readonly<
  Record<SpecializedProfessionSlug, keyof Awaited<TraderWorkspacePageProps["searchParams"]>>
> = {
  alchemy: "alchemySpecialization",
  blacksmithing: "blacksmithingSpecialization",
  engineering: "engineeringSpecialization",
  leatherworking: "leatherworkingSpecialization",
  tailoring: "tailoringSpecialization",
};

const routeOptions = [
  { value: "best", label: "Best route" },
  { value: "auction_house", label: "Auction House" },
  { value: "vendor", label: "Vendor" },
  { value: "disenchant", label: "Disenchant" },
] as const;

export async function TraderWorkspacePage({
  searchParams,
  config,
}: TraderWorkspacePageProps & {
  readonly config: TraderWorkspaceConfig;
}): Promise<React.JSX.Element> {
  const raw = await searchParams;
  const parameters: WorkspaceParameters = {
    market: getParam(raw.market) ?? "",
    mode: getParam(raw.mode) === "items" ? "items" : "crafts",
    profession: getParam(raw.profession) ?? "",
    q: getParam(raw.q) ?? "",
    route: parseRoute(getParam(raw.route)),
    sort: parseSort(getParam(raw.sort)),
    specializations: parseSpecializations(raw),
    useAltCrafting: getParam(raw.network) === "1",
    page: parsePage(getParam(raw.page)),
    itemSort: parseItemSort(getParam(raw.itemSort)),
  };

  try {
    const workspace = await getMarketWorkspace({
      clientProduct: config.clientProduct,
      market: parameters.market,
      profession: parameters.profession,
      query: parameters.mode === "crafts" ? parameters.q : "",
      route: parameters.route,
      sort: parameters.sort,
      specializations: parameters.specializations,
      useAltCrafting: parameters.useAltCrafting,
      page: parameters.page,
      ...(parameters.mode === "items" ? { pageSize: 1 } : {}),
    });
    const selectedMarket = workspace.scan?.market ?? parameters.market;
    const current = { ...parameters, market: selectedMarket };
    const itemBrowser =
      parameters.mode === "items" && workspace.scan?.catalogAvailable
        ? await getMarketItemBrowser({
            clientProduct: config.clientProduct,
            market: selectedMarket,
            query: parameters.q,
            sort: parameters.itemSort,
            page: parameters.page,
          })
        : null;
    const allProfessionCount = workspace.professions.reduce(
      (total, profession) => total + profession.opportunityCount,
      0,
    );
    const pageCount = Math.max(1, Math.ceil(workspace.totalOpportunityCount / workspace.pageSize));
    const firstResult =
      workspace.totalOpportunityCount === 0 ? 0 : (workspace.page - 1) * workspace.pageSize + 1;
    const lastResult = Math.min(
      workspace.page * workspace.pageSize,
      workspace.totalOpportunityCount,
    );
    const hasActiveProfile =
      workspace.useAltCrafting ||
      workspace.specializationProfiles.some((profile) => profile.selected !== "none");

    return (
      <article className="workspace-page">
        <header className="workspace-intro">
          <div>
            <span className="eyebrow">{config.eyebrow}</span>
            <h1>
              {parameters.mode === "items"
                ? "Is this Auction House price good?"
                : "What should I craft?"}
            </h1>
            <p>
              {parameters.mode === "items"
                ? "Search every item in the latest scan and compare its current ask, normal range, supply, and buyer risk."
                : "Search by crafted product, choose a profession, and compare the strongest current exits."}
            </p>
          </div>
          {workspace.scan ? (
            <Link
              className={`scan-health freshness-${workspace.scan.freshness.state}`}
              href={`${config.marketBasePath}/${encodeURIComponent(workspace.scan.region)}/${encodeURIComponent(workspace.scan.realmId)}`}
            >
              <span className="scan-freshness-dot" aria-hidden="true" />
              <span>
                <strong>
                  {workspace.scan.realmId} · {workspace.scan.freshness.label}
                </strong>
                <small>
                  {formatRelativeTime(workspace.scan.completedAt)} ·{" "}
                  {workspace.scan.itemCount.toLocaleString()} markets
                </small>
              </span>
            </Link>
          ) : config.collectorPath ? (
            <Link className="scan-health freshness-missing" href={config.collectorPath}>
              <span className="scan-freshness-dot" aria-hidden="true" />
              <span>
                <strong>Install WoW Trader Collector</strong>
                <small>Create and upload the first {config.gameLabel} market scan</small>
              </span>
            </Link>
          ) : null}
        </header>

        <nav className="workspace-mode-tabs" aria-label="Trader tool">
          <Link
            className={parameters.mode === "crafts" ? "active" : undefined}
            href={workspaceHref(config.basePath, current, { mode: "crafts", page: 1 })}
            prefetch={false}
          >
            <span aria-hidden="true">⚒</span>
            <span>
              <strong>Crafting profits</strong>
              <small>What should I make?</small>
            </span>
          </Link>
          <Link
            className={parameters.mode === "items" ? "active" : undefined}
            href={workspaceHref(config.basePath, current, { mode: "items", page: 1 })}
            prefetch={false}
          >
            <span aria-hidden="true">⌕</span>
            <span>
              <strong>Auction House items</strong>
              <small>Is this a good buy?</small>
            </span>
          </Link>
        </nav>

        <TraderTypeahead
          basePath={config.basePath}
          initialMarket={selectedMarket}
          initialQuery={parameters.q}
          placeholder={
            parameters.mode === "items"
              ? "Search item name or ID…"
              : "Search Arcanite Bar, Runic Leather Bracers…"
          }
          searchLabel={parameters.mode === "items" ? "Auction House item" : "Crafted product"}
          suggestions={
            parameters.mode === "items"
              ? (itemBrowser?.suggestions ?? [])
              : workspace.productSuggestions
          }
          markets={workspace.markets.map((market) => ({
            ...market,
            label: formatMarketLabel(market.value, config.displayRegion),
          }))}
        />

        {workspace.scan ? (
          <MarketScanAutoRefresh
            auctionHouseType={workspace.scan.auctionHouseType}
            initialCompletedAt={workspace.scan.completedAt.toISOString()}
            realmId={workspace.scan.realmId}
            region={workspace.scan.region}
            clientProduct={config.clientProduct}
          />
        ) : null}

        {workspace.scan ? (
          <>
            <section className="workspace-status" aria-label="Selected market status">
              <div>
                <span>Market</span>
                <strong>
                  {config.displayRegion(workspace.scan.region)} · {workspace.scan.realmId} ·{" "}
                  {workspace.scan.auctionHouseType}
                </strong>
              </div>
              <div>
                <span>Catalog</span>
                <strong>
                  {workspace.scan.catalogAvailable
                    ? `${workspace.scan.clientVersion} · build ${workspace.scan.clientBuild}`
                    : `Build ${workspace.scan.clientBuild} · review pending`}
                </strong>
              </div>
              <div>
                <span>History</span>
                <strong>
                  {workspace.scan.historyScanCount >= 6
                    ? `${workspace.scan.historyScanCount} scans`
                    : `Collecting ${workspace.scan.historyScanCount}/6`}
                </strong>
              </div>
              <div>
                <span>Freshness</span>
                <strong>{workspace.scan.freshness.label}</strong>
                <small>{Math.round(workspace.scan.completeness * 100)}% scan coverage</small>
              </div>
            </section>

            {parameters.mode === "items" ? (
              itemBrowser ? (
                <MarketItemBrowser
                  basePath={config.basePath}
                  clientProduct={config.clientProduct}
                  data={itemBrowser}
                  encyclopediaItemPath={config.encyclopediaItemPath}
                  market={selectedMarket}
                  preservedParameters={profileSearchParameters(parameters)}
                  query={parameters.q}
                />
              ) : (
                <DataUnavailable
                  title={`Build ${workspace.scan.clientBuild} item catalog is under review`}
                />
              )
            ) : (
              <>
                <nav className="profession-tabs" aria-label="Filter by profession">
                  <Link
                    className={parameters.profession === "" ? "active" : undefined}
                    href={workspaceHref(config.basePath, current, { profession: "" })}
                    prefetch={false}
                  >
                    <span>All</span>
                    <small>{allProfessionCount}</small>
                  </Link>
                  {workspace.professions.map((profession) => (
                    <Link
                      className={parameters.profession === profession.slug ? "active" : undefined}
                      href={workspaceHref(config.basePath, current, {
                        profession: profession.slug,
                      })}
                      key={profession.slug}
                      prefetch={false}
                    >
                      <span>{profession.name}</span>
                      <small>{profession.opportunityCount}</small>
                    </Link>
                  ))}
                </nav>

                <details className="specialization-bar" open={hasActiveProfile}>
                  <summary>
                    <span>
                      <span className="eyebrow">Advanced crafting profile</span>
                      <strong>
                        {hasActiveProfile ? "Custom account rules active" : "Base recipe costs"}
                      </strong>
                    </span>
                    <span>
                      {hasActiveProfile ? "Review profile" : "Configure alts and masteries"}
                    </span>
                  </summary>
                  <div className="profile-disclosure-body">
                    <div className="profile-copy">
                      <strong id="specialization-heading">Use what your alts can produce</strong>
                      <p>
                        Replace overpriced intermediates with the cheapest deterministic recipe
                        chain. Recipe ownership remains simulated until the addon imports your
                        characters.
                      </p>
                    </div>
                    <form className="crafting-profile-form">
                      <input type="hidden" name="market" value={selectedMarket} />
                      <input type="hidden" name="profession" value={parameters.profession} />
                      <input type="hidden" name="q" value={parameters.q} />
                      <input type="hidden" name="route" value={parameters.route} />
                      <input type="hidden" name="sort" value={parameters.sort} />
                      <SpecializationHiddenInputs parameters={parameters} />
                      <fieldset className="profile-rules">
                        <legend>Costing rules</legend>
                        <label className="profile-toggle">
                          <span className="profile-toggle-copy">
                            <strong>Use alt-crafted materials</strong>
                            <small>
                              Buy the cheapest raw inputs and craft profitable intermediates.
                            </small>
                          </span>
                          <span className="profile-switch">
                            <input
                              type="checkbox"
                              name="network"
                              value="1"
                              defaultChecked={workspace.useAltCrafting}
                            />
                            <span className="profile-switch-track" aria-hidden="true" />
                          </span>
                        </label>
                        <div className="profile-toggle profile-toggle-fixed">
                          <span className="profile-toggle-copy">
                            <strong>Cooldown crafts excluded</strong>
                            <small>
                              Daily and shared cooldown recipes never affect rankings or material
                              costs.
                            </small>
                          </span>
                          <span className="profile-rule-lock" aria-label="Always enabled">
                            Always
                          </span>
                        </div>
                      </fieldset>
                      {config.specializationCopy === "unverified" ? (
                        <div className="profile-specializations specialization-unverified">
                          <strong>Specialization modeling is awaiting verification</strong>
                          <p>
                            Base recipe economics are available. Forever-specific recipe locks and
                            bonus yields will stay out of rankings until they are verified against
                            live behavior.
                          </p>
                        </div>
                      ) : (
                        <fieldset className="profile-specializations">
                          <legend>Profession specializations</legend>
                          <p>
                            Set each alt's active mastery so yields and locked recipes are priced
                            correctly.
                          </p>
                          <div className="profile-select-grid">
                            {workspace.specializationProfiles.map((profile) => (
                              <label
                                key={profile.professionSlug}
                                htmlFor={`profile-${profile.professionSlug}`}
                              >
                                <span>{profile.professionName}</span>
                                <select
                                  id={`profile-${profile.professionSlug}`}
                                  name={profile.parameterName}
                                  defaultValue={profile.selected}
                                >
                                  {profile.options.map((option) => (
                                    <option value={option.slug} key={option.slug}>
                                      {option.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      )}
                      <div className="profile-actions">
                        <span>Updates the ranking with this simulated account profile.</span>
                        <button type="submit">Recalculate profits</button>
                      </div>
                    </form>
                  </div>
                </details>

                <section className="workspace-toolbar" aria-label="Opportunity filters">
                  <div className="route-tabs">
                    {routeOptions.map((route) => (
                      <Link
                        className={parameters.route === route.value ? "active" : undefined}
                        href={workspaceHref(config.basePath, current, { route: route.value })}
                        key={route.value}
                        prefetch={false}
                      >
                        {route.label}
                        <small>{workspace.routeCounts[route.value]}</small>
                      </Link>
                    ))}
                  </div>
                  <form className="sort-form">
                    <input type="hidden" name="market" value={selectedMarket} />
                    <input type="hidden" name="profession" value={parameters.profession} />
                    <input type="hidden" name="q" value={parameters.q} />
                    <input type="hidden" name="route" value={parameters.route} />
                    <ProfileHiddenInputs parameters={parameters} />
                    <label htmlFor="workspace-sort">Sort</label>
                    <select id="workspace-sort" name="sort" defaultValue={parameters.sort}>
                      <option value="total-profit">Executable profit</option>
                      <option value="profit">Profit per craft</option>
                      <option value="roi">Return on capital</option>
                      <option value="specialization-uplift">Specialization uplift</option>
                    </select>
                    <button type="submit">Apply</button>
                  </form>
                </section>

                <aside className="workspace-limitation">
                  <strong>
                    {!workspace.scan.catalogAvailable
                      ? "Catalog gate"
                      : workspace.specializationProfiles.some(
                            (profile) => profile.selected !== "none",
                          ) ||
                          workspace.useAltCrafting ||
                          workspace.scan.historyScanCount >= 6
                        ? "Model boundary"
                        : "Current quote"}
                  </strong>
                  <p>{workspace.limitation}</p>
                </aside>

                <section className="opportunity-results" aria-labelledby="opportunity-heading">
                  <div className="result-summary">
                    <div>
                      <span className="eyebrow">Ranked results</span>
                      <h2 id="opportunity-heading">
                        {parameters.profession
                          ? (workspace.professions.find(
                              (profession) => profession.slug === parameters.profession,
                            )?.name ?? "Profession")
                          : "All professions"}
                      </h2>
                    </div>
                    <span>
                      {firstResult}–{lastResult} of {workspace.totalOpportunityCount} profitable
                      quotes
                    </span>
                  </div>

                  {workspace.opportunities.length === 0 ? (
                    <div className="workspace-empty">
                      <strong>
                        {workspace.scan.catalogAvailable
                          ? "No matching profitable crafts"
                          : `Build ${workspace.scan.clientBuild} catalog is under review`}
                      </strong>
                      <p>
                        {workspace.scan.catalogAvailable
                          ? "Try another profession, route, search, or a newer Auction House scan."
                          : "The uploaded market is available from the scan badge. Profit rankings activate only after its exact item and recipe catalog is published."}
                      </p>
                    </div>
                  ) : (
                    <div className="opportunity-list">
                      <div className="opportunity-head" aria-hidden="true">
                        <span>Product / recipe</span>
                        <span>Profile / exit</span>
                        <span>Recommended</span>
                        <span>Capital</span>
                        <span>Total profit</span>
                        <span>Profit / craft</span>
                        <span>ROI</span>
                      </div>
                      {workspace.opportunities.map((opportunity) => {
                        const summary = (
                          <OpportunitySummary
                            opportunity={opportunity}
                            clientProduct={config.clientProduct}
                          />
                        );
                        return (
                          <article
                            className={`opportunity-card route-${opportunity.route}`}
                            key={`${opportunity.recipeSpellId}:${opportunity.route}`}
                          >
                            {config.encyclopediaRecipePath ? (
                              <Link
                                aria-label={`Open ${opportunity.outputLabel}, crafted by ${opportunity.recipeName}`}
                                className="opportunity-row"
                                href={`${config.encyclopediaRecipePath}/${opportunity.recipeSpellId}`}
                              >
                                {summary}
                              </Link>
                            ) : null}
                            <OpportunityCalculationDetails
                              clientProduct={config.clientProduct}
                              currentMarket={current.market}
                              encyclopediaItemPath={config.encyclopediaItemPath}
                              encyclopediaRecipePath={config.encyclopediaRecipePath}
                              endpoint={opportunityDetailsHref(
                                config.opportunityApiBasePath,
                                current,
                                opportunity,
                              )}
                              {...(config.encyclopediaRecipePath
                                ? {}
                                : { summaryOpportunity: opportunity })}
                            />
                          </article>
                        );
                      })}
                    </div>
                  )}
                  {pageCount > 1 ? (
                    <nav className="workspace-pagination" aria-label="Opportunity pages">
                      {workspace.page > 1 ? (
                        <Link
                          href={workspaceHref(config.basePath, current, {
                            page: workspace.page - 1,
                          })}
                          prefetch={false}
                        >
                          ← Previous
                        </Link>
                      ) : (
                        <span aria-hidden="true" />
                      )}
                      <span>
                        Page {workspace.page} of {pageCount}
                      </span>
                      {workspace.page < pageCount ? (
                        <Link
                          href={workspaceHref(config.basePath, current, {
                            page: workspace.page + 1,
                          })}
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
                <CraftingPlanPanel clientProduct={config.clientProduct} market={current.market} />
              </>
            )}
          </>
        ) : (
          <DataUnavailable title={`No ${config.gameLabel} Auction House scan is available`} />
        )}
      </article>
    );
  } catch {
    return <DataUnavailable title="The market workspace is unavailable" />;
  }
}

function formatMarketLabel(market: string, displayRegion: (region: string) => string): string {
  const [region = "", realm = "", auctionHouseType = ""] = market.split("|");
  const formattedAuctionHouse = auctionHouseType
    ? `${auctionHouseType[0]!.toUpperCase()}${auctionHouseType.slice(1)}`
    : "Unknown";
  return `${displayRegion(region)} · ${realm || "Unknown realm"} · ${formattedAuctionHouse}`;
}

function parseRoute(value: string | undefined): WorkspaceRouteFilter {
  return value === "auction_house" || value === "vendor" || value === "disenchant" ? value : "best";
}

function parseSort(value: string | undefined): WorkspaceSort {
  return value === "profit" || value === "roi" || value === "specialization-uplift"
    ? value
    : "total-profit";
}

function parseItemSort(value: string | undefined): MarketItemSort {
  return value === "discount" ||
    value === "price-low" ||
    value === "price-high" ||
    value === "supply" ||
    value === "name"
    ? value
    : "deal";
}

function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseSpecializations(
  raw: Awaited<TraderWorkspacePageProps["searchParams"]>,
): CraftingSpecializationProfile {
  return {
    alchemy: parseProfessionSpecialization(
      getParam(raw.alchemySpecialization) ?? getParam(raw.specialization),
      "alchemy",
    ),
    blacksmithing: parseProfessionSpecialization(
      getParam(raw.blacksmithingSpecialization),
      "blacksmithing",
    ),
    engineering: parseProfessionSpecialization(
      getParam(raw.engineeringSpecialization),
      "engineering",
    ),
    leatherworking: parseProfessionSpecialization(
      getParam(raw.leatherworkingSpecialization),
      "leatherworking",
    ),
    tailoring: parseProfessionSpecialization(getParam(raw.tailoringSpecialization), "tailoring"),
  };
}

function getParam(value: SearchParamValue): string | undefined {
  return typeof value === "string" ? value : value?.at(-1);
}

function SpecializationHiddenInputs({
  parameters,
}: {
  readonly parameters: WorkspaceParameters;
}): React.JSX.Element {
  return (
    <>
      {(
        Object.entries(specializationParameterNames) as readonly [
          SpecializedProfessionSlug,
          string,
        ][]
      ).map(([professionSlug, parameterName]) => (
        <input
          type="hidden"
          name={parameterName}
          value={parameters.specializations[professionSlug] ?? "none"}
          key={parameterName}
        />
      ))}
    </>
  );
}

function ProfileHiddenInputs({
  parameters,
}: {
  readonly parameters: WorkspaceParameters;
}): React.JSX.Element {
  return (
    <>
      <SpecializationHiddenInputs parameters={parameters} />
      {parameters.useAltCrafting ? <input type="hidden" name="network" value="1" /> : null}
    </>
  );
}

function workspaceHref(
  basePath: string,
  current: WorkspaceParameters,
  updates: Partial<WorkspaceParameters>,
): string {
  const merged = {
    ...current,
    ...updates,
    page: updates.page ?? (Object.keys(updates).length > 0 ? 1 : current.page),
  };
  const search = new URLSearchParams();
  if (merged.market) search.set("market", merged.market);
  if (merged.mode === "items") search.set("mode", "items");
  if (merged.profession) search.set("profession", merged.profession);
  if (merged.q) search.set("q", merged.q);
  if (merged.route !== "best") search.set("route", merged.route);
  if (merged.sort !== "total-profit") search.set("sort", merged.sort);
  if (merged.itemSort !== "deal") search.set("itemSort", merged.itemSort);
  if (merged.page > 1) search.set("page", String(merged.page));
  for (const [professionSlug, parameterName] of Object.entries(
    specializationParameterNames,
  ) as readonly [SpecializedProfessionSlug, string][]) {
    const specialization = merged.specializations[professionSlug];
    if (specialization && specialization !== "none") {
      search.set(parameterName, specialization);
    }
  }
  if (merged.useAltCrafting) search.set("network", "1");
  const query = search.toString();
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}

function profileSearchParameters(
  parameters: WorkspaceParameters,
): readonly { readonly name: string; readonly value: string }[] {
  const values: { name: string; value: string }[] = [];
  if (parameters.profession) values.push({ name: "profession", value: parameters.profession });
  if (parameters.route !== "best") values.push({ name: "route", value: parameters.route });
  if (parameters.sort !== "total-profit") values.push({ name: "sort", value: parameters.sort });
  for (const [professionSlug, parameterName] of Object.entries(
    specializationParameterNames,
  ) as readonly [SpecializedProfessionSlug, string][]) {
    const specialization = parameters.specializations[professionSlug];
    if (specialization && specialization !== "none") {
      values.push({ name: parameterName, value: specialization });
    }
  }
  if (parameters.useAltCrafting) values.push({ name: "network", value: "1" });
  return values;
}

function opportunityDetailsHref(
  opportunityApiBasePath: string,
  current: WorkspaceParameters,
  opportunity: MarketWorkspaceOpportunity,
): string {
  const search = new URLSearchParams({ market: current.market, route: opportunity.route });
  for (const [professionSlug, parameterName] of Object.entries(
    specializationParameterNames,
  ) as readonly [SpecializedProfessionSlug, string][]) {
    const specialization = current.specializations[professionSlug];
    if (specialization && specialization !== "none") {
      search.set(parameterName, specialization);
    }
  }
  if (current.useAltCrafting) search.set("network", "1");
  return `${opportunityApiBasePath}/${opportunity.recipeSpellId}?${search.toString()}`;
}
