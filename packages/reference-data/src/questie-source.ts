const MAX_QUEST_ID = 2_147_483_647;
const MAX_QUEST_LEVEL = 100;
const MAX_QUEST_XP = 1_000_000;

export interface QuestieXpRow {
  readonly questId: number;
  readonly questLevel: number;
  readonly baseXp: number;
}

function boundedInteger(value: string, minimum: number, maximum: number, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`Invalid ${label}: ${value}`);
  return parsed;
}

/** Parses the generated QuestXP table as data. Lua is never evaluated. */
export function parseQuestieXpDatabase(source: string): readonly QuestieXpRow[] {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*QuestXP\.db\s*=\s*\{\s*$/.test(line));
  if (start < 0) throw new Error("Questie XP source has no QuestXP.db table");
  const rows: QuestieXpRow[] = [];
  const seen = new Set<number>();
  let closed = false;
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index]!;
    if (/^\s*}\s*;?\s*$/.test(line)) {
      closed = true;
      break;
    }
    if (!line.trim() || /^\s*--/.test(line)) continue;
    const match = line.match(
      /^\s*\[(\d+)]\s*=\s*\{\s*(-?\d+)\s*,\s*(\d+)\s*}\s*,?\s*(?:--.*)?$/,
    );
    if (!match)
      throw new Error(`Unsupported Questie XP row at line ${index + 1}`);
    const questId = boundedInteger(match[1]!, 1, MAX_QUEST_ID, "Questie quest id");
    const questLevel = boundedInteger(match[2]!, -1, MAX_QUEST_LEVEL, "Questie quest level");
    const baseXp = boundedInteger(match[3]!, 0, MAX_QUEST_XP, "Questie quest XP");
    if (seen.has(questId)) throw new Error(`Duplicate Questie quest id: ${questId}`);
    seen.add(questId);
    rows.push({ questId, questLevel, baseXp });
  }
  if (!closed) throw new Error("Questie XP table is not closed");
  if (!rows.length) throw new Error("Questie XP table has no records");
  return rows;
}

function luaBraceDelta(line: string): number {
  let delta = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index]!;
    const next = line[index + 1];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "-" && next === "-") break;
    if (character === '"' || character === "'") quote = character;
    else if (character === "{") delta++;
    else if (character === "}") delta--;
  }
  return delta;
}

/** Extracts only top-level quest ids from Questie's generated base-quest table. */
export function parseQuestieBaseQuestIds(source: string): ReadonlySet<number> {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*return\s*\{\s*$/.test(line));
  if (start < 0) throw new Error("Questie base-quest source has no returned table");
  let depth = 1;
  const ids = new Set<number>();
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index]!;
    if (depth === 1) {
      const match = line.match(/^\s*\[(\d+)]\s*=\s*\{/);
      if (match) {
        const questId = boundedInteger(match[1]!, 1, MAX_QUEST_ID, "Questie base quest id");
        if (ids.has(questId)) throw new Error(`Duplicate Questie base quest id: ${questId}`);
        ids.add(questId);
      }
    }
    depth += luaBraceDelta(line);
    if (depth === 0) break;
    if (depth < 0) throw new Error(`Questie base-quest table closes early at line ${index + 1}`);
  }
  if (depth !== 0) throw new Error("Questie base-quest table is not closed");
  if (!ids.size) throw new Error("Questie base-quest table has no records");
  return ids;
}

export function parseQuestieTocRevision(source: string): string | null {
  const values = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^##\s*([^:]+):\s*(.*?)\s*$/);
    if (match) values.set(match[1]!.toLowerCase(), match[2]!);
  }
  const version = values.get("version");
  const commit = values.get("x-build-commit");
  if (commit && !/^[a-f0-9]{7,64}$/i.test(commit))
    throw new Error("QuestieDB TOC has an invalid build commit");
  const revision = [version ? `version:${version}` : null, commit ? `commit:${commit}` : null]
    .filter((value): value is string => value !== null)
    .join(";");
  return revision || null;
}
