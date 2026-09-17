import type { Metadata } from "next";

import { HelperSelection } from "../../components/helper-selection";
import { createHelperMetadata } from "../../lib/seo";

export const metadata: Metadata = createHelperMetadata({
  title: "TBC Classic Trader & Item Database",
  description:
    "Open the TBC Trader or search 30,000+ audited items, recipes, professions, reagents, crafting chains, and game IDs in the KFC Helper Encyclopedia.",
  path: "/tbc",
  keywords: [
    "TBC Classic database",
    "TBC item database",
    "TBC profession recipes",
    "TBC Auction House calculator",
  ],
});

export default function TbcHelperPage(): React.JSX.Element {
  return (
    <HelperSelection
      eyebrow="The Burning Crusade · build-aware"
      title="How can we help?"
      description="Use live market data to decide what to craft, or search the extracted game catalog without market noise."
      backHref="/"
      backLabel="Change game"
      options={[
        {
          title: "Trader",
          eyebrow: "Auction House intelligence",
          description:
            "Compare crafting, alt-material chains, disenchanting, vendoring, and Auction House exits.",
          status: "Open workbench",
          image: { src: "/wow-assets/tools/trader.jpg", kind: "icon" },
          tone: "trader",
          href: "/tbc/trader",
        },
        {
          title: "Encyclopedia",
          eyebrow: "30,000+ client records",
          description:
            "Search items, recipes, professions, IDs, reagents, outputs, and learning relationships.",
          status: "Open archive",
          image: { src: "/wow-assets/tools/encyclopedia.jpg", kind: "icon" },
          tone: "encyclopedia",
          href: "/tbc/encyclopedia",
        },
      ]}
    />
  );
}
