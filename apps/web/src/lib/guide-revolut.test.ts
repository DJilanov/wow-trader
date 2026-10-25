import { describe, expect, it, vi } from "vitest";
import {
  guideCheckoutUrl,
  guideRevolutSettings,
  isSettledGuidePayment,
  requestGuideRevolutOrder,
  type GuideRevolutOrder,
} from "./guide-revolut";
const id = "2d3c2c3f-3623-456a-9333-0b2c61508bb5";
const providerId = "6516e61c-d279-a454-a837-bc52ce55ed49";
const paid: GuideRevolutOrder = {
  id: providerId,
  state: "completed",
  amount: 999,
  currency: "USD",
  outstanding_amount: 0,
  refunded_amount: 0,
  merchant_order_data: { reference: `kfc-guide:${id}` },
};
describe("fixed-price guide payments", () => {
  it("requires explicit merchant environment and dedicated credentials", () => {
    expect(
      guideRevolutSettings({
        NODE_ENV: "production",
        GUIDE_REVOLUT_ENVIRONMENT: "sandbox",
        GUIDE_REVOLUT_API_KEY: "test",
      }),
    ).toBeNull();
    expect(guideRevolutSettings({ REVOLUT_API_KEY: "other-site-key" })).toBeNull();
    expect(
      guideRevolutSettings({ GUIDE_REVOLUT_ENVIRONMENT: "wrong", GUIDE_REVOLUT_API_KEY: "test" }),
    ).toBeNull();
    expect(
      guideRevolutSettings({ GUIDE_REVOLUT_ENVIRONMENT: "sandbox", GUIDE_REVOLUT_API_KEY: "test" }),
    ).toEqual({ environment: "sandbox", apiKey: "test" });
  });
  it("rejects pending, underpaid, different-currency, refunded and unrelated orders", () => {
    expect(isSettledGuidePayment(paid, id, providerId)).toBe(true);
    for (const delta of [
      { state: "pending" },
      { amount: 998 },
      { currency: "EUR" },
      { outstanding_amount: 1 },
      { refunded_amount: 1 },
      { refunded_amount: undefined },
      { merchant_order_data: { reference: "another-order" } },
      { id },
    ])
      expect(isSettledGuidePayment({ ...paid, ...delta }, id, providerId)).toBe(false);
  });
  it("accepts only genuine environment-specific HTTPS checkout links", () => {
    const url = "https://checkout.revolut.com/payment-link/test";
    expect(guideCheckoutUrl(url, "production")).toBe(url);
    for (const value of [
      url,
      "https://checkout.revolut.com.evil.example/payment-link/test",
      "https://evil.example/payment-link/test",
      "javascript:alert(1)",
      "https://user@checkout.revolut.com/payment-link/test",
      "https://checkout.revolut.com:444/payment-link/test",
    ])
      expect(guideCheckoutUrl(value, "sandbox")).toBeNull();
  });
  it("creates the USD 9.99 order only on the server with exact identity and validates responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(paid));
    await requestGuideRevolutOrder(
      { environment: "sandbox", apiKey: "private-test-key" },
      { id, redirectUrl: "https://kfcguild.online/tools/forever/leveling/access" },
      fetcher,
    );
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://sandbox-merchant.revolut.com/api/orders");
    expect(JSON.parse(String(options?.body))).toMatchObject({
      amount: 999,
      currency: "USD",
      merchant_order_data: { reference: `kfc-guide:${id}` },
    });
    expect(options?.headers).toMatchObject({ Authorization: "Bearer private-test-key" });
    expect(options?.cache).toBe("no-store");
    await expect(
      requestGuideRevolutOrder(
        { environment: "sandbox", apiKey: "test" },
        { providerId },
        vi.fn<typeof fetch>().mockResolvedValue(Response.json({ state: "completed" })),
      ),
    ).rejects.toThrow();
  });
});
