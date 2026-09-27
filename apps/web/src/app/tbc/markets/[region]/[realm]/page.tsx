import type { Metadata } from "next";

import {
  isSafeMarketRouteValue,
  MarketOverviewPage,
  type MarketPageProps,
} from "../../../../../components/market-overview-page";
import { TBC_CLIENT_PRODUCT } from "../../../../../lib/game-versions";
import { createHelperMetadata } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: MarketPageProps): Promise<Metadata> {
  const { region, realm } = await params;
  return createHelperMetadata({
    title: `${realm} ${region.toUpperCase()} TBC Auction House`,
    description: `Latest accepted TBC Auction House scan for ${realm} ${region.toUpperCase()}, with item prices, available quantity, listing depth, and build provenance.`,
    path: `/tbc/markets/${encodeURIComponent(region)}/${encodeURIComponent(realm)}`,
    keywords: [`${realm} Auction House`, `${realm} TBC prices`, "TBC Auction House"],
    noIndex: !isSafeMarketRouteValue(region) || !isSafeMarketRouteValue(realm),
  });
}

export default function TbcMarketPage(props: MarketPageProps): Promise<React.JSX.Element> {
  return MarketOverviewPage({
    ...props,
    config: {
      clientProduct: TBC_CLIENT_PRODUCT,
      gameLabel: "TBC",
      traderPath: "/tbc/trader",
      itemBasePath: "/tbc/encyclopedia/items",
      displayRegion: (region) => region.toUpperCase(),
    },
  });
}
