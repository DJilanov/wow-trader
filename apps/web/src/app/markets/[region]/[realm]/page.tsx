import { permanentRedirect } from "next/navigation";

import type { MarketPageProps } from "../../../../components/market-overview-page";

export default async function LegacyMarketPage({ params }: MarketPageProps): Promise<never> {
  const { region, realm } = await params;
  permanentRedirect(`/tbc/markets/${encodeURIComponent(region)}/${encodeURIComponent(realm)}`);
}
