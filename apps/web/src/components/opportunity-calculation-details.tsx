"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import type { MarketWorkspaceOpportunity } from "../lib/market-workspace-data";
import type { SupportedClientProduct } from "../lib/game-versions";
import { getExternalItemReference, getExternalSpellReference } from "../lib/item-reference";
import { AddToCraftingPlanButton } from "./crafting-plan";
import { ItemIcon } from "./item-icon";
import { MarketHistoryChart } from "./market-history-chart";

type OpportunityDetail = Pick<
  MarketWorkspaceOpportunity,
  | "auctionHouseCut"
  | "baseProfit"
  | "breakEvenUnitPrice"
  | "craftSteps"
  | "crossProfessionTransferCount"
  | "directReagentCost"
  | "evidence"
  | "executableCapital"
  | "executableCapitalCopper"
  | "executableCrafts"
  | "executableProfit"
  | "executableProfitCopper"
  | "executableReturnOnCapital"
  | "inputs"
  | "marketHistory"
  | "networkSavings"
  | "omittedOutputCount"
  | "outputLabel"
  | "outputs"
  | "priceSignal"
  | "profitQuality"
  | "professionName"
  | "quoteCapturedAt"
  | "quotedProfit"
  | "recipeName"
  | "recipeSpellId"
  | "route"
  | "routeLabel"
  | "specializationModelVersion"
  | "specializationName"
  | "stopEarlyWarning"
  | "usesAltCrafting"
>;

interface OpportunityCalculationDetailsProps {
  readonly clientProduct: SupportedClientProduct;
  readonly currentMarket: string;
  readonly encyclopediaItemPath: string | null;
  readonly encyclopediaRecipePath: string | null;
  readonly endpoint: string;
  readonly summaryOpportunity?: MarketWorkspaceOpportunity;
}

export function OpportunityCalculationDetails({
  clientProduct,
  currentMarket,
  encyclopediaItemPath,
  encyclopediaRecipePath,
  endpoint,
  summaryOpportunity,
}: OpportunityCalculationDetailsProps): React.JSX.Element {
  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const load = useCallback(async (): Promise<void> => {
    if (detail || state === "loading") return;
    controller.current?.abort();
    controller.current = new AbortController();
    setState("loading");
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
        signal: controller.current.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      const opportunity = readOpportunityDetail(body);
      if (!response.ok || !opportunity) throw new Error("Opportunity detail is unavailable");
      setDetail(opportunity);
      setState("idle");
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setState("error");
    }
  }, [detail, endpoint, state]);

  return (
    <details
      className={`calculation-details${summaryOpportunity ? " calculation-details-row" : ""}`}
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary className={summaryOpportunity ? "opportunity-row" : undefined}>
        {summaryOpportunity ? (
          <OpportunitySummary
            clientProduct={clientProduct}
            opportunity={summaryOpportunity}
            showExternalReferences
          />
        ) : (
          "Show calculation and evidence"
        )}
      </summary>
      {state === "loading" ? (
        <p className="calculation-message" role="status">
          Loading calculation…
        </p>
      ) : null}
      {state === "error" ? (
        <div className="calculation-message" role="alert">
          <span>The calculation could not be loaded.</span>
          <button onClick={() => void load()} type="button">
            Retry
          </button>
        </div>
      ) : null}
      {detail ? (
        <OpportunityDetailContent
          clientProduct={clientProduct}
          currentMarket={currentMarket}
          detail={detail}
          encyclopediaItemPath={encyclopediaItemPath}
          encyclopediaRecipePath={encyclopediaRecipePath}
        />
      ) : null}
    </details>
  );
}

export function OpportunitySummary({
  clientProduct,
  opportunity,
  showExternalReferences = false,
}: {
  readonly clientProduct: SupportedClientProduct;
  readonly opportunity: MarketWorkspaceOpportunity;
  readonly showExternalReferences?: boolean;
}): React.JSX.Element {
  const itemReference = showExternalReferences
    ? getExternalItemReference(clientProduct, opportunity.primaryOutputItemId)
    : null;
  const spellReference = showExternalReferences
    ? getExternalSpellReference(clientProduct, opportunity.recipeSpellId)
    : null;

  return (
    <>
      <span className="craft-cell">
        <ItemIcon
          fileDataId={opportunity.outputIconFileDataId}
          product={clientProduct}
          quality={opportunity.outputQuality}
        />
        <span>
          <strong className="craft-name">
            {itemReference ? (
              <ExternalSummaryLink
                href={itemReference.href}
                label={`View ${opportunity.outputLabel} on ${itemReference.label}`}
              >
                {opportunity.outputLabel} <span aria-hidden="true">↗</span>
              </ExternalSummaryLink>
            ) : (
              opportunity.outputLabel
            )}
          </strong>
          <small>
            Recipe:{" "}
            {spellReference ? (
              <ExternalSummaryLink
                href={spellReference.href}
                label={`View ${opportunity.recipeName} recipe on ${spellReference.label}`}
              >
                {opportunity.recipeName} <span aria-hidden="true">↗</span>
              </ExternalSummaryLink>
            ) : (
              opportunity.recipeName
            )}
            {showExternalReferences ? ` · Item ${opportunity.primaryOutputItemId}` : ""}
          </small>
          <span>
            {opportunity.professionName} · skill {opportunity.requiredSkillRank}
            {opportunity.cooldownLabel ? ` · ${opportunity.cooldownLabel}` : ""}
          </span>
        </span>
      </span>
      <span className="profile-cell">
        <span className={`route-badge ${opportunity.route}`}>{opportunity.routeLabel}</span>
        {opportunity.specializationName ? (
          <span className="specialization-badge">{opportunity.specializationName}</span>
        ) : null}
        {opportunity.usesAltCrafting ? <span className="network-badge">Alt network</span> : null}
        <small className={`confidence-badge ${opportunity.confidenceTier}`}>
          {opportunity.confidenceLabel}
        </small>
        <small className={`market-quality-badge ${opportunity.profitQuality.kind}`}>
          {opportunity.profitQuality.label}
        </small>
        {showExternalReferences ? (
          <small className="row-action">Click row for details</small>
        ) : null}
      </span>
      <span className="yield-cell">
        <small>Recommended</small>
        <strong>
          {opportunity.executableCrafts} craft{opportunity.executableCrafts === 1 ? "" : "s"}
        </strong>
        <span>Reagents priced through {opportunity.depthCraftLimit}</span>
      </span>
      <span className="money-cell">
        <small>Capital</small>
        <strong>{opportunity.executableCapital}</strong>
      </span>
      <span className="money-cell profit-cell">
        <small>Total profit</small>
        <strong className="positive-text">+{opportunity.executableProfit}</strong>
      </span>
      <span className="money-cell profit-cell">
        <small>Profit / craft</small>
        <strong className="positive-text">+{opportunity.quotedProfit}</strong>
      </span>
      <span className="money-cell">
        <small>ROI</small>
        <strong>{opportunity.executableReturnOnCapital}</strong>
      </span>
    </>
  );
}

function ExternalSummaryLink({
  children,
  href,
  label,
}: {
  readonly children: React.ReactNode;
  readonly href: string;
  readonly label: string;
}): React.JSX.Element {
  return (
    <a
      aria-label={`${label} (opens in a new tab)`}
      href={href}
      onClick={(event) => event.stopPropagation()}
      referrerPolicy="no-referrer"
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

function OpportunityDetailContent({
  clientProduct,
  currentMarket,
  detail,
  encyclopediaItemPath,
  encyclopediaRecipePath,
}: {
  readonly clientProduct: SupportedClientProduct;
  readonly currentMarket: string;
  readonly detail: OpportunityDetail;
  readonly encyclopediaItemPath: string | null;
  readonly encyclopediaRecipePath: string | null;
}): React.JSX.Element {
  return (
    <div className="calculation-content">
      <section className="execution-summary" aria-label="Recommended execution">
        <div>
          <span>Recommended action</span>
          <strong>
            Craft {detail.executableCrafts}× and exit through {detail.routeLabel}
          </strong>
          <small>
            Spend {detail.executableCapital} · quoted profit +{detail.executableProfit} ·{" "}
            {detail.executableReturnOnCapital} ROI
          </small>
        </div>
        <div className="execution-summary-actions">
          {detail.breakEvenUnitPrice ? (
            <span>
              Break-even <strong>{detail.breakEvenUnitPrice}</strong> each
            </span>
          ) : null}
          <AddToCraftingPlanButton
            clientProduct={clientProduct}
            market={currentMarket}
            opportunity={detail}
          />
        </div>
      </section>
      <div className="calculation-grid">
        <div>
          <h3>{detail.usesAltCrafting ? "Raw materials purchased" : "Reagents purchased"}</h3>
          <ul>
            {detail.inputs.map((input) => (
              <li key={input.itemId}>
                <div className="detail-item">
                  <ItemIcon
                    fileDataId={input.iconFileDataId}
                    product={clientProduct}
                    quality={input.quality}
                    size="small"
                  />
                  <ItemReferenceLink
                    clientProduct={clientProduct}
                    encyclopediaItemPath={encyclopediaItemPath}
                    itemId={input.itemId}
                    itemName={input.name}
                  >
                    {input.quantity}× {input.name}
                  </ItemReferenceLink>
                </div>
                <span>
                  {input.cost} · up to {input.highestUnitPrice} each
                  {input.priceSignalLabel ? ` · ${input.priceSignalLabel}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {detail.usesAltCrafting ? (
            <>
              <h3 className="craft-route-heading">Craft with your alts</h3>
              <ol className="craft-route-list">
                {detail.craftSteps.map((step, stepIndex) => (
                  <li key={`${step.recipeSpellId}:${step.outputItemId}:${stepIndex}`}>
                    <span>
                      {step.professionName} · skill {step.requiredSkillRank}
                    </span>
                    {encyclopediaRecipePath ? (
                      <Link href={`${encyclopediaRecipePath}/${step.recipeSpellId}`}>
                        Craft {step.crafts}× {step.recipeName}
                      </Link>
                    ) : (
                      <strong>
                        Craft {step.crafts}× {step.recipeName}
                      </strong>
                    )}
                    <small>
                      Produces{" "}
                      <ItemReferenceLink
                        clientProduct={clientProduct}
                        encyclopediaItemPath={encyclopediaItemPath}
                        itemId={step.outputItemId}
                        itemName={step.outputName}
                      >
                        {step.outputQuantity}× {step.outputName}
                      </ItemReferenceLink>
                      {step.leftoverQuantity > 0 ? ` · ${step.leftoverQuantity} leftover` : ""}
                    </small>
                  </li>
                ))}
              </ol>
              <p>
                Direct AH reagents: {detail.directReagentCost ?? "unavailable"}
                {detail.networkSavings ? ` · saved ${detail.networkSavings}` : ""}
                {detail.crossProfessionTransferCount > 0
                  ? ` · ${detail.crossProfessionTransferCount} cross-profession transfer${detail.crossProfessionTransferCount === 1 ? "" : "s"}`
                  : ""}
              </p>
            </>
          ) : null}
        </div>
        <div>
          <h3>{detail.routeLabel} value</h3>
          <ul>
            {detail.outputs.map((output) => (
              <li key={output.itemId}>
                <div className="detail-item">
                  <ItemIcon
                    fileDataId={output.iconFileDataId}
                    product={clientProduct}
                    quality={output.quality}
                    size="small"
                  />
                  <ItemReferenceLink
                    clientProduct={clientProduct}
                    encyclopediaItemPath={encyclopediaItemPath}
                    itemId={output.itemId}
                    itemName={output.name}
                  >
                    {output.expectedQuantity}× {output.name}
                  </ItemReferenceLink>
                </div>
                <span>{output.unitValue} each</span>
              </li>
            ))}
          </ul>
          {detail.route === "auction_house" || detail.route === "disenchant" ? (
            <p>AH cut: {detail.auctionHouseCut}</p>
          ) : null}
        </div>
        <div className="evidence-cell">
          <h3>Why this number</h3>
          <p>{detail.evidence}</p>
          <p className={`profit-quality ${detail.profitQuality.kind}`}>
            <strong>{detail.profitQuality.label}</strong>
            {detail.profitQuality.guidance}
          </p>
          <MarketSignal
            auctionHouseCut={detail.auctionHouseCut}
            history={detail.marketHistory}
            route={detail.route}
            signal={detail.priceSignal}
          />
          {detail.stopEarlyWarning ? (
            <p className="stop-early-warning">{detail.stopEarlyWarning}</p>
          ) : null}
          {detail.specializationName ? (
            <p>
              Base profit without the selected specialization effect: {detail.baseProfit}. Model:{" "}
              {detail.specializationModelVersion}.
            </p>
          ) : null}
          {detail.omittedOutputCount > 0 ? (
            <p>{detail.omittedOutputCount} output lacked a value and was omitted.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MarketSignal({
  auctionHouseCut,
  history,
  route,
  signal,
}: {
  readonly auctionHouseCut: string;
  readonly history: MarketWorkspaceOpportunity["marketHistory"];
  readonly route: MarketWorkspaceOpportunity["route"];
  readonly signal: MarketWorkspaceOpportunity["priceSignal"];
}): React.JSX.Element {
  if (signal.status === "collecting") {
    return (
      <div className="market-signal collecting">
        <strong>Price history: {signal.label}</strong>
        <span>Guidance unlocks after six independent half-hour market observations.</span>
        {route === "auction_house" || route === "disenchant" ? (
          <span>The profit recommendation already subtracts the {auctionHouseCut} AH fee.</span>
        ) : null}
        <MarketHistoryChart auctionHouseCut={auctionHouseCut} history={history} signal={signal} />
      </div>
    );
  }
  const guidance = marketSignalGuidance(route, signal.kind);
  return (
    <div className={`market-signal ${signal.kind.replace("_", "-")}`}>
      <strong>
        {signal.label} · {signal.differenceFromNormal}
      </strong>
      <span>
        Current {signal.currentPrice}; normal {signal.normalPrice} ({signal.normalRange}). Supply{" "}
        {signal.supplyDifference} versus normal ({signal.currentQuantity} available across{" "}
        {signal.currentListingCount} listings).
      </span>
      <span>
        Direction {signal.direction}; {signal.confidence} confidence across{" "}
        {signal.observationCount} independent half-hour observations. {guidance}
      </span>
      {route === "auction_house" || route === "disenchant" ? (
        <span>
          Chart prices are gross asks. The profit recommendation above already subtracts the{" "}
          {auctionHouseCut} Auction House fee for this craft.
        </span>
      ) : null}
      <MarketHistoryChart auctionHouseCut={auctionHouseCut} history={history} signal={signal} />
    </div>
  );
}

function marketSignalGuidance(
  route: MarketWorkspaceOpportunity["route"],
  kind: Exclude<MarketWorkspaceOpportunity["priceSignal"], { status: "collecting" }>["kind"],
): string {
  if (route !== "auction_house") {
    return "This exit does not depend directly on the product's Auction House price.";
  }
  const guidance: Record<typeof kind, string> = {
    bargain: "The output is cheap versus history; selling immediately is weaker than usual.",
    normal: "The output is trading inside its recent normal range.",
    rising:
      "Several observations support the move, but listings are still asking prices, not sales.",
    spike_risk:
      "Thin supply is inflating the quote; do not size a craft as if every unit will sell here.",
    oversupplied:
      "Unusually high supply is pressuring price; producing more carries inventory risk.",
    falling: "The recent sequence is falling; wait for stabilization before speculative crafting.",
    too_thin: "There is not enough depth for reliable selling guidance.",
  };
  return guidance[kind];
}

function ItemReferenceLink({
  children,
  clientProduct,
  encyclopediaItemPath,
  itemId,
  itemName,
}: {
  readonly children: React.ReactNode;
  readonly clientProduct: SupportedClientProduct;
  readonly encyclopediaItemPath: string | null;
  readonly itemId: number;
  readonly itemName: string;
}): React.JSX.Element {
  if (encyclopediaItemPath) {
    return <Link href={`${encyclopediaItemPath}/${itemId}`}>{children}</Link>;
  }

  const externalReference = getExternalItemReference(clientProduct, itemId);
  if (!externalReference) return <span>{children}</span>;

  return (
    <a
      aria-label={`View ${itemName} on ${externalReference.label} (opens in a new tab)`}
      href={externalReference.href}
      referrerPolicy="no-referrer"
      rel="noopener noreferrer"
      target="_blank"
    >
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}

function readOpportunityDetail(value: unknown): OpportunityDetail | null {
  if (!value || typeof value !== "object" || !("opportunity" in value)) return null;
  const opportunity: unknown = value.opportunity;
  if (
    !opportunity ||
    typeof opportunity !== "object" ||
    !("inputs" in opportunity) ||
    !Array.isArray(opportunity.inputs) ||
    !("outputs" in opportunity) ||
    !Array.isArray(opportunity.outputs) ||
    !("craftSteps" in opportunity) ||
    !Array.isArray(opportunity.craftSteps) ||
    !("marketHistory" in opportunity) ||
    !isMarketHistory(opportunity.marketHistory) ||
    !("evidence" in opportunity) ||
    typeof opportunity.evidence !== "string"
  ) {
    return null;
  }
  return opportunity as OpportunityDetail;
}

function isMarketHistory(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== "object" || !("points" in value) || !Array.isArray(value.points)) {
    return false;
  }
  return value.points.every(
    (point) =>
      Boolean(point) &&
      typeof point === "object" &&
      "observedAt" in point &&
      typeof point.observedAt === "string" &&
      "unitAskCopper" in point &&
      typeof point.unitAskCopper === "string",
  );
}
