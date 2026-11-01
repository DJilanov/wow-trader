import type { Metadata } from "next";
import { ForeverRaidComposition } from "../../../components/forever-raid-composition";
import { JsonLd } from "../../../components/json-ld";
import { readCompositionCatalog } from "../../../lib/forever-raid-composition-data";
import { createBreadcrumbJsonLd, createHelperMetadata } from "../../../lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = createHelperMetadata({
  title: "WoW Forever Raid Composition Planner — 10, 20 & 40 Players",
  description:
    "Build a 10, 20 or 40 player WoW Forever raid. Compare class and spec counts, plan buffs, assign Sunder, rearrange five-player parties and share your composition.",
  path: "/forever/raid-composition",
  keywords: [
    "WoW Forever raid composition",
    "WoW Forever raid planner",
    "Forever 10 man composition",
    "Forever 20 man raid",
    "Forever 40 man raid",
  ],
});
export default async function RaidCompositionPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ size?: string }>;
}): Promise<React.JSX.Element> {
  const { size } = await searchParams;
  const initialSize = size === "10" ? 10 : size === "20" ? 20 : size === "40" ? 40 : undefined;
  const catalog = await readCompositionCatalog();
  return (
    <>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: "KFC Helper", path: "/" },
          { name: "Forever", path: "/forever" },
          { name: "Raid composition", path: "/forever/raid-composition" },
        ])}
      />
      <ForeverRaidComposition catalog={catalog} {...(initialSize ? { initialSize } : {})} />
    </>
  );
}
