export type EntityGraphRelationKind =
  | "sold_by"
  | "dropped_by"
  | "rewarded_by"
  | "starts_quest"
  | "ends_quest"
  | "teaches_recipe"
  | "crafted_by"
  | "requires_item"
  | "located_on_map"
  | "related_to";

export interface EntityGraphRelationInput {
  readonly direction: "incoming" | "outgoing";
  readonly relationKind: string;
  readonly relatedKind: string;
  readonly relatedId: number;
}

export interface EntityGraphRelation extends EntityGraphRelationInput {
  readonly normalizedKind: EntityGraphRelationKind;
  readonly label: string;
  readonly href: string | null;
}

const RELATION_ALIASES: Readonly<Record<string, EntityGraphRelationKind>> = {
  sold_by: "sold_by",
  sold_by_npc: "sold_by",
  dropped_by: "dropped_by",
  dropped_by_npc: "dropped_by",
  dropped_by_object: "dropped_by",
  rewarded_by: "rewarded_by",
  rewarded_by_quest: "rewarded_by",
  starts_quest: "starts_quest",
  started_by: "starts_quest",
  ends_quest: "ends_quest",
  finishes_quest: "ends_quest",
  finished_by: "ends_quest",
  teaches_recipe: "teaches_recipe",
  teaches_spell: "teaches_recipe",
  crafted_by: "crafted_by",
  crafted_by_spell: "crafted_by",
  requires_item: "requires_item",
  located_on_map: "located_on_map",
};

const RELATION_LABELS: Readonly<Record<EntityGraphRelationKind, string>> = {
  sold_by: "Vendor relationship",
  dropped_by: "Drop relationship",
  rewarded_by: "Quest reward relationship",
  starts_quest: "Quest start relationship",
  ends_quest: "Quest completion relationship",
  teaches_recipe: "Recipe teaching relationship",
  crafted_by: "Crafting relationship",
  requires_item: "Required item relationship",
  located_on_map: "Map location relationship",
  related_to: "Related entity",
};

export function normalizeEntityGraphRelation(
  relation: EntityGraphRelationInput,
): EntityGraphRelation {
  const normalizedKind = RELATION_ALIASES[relation.relationKind] ?? "related_to";
  return {
    ...relation,
    normalizedKind,
    label: RELATION_LABELS[normalizedKind],
    href: entityGraphHref(relation.relatedKind, relation.relatedId, relation.relationKind),
  };
}

export function entityGraphHref(kind: string, id: number, relationKind?: string): string | null {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (kind === "item" || kind === "quest" || kind === "npc" || kind === "object") {
    return `/forever/encyclopedia/${kind}s/${id}`;
  }
  if (kind === "spell" && normalizeRelationKind(relationKind) === "teaches_recipe") {
    return `/forever/encyclopedia/recipes/${id}`;
  }
  return null;
}

export function normalizeRelationKind(relationKind: string | undefined): EntityGraphRelationKind {
  return relationKind ? (RELATION_ALIASES[relationKind] ?? "related_to") : "related_to";
}
