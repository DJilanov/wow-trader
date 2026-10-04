import type { Metadata } from "next";
import Link from "next/link";

import { HelperSelection } from "../../components/helper-selection";
import { JsonLd } from "../../components/json-ld";
import { createHelperMetadata, HELPER_SITE_URL } from "../../lib/seo";

export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Database, Professions & Auction House Tools",
  description:
    "Explore WoW Forever Auction House scans, the WoW Trader Collector, talent calculator, spellbooks, racials, class abilities, Legacy perks, maps, quests, and bosses.",
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
        eyebrow="WoW Forever · live beta tools"
        title="Explore, trade or find your path"
        description="Choose your leveling journey, browse the Forever Encyclopedia or inspect accepted Auction House scans from the native WoW Trader Collector."
        backHref="/"
        backLabel="Change game"
        options={[
          {
            title: "Leveling",
            eyebrow: "Your path through Azeroth",
            description:
              "Choose your faction, race and pace. Browse small quest brackets through level 60 with transparent source coverage.",
            status: "Chapter browser · local progress",
            image: { src: "/wow-assets/games/forever-logo.jpg", kind: "logo" },
            tone: "leveling",
            href: "/forever/leveling",
          },
          {
            title: "Trader",
            eyebrow: "Market intelligence",
            description:
              "Inspect live market depth now. Crafting routes activate only when the exact matching item and recipe catalog passes review.",
            status: "First market scan live",
            image: { src: "/wow-assets/tools/trader.jpg", kind: "icon" },
            tone: "trader",
            href: "/forever/trader",
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
      <section className="collector-promo" aria-labelledby="collector-promo-heading">
        <div>
          <span className="eyebrow">Contribute market data</span>
          <h2 id="collector-promo-heading">WoW Trader Collector + Companion</h2>
          <p>
            Install the in-game scanner, let the Companion detect completed SavedVariables, and
            share build-aware Auction House prices without entering your Battle.net credentials.
          </p>
        </div>
        <Link href="/forever/addon">Download the Collector →</Link>
      </section>
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
          <span className="eyebrow">Economy with evidence</span>
          <h2>The first Forever market is live</h2>
          <p>
            Accepted in-game prices and listing depth are available now. Crafting, vendoring,
            disenchanting, and cross-profession rankings stay behind the exact-build catalog gate;
            cooldowns and unsupported mechanics remain excluded instead of estimated as facts.
          </p>
          <Link href="/forever/trader">Open the Forever Trader →</Link>
        </div>
      </section>
    </>
  );
}
