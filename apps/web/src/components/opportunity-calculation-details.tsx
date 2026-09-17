"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import type { MarketWorkspaceOpportunity } from "../lib/market-workspace-data";
import { ItemIcon } from "./item-icon";

type OpportunityDetail = Pick<
  MarketWorkspaceOpportunity,
  | "auctionHouseCut"
  | "baseProfit"
  | "craftSteps"
  | "crossProfessionTransferCount"
  | "directReagentCost"
  | "evidence"
  | "inputs"
  | "networkSavings"
  | "omittedOutputCount"
  | "outputs"
  | "route"
  | "routeLabel"
  | "specializationModelVersion"
  | "specializationName"
  | "stopEarlyWarning"
  | "usesAltCrafting"
>;

interface OpportunityCalculationDetailsProps {
  readonly endpoint: string;
}

export function OpportunityCalculationDetails({
  endpoint,
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
      className="calculation-details"
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary>Show calculation and evidence</summary>
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
      {detail ? <OpportunityDetailContent detail={detail} /> : null}
    </details>
  );
}

function OpportunityDetailContent({
  detail,
}: {
  readonly detail: OpportunityDetail;
}): React.JSX.Element {
  return (
    <div className="calculation-grid">
      <div>
        <h3>{detail.usesAltCrafting ? "Raw materials purchased" : "Reagents purchased"}</h3>
        <ul>
          {detail.inputs.map((input) => (
            <li key={input.itemId}>
              <div className="detail-item">
                <ItemIcon fileDataId={input.iconFileDataId} quality={input.quality} size="small" />
                <Link href={`/tbc/encyclopedia/items/${input.itemId}`}>
                  {input.quantity}× {input.name}
                </Link>
              </div>
              <span>
                {input.cost} · up to {input.highestUnitPrice} each
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
                  <Link href={`/tbc/encyclopedia/recipes/${step.recipeSpellId}`}>
                    Craft {step.crafts}× {step.recipeName}
                  </Link>
                  <small>
                    Produces {step.outputQuantity}× {step.outputName}
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
                  quality={output.quality}
                  size="small"
                />
                <Link href={`/tbc/encyclopedia/items/${output.itemId}`}>
                  {output.expectedQuantity}× {output.name}
                </Link>
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
    !("evidence" in opportunity) ||
    typeof opportunity.evidence !== "string"
  ) {
    return null;
  }
  return opportunity as OpportunityDetail;
}
