"use client";

import { useMemo, useState } from "react";

import { formatCompactGold } from "../lib/format";
import type { MarketOpportunityHistory } from "../lib/market-opportunity-history";
import type { MarketPriceSignal } from "../lib/market-price-signal";

type ChartMode = "ask" | "net" | "profit";
type ChartRange = "30m" | "24h" | "7d" | "30d";

interface HistoryPoint {
  readonly observedAt: string;
  readonly timestamp: number;
  readonly unitAskCopper: bigint;
  readonly grossRevenueCopper: bigint | null;
  readonly netRevenueCopper: bigint | null;
  readonly reagentCostCopper: bigint | null;
  readonly profitCopper: bigint | null;
  readonly availableQuantity: number;
  readonly listingCount: number;
  readonly missingInputCount: number;
  readonly missingOutputCount: number;
}

interface MarketHistoryChartProps {
  readonly auctionHouseCut?: string;
  readonly context?: "craft" | "item";
  readonly history: MarketOpportunityHistory | null;
  readonly signal: MarketPriceSignal;
  readonly subjectName?: string;
}

const RANGE_OPTIONS: readonly {
  readonly value: ChartRange;
  readonly label: string;
  readonly ms: number;
}[] = [
  { value: "30m", label: "30m", ms: 30 * 60_000 },
  { value: "24h", label: "24h", ms: 24 * 60 * 60_000 },
  { value: "7d", label: "7d", ms: 7 * 24 * 60 * 60_000 },
  { value: "30d", label: "30d", ms: 30 * 24 * 60 * 60_000 },
];

const PLOT_LEFT = 76;
const PLOT_RIGHT = 700;
const PRICE_TOP = 20;
const PRICE_BOTTOM = 150;
const SUPPLY_TOP = 178;
const SUPPLY_BOTTOM = 212;
const GAP_THRESHOLD_MS = 90 * 60_000;

export function MarketHistoryChart({
  auctionHouseCut = "n/a",
  context = "craft",
  history,
  signal,
  subjectName,
}: MarketHistoryChartProps): React.JSX.Element | null {
  const allPoints = useMemo(() => normalizeHistory(history, signal), [history, signal]);
  const economicsAvailable = allPoints.some((point) => point.profitCopper !== null);
  const [mode, setMode] = useState<ChartMode>("ask");
  const [range, setRange] = useState<ChartRange>("24h");
  const [hoveredAt, setHoveredAt] = useState<string | null>(null);
  const [pinnedAt, setPinnedAt] = useState<string | null>(null);

  if (allPoints.length === 0) return null;

  const effectiveMode = economicsAvailable ? mode : "ask";
  const latestTimestamp = allPoints.at(-1)!.timestamp;
  const rangeMilliseconds = RANGE_OPTIONS.find((option) => option.value === range)!.ms;
  const rangeStart = latestTimestamp - rangeMilliseconds;
  const points = allPoints.filter((point) => point.timestamp >= rangeStart);
  const valuedPoints = points
    .filter(
      (point): point is HistoryPoint & { readonly chartValue: bigint } =>
        chartValue(point, effectiveMode) !== null,
    )
    .map((point) => ({ ...point, chartValue: chartValue(point, effectiveMode)! }));
  const activePoint =
    valuedPoints.find((point) => point.observedAt === (pinnedAt ?? hoveredAt)) ??
    valuedPoints.at(-1) ??
    points.at(-1)!;
  const band =
    signal.status === "available" && valuedPoints.length >= signal.observationCount
      ? robustBand(valuedPoints.slice(-48).map((point) => point.chartValue))
      : signal.status === "available" && valuedPoints.length >= 6
        ? robustBand(valuedPoints.slice(-48).map((point) => point.chartValue))
        : null;
  const scaleValues = valuedPoints.map((point) => point.chartValue);
  if (effectiveMode === "profit") {
    scaleValues.push(0n);
    for (const point of points) {
      if (point.netRevenueCopper !== null) scaleValues.push(point.netRevenueCopper);
      if (point.reagentCostCopper !== null) scaleValues.push(point.reagentCostCopper);
    }
  }
  if (band) scaleValues.push(band.lower, band.normal, band.upper);
  const rawFloor = scaleValues.length > 0 ? minimumBigInt(scaleValues) : 0n;
  const rawCeiling = scaleValues.length > 0 ? maximumBigInt(scaleValues) : 1n;
  const padding =
    rawCeiling === rawFloor ? maximumBigInt(1n, absoluteBigInt(rawCeiling) / 10n) : 0n;
  const floor = rawFloor - padding;
  const ceiling = rawCeiling + padding;
  const span = ceiling > floor ? ceiling - floor : 1n;
  const midpoint = (floor + ceiling) / 2n;
  const xFor = (timestamp: number): number =>
    PLOT_LEFT +
    ((timestamp - rangeStart) / Math.max(1, latestTimestamp - rangeStart)) *
      (PLOT_RIGHT - PLOT_LEFT);
  const yFor = (value: bigint): number => {
    const scaled = Number(((value - floor) * 10_000n) / span) / 10_000;
    return PRICE_BOTTOM - scaled * (PRICE_BOTTOM - PRICE_TOP);
  };
  const maximumSupply = Math.max(1, ...points.map((point) => point.availableQuantity));
  const supplyYFor = (quantity: number): number =>
    SUPPLY_BOTTOM - (quantity / maximumSupply) * (SUPPLY_BOTTOM - SUPPLY_TOP);
  const summary = summarizeRange(valuedPoints, points, effectiveMode);
  const gapCount = countGaps(points);

  return (
    <section className="market-history-panel" aria-label="Auction House price intelligence">
      <header className="market-history-header">
        <div>
          <strong>Market history</strong>
          <span>
            {subjectName ?? history?.primaryOutputName ?? "Output item"} · scans shown in UTC
          </span>
        </div>
        {context === "craft" ? (
          <div className="market-history-mode" role="group" aria-label="Chart value">
            <ChartButton active={effectiveMode === "ask"} onClick={() => setMode("ask")}>
              Unit ask
            </ChartButton>
            <ChartButton
              active={effectiveMode === "net"}
              disabled={!economicsAvailable}
              onClick={() => setMode("net")}
            >
              Net output
            </ChartButton>
            <ChartButton
              active={effectiveMode === "profit"}
              disabled={!economicsAvailable}
              onClick={() => setMode("profit")}
            >
              Profit
            </ChartButton>
          </div>
        ) : (
          <span className="market-history-context">Representative unit ask</span>
        )}
      </header>
      <div className="market-history-ranges" role="group" aria-label="History period">
        {RANGE_OPTIONS.map((option) => (
          <button
            aria-pressed={range === option.value}
            className={range === option.value ? "active" : undefined}
            key={option.value}
            onClick={() => {
              setRange(option.value);
              setPinnedAt(null);
              setHoveredAt(null);
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
        <span>
          {points.length} scan{points.length === 1 ? "" : "s"}
        </span>
      </div>
      <div
        className="market-history-visual"
        onMouseLeave={() => {
          if (!pinnedAt) setHoveredAt(null);
        }}
      >
        <svg
          aria-label={`${modeLabel(effectiveMode)} history from ${formatCompactGold(floor)} to ${formatCompactGold(ceiling)}, with listed supply`}
          role="img"
          viewBox="0 0 720 250"
        >
          {[
            { value: ceiling, y: PRICE_TOP },
            { value: midpoint, y: (PRICE_TOP + PRICE_BOTTOM) / 2 },
            { value: floor, y: PRICE_BOTTOM },
          ].map((tick) => (
            <g key={`${tick.y}-${tick.value}`}>
              <line
                className="market-history-grid"
                x1={PLOT_LEFT}
                x2={PLOT_RIGHT}
                y1={tick.y}
                y2={tick.y}
              />
              <text
                className="market-history-axis-label"
                textAnchor="end"
                x={PLOT_LEFT - 8}
                y={tick.y + 3}
              >
                {formatCompactGold(tick.value)}
              </text>
            </g>
          ))}
          {band ? (
            <>
              <rect
                className="market-history-band"
                height={Math.max(2, yFor(band.lower) - yFor(band.upper))}
                width={PLOT_RIGHT - PLOT_LEFT}
                x={PLOT_LEFT}
                y={yFor(band.upper)}
              />
              <line
                className="market-history-normal-line"
                x1={PLOT_LEFT}
                x2={PLOT_RIGHT}
                y1={yFor(band.normal)}
                y2={yFor(band.normal)}
              />
            </>
          ) : null}
          {effectiveMode === "profit" && floor < 0n && ceiling > 0n ? (
            <line
              className="market-history-break-even-line"
              x1={PLOT_LEFT}
              x2={PLOT_RIGHT}
              y1={yFor(0n)}
              y2={yFor(0n)}
            />
          ) : null}
          {effectiveMode === "profit" ? (
            <>
              <HistoryLines
                className="market-history-net-line"
                points={points}
                value={(point) => point.netRevenueCopper}
                xFor={xFor}
                yFor={yFor}
              />
              <HistoryLines
                className="market-history-reagent-line"
                points={points}
                value={(point) => point.reagentCostCopper}
                xFor={xFor}
                yFor={yFor}
              />
              {points.map((point) => (
                <g aria-hidden="true" key={`economics-${point.observedAt}`}>
                  {point.netRevenueCopper !== null ? (
                    <circle
                      className="market-history-net-point"
                      cx={xFor(point.timestamp)}
                      cy={yFor(point.netRevenueCopper)}
                      r="2.3"
                    />
                  ) : null}
                  {point.reagentCostCopper !== null ? (
                    <circle
                      className="market-history-reagent-point"
                      cx={xFor(point.timestamp)}
                      cy={yFor(point.reagentCostCopper)}
                      r="2.3"
                    />
                  ) : null}
                </g>
              ))}
            </>
          ) : null}
          <HistoryLines
            className="market-history-line"
            points={points}
            value={(point) => chartValue(point, effectiveMode)}
            xFor={xFor}
            yFor={yFor}
          />
          {renderGapLabels(points, xFor)}
          {valuedPoints.map((point, index) => {
            const x = xFor(point.timestamp);
            const y = yFor(point.chartValue);
            const previousProfit = previousKnownProfit(points, point.timestamp);
            const crossedIntoProfit =
              point.profitCopper !== null &&
              point.profitCopper > 0n &&
              (previousProfit === null || previousProfit <= 0n);
            const bargain =
              signal.status === "available" &&
              point.unitAskCopper < BigInt(signal.lowerPriceCopper);
            const selected = point.observedAt === activePoint.observedAt;
            const accessibleLabel = pointAccessibleLabel(point, history, signal);
            return (
              <g key={point.observedAt}>
                {bargain ? (
                  <rect
                    aria-hidden="true"
                    className="market-history-bargain-marker"
                    height="8"
                    transform={`rotate(45 ${x} ${y})`}
                    width="8"
                    x={x - 4}
                    y={y - 4}
                  />
                ) : null}
                {crossedIntoProfit ? (
                  <path
                    aria-hidden="true"
                    className="market-history-profit-marker"
                    d={`M ${x} ${y - 8} L ${x + 7} ${y + 5} L ${x - 7} ${y + 5} Z`}
                  />
                ) : null}
                <circle
                  aria-label={accessibleLabel}
                  aria-pressed={pinnedAt === point.observedAt}
                  className={selected ? "selected" : undefined}
                  cx={x}
                  cy={y}
                  onBlur={() => {
                    if (!pinnedAt) setHoveredAt(null);
                  }}
                  onClick={() =>
                    setPinnedAt((current) =>
                      current === point.observedAt ? null : point.observedAt,
                    )
                  }
                  onFocus={() => setHoveredAt(point.observedAt)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setPinnedAt((current) =>
                      current === point.observedAt ? null : point.observedAt,
                    );
                  }}
                  onMouseEnter={() => setHoveredAt(point.observedAt)}
                  r={selected ? 4.5 : 3}
                  role="button"
                  tabIndex={0}
                >
                  <title>{accessibleLabel}</title>
                </circle>
                {index === valuedPoints.length - 1 ? (
                  <text
                    className="market-history-latest-label"
                    textAnchor="end"
                    x={x - 6}
                    y={y - 7}
                  >
                    latest
                  </text>
                ) : null}
              </g>
            );
          })}
          <line
            className="market-history-supply-axis"
            x1={PLOT_LEFT}
            x2={PLOT_RIGHT}
            y1={SUPPLY_BOTTOM}
            y2={SUPPLY_BOTTOM}
          />
          <text
            className="market-history-supply-label"
            textAnchor="end"
            x={PLOT_LEFT - 8}
            y={SUPPLY_TOP + 3}
          >
            {maximumSupply}
          </text>
          <text
            className="market-history-supply-label"
            textAnchor="end"
            x={PLOT_LEFT - 8}
            y={SUPPLY_BOTTOM + 3}
          >
            0
          </text>
          <text className="market-history-supply-title" x={PLOT_LEFT} y={SUPPLY_TOP - 7}>
            Listed supply
          </text>
          <HistoryLines
            className="market-history-supply-line"
            points={points}
            value={(point) => BigInt(point.availableQuantity)}
            xFor={xFor}
            yFor={(value) => supplyYFor(Number(value))}
          />
          {points.map((point) => (
            <circle
              aria-hidden="true"
              className="market-history-supply-point"
              cx={xFor(point.timestamp)}
              cy={supplyYFor(point.availableQuantity)}
              key={`supply-${point.observedAt}`}
              r="2"
            />
          ))}
          {timeTicks(rangeStart, latestTimestamp).map((timestamp) => (
            <text
              className="market-history-time-label"
              key={timestamp}
              textAnchor={
                timestamp === rangeStart
                  ? "start"
                  : timestamp === latestTimestamp
                    ? "end"
                    : "middle"
              }
              x={xFor(timestamp)}
              y="239"
            >
              {formatAxisTime(timestamp, range)}
            </text>
          ))}
        </svg>
        <ObservationCard
          auctionHouseCut={auctionHouseCut}
          history={history}
          point={activePoint}
          signal={signal}
          context={context}
        />
      </div>
      <div className="market-history-summary" aria-label={`${range} summary`}>
        <SummaryValue label="Low" value={summary.low} />
        <SummaryValue label="Median" value={summary.median} />
        <SummaryValue label="High" value={summary.high} />
        <SummaryValue label="Period move" value={summary.change} />
        <SummaryValue label="Vs median" value={summary.vsMedian} />
        <SummaryValue label="Raw trend" value={summary.trend} />
        <SummaryValue label="Listed supply" value={summary.supplyChange} />
        <SummaryValue
          label="Evidence"
          value={`${valuedPoints.length}/${points.length} valued${gapCount > 0 ? ` · ${gapCount} gap${gapCount === 1 ? "" : "s"}` : ""}`}
        />
      </div>
      <div className="market-history-legend" aria-label="Chart legend">
        <span>
          <i className="legend-main" />
          {modeLabel(effectiveMode)}
        </span>
        {effectiveMode === "profit" ? (
          <>
            <span>
              <i className="legend-net" />
              Net output
            </span>
            <span>
              <i className="legend-reagent" />
              Reagents
            </span>
          </>
        ) : null}
        {band ? (
          <span>
            <i className="legend-band" />
            Robust normal range
          </span>
        ) : null}
        {economicsAvailable ? (
          <span>
            <i className="legend-deal" />
            Profit turns positive
          </span>
        ) : null}
        {signal.status === "available" ? (
          <span>
            <i className="legend-bargain" />
            Below normal ask
          </span>
        ) : null}
        <span>
          <i className="legend-supply" />
          Listed supply, not sales
        </span>
      </div>
      <div className={`market-history-gate ${signal.status}`}>
        {signal.status === "collecting" ? (
          <>
            <strong>{signal.label}: raw history only</strong>
            <span>
              Buy/sell guidance remains locked until {signal.minimumObservationCount} independent
              half-hour observations exist.
            </span>
          </>
        ) : (
          <>
            <strong>{signal.observationCount} observations: guidance active</strong>
            <span>Normal bands use the robust median model; asks still do not prove sales.</span>
          </>
        )}
      </div>
      <p className="market-history-method">
        {context === "item"
          ? "History uses the quantity-weighted p10 ask from each matching scan. It measures listed prices and supply, not retained historical order-book depth, sale probability, or confirmed sales."
          : "Historical craft economics use matching-scan p10 asks × recipe quantities and the configured AH fee. Missing input or output markets create gaps. They are indicative one-craft values, not retained historical order-book depth, deposits, sale probability, or confirmed sales."}
      </p>
    </section>
  );
}

function ChartButton({
  active,
  children,
  disabled = false,
  onClick,
}: {
  readonly active: boolean;
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-pressed={active}
      className={active ? "active" : undefined}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function HistoryLines({
  className,
  points,
  value,
  xFor,
  yFor,
}: {
  readonly className: string;
  readonly points: readonly HistoryPoint[];
  readonly value: (point: HistoryPoint) => bigint | null;
  readonly xFor: (timestamp: number) => number;
  readonly yFor: (value: bigint) => number;
}): React.JSX.Element {
  return (
    <g aria-hidden="true">
      {points.slice(1).map((point, index) => {
        const previous = points[index]!;
        const previousValue = value(previous);
        const currentValue = value(point);
        if (
          previousValue === null ||
          currentValue === null ||
          point.timestamp - previous.timestamp > GAP_THRESHOLD_MS
        ) {
          return null;
        }
        return (
          <line
            className={className}
            key={`${className}-${previous.observedAt}-${point.observedAt}`}
            x1={xFor(previous.timestamp)}
            x2={xFor(point.timestamp)}
            y1={yFor(previousValue)}
            y2={yFor(currentValue)}
          />
        );
      })}
    </g>
  );
}

function ObservationCard({
  auctionHouseCut,
  context,
  history,
  point,
  signal,
}: {
  readonly auctionHouseCut: string;
  readonly context: "craft" | "item";
  readonly history: MarketOpportunityHistory | null;
  readonly point: HistoryPoint;
  readonly signal: MarketPriceSignal;
}): React.JSX.Element {
  const normalDifference =
    signal.status === "available"
      ? formatPercentDifference(point.unitAskCopper, BigInt(signal.normalPriceCopper))
      : null;
  const fee =
    point.grossRevenueCopper !== null && point.netRevenueCopper !== null
      ? point.grossRevenueCopper - point.netRevenueCopper
      : null;
  return (
    <aside aria-live="polite" className="market-history-tooltip">
      <time dateTime={point.observedAt}>{formatTooltipTime(point.timestamp)}</time>
      <dl>
        <div>
          <dt>Unit ask</dt>
          <dd>{formatCompactGold(point.unitAskCopper)}</dd>
        </div>
        {point.grossRevenueCopper !== null ? (
          <div>
            <dt>Gross output</dt>
            <dd>{formatCompactGold(point.grossRevenueCopper)}</dd>
          </div>
        ) : null}
        {point.netRevenueCopper !== null ? (
          <div>
            <dt>Net after fee</dt>
            <dd>{formatCompactGold(point.netRevenueCopper)}</dd>
          </div>
        ) : null}
        {fee !== null ? (
          <div>
            <dt>AH fee</dt>
            <dd>−{formatCompactGold(fee)}</dd>
          </div>
        ) : null}
        {point.reagentCostCopper !== null ? (
          <div>
            <dt>Reagents</dt>
            <dd>−{formatCompactGold(point.reagentCostCopper)}</dd>
          </div>
        ) : null}
        {point.profitCopper !== null ? (
          <div className={point.profitCopper >= 0n ? "positive" : "negative"}>
            <dt>Craft profit</dt>
            <dd>{formatCompactGold(point.profitCopper)}</dd>
          </div>
        ) : null}
        {normalDifference ? (
          <div>
            <dt>Vs normal</dt>
            <dd>{normalDifference}</dd>
          </div>
        ) : null}
        <div>
          <dt>Listed supply</dt>
          <dd>{point.availableQuantity.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Listings</dt>
          <dd>{point.listingCount.toLocaleString()}</dd>
        </div>
      </dl>
      {point.profitCopper === null && history ? (
        <small>
          Economics unavailable: {point.missingInputCount} input and {point.missingOutputCount}{" "}
          output market
          {point.missingInputCount + point.missingOutputCount === 1 ? " was" : "s were"} missing.
        </small>
      ) : null}
      {context === "craft" ? (
        <small>
          {history
            ? `Successful-sale fee rate: ${formatBasisPoints(history.auctionHouseCutBasisPoints)}.`
            : `Current quote AH cut: ${auctionHouseCut}.`}
        </small>
      ) : (
        <small>Representative ask uses the quantity-weighted p10 listing price.</small>
      )}
    </aside>
  );
}

function SummaryValue({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function normalizeHistory(
  history: MarketOpportunityHistory | null,
  signal: MarketPriceSignal,
): HistoryPoint[] {
  const points =
    history?.points ??
    signal.history.map((point) => ({
      ...point,
      unitAskCopper: point.priceCopper,
      grossRevenueCopper: null,
      netRevenueCopper: null,
      reagentCostCopper: null,
      profitCopper: null,
      missingInputCount: 0,
      missingOutputCount: 0,
    }));
  return points
    .map((point) => ({
      observedAt: point.observedAt,
      timestamp: new Date(point.observedAt).getTime(),
      unitAskCopper: BigInt(point.unitAskCopper),
      grossRevenueCopper: optionalBigInt(point.grossRevenueCopper),
      netRevenueCopper: optionalBigInt(point.netRevenueCopper),
      reagentCostCopper: optionalBigInt(point.reagentCostCopper),
      profitCopper: optionalBigInt(point.profitCopper),
      availableQuantity: point.availableQuantity,
      listingCount: point.listingCount,
      missingInputCount: point.missingInputCount,
      missingOutputCount: point.missingOutputCount,
    }))
    .filter((point) => Number.isFinite(point.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);
}

function chartValue(point: HistoryPoint, mode: ChartMode): bigint | null {
  if (mode === "ask") return point.unitAskCopper;
  if (mode === "net") return point.netRevenueCopper;
  return point.profitCopper;
}

function summarizeRange(
  valuedPoints: readonly (HistoryPoint & { readonly chartValue: bigint })[],
  points: readonly HistoryPoint[],
  mode: ChartMode,
): {
  readonly low: string;
  readonly median: string;
  readonly high: string;
  readonly change: string;
  readonly vsMedian: string;
  readonly trend: string;
  readonly supplyChange: string;
} {
  if (valuedPoints.length === 0) {
    return {
      low: "n/a",
      median: "n/a",
      high: "n/a",
      change: "n/a",
      vsMedian: "n/a",
      trend: "n/a",
      supplyChange: "n/a",
    };
  }
  const values = valuedPoints.map((point) => point.chartValue);
  const first = valuedPoints[0]!.chartValue;
  const last = valuedPoints.at(-1)!.chartValue;
  const median = medianBigInt(values);
  const firstSupply = points[0]?.availableQuantity;
  const lastSupply = points.at(-1)?.availableQuantity;
  return {
    low: formatCompactGold(minimumBigInt(values)),
    median: formatCompactGold(median),
    high: formatCompactGold(maximumBigInt(values)),
    change:
      valuedPoints.length < 2
        ? "Need 2 scans"
        : mode === "profit"
          ? formatSignedGold(last - first)
          : formatPercentDifference(last, first),
    vsMedian:
      mode === "profit" ? formatSignedGold(last - median) : formatPercentDifference(last, median),
    trend:
      valuedPoints.length < 2
        ? "Need 2 scans"
        : last > first
          ? "Up"
          : last < first
            ? "Down"
            : "Flat",
    supplyChange:
      firstSupply === undefined || lastSupply === undefined || points.length < 2
        ? "Need 2 scans"
        : formatSignedInteger(lastSupply - firstSupply),
  };
}

function robustBand(values: readonly bigint[]): {
  readonly lower: bigint;
  readonly normal: bigint;
  readonly upper: bigint;
} {
  const normal = medianBigInt(values);
  const deviation = medianBigInt(values.map((value) => absoluteBigInt(value - normal)));
  const radius = maximumBigInt(1n, maximumBigInt(absoluteBigInt(normal) / 20n, deviation * 2n));
  return { lower: normal - radius, normal, upper: normal + radius };
}

function previousKnownProfit(points: readonly HistoryPoint[], timestamp: number): bigint | null {
  return (
    points.filter((point) => point.timestamp < timestamp && point.profitCopper !== null).at(-1)
      ?.profitCopper ?? null
  );
}

function renderGapLabels(
  points: readonly HistoryPoint[],
  xFor: (timestamp: number) => number,
): React.JSX.Element[] {
  return points.slice(1).flatMap((point, index) => {
    const previous = points[index]!;
    if (point.timestamp - previous.timestamp <= GAP_THRESHOLD_MS) return [];
    const midpoint = previous.timestamp + (point.timestamp - previous.timestamp) / 2;
    return [
      <text
        className="market-history-gap-label"
        key={`gap-${previous.observedAt}-${point.observedAt}`}
        textAnchor="middle"
        x={xFor(midpoint)}
        y={PRICE_BOTTOM - 5}
      >
        no scans
      </text>,
    ];
  });
}

function pointAccessibleLabel(
  point: HistoryPoint,
  history: MarketOpportunityHistory | null,
  signal: MarketPriceSignal,
): string {
  const parts = [
    formatTooltipTime(point.timestamp),
    `unit ask ${formatCompactGold(point.unitAskCopper)}`,
    `${point.availableQuantity} listed across ${point.listingCount} listings`,
  ];
  if (point.netRevenueCopper !== null)
    parts.push(`net output ${formatCompactGold(point.netRevenueCopper)}`);
  if (point.reagentCostCopper !== null)
    parts.push(`reagents ${formatCompactGold(point.reagentCostCopper)}`);
  if (point.profitCopper !== null)
    parts.push(`craft profit ${formatCompactGold(point.profitCopper)}`);
  if (signal.status === "collecting") parts.push(`${signal.label}, guidance locked`);
  if (history && point.profitCopper === null) parts.push("same-scan economics incomplete");
  return parts.join(", ");
}

function countGaps(points: readonly HistoryPoint[]): number {
  return points
    .slice(1)
    .filter((point, index) => point.timestamp - points[index]!.timestamp > GAP_THRESHOLD_MS).length;
}

function timeTicks(start: number, end: number): readonly number[] {
  return [start, start + (end - start) / 2, end];
}

function formatAxisTime(timestamp: number, range: ChartRange): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: range === "30m" || range === "24h" ? undefined : "2-digit",
    month: range === "30m" || range === "24h" ? undefined : "short",
    hour: range === "7d" || range === "30d" ? undefined : "2-digit",
    minute: range === "7d" || range === "30d" ? undefined : "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function formatTooltipTime(timestamp: number): string {
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(timestamp))} UTC`;
}

function formatPercentDifference(value: bigint, reference: bigint): string {
  if (reference === 0n) return "n/a";
  const basisPoints = ((value - reference) * 10_000n) / absoluteBigInt(reference);
  const sign = basisPoints > 0n ? "+" : basisPoints < 0n ? "−" : "";
  const absolute = absoluteBigInt(basisPoints);
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}%`;
}

function formatSignedGold(value: bigint): string {
  return `${value > 0n ? "+" : ""}${formatCompactGold(value)}`;
}

function formatSignedInteger(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

function formatBasisPoints(value: number): string {
  const whole = Math.floor(value / 100);
  const fraction = String(value % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}%`;
}

function modeLabel(mode: ChartMode): string {
  if (mode === "ask") return "Unit asking price";
  if (mode === "net") return "Net output per craft";
  return "Indicative profit per craft";
}

function optionalBigInt(value: string | null): bigint | null {
  return value === null ? null : BigInt(value);
}

function medianBigInt(values: readonly bigint[]): bigint {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2n;
}

function minimumBigInt(values: readonly bigint[]): bigint {
  return values.reduce((minimum, value) => (value < minimum ? value : minimum));
}

function maximumBigInt(left: bigint, right: bigint): bigint;
function maximumBigInt(values: readonly bigint[]): bigint;
function maximumBigInt(leftOrValues: bigint | readonly bigint[], right?: bigint): bigint {
  if (typeof leftOrValues === "bigint") return leftOrValues > right! ? leftOrValues : right!;
  return leftOrValues.reduce((maximum, value) => (value > maximum ? value : maximum));
}

function absoluteBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}
