import { describe, expect, it } from "vitest";
import { summarizeTradeLedger, type LedgerTrade } from "./trade-ledger.js";
let next = 0;
function event(overrides: Partial<LedgerTrade> = {}): LedgerTrade {
  return {
    eventId: String(++next),
    product: "wow_classic_beta",
    clientBuild: 70707,
    market: "EU|Realm|alliance",
    characterName: "Crafter",
    itemId: 1,
    quantity: 3,
    kind: "purchase",
    amountCopper: "100",
    auctionFeeCopper: "0",
    depositCopper: "0",
    occurredAt: "2026-10-30T12:00:00Z",
    evidence: "mail_receipt",
    ...overrides,
  };
}
describe("private actual trade accounting", () => {
  it("allocates partial FIFO costs without losing or creating copper", () => {
    const purchase = event();
    const first = event({
      kind: "sale",
      quantity: 1,
      amountCopper: "100",
      auctionFeeCopper: "5",
      occurredAt: "2026-10-30T13:00:00Z",
    });
    const last = event({
      kind: "sale",
      quantity: 2,
      amountCopper: "200",
      auctionFeeCopper: "10",
      occurredAt: "2026-10-30T14:00:00Z",
    });
    expect(summarizeTradeLedger([last, first, purchase, purchase])).toMatchObject({
      matchedUnits: 3,
      matchedMarginCopper: 185n,
      knownSaleFeesCopper: 15n,
      purchaseCostCopper: 100n,
      soldUnits: 3,
    });
  });
  it("never turns missing fees or purchase costs into profit", () => {
    expect(
      summarizeTradeLedger([
        event(),
        event({ kind: "sale", auctionFeeCopper: null, occurredAt: "2026-10-30T13:00:00Z" }),
      ]),
    ).toMatchObject({ matchedMarginCopper: 0n, matchedUnits: 0, saleUnitsWithUnknownFees: 3 });
    expect(summarizeTradeLedger([event({ kind: "sale" })])).toMatchObject({
      matchedMarginCopper: 0n,
      unmatchedSaleUnits: 3,
    });
  });
  it("keeps game builds, realms and characters separate", () => {
    const purchase = event();
    for (const scope of [
      { clientBuild: 70200 },
      { market: "EU|Other|alliance" },
      { characterName: "Other" },
      { product: "wow_anniversary" },
    ]) {
      expect(
        summarizeTradeLedger([
          purchase,
          event({ kind: "sale", occurredAt: "2026-10-30T13:00:00Z", ...scope }),
        ]).unmatchedSaleUnits,
      ).toBe(3);
    }
  });
  it("records known expiry losses and flags unknown deposits", () => {
    const result = summarizeTradeLedger([
      event({ kind: "expired", depositCopper: "12", evidence: "manual" }),
      event({ kind: "cancelled", depositCopper: null }),
    ]);
    expect(result).toMatchObject({
      knownExpiredDepositsCopper: 12n,
      matchedMarginCopper: -12n,
      expiryEventsWithUnknownDeposits: 1,
      manualEvents: 1,
      confirmedMailEvents: 1,
    });
  });
});
