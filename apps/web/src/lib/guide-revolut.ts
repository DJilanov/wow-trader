import { z } from "zod";
import { GUIDE_SUPPORT_AMOUNT, GUIDE_SUPPORT_CURRENCY } from "./guide-access-config";

export interface GuideRevolutSettings {
  readonly environment: "sandbox" | "production";
  readonly apiKey: string;
}

export const guideRevolutOrderSchema = z.object({
  id: z.guid(),
  state: z.string(),
  amount: z.number().int().nonnegative(),
  currency: z.string(),
  outstanding_amount: z.number().int().nonnegative().optional(),
  refunded_amount: z.number().int().nonnegative().optional(),
  checkout_url: z.url().optional(),
  merchant_order_data: z.object({ reference: z.string() }),
});
export type GuideRevolutOrder = z.infer<typeof guideRevolutOrderSchema>;

export function guideRevolutSettings(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GuideRevolutSettings | null {
  const mode = environment.GUIDE_REVOLUT_ENVIRONMENT;
  const apiKey = environment.GUIDE_REVOLUT_API_KEY || "";
  if (environment.NODE_ENV === "production" && mode !== "production") return null;
  return (mode === "sandbox" || mode === "production") && apiKey.trim()
    ? { environment: mode, apiKey }
    : null;
}

export function guideCheckoutUrl(
  value: string,
  environment: GuideRevolutSettings["environment"],
): string | null {
  try {
    const url = new URL(value);
    const host =
      environment === "production" ? "checkout.revolut.com" : "sandbox-checkout.revolut.com";
    return url.protocol === "https:" &&
      url.hostname === host &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname.startsWith("/payment-link/")
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function isSettledGuidePayment(
  order: GuideRevolutOrder,
  localId: string,
  providerId: string,
): boolean {
  return (
    order.id === providerId &&
    order.merchant_order_data.reference === `kfc-guide:${localId}` &&
    order.amount === GUIDE_SUPPORT_AMOUNT &&
    order.currency === GUIDE_SUPPORT_CURRENCY &&
    order.state === "completed" &&
    order.outstanding_amount === 0 &&
    order.refunded_amount === 0
  );
}

export async function requestGuideRevolutOrder(
  settings: GuideRevolutSettings,
  input: { readonly id: string; readonly redirectUrl: string } | { readonly providerId: string },
  fetcher: typeof fetch = fetch,
): Promise<GuideRevolutOrder> {
  const creation = "id" in input;
  const host =
    settings.environment === "production" ? "merchant.revolut.com" : "sandbox-merchant.revolut.com";
  const response = await fetcher(
    `https://${host}/api/orders${creation ? "" : `/${encodeURIComponent(input.providerId)}`}`,
    {
      method: creation ? "POST" : "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Revolut-Api-Version": "2026-08-17",
      },
      ...(creation
        ? {
            body: JSON.stringify({
              amount: GUIDE_SUPPORT_AMOUNT,
              currency: GUIDE_SUPPORT_CURRENCY,
              capture_mode: "automatic",
              description: "KFC guide supporter access - one-time USD 9.99",
              merchant_order_data: { reference: `kfc-guide:${input.id}` },
              redirect_url: input.redirectUrl,
            }),
          }
        : {}),
    },
  );
  if (!response.ok) throw new Error(`Guide payment provider unavailable (${response.status})`);
  return guideRevolutOrderSchema.parse(await response.json());
}
