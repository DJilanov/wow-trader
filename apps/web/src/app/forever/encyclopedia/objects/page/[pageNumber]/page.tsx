import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ForeverCommunityDirectory } from "../../../../../../components/forever-community-directory";
import { getCommunityReferenceDirectoryPage } from "../../../../../../lib/community-reference";
import { createHelperMetadata } from "../../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface DirectoryPageProps {
  readonly params: Promise<{ readonly pageNumber: string }>;
}

export async function generateMetadata({ params }: DirectoryPageProps): Promise<Metadata> {
  const value = (await params).pageNumber;
  const page = parseDirectoryPage(value);
  return createHelperMetadata({
    title: `WoW Forever Object Directory${page ? ` — Page ${page}` : ""}`,
    description:
      "Continue browsing evidence-qualified WoW Forever object locations and relationships.",
    path: `/forever/encyclopedia/objects/page/${value}`,
    noIndex: !page || page === 1,
  });
}

export default async function ForeverObjectsDirectoryPage({
  params,
}: DirectoryPageProps): Promise<React.JSX.Element> {
  const page = parseDirectoryPage((await params).pageNumber);
  if (!page || page === 1) notFound();
  const data = await getCommunityReferenceDirectoryPage("object", page);
  if (!data) notFound();
  return <ForeverCommunityDirectory data={data} />;
}

function parseDirectoryPage(value: string): number | null {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : null;
}
