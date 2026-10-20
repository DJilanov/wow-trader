import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DataUnavailable } from "../../../../../components/data-unavailable";
import { ForeverCommunityEntity } from "../../../../../components/forever-community-entity";
import {
  getCommunityEntitySearchSurface,
  getCommunityReferenceEntity,
} from "../../../../../lib/community-reference";
import { createHelperMetadata } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface ForeverNpcPageProps {
  readonly params: Promise<{ readonly npcId: string }>;
}

export async function generateMetadata({ params }: ForeverNpcPageProps): Promise<Metadata> {
  const { npcId } = await params;
  const id = parsePositiveId(npcId);
  const entity = id ? await getCommunityReferenceEntity("npc", id).catch(() => null) : null;
  const searchSurface = entity ? getCommunityEntitySearchSurface(entity) : null;
  return createHelperMetadata({
    title: `${entity?.name ?? `NPC ${npcId}`} · WoW Forever`,
    description: entity
      ? `Locations, quests, item relationships, and observed identity evidence for ${entity.name} (NPC ${entity.id}) in WoW Forever.`
      : `Build-pinned community and observation evidence for WoW Forever NPC ${npcId}.`,
    path: `/forever/encyclopedia/npcs/${npcId}`,
    noIndex: searchSurface?.state !== "indexable",
  });
}

export default async function ForeverNpcPage({
  params,
}: ForeverNpcPageProps): Promise<React.JSX.Element> {
  const { npcId } = await params;
  const id = parsePositiveId(npcId);
  if (!id) notFound();
  try {
    const entity = await getCommunityReferenceEntity("npc", id);
    if (!entity) notFound();
    return <ForeverCommunityEntity entity={entity} />;
  } catch (error: unknown) {
    if (isNextNavigationError(error)) throw error;
    return <DataUnavailable title="NPC reference data is unavailable" />;
  }
}

function parsePositiveId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isNextNavigationError(error: unknown): boolean {
  return error instanceof Error && "digest" in error;
}
