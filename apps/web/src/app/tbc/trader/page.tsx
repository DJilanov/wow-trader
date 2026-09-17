import type { Metadata } from "next";
import Link from "next/link";

import { DataUnavailable } from "../../../components/data-unavailable";
import { ItemIcon } from "../../../components/item-icon";
import { MarketScanAutoRefresh } from "../../../components/market-scan-auto-refresh";
import { OpportunityCalculationDetails } from "../../../components/opportunity-calculation-details";
import { TraderTypeahead } from "../../../components/trader-typeahead";
import { formatRelativeTime } from "../../../lib/format";
import {
  getMarketWorkspace,
  type MarketWorkspaceOpportunity,
  type WorkspaceRouteFilter,
  type WorkspaceSort,
} from "../../../lib/market-workspace-data";
import {
  parseProfessionSpecialization,
  type CraftingSpecializationProfile,
  type SpecializedProfessionSlug,
} from "../../../lib/specializations";
import { createHelperMetadata } from "../../../lib/seo";

export const dynamic = "force-dynamic";

type SearchParamValue = string | readonly string[] | undefined;

interface HomePageProps {
  readonly searchParams: Promise<{
    readonly market?: SearchParamValue;
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
  }>;
}

export async function generateMetadata({ searchParams }: HomePageProps): Promise<Metadata> {
  const raw = await searchParams;
  const hasFilters = Object.values(raw).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
  return createHelperMetadata({
    title: "TBC Auction House Crafting Profit Calculator",
    description:
      "Compare TBC crafting profit, Auction House exits, vendor values, disenchant returns, specializations, and cross-profession alt crafting with live scan depth.",
    path: "/tbc/trader",
    keywords: [
      "TBC Auction House calculator",
      "TBC crafting profit",
      "TBC gold making",
      "TBC disenchant calculator",
      "TBC profession profit",
    ],
    noIndex: hasFilters,
  });
}

interface WorkspaceParameters {
  readonly market: string;
  readonly profession: string;
  readonly q: string;
  readonly route: WorkspaceRouteFilter;
  readonly sort: WorkspaceSort;
  readonly specializations: CraftingSpecializationProfile;
  readonly useAltCrafting: boolean;
}

const specializationParameterNames: Readonly<
  Record<SpecializedProfessionSlug, keyof Awaited<HomePageProps["searchParams"]>>
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

export default async function HomePage({
  searchParams,
}: HomePageProps): Promise<React.JSX.Element> {
  const raw = await searchParams;
  const parameters: WorkspaceParameters = {
    market: getParam(raw.market) ?? "",
    profession: getParam(raw.profession) ?? "",
    q: getParam(raw.q) ?? "",
    route: parseRoute(getParam(raw.route)),
    sort: parseSort(getParam(raw.sort)),
    specializations: parseSpecializations(raw),
    useAltCrafting: getParam(raw.network) === "1",
  };

  try {
    const workspace = await getMarketWorkspace({
      market: parameters.market,
      profession: parameters.profession,
      query: parameters.q,
      route: parameters.route,
      sort: parameters.sort,
      specializations: parameters.specializations,
      useAltCrafting: parameters.useAltCrafting,
    });
    const selectedMarket = workspace.scan?.market ?? parameters.market;
    const current = { ...parameters, market: selectedMarket };
    const allProfessionCount = workspace.professions.reduce(
      (total, profession) => total + profession.opportunityCount,
      0,
    );

    return (
      <article className="workspace-page">
        <header className="workspace-intro">
          <div>
            <span className="eyebrow">TBC market workspace</span>
            <h1>What should I craft?</h1>
            <p>
              Search by crafted product, choose a profession, and compare the strongest current
              exits.
            </p>
          </div>
          {workspace.scan ? (
            <Link
              className={`scan-health freshness-${workspace.scan.freshness.state}`}
              href={`/markets/${encodeURIComponent(workspace.scan.region)}/${encodeURIComponent(workspace.scan.realmId)}`}
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
          ) : null}
        </header>

        <TraderTypeahead
          initialMarket={selectedMarket}
          initialQuery={parameters.q}
          markets={workspace.markets}
        />

        {workspace.scan ? (
          <MarketScanAutoRefresh
            auctionHouseType={workspace.scan.auctionHouseType}
            initialCompletedAt={workspace.scan.completedAt.toISOString()}
            realmId={workspace.scan.realmId}
            region={workspace.scan.region}
          />
        ) : null}

        {workspace.scan ? (
          <>
            <section className="workspace-status" aria-label="Selected market status">
              <div>
                <span>Market</span>
                <strong>
                  {workspace.scan.region} · {workspace.scan.realmId} ·{" "}
                  {workspace.scan.auctionHouseType}
                </strong>
              </div>
              <div>
                <span>Catalog</span>
                <strong>
                  {workspace.scan.clientVersion} · build {workspace.scan.clientBuild}
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

            <nav className="profession-tabs" aria-label="Filter by profession">
              <Link
                className={parameters.profession === "" ? "active" : undefined}
                href={workspaceHref(current, { profession: "" })}
                prefetch={false}
              >
                <span>All</span>
                <small>{allProfessionCount}</small>
              </Link>
              {workspace.professions.map((profession) => (
                <Link
                  className={parameters.profession === profession.slug ? "active" : undefined}
                  href={workspaceHref(current, { profession: profession.slug })}
                  key={profession.slug}
                  prefetch={false}
                >
                  <span>{profession.name}</span>
                  <small>{profession.opportunityCount}</small>
                </Link>
              ))}
            </nav>

            <section className="specialization-bar" aria-labelledby="specialization-heading">
              <div className="profile-copy">
                <span className="eyebrow">Account crafting network</span>
                <strong id="specialization-heading">Use what your alts can produce</strong>
                <p>
                  Replace overpriced intermediates with the cheapest deterministic recipe chain.
                  Recipe ownership remains simulated until the addon imports your characters.
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
                      <small>Buy the cheapest raw inputs and craft profitable intermediates.</small>
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
                        Daily and shared cooldown recipes never affect rankings or material costs.
                      </small>
                    </span>
                    <span className="profile-rule-lock" aria-label="Always enabled">
                      Always
                    </span>
                  </div>
                </fieldset>
                <fieldset className="profile-specializations">
                  <legend>Profession specializations</legend>
                  <p>
                    Set each alt's active mastery so yields and locked recipes are priced correctly.
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
                <div className="profile-actions">
                  <span>Updates the ranking with this simulated account profile.</span>
                  <button type="submit">Recalculate profits</button>
                </div>
              </form>
            </section>

            <section className="workspace-toolbar" aria-label="Opportunity filters">
              <div className="route-tabs">
                {routeOptions.map((route) => (
                  <Link
                    className={parameters.route === route.value ? "active" : undefined}
                    href={workspaceHref(current, { route: route.value })}
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
                  <option value="profit">Profit per craft</option>
                  <option value="roi">Return on capital</option>
                  <option value="specialization-uplift">Specialization uplift</option>
                </select>
                <button type="submit">Apply</button>
              </form>
            </section>

            <aside className="workspace-limitation">
              <strong>
                {workspace.specializationProfiles.some((profile) => profile.selected !== "none") ||
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
                  {workspace.opportunities.length} of {workspace.totalOpportunityCount} profitable
                  quotes
                </span>
              </div>

              {workspace.opportunities.length === 0 ? (
                <div className="workspace-empty">
                  <strong>No matching profitable crafts</strong>
                  <p>Try another profession, route, search, or a newer Auction House scan.</p>
                </div>
              ) : (
                <div className="opportunity-list">
                  <div className="opportunity-head" aria-hidden="true">
                    <span>Product / recipe</span>
                    <span>Profile / exit</span>
                    <span>Materials</span>
                    <span>Expected yield</span>
                    <span>Net value</span>
                    <span>Profit</span>
                    <span>ROI</span>
                  </div>
                  {workspace.opportunities.map((opportunity) => (
                    <article
                      className={`opportunity-card route-${opportunity.route}`}
                      key={`${opportunity.recipeSpellId}:${opportunity.route}`}
                    >
                      <Link
                        aria-label={`Open ${opportunity.outputLabel}, crafted by ${opportunity.recipeName}`}
                        className="opportunity-row"
                        href={`/tbc/encyclopedia/recipes/${opportunity.recipeSpellId}`}
                      >
                        <div className="craft-cell">
                          <ItemIcon
                            fileDataId={opportunity.outputIconFileDataId}
                            quality={opportunity.outputQuality}
                          />
                          <div>
                            <strong className="craft-name">{opportunity.outputLabel}</strong>
                            <small>Recipe: {opportunity.recipeName}</small>
                            <span>
                              {opportunity.professionName} · skill {opportunity.requiredSkillRank}
                              {opportunity.cooldownLabel ? ` · ${opportunity.cooldownLabel}` : ""}
                            </span>
                          </div>
                        </div>
                        <div className="profile-cell">
                          <span className={`route-badge ${opportunity.route}`}>
                            {opportunity.routeLabel}
                          </span>
                          {opportunity.specializationName ? (
                            <span className="specialization-badge">
                              {opportunity.specializationName}
                            </span>
                          ) : null}
                          {opportunity.usesAltCrafting ? (
                            <span className="network-badge">Alt network</span>
                          ) : null}
                          <small className={`confidence-badge ${opportunity.confidenceTier}`}>
                            {opportunity.confidenceLabel}
                          </small>
                        </div>
                        <div className="money-cell">
                          <small>
                            {opportunity.usesAltCrafting ? "Network cost" : "Materials"}
                          </small>
                          <strong>{opportunity.reagentCost}</strong>
                          {opportunity.networkSavings ? (
                            <span className="network-saving">
                              save {opportunity.networkSavings}
                            </span>
                          ) : null}
                        </div>
                        <div className="yield-cell">
                          <small>Expected yield</small>
                          <strong>{opportunity.expectedYieldLabel}</strong>
                          <span>possible {opportunity.yieldRangeLabel}</span>
                        </div>
                        <div className="money-cell">
                          <small>Net value</small>
                          <strong>{opportunity.netValue}</strong>
                        </div>
                        <div className="money-cell profit-cell">
                          <small>Profit</small>
                          <strong className="positive-text">+{opportunity.quotedProfit}</strong>
                          {opportunity.specializationUplift ? (
                            <span>+{opportunity.specializationUplift} specialization</span>
                          ) : null}
                        </div>
                        <div className="money-cell">
                          <small>ROI</small>
                          <strong>{opportunity.returnOnCapital}</strong>
                        </div>
                      </Link>
                      <OpportunityCalculationDetails
                        endpoint={opportunityDetailsHref(current, opportunity)}
                      />
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <DataUnavailable title="No Auction House scan is available" />
        )}
      </article>
    );
  } catch {
    return <DataUnavailable title="The market workspace is unavailable" />;
  }
}

function parseRoute(value: string | undefined): WorkspaceRouteFilter {
  return value === "auction_house" || value === "vendor" || value === "disenchant" ? value : "best";
}

function parseSort(value: string | undefined): WorkspaceSort {
  return value === "roi" || value === "specialization-uplift" ? value : "profit";
}

function parseSpecializations(
  raw: Awaited<HomePageProps["searchParams"]>,
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
  current: WorkspaceParameters,
  updates: Partial<WorkspaceParameters>,
): string {
  const merged = { ...current, ...updates };
  const search = new URLSearchParams();
  if (merged.market) search.set("market", merged.market);
  if (merged.profession) search.set("profession", merged.profession);
  if (merged.q) search.set("q", merged.q);
  if (merged.route !== "best") search.set("route", merged.route);
  if (merged.sort !== "profit") search.set("sort", merged.sort);
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
  return query.length > 0 ? `/tbc/trader?${query}` : "/tbc/trader";
}

function opportunityDetailsHref(
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
  return `/api/v1/tbc/opportunity-details/${opportunity.recipeSpellId}?${search.toString()}`;
}
