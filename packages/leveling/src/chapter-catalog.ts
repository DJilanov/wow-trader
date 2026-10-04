import { z } from "zod";
import type { CharacterProfile } from "./profile.js";
import { classSlugs, type Faction } from "./model.js";

const conditionalValueSchema = z
  .object({ value: z.string().max(200), condition: z.string().max(200) })
  .strict();
export const chapterReferenceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    sourceId: z.number().int().positive(),
    title: z.string().min(1).max(200),
    factions: z.array(z.enum(["alliance", "horde"])).min(1),
    family: z.enum(["questing", "mage-aoe", "advanced-mage-aoe"]),
    condition: z.string().max(200),
    defaults: z.array(z.string().max(200)),
    labels: z.array(conditionalValueSchema),
    next: z.array(conditionalValueSchema),
    xpRates: z.array(conditionalValueSchema),
  })
  .strict();
export type ChapterReference = z.infer<typeof chapterReferenceSchema>;
export type ConditionResult = "match" | "exclude" | "unknown";

function combineAnd(values: readonly ConditionResult[]): ConditionResult {
  return values.includes("exclude") ? "exclude" : values.includes("unknown") ? "unknown" : "match";
}
function combineOr(values: readonly ConditionResult[]): ConditionResult {
  return values.includes("match") ? "match" : values.includes("unknown") ? "unknown" : "exclude";
}

export function evaluateChapterCondition(
  condition: string,
  profile: CharacterProfile,
): ConditionResult {
  const input = condition.split("--")[0]?.trim() ?? "";
  if (!input) return "match";
  // Guide predicates use slash-separated alternatives and whitespace conjunctions.
  // Unsupported predicates stay unknown rather than being executed or guessed.
  return combineOr(
    input.split("/").map((branch) =>
      combineAnd(
        branch
          .trim()
          .split(/\s+/)
          .map((raw) => {
            const negate = raw.startsWith("!");
            const rawToken = raw.replace(/^!/, "").toLowerCase();
            const token = rawToken === "pala" ? "paladin" : rawToken;
            let result: ConditionResult;
            if (["alliance", "horde"].includes(token))
              result = profile.faction === token ? "match" : "exclude";
            else if (
              [
                "human",
                "dwarf",
                "gnome",
                "nightelf",
                "orc",
                "troll",
                "tauren",
                "undead",
                "skyborne",
              ].includes(token)
            )
              result = profile.raceId.replaceAll("-", "") === token ? "match" : "exclude";
            else if (classSlugs.some((slug) => slug === token))
              result =
                profile.classSlug === null
                  ? "unknown"
                  : profile.classSlug === token
                    ? "match"
                    : "exclude";
            else if (token === "forever") result = "match";
            else if (token === "skip") result = "exclude";
            else if (["sod", "som", "era", "season2", "hardcore", "softcore"].includes(token))
              result = "exclude";
            else result = "unknown";
            return negate && result !== "unknown"
              ? result === "match"
                ? "exclude"
                : "match"
              : result;
          }),
      ),
    ),
  );
}

export function evaluateXpRate(value: string, rate: number | null): ConditionResult {
  const match = /^(<=|>=|<|>|=)\s*(\d+(?:\.\d+)?)$/.exec(value);
  if (!match || rate === null) return "unknown";
  const limit = Number(match[2]);
  const valid =
    match[1] === "<"
      ? rate < limit
      : match[1] === ">"
        ? rate > limit
        : match[1] === "<="
          ? rate <= limit
          : match[1] === ">="
            ? rate >= limit
            : rate === limit;
  return valid ? "match" : "exclude";
}

export function chapterEligibility(
  chapter: ChapterReference,
  profile: CharacterProfile,
): ConditionResult {
  if (!chapter.factions.includes(profile.faction)) return "exclude";
  const constraints: ConditionResult[] = [evaluateChapterCondition(chapter.condition, profile)];
  if (chapter.defaults.length > 0)
    constraints.push(
      combineOr(chapter.defaults.map((condition) => evaluateChapterCondition(condition, profile))),
    );
  for (const gate of chapter.xpRates) {
    const condition = evaluateChapterCondition(gate.condition, profile);
    if (condition === "match") constraints.push(evaluateXpRate(gate.value, profile.xpRate));
    else if (condition === "unknown") constraints.push("unknown");
  }
  return combineAnd(constraints);
}

export interface ChapterLabel {
  readonly title: string;
  readonly zone: string;
  readonly minimumLevel: number;
  readonly maximumLevel: number;
  readonly unresolved: boolean;
}
export function getChapterLabel(
  chapter: ChapterReference,
  profile: CharacterProfile,
): ChapterLabel {
  const candidates = chapter.labels.map((label) => ({
    ...label,
    result: evaluateChapterCondition(label.condition, profile),
  }));
  const selected = candidates.find((label) => label.result === "match");
  const title = selected?.value ?? chapter.title;
  const levels = /^(\d+)-(\d+)\s+(.+)$/.exec(title);
  return {
    title,
    minimumLevel: Number(levels?.[1] ?? 1),
    maximumLevel: Number(levels?.[2] ?? 60),
    zone: levels?.[3] ?? title,
    unresolved: !selected && candidates.some((label) => label.result === "unknown"),
  };
}

export interface ChapterCatalogAudit {
  readonly unresolvedTargets: readonly { readonly chapterId: string; readonly target: string }[];
  readonly cycles: readonly string[];
}

function targetName(value: string): string {
  return value.split("\\").at(-1)?.trim() ?? value.trim();
}

export function findChapterTargets(
  chapter: ChapterReference,
  catalog: readonly ChapterReference[],
  profile: CharacterProfile,
): readonly ChapterReference[] {
  const targets = chapter.next.flatMap((edge) => {
    if (evaluateChapterCondition(edge.condition, profile) !== "match") return [];
    return catalog.filter(
      (candidate) =>
        candidate.title === targetName(edge.value) &&
        candidate.family === chapter.family &&
        chapterEligibility(candidate, profile) === "match",
    );
  });
  return [...new Map(targets.map((target) => [target.id, target])).values()];
}

export function auditChapterCatalog(catalog: readonly ChapterReference[]): ChapterCatalogAudit {
  if (
    new Set(catalog.map((chapter) => chapter.id)).size !== catalog.length ||
    new Set(catalog.map((chapter) => chapter.sourceId)).size !== catalog.length
  )
    throw new Error("Duplicate chapter identity");
  const unresolvedTargets = catalog.flatMap((chapter) =>
    chapter.next
      .filter(
        (edge) =>
          !catalog.some(
            (candidate) =>
              candidate.title === targetName(edge.value) &&
              candidate.family === chapter.family &&
              candidate.factions.some((faction) => chapter.factions.includes(faction)),
          ),
      )
      .map((edge) => ({ chapterId: chapter.id, target: edge.value })),
  );
  const cycles = new Set<string>();
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(chapter: ChapterReference): void {
    if (visiting.has(chapter.id)) {
      cycles.add(chapter.id);
      return;
    }
    if (visited.has(chapter.id)) return;
    visiting.add(chapter.id);
    for (const edge of chapter.next)
      for (const target of catalog.filter(
        (candidate) =>
          candidate.title === targetName(edge.value) &&
          candidate.family === chapter.family &&
          candidate.factions.some((faction) => chapter.factions.includes(faction)),
      ))
        visit(target);
    visiting.delete(chapter.id);
    visited.add(chapter.id);
  }
  catalog.forEach(visit);
  return { unresolvedTargets, cycles: [...cycles] };
}

export interface ChapterSelection {
  readonly chapters: readonly ChapterReference[];
  readonly alternatives: readonly ChapterReference[];
  readonly unresolved: readonly ChapterReference[];
  readonly messages: readonly string[];
}

export function selectChapterSequence(
  catalog: readonly ChapterReference[],
  profile: CharacterProfile,
): ChapterSelection {
  const ordinary = catalog.filter((chapter) => chapter.family === "questing");
  const starts = ordinary.filter(
    (chapter) =>
      /^1-/.test(chapter.title) &&
      chapter.factions.includes(profile.faction) &&
      chapter.defaults.some(
        (condition) => evaluateChapterCondition(condition, profile) === "match",
      ),
  );
  const eligibleStarts = starts.filter(
    (chapter) => chapterEligibility(chapter, profile) === "match",
  );
  const chapters: ChapterReference[] = [];
  const alternatives: ChapterReference[] = [];
  const messages: string[] = [];
  let current = eligibleStarts.length === 1 ? eligibleStarts[0] : undefined;
  if (starts.length > 0 && !current)
    messages.push(
      "The starting bracket depends on an XP-rate or character condition. Review the candidates below; no branch has been selected automatically.",
    );
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    chapters.push(current);
    seen.add(current.id);
    const targets = findChapterTargets(current, catalog, profile);
    const uncertain = current.next.some((edge) => {
      const condition = evaluateChapterCondition(edge.condition, profile);
      const candidates = catalog.filter(
        (candidate) =>
          candidate.title === targetName(edge.value) &&
          candidate.family === current?.family &&
          candidate.factions.includes(profile.faction),
      );
      return (
        condition === "unknown" ||
        (condition === "match" &&
          (candidates.length === 0 ||
            candidates.some((candidate) => chapterEligibility(candidate, profile) === "unknown")))
      );
    });
    if (targets.length === 1 && !uncertain) current = targets[0];
    else {
      if (targets.length > 1) {
        alternatives.push(...targets);
        messages.push(
          "This route reaches alternative continuations. They remain separate until the transition is reviewed.",
        );
      } else if (
        current.next.length > 0 ||
        (profile.raceId === "skyborne" && profile.faction === "horde")
      )
        messages.push(
          "The next transition is unresolved for this profile. Browse the remaining reference brackets without treating them as a continuous validated route.",
        );
      current = undefined;
    }
  }
  if (current) messages.push("A cyclic continuation was stopped for safety.");
  const selected = new Set(chapters.map((chapter) => chapter.id));
  const remaining = ordinary.filter(
    (chapter) =>
      !selected.has(chapter.id) &&
      chapterEligibility(chapter, profile) !== "exclude" &&
      (!/^1-/.test(chapter.title) || starts.some((start) => start.id === chapter.id)),
  );
  return {
    chapters,
    alternatives: [
      ...new Map(
        [
          ...alternatives,
          ...remaining.filter((chapter) => chapterEligibility(chapter, profile) === "match"),
        ].map((chapter) => [chapter.id, chapter]),
      ).values(),
    ].sort(
      (a, b) =>
        getChapterLabel(a, profile).minimumLevel - getChapterLabel(b, profile).minimumLevel ||
        a.sourceId - b.sourceId,
    ),
    unresolved: remaining.filter((chapter) => chapterEligibility(chapter, profile) === "unknown"),
    messages,
  };
}

export function parseGuideInventoryCsv(source: string): readonly Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  const input = source.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (character === "\n" && !quoted) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("Unterminated CSV quote");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = rows.shift();
  if (!headers || !["guide_id", "name", "raw_header"].every((key) => headers.includes(key)))
    throw new Error("Missing guide inventory columns");
  return rows
    .filter((values) => values.some(Boolean))
    .map((values) => {
      if (values.length !== headers.length) throw new Error("Invalid guide inventory row width");
      return Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ""]));
    });
}

export function extractChapterReferences(csv: string): readonly ChapterReference[] {
  return parseGuideInventoryCsv(csv).map((row) => {
    const lines = (row.raw_header ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("--"));
    function values(prefix: string): { value: string; condition: string }[] {
      return lines
        .filter((line) => line.startsWith(`${prefix} `))
        .flatMap((line) => {
          const [value = "", condition = ""] = line.slice(prefix.length).trim().split("<<");
          return (prefix === "#next" ? value.split(";") : [value])
            .filter((entry) => entry.trim())
            .map((entry) => ({ value: entry.trim(), condition: condition.trim() }));
        });
    }
    const factions: Faction[] = [];
    if (/\(A\)/.test(row.raw_header ?? "")) factions.push("alliance");
    if (/\(H\)/.test(row.raw_header ?? "")) factions.push("horde");
    const family = /advanced/i.test(row.subgroup ?? "")
      ? "advanced-mage-aoe"
      : /aoe|guide mage$/i.test(row.subgroup ?? "")
        ? "mage-aoe"
        : "questing";
    const title = row.name ?? "";
    return chapterReferenceSchema.parse({
      id: `chapter-${row.guide_id}-${title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-$/, "")}`,
      sourceId: Number(row.guide_id),
      title,
      factions,
      family,
      condition: lines
        .filter((line) => line.startsWith("<<"))
        .map((line) => line.slice(2).trim())
        .join(" "),
      defaults: values("#defaultfor").map((value) => value.value),
      labels: values("#displayname"),
      next: values("#next"),
      xpRates: values("#xprate"),
    });
  });
}
