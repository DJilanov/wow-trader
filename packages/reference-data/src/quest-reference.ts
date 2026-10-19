import type { ReferenceRecord } from "./contracts.js";

type ReferenceRelation = ReferenceRecord["relations"][number];

export interface QuestReferenceFacts {
  readonly questId: number;
  readonly name: string;
  readonly sourceUrl: string;
  readonly sourceSha256: string;
  readonly capturedAt: string;
  readonly questLevel: number | null;
  readonly minimumLevel: number | null;
  readonly type: string | null;
  readonly side: "alliance" | "horde" | "both" | null;
  readonly raceIds: readonly number[];
  readonly classIds: readonly number[];
  readonly shareable: boolean | null;
  readonly starters: readonly ReferenceRelation[];
  readonly finishers: readonly ReferenceRelation[];
  readonly series: readonly ReferenceRelation[];
  readonly objectives: readonly string[];
  readonly rewards: readonly string[];
  readonly objectiveState: "present" | "none" | "unknown";
  readonly rewardState: "present" | "none" | "unknown";
}

export function extractQuestReferenceFacts(record: ReferenceRecord): QuestReferenceFacts {
  if (record.kind !== "quest") throw new Error("Quest reference facts require a quest record");
  const questLevel = numericFact(record.quickFacts, /^Level:\s*(\d{1,2})$/i);
  const minimumLevel = numericFact(record.quickFacts, /^Requires level\s+(\d{1,2})$/i);
  const type = textFact(record.quickFacts, /^Type:\s*(.+)$/i);
  const sideText = textFact(record.quickFacts, /^Side:\s*(Alliance|Horde|Both)$/i);
  const side = sideText ? (sideText.toLowerCase() as QuestReferenceFacts["side"]) : null;
  const shareable = record.quickFacts.some((fact) => /^Not sharable$/i.test(fact))
    ? false
    : record.quickFacts.some((fact) => /^Sharable$/i.test(fact))
      ? true
      : null;
  return {
    questId: record.id,
    name: record.name,
    sourceUrl: record.sourceUrl,
    sourceSha256: record.sourceSha256,
    capturedAt: record.capturedAt,
    questLevel,
    minimumLevel,
    type,
    side,
    raceIds: ids(record.quickFacts, /^Races?:\s*(.+)$/i, /race ID (\d+)/gi),
    classIds: ids(record.quickFacts, /^Classes?:\s*(.+)$/i, /class ID (\d+)/gi),
    shareable,
    starters: record.relations.filter((relation) => relation.relation === "start"),
    finishers: record.relations.filter((relation) => relation.relation === "end"),
    series: record.relations.filter((relation) => relation.relation === "series"),
    objectives: record.objectives,
    rewards: record.rewards,
    objectiveState:
      record.questContent?.objectives ?? (record.objectives.length ? "present" : "unknown"),
    rewardState: record.questContent?.rewards ?? (record.rewards.length ? "present" : "unknown"),
  };
}

function numericFact(facts: readonly string[], pattern: RegExp): number | null {
  const values = facts
    .map((fact) => Number(fact.match(pattern)?.[1]))
    .filter((value) => Number.isSafeInteger(value) && value >= 1 && value <= 60);
  return values.length === 1 ? values[0]! : null;
}

function textFact(facts: readonly string[], pattern: RegExp): string | null {
  const values = facts.map((fact) => fact.match(pattern)?.[1]?.trim()).filter(isPresent);
  return values.length === 1 ? values[0]! : null;
}

function ids(facts: readonly string[], factPattern: RegExp, idPattern: RegExp): number[] {
  const result = new Set<number>();
  for (const fact of facts) {
    const value = fact.match(factPattern)?.[1];
    if (!value) continue;
    for (const match of value.matchAll(idPattern)) {
      const id = Number(match[1]);
      if (Number.isSafeInteger(id) && id > 0) result.add(id);
    }
  }
  return [...result].sort((left, right) => left - right);
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined;
}
