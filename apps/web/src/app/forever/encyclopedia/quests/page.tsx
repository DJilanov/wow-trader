import type { Metadata } from "next";
import { DataUnavailable } from "../../../../components/data-unavailable";
import { ForeverQuestDirectory } from "../../../../components/forever-quest-directory";
import { getForeverQuestDirectory } from "../../../../lib/forever-world";
import {
  questDirectoryFilters,
  questDirectoryHasFilters,
} from "../../../../lib/forever-quest-directory";
import { createHelperMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

interface QuestIndexProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: QuestIndexProps): Promise<Metadata> {
  const data = await getForeverQuestDirectory().catch(() => null);
  return createHelperMetadata({
    title: "WoW Forever Quests and Quest Lines",
    description:
      "Find named WoW Forever quests, objectives, rewards and requirements with reviewed reference sources and separate exact-build observations.",
    path: "/forever/encyclopedia/quests",
    keywords: ["WoW Forever quests", "WoW Forever quest lines", "WoW Forever quest database"],
    noIndex:
      !data?.titledQuests.length ||
      questDirectoryHasFilters(questDirectoryFilters(await searchParams)),
  });
}

export default async function ForeverQuestsPage({
  searchParams,
}: QuestIndexProps): Promise<React.JSX.Element> {
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
  return <ForeverQuestDirectory data={data} filters={filters} page={1} />;
}
