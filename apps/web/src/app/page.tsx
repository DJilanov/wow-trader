import type { Metadata } from "next";

import { HelperSelection } from "../components/helper-selection";
import { createHelperMetadata } from "../lib/seo";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever & TBC Database Tools",
  description:
    "Choose WoW Forever or TBC tools for audited item data, profession recipes, crafting routes, and Auction House intelligence from KFC Helper.",
  path: "/",
  keywords: ["WoW Forever tools", "TBC database", "WoW Trader", "WoW Encyclopedia"],
});

export default function HelperHomePage(): React.JSX.Element {
  return (
    <HelperSelection
      eyebrow="KFC Guild helper"
      title="Choose your Azeroth"
      description="Every database and market calculation is tied to the game build you select. Pick a version to continue."
      options={[
        {
          title: "The Burning Crusade",
          eyebrow: "Anniversary realms",
          description:
            "Live catalog, profession archive, and Spineshatter Auction House intelligence.",
          status: "Live now",
          image: { src: "/wow-assets/games/tbc-logo.png", kind: "logo" },
          tone: "tbc",
          href: "/tbc",
        },
        {
          title: "WoW Forever",
          eyebrow: "New game data",
          description:
            "The product shell is ready. Catalog extraction begins against the public client build.",
          status: "Preparing",
          image: { src: "/wow-assets/games/forever-logo.jpg", kind: "logo" },
          tone: "forever",
          href: "/forever",
        },
      ]}
    />
  );
}
