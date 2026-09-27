import type { Metadata } from "next";

import {
  TraderWorkspacePage,
  type TraderWorkspacePageProps,
} from "../../../components/trader-workspace-page";
import { TBC_CLIENT_PRODUCT } from "../../../lib/game-versions";
import { createHelperMetadata } from "../../../lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: TraderWorkspacePageProps): Promise<Metadata> {
  const raw = await searchParams;
  const hasFilters = Object.values(raw).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
  return createHelperMetadata({
    title: "TBC Auction House Prices and Crafting Profit Calculator",
    description:
      "Search TBC Auction House item prices and historical ranges, then compare crafting profit, vendor value, disenchant returns, specializations, and alt crafting.",
    path: "/tbc/trader",
    keywords: [
      "TBC Auction House calculator",
      "TBC Auction House prices",
      "TBC item price history",
      "TBC crafting profit",
      "TBC gold making",
      "TBC disenchant calculator",
      "TBC profession profit",
    ],
    noIndex: hasFilters,
  });
}

export default function TbcTraderPage(props: TraderWorkspacePageProps): Promise<React.JSX.Element> {
  return TraderWorkspacePage({
    ...props,
    config: {
      clientProduct: TBC_CLIENT_PRODUCT,
      gameLabel: "TBC",
      eyebrow: "TBC market workspace",
      basePath: "/tbc/trader",
      encyclopediaRecipePath: "/tbc/encyclopedia/recipes",
      encyclopediaItemPath: "/tbc/encyclopedia/items",
      marketBasePath: "/tbc/markets",
      opportunityApiBasePath: "/api/v1/tbc/opportunity-details",
      collectorPath: null,
      displayRegion: (region) => region.toUpperCase(),
      specializationCopy: "supported",
    },
  });
}
