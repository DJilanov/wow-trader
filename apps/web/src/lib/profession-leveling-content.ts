import type { Metadata } from "next";
import { createHelperMetadata, helperAbsoluteUrl } from "./seo";

export const PROFESSION_LEVELING_PATH = "/forever/trader/leveling";

export const PROFESSION_LEVELING_PROFESSIONS = [
  { slug: "alchemy", name: "Alchemy" },
  { slug: "blacksmithing", name: "Blacksmithing" },
  { slug: "cooking", name: "Cooking" },
  { slug: "enchanting", name: "Enchanting" },
  { slug: "engineering", name: "Engineering" },
  { slug: "first-aid", name: "First Aid" },
  { slug: "leatherworking", name: "Leatherworking" },
  { slug: "mining", name: "Mining · smelting" },
  { slug: "tailoring", name: "Tailoring" },
] as const;

export const PROFESSION_LEVELING_QUESTIONS = [
  {
    question: "How do I find a cheaper profession leveling route?",
    answer:
      "Choose your profession and Auction House, set your current and target skill, then mark recipes you already know. The calculator compares crafts using reagent prices and one-time recipe costs, and gives you a crafting order and shopping list. You can plan any range within skill 1–300.",
  },
  {
    question: "Are recipe purchases and trainer fees included?",
    answer:
      "Yes, when their prices and learning requirements are available. A recipe purchase or learning fee is charged once across the route. Already learned recipes have no new learning cost. If a fee or required skill is missing, enter it under Known recipes & learning costs; unknown costs are excluded rather than treated as free.",
  },
  {
    question: "Does it use my realm’s Auction House prices?",
    answer:
      "It uses the selected realm and faction’s accepted Auction House scan and its matching game-build catalog. The scan time is shown beside the market selector. Prices, available quantities and whole auction stacks affect the result, so refresh your scan before buying materials.",
  },
  {
    question: "Are yellow and green skill-ups guaranteed?",
    answer:
      "No. The yellow/green strategy uses estimated skill-up chances, so actual craft counts can differ. Choose orange recipes to avoid that probability estimate. Check your skill after each step and recalculate when your progress differs from the plan.",
  },
  {
    question: "What is outside the cost estimate?",
    answer:
      "Profession rank upgrades, tools and travel are extra. The calculator prices vendor reagents from the Auction House and does not assume materials already in your bags. It compares a bounded set of routes rather than guaranteeing a global minimum. Mining covers smelting, not gathering routes; Herbalism and Skinning are not supported.",
  },
  {
    question: "Does the route account for vendor and disenchant returns?",
    answer:
      "Yes. Vendor returns are deducted by default. Choose best of vendor / disenchant to compare estimated material-sale proceeds after Auction House cut and your disenchant fee. Set the available Enchanting skill and whether this character or another player disenchants. Bound items require this character. Only leftover crafted outputs count; ingredients reused later are not sold twice. Missing evidence or prices fall back to vendor value. The shopping budget is shown separately because you pay before recovering value.",
  },
] as const;

const title = "WoW Forever Profession Leveling Calculator (1–300)";
const description =
  "Plan WoW Forever profession leveling with Auction House prices, one-time recipe costs and a crafting shopping list. Compare routes for your skill and budget.";
const baseMetadata = createHelperMetadata({
  title,
  description,
  path: PROFESSION_LEVELING_PATH,
  keywords: [
    "WoW Forever profession leveling",
    "WoW Forever crafting calculator",
    "WoW Forever profession guide 1-300",
  ],
});
const shareImage = helperAbsoluteUrl("/og/profession-leveling");

export const PROFESSION_LEVELING_METADATA: Metadata = {
  ...baseMetadata,
  openGraph: {
    ...baseMetadata.openGraph,
    images: [{ url: shareImage, width: 1200, height: 630, alt: title }],
  },
  twitter: { ...baseMetadata.twitter, images: [shareImage] },
};

export const PROFESSION_LEVELING_STRUCTURED_DATA: Readonly<Record<string, unknown>> = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${helperAbsoluteUrl(PROFESSION_LEVELING_PATH)}#webpage`,
  name: title,
  description,
  url: helperAbsoluteUrl(PROFESSION_LEVELING_PATH),
  isPartOf: { "@id": `${helperAbsoluteUrl("/")}#website` },
  about: { "@type": "Thing", name: "WoW Forever profession leveling" },
};
