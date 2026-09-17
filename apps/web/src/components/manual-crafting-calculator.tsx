"use client";

import { calculateCraftingOpportunity } from "@wow-trader/economics";
import { useMemo, useState } from "react";

import { formatCopper, formatPercentBasisPoints } from "../lib/format";

interface CalculatorValues {
  readonly crafts: string;
  readonly reagentQuantity: string;
  readonly reagentPrice: string;
  readonly outputQuantity: string;
  readonly outputPrice: string;
  readonly auctionCut: string;
  readonly fillRate: string;
  readonly depositLoss: string;
  readonly cooldownCost: string;
}

const initialValues: CalculatorValues = {
  crafts: "1",
  reagentQuantity: "1",
  reagentPrice: "0",
  outputQuantity: "1",
  outputPrice: "0",
  auctionCut: "5",
  fillRate: "100",
  depositLoss: "0",
  cooldownCost: "0",
};

export function ManualCraftingCalculator(): React.JSX.Element {
  const [values, setValues] = useState(initialValues);
  const result = useMemo(() => calculate(values), [values]);

  function update(field: keyof CalculatorValues, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="calculator-layout">
      <form className="calculator-form" onSubmit={(event) => event.preventDefault()}>
        <fieldset>
          <legend>Craft</legend>
          <NumberField
            label="Number of crafts"
            value={values.crafts}
            onChange={(value) => update("crafts", value)}
          />
          <NumberField
            label="Reagent units per craft"
            value={values.reagentQuantity}
            onChange={(value) => update("reagentQuantity", value)}
          />
          <NumberField
            label="Reagent unit price (copper)"
            value={values.reagentPrice}
            onChange={(value) => update("reagentPrice", value)}
          />
          <NumberField
            label="Output units per craft"
            value={values.outputQuantity}
            onChange={(value) => update("outputQuantity", value)}
          />
          <NumberField
            label="Output unit price (copper)"
            value={values.outputPrice}
            onChange={(value) => update("outputPrice", value)}
          />
        </fieldset>
        <fieldset>
          <legend>Reality checks</legend>
          <NumberField
            label="Auction House cut (%)"
            value={values.auctionCut}
            step="0.01"
            onChange={(value) => update("auctionCut", value)}
          />
          <NumberField
            label="Expected fill rate (%)"
            value={values.fillRate}
            step="0.01"
            onChange={(value) => update("fillRate", value)}
          />
          <NumberField
            label="Expected lost deposits (copper)"
            value={values.depositLoss}
            onChange={(value) => update("depositLoss", value)}
          />
          <NumberField
            label="Cooldown opportunity cost (copper)"
            value={values.cooldownCost}
            onChange={(value) => update("cooldownCost", value)}
          />
        </fieldset>
      </form>

      <section className="calculator-result" aria-live="polite">
        <span className="eyebrow">Depth-free manual estimate</span>
        {result.ok ? (
          <>
            <p className={result.profit >= 0n ? "profit positive-text" : "profit negative-text"}>
              {formatCopper(result.profit)}
            </p>
            <dl className="metric-list">
              <div>
                <dt>Reagent cost</dt>
                <dd>{formatCopper(result.reagentCost)}</dd>
              </div>
              <div>
                <dt>Expected net revenue</dt>
                <dd>{formatCopper(result.netRevenue)}</dd>
              </div>
              <div>
                <dt>Required capital</dt>
                <dd>{formatCopper(result.capital)}</dd>
              </div>
              <div>
                <dt>Return on capital</dt>
                <dd>{result.roi === null ? "n/a" : formatPercentBasisPoints(result.roi)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="form-error">{result.message}</p>
        )}
        <p className="fine-print">
          Enter copper, not gold. The market opportunity page adds live order-book depth; this
          manual form is useful for stress-testing fees, fills, and cooldown value.
        </p>
      </section>
    </div>
  );
}

interface NumberFieldProps {
  readonly label: string;
  readonly value: string;
  readonly step?: string;
  readonly onChange: (value: string) => void;
}

function NumberField({ label, value, step = "1", onChange }: NumberFieldProps): React.JSX.Element {
  return (
    <label>
      <span>{label}</span>
      <input
        inputMode="decimal"
        min="0"
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

type CalculatorResult =
  | { readonly ok: false; readonly message: string }
  | {
      readonly ok: true;
      readonly profit: bigint;
      readonly reagentCost: bigint;
      readonly netRevenue: bigint;
      readonly capital: bigint;
      readonly roi: bigint | null;
    };

function calculate(values: CalculatorValues): CalculatorResult {
  try {
    const crafts = positiveInteger(values.crafts, "Crafts");
    const reagentQuantity = positiveInteger(values.reagentQuantity, "Reagent quantity");
    const outputQuantity = positiveInteger(values.outputQuantity, "Output quantity");
    const reagentPrice = positiveMoney(values.reagentPrice, "Reagent price");
    const outputPrice = positiveMoney(values.outputPrice, "Output price");
    const depositLoss = nonNegativeMoney(values.depositLoss, "Deposit loss");
    const cooldownCost = nonNegativeMoney(values.cooldownCost, "Cooldown cost");
    const auctionCut = percentageToBasisPoints(values.auctionCut, "Auction cut");
    const fillRate = percentageToBasisPoints(values.fillRate, "Fill rate");
    const result = calculateCraftingOpportunity({
      crafts,
      inputs: [
        {
          itemId: 1,
          quantity: reagentQuantity,
          priceLevels: [{ unitPriceCopper: reagentPrice, quantity: reagentQuantity * crafts }],
        },
      ],
      outputs: [
        {
          itemId: 2,
          expectedQuantity: { numerator: BigInt(outputQuantity), denominator: 1n },
          expectedUnitPriceCopper: outputPrice,
          fillRateBasisPoints: fillRate,
        },
      ],
      auctionHouseCutBasisPoints: auctionCut,
      fixedCostCopper: 0n,
      listingDepositCopper: depositLoss,
      expectedDepositLossCopper: depositLoss,
      cooldownOpportunityCostCopper: cooldownCost,
    });
    if (!result.viable)
      return { ok: false, message: "The supplied reagent depth is insufficient." };
    return {
      ok: true,
      profit: result.expectedProfitCopper,
      reagentCost: result.reagentCostCopper,
      netRevenue: result.expectedNetRevenueCopper,
      capital: result.capitalRequiredCopper,
      roi: result.returnOnCapitalBasisPoints,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Invalid values" };
  }
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new RangeError(`${label} must be a positive integer.`);
  return parsed;
}

function positiveMoney(value: string, label: string): bigint {
  const parsed = nonNegativeMoney(value, label);
  if (parsed === 0n) throw new RangeError(`${label} must be greater than zero.`);
  return parsed;
}

function nonNegativeMoney(value: string, label: string): bigint {
  if (!/^\d+$/.test(value)) throw new RangeError(`${label} must be whole copper.`);
  return BigInt(value);
}

function percentageToBasisPoints(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new RangeError(`${label} must be between 0 and 100.`);
  }
  return Math.round(parsed * 100);
}
