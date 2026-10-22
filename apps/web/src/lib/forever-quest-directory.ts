import { extractQuestReferenceFacts, type ReferenceRecord } from "@wow-trader/reference-data";

export interface QuestDirectoryIdentity {
  readonly questId: number;
  readonly title: string | null;
  readonly minimumLevel?: number | null;
}

export interface QuestDirectoryObservation {
  readonly questId: number;
  readonly title: string;
  readonly evidenceKind: string;
  readonly capturedAt: Date;
}

export interface QuestDirectoryEntry {
  readonly questId: number;
  readonly title: string;
  readonly evidenceKind: string;
  readonly capturedAt: Date | null;
  readonly questLevel: number | null;
  readonly minimumLevel: number | null;
  readonly side: "alliance" | "horde" | "both" | null;
  readonly referenceCapturedAt: Date | null;
}

export interface QuestDirectoryFilters {
  readonly query: string;
  readonly side: "all" | "alliance" | "horde" | "both";
  readonly minimumLevel: number | null;
  readonly maximumLevel: number | null;
}

export const QUEST_DIRECTORY_PAGE_SIZE = 60;

export function buildQuestDirectoryEntries(
  quests: readonly QuestDirectoryIdentity[],
  observations: readonly QuestDirectoryObservation[],
  approvedReferences: ReadonlyMap<number, ReferenceRecord>,
): readonly QuestDirectoryEntry[] {
  const identities = new Map(quests.map((quest) => [quest.questId, quest]));
  const entries = new Map<number, QuestDirectoryEntry>();
  for (const quest of quests) {
    if (!quest.title) continue;
    entries.set(quest.questId, {
      questId: quest.questId,
      title: quest.title,
      evidenceKind: "client_task",
      capturedAt: null,
      questLevel: null,
      minimumLevel: quest.minimumLevel || null,
      side: null,
      referenceCapturedAt: null,
    });
  }
  for (const observation of observations) {
    if (!identities.has(observation.questId)) continue;
    entries.set(observation.questId, {
      ...observation,
      questLevel: null,
      minimumLevel: identities.get(observation.questId)?.minimumLevel || null,
      side: null,
      referenceCapturedAt: null,
    });
  }
  for (const [id, reference] of approvedReferences) {
    if (reference.game !== "forever" || reference.kind !== "quest" || reference.id !== id) continue;
    if (!identities.has(id)) continue;
    const existing = entries.get(id);
    if (existing && existing.title !== reference.name) continue;
    const facts = extractQuestReferenceFacts(reference);
    entries.set(id, {
      questId: id,
      title: existing?.title ?? reference.name,
      evidenceKind: existing?.evidenceKind ?? "published_reference",
      capturedAt: existing?.capturedAt ?? null,
      questLevel: facts.questLevel,
      minimumLevel: existing?.minimumLevel ?? facts.minimumLevel,
      side: facts.side,
      referenceCapturedAt: new Date(reference.capturedAt),
    });
  }
  return [...entries.values()].sort(
    (left, right) => left.title.localeCompare(right.title) || left.questId - right.questId,
  );
}

export function questDirectoryFilters(
  params: Readonly<Record<string, string | string[] | undefined>>,
): QuestDirectoryFilters {
  const scalar = (name: string): string => (typeof params[name] === "string" ? params[name] : "");
  const side = scalar("side");
  return {
    query: scalar("q").trim().slice(0, 100),
    side: side === "alliance" || side === "horde" || side === "both" ? side : "all",
    minimumLevel: questLevelFilter(scalar("min")),
    maximumLevel: questLevelFilter(scalar("max")),
  };
}

export function filterQuestDirectory(
  entries: readonly QuestDirectoryEntry[],
  filters: QuestDirectoryFilters,
): readonly QuestDirectoryEntry[] {
  const query = filters.query.toLocaleLowerCase("en");
  return entries.filter((entry) => {
    if (
      query &&
      !entry.title.toLocaleLowerCase("en").includes(query) &&
      String(entry.questId) !== query
    )
      return false;
    if (filters.side !== "all") {
      if (
        filters.side === "both"
          ? entry.side !== "both"
          : entry.side !== filters.side && entry.side !== "both"
      )
        return false;
    }
    if (
      filters.minimumLevel !== null &&
      (entry.questLevel === null || entry.questLevel < filters.minimumLevel)
    )
      return false;
    if (
      filters.maximumLevel !== null &&
      (entry.questLevel === null || entry.questLevel > filters.maximumLevel)
    )
      return false;
    return true;
  });
}

export function questDirectoryHref(page: number, filters: QuestDirectoryFilters): string {
  const base = "/forever/encyclopedia/quests";
  const path = page === 1 ? base : `${base}/page/${page}`;
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.side !== "all") params.set("side", filters.side);
  if (filters.minimumLevel !== null) params.set("min", String(filters.minimumLevel));
  if (filters.maximumLevel !== null) params.set("max", String(filters.maximumLevel));
  return params.size ? `${path}?${params}` : path;
}

export function questDirectoryHasFilters(filters: QuestDirectoryFilters): boolean {
  return Boolean(
    filters.query ||
    filters.side !== "all" ||
    filters.minimumLevel !== null ||
    filters.maximumLevel !== null,
  );
}

function questLevelFilter(value: string): number | null {
  if (!/^\d{1,2}$/.test(value)) return null;
  const level = Number(value);
  return level >= 1 && level <= 60 ? level : null;
}
