export interface LedgerTrade {
  readonly eventId: string;
  readonly product: string;
  readonly market: string;
  readonly characterName: string;
  readonly itemId: number;
  readonly quantity: number;
  readonly kind: "purchase" | "sale" | "expired" | "cancelled" | "deposit_paid";
  readonly amountCopper: string;
  readonly auctionFeeCopper: string | null;
  readonly depositCopper: string | null;
  readonly occurredAt: string;
  readonly postedAt?: string | null;
  readonly evidence: "mail_receipt" | "manual";
}
export interface TradeLedgerSummary {
  readonly purchaseCostCopper: bigint;
  readonly grossSalesCopper: bigint;
  readonly knownSaleFeesCopper: bigint;
  readonly knownExpiredDepositsCopper: bigint;
  readonly matchedMarginCopper: bigint;
  readonly matchedUnits: number;
  readonly unmatchedSaleUnits: number;
  readonly saleUnitsWithUnknownFees: number;
  readonly expiryEventsWithUnknownDeposits: number;
  readonly purchasedUnits: number;
  readonly soldUnits: number;
  readonly manualEvents: number;
  readonly confirmedMailEvents: number;
}

export function summarizeTradeLedger(events: readonly LedgerTrade[]): TradeLedgerSummary {
  let purchaseCostCopper = 0n,
    grossSalesCopper = 0n,
    knownSaleFeesCopper = 0n,
    knownExpiredDepositsCopper = 0n,
    matchedMarginCopper = 0n;
  let matchedUnits = 0,
    unmatchedSaleUnits = 0,
    saleUnitsWithUnknownFees = 0,
    expiryEventsWithUnknownDeposits = 0,
    purchasedUnits = 0,
    soldUnits = 0,
    manualEvents = 0,
    confirmedMailEvents = 0;
  const stock = new Map<string, { quantity: number; cost: bigint }[]>();
  const seen = new Set<string>();
  for (const event of [...events].sort(
    (a, b) =>
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.eventId.localeCompare(b.eventId),
  )) {
    if (seen.has(event.eventId)) continue;
    seen.add(event.eventId);
    if (
      !Number.isSafeInteger(event.quantity) ||
      event.quantity < 1 ||
      !Number.isFinite(Date.parse(event.occurredAt))
    )
      throw new RangeError("Invalid ledger event");
    const amount = BigInt(event.amountCopper);
    if (amount < 0n) throw new RangeError("Negative ledger amount");
    if (event.evidence === "manual") manualEvents++;
    else confirmedMailEvents++;
    const key = `${event.product}:${event.market}:${event.characterName.toLowerCase()}:${event.itemId}`;
    const lots = stock.get(key) ?? [];
    if (event.kind === "purchase") {
      purchaseCostCopper += amount;
      purchasedUnits += event.quantity;
      lots.push({ quantity: event.quantity, cost: amount });
      stock.set(key, lots);
    } else if (event.kind === "sale") {
      grossSalesCopper += amount;
      soldUnits += event.quantity;
      const fee = event.auctionFeeCopper === null ? null : BigInt(event.auctionFeeCopper);
      if (fee !== null && (fee < 0n || fee > amount))
        throw new RangeError("Invalid recorded sale fee");
      if (fee !== null) knownSaleFeesCopper += fee;
      else saleUnitsWithUnknownFees += event.quantity;
      let remaining = event.quantity,
        cost = 0n;
      while (remaining && lots.length) {
        const lot = lots[0]!;
        const used = Math.min(remaining, lot.quantity);
        const allocated =
          used === lot.quantity
            ? lot.cost
            : (lot.cost * BigInt(used) + BigInt(lot.quantity) - 1n) / BigInt(lot.quantity);
        cost += allocated;
        lot.cost -= allocated;
        lot.quantity -= used;
        remaining -= used;
        if (!lot.quantity) lots.shift();
      }
      const matched = event.quantity - remaining;
      unmatchedSaleUnits += remaining;
      if (fee !== null && matched > 0) {
        matchedUnits += matched;
        matchedMarginCopper += ((amount - fee) * BigInt(matched)) / BigInt(event.quantity) - cost;
      }
    } else if (event.kind === "expired" || event.kind === "cancelled") {
      if (event.depositCopper === null) expiryEventsWithUnknownDeposits++;
      else {
        const deposit = BigInt(event.depositCopper);
        if (deposit < 0n) throw new RangeError("Invalid deposit");
        knownExpiredDepositsCopper += deposit;
      }
    }
  }
  return {
    purchaseCostCopper,
    grossSalesCopper,
    knownSaleFeesCopper,
    knownExpiredDepositsCopper,
    matchedMarginCopper: matchedMarginCopper - knownExpiredDepositsCopper,
    matchedUnits,
    unmatchedSaleUnits,
    saleUnitsWithUnknownFees,
    expiryEventsWithUnknownDeposits,
    purchasedUnits,
    soldUnits,
    manualEvents,
    confirmedMailEvents,
  };
}
