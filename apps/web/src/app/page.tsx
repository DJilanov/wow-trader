import type { Metadata } from "next";
import Link from "next/link";

import { HelperSelection } from "../components/helper-selection";
import { JsonLd } from "../components/json-ld";
import { createHelperMetadata, helperAbsoluteUrl, HELPER_SITE_URL } from "../lib/seo";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever & TBC Database Tools",
  description:
    "Choose WoW Forever or TBC tools for audited item data, profession recipes, crafting routes, and Auction House intelligence from KFC Helper.",
  path: "/",
  keywords: ["WoW Forever tools", "TBC database", "WoW Trader", "WoW Encyclopedia"],
});

const featuredTools = [
  {
    title: "WoW Forever leveling",
    description:
      "Plan solo, relaxed, or group routes with explicit source coverage and progress saved in your browser.",
    href: "/forever/leveling",
  },
  {
    title: "Talent calculators and simulator",
    description:
      "Explore all nine classes, share talent builds, inspect spellbooks, and compare reviewed combat models.",
    href: "/forever/simulator",
  },
  {
    title: "WoW Forever Encyclopedia",
    description:
      "Search build-aware items, recipes, professions, maps, quests, NPCs, objects, instances, and bosses.",
    href: "/forever/encyclopedia",
  },
  {
    title: "Auction House and crafting tools",
    description:
      "Compare exact-build market scans, supply, material costs, and explainable crafting opportunities.",
    href: "/forever/trader",
  },
  {
    title: "Collector and public data",
    description:
      "Install the scanner and Companion, then inspect publication, coverage, and evidence status.",
    href: "/forever/addon",
  },
  {
    title: "TBC database and Trader",
    description:
      "Keep Anniversary item, recipe, profession, market, and gear references separate from Forever data.",
    href: "/tbc",
  },
] as const;

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": `${HELPER_SITE_URL}#page`,
  url: HELPER_SITE_URL,
  name: "WoW Forever and TBC tools",
  description:
    "Build-aware WoW Forever and TBC leveling, talent, database, profession, crafting, and Auction House tools.",
  isPartOf: { "@id": `${HELPER_SITE_URL}#website` },
  mainEntity: {
    "@type": "ItemList",
    itemListElement: featuredTools.map((tool, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: tool.title,
      url: helperAbsoluteUrl(tool.href),
    })),
  },
};

export default function HelperHomePage(): React.JSX.Element {
  return (
    <>
      <JsonLd data={structuredData} />
      <HelperSelection
        eyebrow="KFC Guild helper"
        title="WoW Forever and TBC tools"
        description="Every database and market calculation is tied to the game build you select. Choose an edition for its leveling, talents, world data, professions, and Auction House tools."
        options={[
          {
            title: "WoW Forever",
            eyebrow: "Live beta tools",
            description:
              "Published catalog, leveling routes, talents, simulator, world reference, and exact-build Auction House intelligence.",
            status: "Live now",
            image: { src: "/wow-assets/games/forever-logo.jpg", kind: "logo" },
            tone: "forever",
            href: "/forever",
          },
          {
            title: "The Burning Crusade",
            eyebrow: "Anniversary realms",
            description:
              "Live catalog, profession archive, crafting calculator, gear reference, and Spineshatter market data.",
            status: "Live now",
            image: { src: "/wow-assets/games/tbc-logo.png", kind: "logo" },
            tone: "tbc",
            href: "/tbc",
          },
        ]}
      />
      <section className="detail-grid" aria-label="Featured World of Warcraft tools">
        {featuredTools.map((tool) => (
          <article className="panel" key={tool.href}>
            <h2>{tool.title}</h2>
            <p>{tool.description}</p>
            <Link href={tool.href}>Open {tool.title} →</Link>
          </article>
        ))}
      </section>
    </>
  );
}
