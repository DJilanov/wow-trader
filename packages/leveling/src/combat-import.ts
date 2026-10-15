import { combatDatasetSchema, type CombatDataset, type CombatNpc } from "./combat-model.js";

type LuaValue = string | number | boolean | null | Map<string | number, LuaValue>;
type LuaTable = Map<string | number, LuaValue>;

// Accept data literals only. Provider Lua, functions and expressions are never evaluated.
export function parseLuaDataLiteral(source: string): LuaValue {
  if (source.length > 1_000_000) throw new Error("Lua row exceeds its size budget.");
  let offset = 0,
    nodes = 0;
  const space = (): void => {
    while (/\s/.test(source[offset] ?? "") && offset < source.length) offset++;
  };
  function value(depth: number): LuaValue {
    if (depth > 24 || ++nodes > 100000)
      throw new Error("Lua literal exceeds its nesting/node budget.");
    space();
    const token = source[offset];
    if (token === "'" || token === '"') {
      const quote = token;
      offset++;
      let text = "";
      while (offset < source.length) {
        const character = source[offset++]!;
        if (character === quote) return text;
        if (character !== "\\") {
          text += character;
          continue;
        }
        const escaped = source[offset++];
        if (escaped === undefined) break;
        if (/\d/.test(escaped)) {
          let digits = escaped;
          for (let index = 0; index < 2 && /\d/.test(source[offset] ?? ""); index++)
            digits += source[offset++]!;
          const code = Number(digits);
          if (code > 255) throw new Error("Invalid Lua character escape.");
          text += String.fromCharCode(code);
        } else {
          const escapes: Readonly<Record<string, string>> = {
            a: "\x07",
            b: "\b",
            f: "\f",
            n: "\n",
            r: "\r",
            t: "\t",
            v: "\v",
            "\\": "\\",
            "'": "'",
            '"': '"',
          };
          if (escapes[escaped] === undefined) throw new Error("Unsupported Lua string escape.");
          text += escapes[escaped];
        }
      }
      throw new Error("Unterminated Lua string.");
    }
    if (token === "{") {
      offset++;
      const table: LuaTable = new Map();
      let next = 1;
      space();
      while (source[offset] !== "}") {
        if (offset >= source.length) throw new Error("Unterminated Lua table.");
        let key: string | number = next++;
        if (source[offset] === "[") {
          next--;
          offset++;
          const explicit = value(depth + 1);
          if (typeof explicit !== "string" && typeof explicit !== "number")
            throw new Error("Invalid Lua table key.");
          key = explicit;
          space();
          if (source[offset++] !== "]") throw new Error("Invalid Lua table key terminator.");
          space();
          if (source[offset++] !== "=") throw new Error("Invalid Lua table assignment.");
        }
        if (table.has(key)) throw new Error("Duplicate Lua table key.");
        table.set(key, value(depth + 1));
        space();
        if (source[offset] === "," || source[offset] === ";") {
          offset++;
          space();
        } else if (source[offset] !== "}") throw new Error("Invalid Lua table separator.");
      }
      offset++;
      return table;
    }
    const match = /^(nil|true|false|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(?=[\s,;}\]]|$)/.exec(
      source.slice(offset),
    );
    if (!match) throw new Error("Only Lua data literals are accepted.");
    offset += match[0].length;
    if (match[0] === "nil") return null;
    if (match[0] === "true") return true;
    if (match[0] === "false") return false;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) throw new Error("Nonfinite Lua number.");
    return number;
  }
  const result = value(0);
  space();
  if (offset !== source.length) throw new Error("Unexpected executable text after Lua data.");
  return result;
}

function table(value: LuaValue | undefined): LuaTable {
  return value instanceof Map ? value : new Map();
}
function numericIds(value: LuaValue | undefined): number[] {
  return [...table(value).values()].filter(
    (entry): entry is number =>
      typeof entry === "number" && Number.isSafeInteger(entry) && entry > 0 && entry <= 10000000,
  );
}
function nullableInteger(
  value: LuaValue | undefined,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}
function rows(source: string, kind: "npc" | "quest" | "item"): Map<number, LuaTable> {
  if (source.length > 32_000_000 || !source.includes(" -> authored corrections."))
    throw new Error(
      "Import requires a bounded Forever static export with authored corrections included.",
    );
  const result = new Map<number, LuaTable>();
  const row = new RegExp(`^${kind}\\[(\\d+)\\]=(\\{.*\\})$`);
  for (const original of source.split(/\r?\n/)) {
    const line = original.trim();
    if (
      !line ||
      line.startsWith("--") ||
      line === `local ${kind} = {}` ||
      line === `return ${kind}`
    )
      continue;
    const match = row.exec(line);
    if (!match) throw new Error("Unrecognized provider export syntax.");
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id) || id <= 0 || id > 10000000 || result.has(id))
      throw new Error("Invalid or duplicate provider identity.");
    const parsed = parseLuaDataLiteral(match[2]!);
    if (!(parsed instanceof Map)) throw new Error("Expected a provider row table.");
    result.set(id, parsed);
  }
  if (!result.size) throw new Error("Provider export contains no entities.");
  return result;
}

export function importQuestieCombatData(input: {
  readonly npcExport: string;
  readonly questExport: string;
  readonly itemExport: string;
  readonly provider: CombatDataset["provider"];
  readonly targetBuild: number;
  readonly publication: CombatDataset["publication"];
  readonly authorizationNote: string;
  readonly dungeons?: CombatDataset["dungeons"];
  readonly killXpEvidence?: CombatDataset["killXpEvidence"];
}): CombatDataset {
  const npcRows = rows(input.npcExport, "npc"),
    questRows = rows(input.questExport, "quest"),
    itemRows = rows(input.itemExport, "item");
  const npcs: CombatNpc[] = [];
  for (const [id, row] of npcRows) {
    const name = row.get(1);
    if (typeof name !== "string" || !name.trim()) continue;
    const zoneIds = new Set(
      [...table(row.get(7)).keys()].filter(
        (zone): zone is number => typeof zone === "number" && zone > 0,
      ),
    );
    const primaryZone = nullableInteger(row.get(9), 1, 10000000);
    if (primaryZone) zoneIds.add(primaryZone);
    const minimumLevel = nullableInteger(row.get(4), 1, 100),
      maximumLevel = nullableInteger(row.get(5), 1, 100);
    const inverted = minimumLevel !== null && maximumLevel !== null && minimumLevel > maximumLevel;
    npcs.push({
      id,
      name,
      minimumLevel: inverted ? null : minimumLevel,
      maximumLevel: inverted ? null : maximumLevel,
      rank: nullableInteger(row.get(6), 0, 5),
      zoneIds: [...zoneIds].sort((a, b) => a - b),
      xpEligibility:
        /(?:kill.?credit|trigger|\bDNT\b|invisible|bunny|dummy)/i.test(name) || name === "Stanley"
          ? "unknown"
          : "assumed",
    });
  }
  const quests: CombatDataset["quests"] = [];
  for (const [questId, row] of questRows) {
    const objectives = table(row.get(10));
    const creatureIds = [...table(objectives.get(1)).values()].flatMap((entry) => {
      const id = nullableInteger(table(entry).get(1), 1, 10000000);
      return id === null ? [] : [id];
    });
    const itemCreatureIds = [...table(objectives.get(3)).values()].flatMap((entry) => {
      const id = nullableInteger(table(entry).get(1), 1, 10000000);
      return id === null ? [] : numericIds(itemRows.get(id)?.get(2));
    });
    quests.push({
      questId,
      creatureIds: [...new Set(creatureIds)],
      itemCreatureIds: [...new Set(itemCreatureIds)],
      objectiveText: [...table(row.get(8)).values()].filter(
        (text): text is string => typeof text === "string",
      ),
      onlyCreatureObjectives:
        creatureIds.length > 0 &&
        [...objectives.entries()].every(([key, value]) => key === 1 || table(value).size === 0),
    });
  }
  return combatDatasetSchema.parse({
    schema: "forever-combat-reference.v1",
    targetBuild: input.targetBuild,
    publication: input.publication,
    authorizationNote: input.authorizationNote,
    provider: input.provider,
    npcs,
    quests,
    dungeons: input.dungeons ?? [],
    killXpEvidence: input.killXpEvidence ?? [],
  });
}
