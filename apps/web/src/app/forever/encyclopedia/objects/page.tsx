import type { Metadata } from "next";
import { cache } from "react";

import { DataUnavailable } from "../../../../components/data-unavailable";
import { ForeverCommunityDirectory } from "../../../../components/forever-community-directory";
import { getCommunityReferenceDirectoryPage } from "../../../../lib/community-reference";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

const getDirectory = cache(() => getCommunityReferenceDirectoryPage("object", 1).catch(() => null));

export async function generateMetadata(): Promise<Metadata> {
  const data = await getDirectory();
  return createHelperMetadata({
    title: "WoW Forever Object Directory",
    description:
      "Browse evidence-qualified WoW Forever world objects with locations and normalized quest and item relationships.",
    path: "/forever/encyclopedia/objects",
    keywords: ["WoW Forever objects", "WoW Forever object locations", "WoW Forever quest objects"],
    noIndex: !data?.total,
  });
}

export default async function ForeverObjectsPage(): Promise<React.JSX.Element> {
  const data = await getDirectory();
  if (!data) return <DataUnavailable title="The object directory is not available" />;
  return <ForeverCommunityDirectory data={data} />;
}
