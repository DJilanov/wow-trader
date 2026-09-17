import type { Metadata } from "next";
import Link from "next/link";

import { HelperSelection } from "../../components/helper-selection";
import { JsonLd } from "../../components/json-ld";
import { createHelperMetadata, HELPER_SITE_URL } from "../../lib/seo";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Database, Professions & Auction House Tools",
  description:
    "Explore KFC Helper's WoW Forever talent calculator, spellbooks, racials, class abilities, and Legacy perks while the item and economy archive awaits the public client.",
  path: "/forever",
  keywords: [
    "WoW Forever database",
    "WoW Forever items",
    "WoW Forever professions",
    "WoW Forever recipes",
    "WoW Forever Auction House",
  ],
});

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${HELPER_SITE_URL}/forever#webpage`,
  url: `${HELPER_SITE_URL}/forever`,
  name: "WoW Forever Database, Professions & Auction House Tools",
  description:
    "The KFC Helper home for WoW Forever talents, spellbooks, racials, Legacy perks, items, recipes, professions, crafting, and Auction House data.",
  isPartOf: { "@id": `${HELPER_SITE_URL}/#website` },
  about: {
    "@type": "VideoGame",
    name: "World of Warcraft: Forever",
    sameAs:
      "https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever",
  },
};

export default function ForeverHelperPage(): React.JSX.Element {
  return (
    <>
      <JsonLd data={structuredData} />
      <HelperSelection
        eyebrow="WoW Forever · preview archive"
        title="Explore what we know before release"
        description="The talent and spellbook archive is live from reviewed public demo evidence. Trader remains locked until a real public client catalog and Auction House scan exist."
        backHref="/"
        backLabel="Change game"
        options={[
          {
            title: "Trader",
            eyebrow: "Market intelligence",
            description:
              "Crafting routes and price signals will activate after catalog publication and the first valid Auction House scan.",
            status: "Awaiting catalog + scan",
            image: { src: "/wow-assets/tools/trader.jpg", kind: "icon" },
            tone: "trader",
          },
          {
            title: "Encyclopedia",
            eyebrow: "Talents and spellbooks",
            description:
              "Build talent trees, browse captured spellbooks, and compare racials, class abilities, Legacy perks, and source changes.",
            status: "Preview archive live",
            image: { src: "/wow-assets/tools/encyclopedia.jpg", kind: "icon" },
            tone: "encyclopedia",
            href: "/forever/encyclopedia",
          },
        ]}
      />
      <section className="detail-grid" aria-label="WoW Forever data readiness">
        <div className="panel">
          <span className="eyebrow">Preview evidence available now</span>
          <h2>Builds, spellbooks, racials, and Legacy</h2>
          <p>
            The Encyclopedia preserves the public BlizzCon demo export as an immutable snapshot.
            Every estimate and incomplete record stays visibly labeled, while shared talent builds
            remain tied to the exact source snapshot used to create them.
          </p>
          <Link href="/forever/encyclopedia">Open the Forever Encyclopedia →</Link>
        </div>
        <div className="panel">
          <span className="eyebrow">Economy after evidence</span>
          <h2>How the WoW Forever Trader will activate</h2>
          <p>
            Auction House values begin only after a valid in-game scan. Crafting, vendoring,
            disenchanting, and cross-profession routes will remain explainable, while cooldowns and
            unsupported mechanics are excluded or clearly labeled instead of estimated as facts.
          </p>
          <a
            href="https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read Blizzard&apos;s official WoW Forever announcement →
          </a>
        </div>
      </section>
    </>
  );
}
