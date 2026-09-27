import type { Metadata } from "next";

import {
  isSafeMarketRouteValue,
  MarketOverviewPage,
  type MarketPageProps,
} from "../../../../../components/market-overview-page";
import { FOREVER_CLIENT_PRODUCT } from "../../../../../lib/game-versions";
import { createHelperMetadata } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

function displayForeverRegion(region: string): string {
  return region.toUpperCase() === "UNKNOWN" ? "Forever Beta" : region.toUpperCase();
}

export async function generateMetadata({ params }: MarketPageProps): Promise<Metadata> {
  const { region, realm } = await params;
  return createHelperMetadata({
    title: `${realm} WoW Forever Auction House`,
    description: `Latest accepted WoW Forever Auction House scan for ${realm}, with item prices, quantities, listing depth, and exact client-build provenance.`,
    path: `/forever/markets/${encodeURIComponent(region)}/${encodeURIComponent(realm)}`,
    keywords: [`${realm} Auction House`, "WoW Forever prices", "WoW Forever Auction House"],
    noIndex: !isSafeMarketRouteValue(region) || !isSafeMarketRouteValue(realm),
  });
}

export default function ForeverMarketPage(props: MarketPageProps): Promise<React.JSX.Element> {
  return MarketOverviewPage({
    ...props,
    config: {
      clientProduct: FOREVER_CLIENT_PRODUCT,
      gameLabel: "WoW Forever",
      traderPath: "/forever/trader",
      itemBasePath: null,
      displayRegion: displayForeverRegion,
    },
  });
}
