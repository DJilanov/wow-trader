import type { Metadata } from "next";
import { cache } from "react";

import { DataUnavailable } from "../../../../components/data-unavailable";
import { ForeverCommunityDirectory } from "../../../../components/forever-community-directory";
import { getCommunityReferenceDirectoryPage } from "../../../../lib/community-reference";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

const getDirectory = cache(() => getCommunityReferenceDirectoryPage("npc", 1).catch(() => null));

export async function generateMetadata(): Promise<Metadata> {
  const data = await getDirectory();
  return createHelperMetadata({
    title: "WoW Forever NPC Directory",
    description:
      "Browse evidence-qualified WoW Forever NPCs with locations, quest and item relationships, and exact-build observations.",
    path: "/forever/encyclopedia/npcs",
    keywords: ["WoW Forever NPCs", "WoW Forever NPC locations", "WoW Forever quest givers"],
    noIndex: !data?.total,
  });
}

export default async function ForeverNpcsPage(): Promise<React.JSX.Element> {
  const data = await getDirectory();
  if (!data) return <DataUnavailable title="The NPC directory is not available" />;
  return <ForeverCommunityDirectory data={data} />;
}
