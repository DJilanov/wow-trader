import type { Metadata } from "next";

import {
  TraderWorkspacePage,
  type TraderWorkspacePageProps,
} from "../../../components/trader-workspace-page";
import { FOREVER_CLIENT_PRODUCT } from "../../../lib/game-versions";
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
    title: "WoW Forever Auction House Prices and Crafting Profit",
    description:
      "Search WoW Forever Auction House items, compare current prices with historical normal ranges, and find profitable crafting, vendor, and disenchant opportunities.",
    path: "/forever/trader",
    keywords: [
      "WoW Forever Auction House",
      "WoW Forever item prices",
      "WoW Forever price history",
      "WoW Forever crafting profit",
      "WoW Forever gold making",
      "WoW Forever profession calculator",
    ],
    noIndex: hasFilters,
  });
}

export default function ForeverTraderPage(
  props: TraderWorkspacePageProps,
): Promise<React.JSX.Element> {
  return TraderWorkspacePage({
    ...props,
    config: {
      clientProduct: FOREVER_CLIENT_PRODUCT,
      gameLabel: "WoW Forever",
      eyebrow: "WoW Forever market workspace",
      basePath: "/forever/trader",
      encyclopediaRecipePath: null,
      encyclopediaItemPath: null,
      marketBasePath: "/forever/markets",
      opportunityApiBasePath: "/api/v1/forever/opportunity-details",
      collectorPath: "/forever/addon",
      displayRegion: (region) => (region.toUpperCase() === "UNKNOWN" ? "Forever Beta" : region),
      specializationCopy: "unverified",
    },
  });
}
