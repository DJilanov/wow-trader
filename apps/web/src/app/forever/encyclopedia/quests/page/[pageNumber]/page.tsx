import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DataUnavailable } from "../../../../../../components/data-unavailable";
import { ForeverQuestDirectory } from "../../../../../../components/forever-quest-directory";
import { getForeverQuestDirectory } from "../../../../../../lib/forever-world";
import {
  filterQuestDirectory,
  QUEST_DIRECTORY_PAGE_SIZE,
  questDirectoryFilters,
  questDirectoryHasFilters,
} from "../../../../../../lib/forever-quest-directory";
import { createHelperMetadata } from "../../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface QuestDirectoryPageProps {
  readonly params: Promise<{ readonly pageNumber: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
  searchParams,
}: QuestDirectoryPageProps): Promise<Metadata> {
  const { pageNumber } = await params;
  if (!/^[1-9]\d{0,4}$/.test(pageNumber) || Number(pageNumber) < 2) notFound();
  const filters = questDirectoryFilters(await searchParams);
  const data = await getForeverQuestDirectory().catch(() => null);
  if (
    data &&
    Number(pageNumber) >
      Math.max(
        1,
        Math.ceil(
          filterQuestDirectory(data.titledQuests, filters).length / QUEST_DIRECTORY_PAGE_SIZE,
        ),
      )
  )
    notFound();
  return createHelperMetadata({
    title: `WoW Forever Quest Directory - Page ${pageNumber}`,
    description:
      "Browse named quest references, requirements, objectives and build-scoped evidence for WoW Forever.",
    path: `/forever/encyclopedia/quests/page/${pageNumber}`,
    noIndex: !data || questDirectoryHasFilters(filters),
  });
}

export default async function QuestDirectoryPage({
  params,
  searchParams,
}: QuestDirectoryPageProps): Promise<React.JSX.Element> {
  const { pageNumber } = await params;
  if (!/^[1-9]\d{0,4}$/.test(pageNumber) || Number(pageNumber) < 2) notFound();
  const filters = questDirectoryFilters(await searchParams);
  let data: Awaited<ReturnType<typeof getForeverQuestDirectory>>;
  try {
    data = await getForeverQuestDirectory();
  } catch (error: unknown) {
    console.error(
      "Forever quest directory unavailable",
      error instanceof Error ? error.name : "Unknown error",
    );
    return <DataUnavailable title="Forever quests are temporarily unavailable" />;
  }
  if (!data) return <DataUnavailable title="The Forever quest index is not available" />;
  return <ForeverQuestDirectory data={data} filters={filters} page={Number(pageNumber)} />;
}
