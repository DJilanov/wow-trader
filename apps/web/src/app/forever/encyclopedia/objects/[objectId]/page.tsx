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

interface ForeverObjectPageProps {
  readonly params: Promise<{ readonly objectId: string }>;
}

export async function generateMetadata({ params }: ForeverObjectPageProps): Promise<Metadata> {
  const { objectId } = await params;
  const id = parsePositiveId(objectId);
  const entity = id ? await getCommunityReferenceEntity("object", id).catch(() => null) : null;
  const searchSurface = entity ? getCommunityEntitySearchSurface(entity) : null;
  return createHelperMetadata({
    title: `${entity?.name ?? `Object ${objectId}`} · WoW Forever`,
    description: entity
      ? `Locations, quests, item relationships, and source provenance for ${entity.name} (object ${entity.id}) in WoW Forever.`
      : `Build-pinned community evidence for WoW Forever object ${objectId}.`,
    path: `/forever/encyclopedia/objects/${objectId}`,
    noIndex: searchSurface?.state !== "indexable",
  });
}

export default async function ForeverObjectPage({
  params,
}: ForeverObjectPageProps): Promise<React.JSX.Element> {
  const { objectId } = await params;
  const id = parsePositiveId(objectId);
  if (!id) notFound();
  try {
    const entity = await getCommunityReferenceEntity("object", id);
    if (!entity) notFound();
    return <ForeverCommunityEntity entity={entity} />;
  } catch (error: unknown) {
    if (isNextNavigationError(error)) throw error;
    return <DataUnavailable title="Object reference data is unavailable" />;
  }
}

function parsePositiveId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isNextNavigationError(error: unknown): boolean {
  return error instanceof Error && "digest" in error;
}
