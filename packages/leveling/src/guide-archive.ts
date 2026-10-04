import { z } from "zod";
import {
  evaluateChapterCondition,
  evaluateXpRate,
  type ConditionResult,
} from "./chapter-catalog.js";
import type { CharacterProfile } from "./profile.js";

const identity = z.string().regex(/^[a-z0-9-]{1,180}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const directiveSchema = z
  .object({
    tag: z.string().max(60),
    arguments: z.string().max(5000),
    condition: z.string().max(300),
    text: z.string().max(12000),
    sourceLine: z.number().int().positive(),
    questId: z.number().int().positive().nullable(),
    position: z
      .object({
        zone: z.string().max(120),
        floor: z.number().int().nonnegative().nullable(),
        x: z.number().finite(),
        y: z.number().finite(),
        space: z.enum(["map-percent", "world"]),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const importedStepSchema = z
  .object({
    id: identity,
    ordinal: z.number().int().positive(),
    sourceLine: z.number().int().positive(),
    condition: z.string().max(300),
    directives: z.array(directiveSchema).max(300),
  })
  .strict();
export const importedChapterSchema = z
  .object({
    schemaVersion: z.literal(1),
    chapterId: identity,
    version: identity,
    targetBuild: z.number().int().positive(),
    sourceSha256: hash,
    sourceName: z.literal("RestedXP Forever Guide"),
    steps: z.array(importedStepSchema).min(1).max(5000),
  })
  .strict();
export type ImportedDirective = z.infer<typeof directiveSchema>;
export type ImportedStep = z.infer<typeof importedStepSchema>;
export type ImportedChapter = z.infer<typeof importedChapterSchema>;
export const guideArchiveManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    parserVersion: z.literal("forever-guide-v2"),
    publication: z.enum(["private-reference", "authorized"]),
    authorizationNote: z.string().max(500),
    sourceSha256: hash,
    inventorySha256: hash,
    targetBuild: z.number().int().positive(),
    chapters: z
      .array(
        z
          .object({
            chapterId: identity,
            version: identity,
            file: z.string().regex(/^[a-z0-9.-]+\.json$/),
            sha256: hash,
            sourceSha256: hash,
            stepCount: z.number().int().positive(),
            questIds: z.array(z.number().int().positive()).max(10000),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (
      new Set(manifest.chapters.map((chapter) => chapter.chapterId)).size !==
      manifest.chapters.length
    )
      context.addIssue({ code: "custom", message: "Duplicate archived chapter identity" });
    if (manifest.publication === "authorized" && !manifest.authorizationNote.trim())
      context.addIssue({ code: "custom", message: "Publication requires recorded authorization" });
  });
export type GuideArchiveManifest = z.infer<typeof guideArchiveManifestSchema>;
export type GuideChapterSummary = GuideArchiveManifest["chapters"][number];

export function cleanGuideText(value: string): string {
  return value
    .replace(/\|T[^|]*\|t/g, "")
    .replace(/\|A[^|]*\|a/g, "")
    .replace(/\|H[^|]*\|h([^|]*)\|h/g, "$1")
    .replace(/\|c(?:[a-fA-F0-9]{8}|RXP_[A-Z]+_)/g, "")
    .replace(/\|r/g, "")
    .replace(/\|n/g, "\n")
    .replace(/\|\|/g, "|")
    .trim();
}

function parsePosition(tag: string, arguments_: string): ImportedDirective["position"] {
  if (![".goto", ".waypoint", ".line"].includes(tag)) return null;
  const [map = "", first, second] = arguments_.split(",");
  if (!map || first === undefined || second === undefined || !first.trim() || !second.trim())
    return null;
  const x = Number(first),
    y = Number(second);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const world = /^(\d+)\/(\d+)$/.exec(map.trim());
  return {
    zone: world?.[1] ?? map.trim(),
    floor: world ? Number(world[2]) : null,
    x,
    y,
    space: world ? "world" : "map-percent",
  };
}

export function parseGuideChapter(
  source: string,
  chapterId: string,
  sourceSha256: string,
  targetBuild: number,
): ImportedChapter {
  const steps: ImportedStep[] = [];
  let current: ImportedStep | undefined;
  for (const [index, original] of source
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .entries()) {
    const line = original.trim();
    if (!line || line.startsWith("--")) continue;
    const uncommented = line.split("--")[0]?.trim() ?? "";
    const [body = "", ...conditions] = uncommented.split(/\s*<<\s*/);
    const condition = conditions.join(" ").trim();
    if (/^step(?:\s|$)/.test(body)) {
      current = {
        id: `source-step-${String(steps.length + 1).padStart(4, "0")}`,
        ordinal: steps.length + 1,
        sourceLine: index + 1,
        condition,
        directives: [],
      };
      steps.push(current);
      continue;
    }
    if (!current) continue;
    const matched = /^([.#][\w/]+)\b\s*(.*)$/.exec(body);
    let tag = matched?.[1] ?? "text";
    let arguments_ = "",
      text = "";
    if (matched) {
      const [args = "", ...description] = (matched[2] ?? "").split(/\s*>>\s*/);
      arguments_ = args.trim();
      text = cleanGuideText(description.join(" >> "));
      if (!text && [".accept", ".turnin", ".complete", ".collect"].includes(tag))
        text = cleanGuideText(original.split("--").slice(1).join("--"));
    } else if (/^(?:>>|\*|\+)/.test(body)) {
      text = cleanGuideText(body.replace(/^(?:>>|\*|\+)/, ""));
      if (/^\+\d+$/.test(body)) {
        tag = "marker";
        text = "";
      }
    } else text = cleanGuideText(body);
    const questValue = [
      ".accept",
      ".turnin",
      ".complete",
      ".abandon",
      ".daily",
      ".dailyturnin",
    ].includes(tag)
      ? Number(arguments_.split(",")[0])
      : Number.NaN;
    current.directives.push(
      directiveSchema.parse({
        tag,
        arguments: arguments_,
        condition,
        text,
        sourceLine: index + 1,
        questId: Number.isInteger(questValue) && questValue > 0 ? questValue : null,
        position: parsePosition(tag, arguments_),
      }),
    );
  }
  return importedChapterSchema.parse({
    schemaVersion: 1,
    chapterId,
    sourceSha256,
    version: `import-v2-${sourceSha256.slice(0, 16)}`,
    targetBuild,
    sourceName: "RestedXP Forever Guide",
    steps,
  });
}

export interface GuideReadingOptions {
  readonly dungeons: readonly string[];
}
export interface GuideStepView {
  readonly step: ImportedStep;
  readonly condition: ConditionResult;
  readonly directives: readonly ImportedDirective[];
  readonly conditionalDirectives: readonly ImportedDirective[];
  readonly runtimeChecks: readonly ImportedDirective[];
  readonly optional: boolean;
}
export const RUNTIME_CHECK_TAGS = new Set([
  ".isOnQuest",
  ".isNotOnQuest",
  ".isQuestTurnedIn",
  ".isQuestComplete",
  ".isQuestNotComplete",
  ".isQuestAvailable",
  ".itemcount",
  ".itemStat",
  ".money",
  ".skill",
  ".istrained",
  ".aura",
  ".cooldown",
  ".zoneskip",
  ".subzoneskip",
  ".reputation",
  ".maxlevel",
  ".train",
  ".xp",
]);

function directiveGate(
  directive: ImportedDirective,
  profile: CharacterProfile,
  options: GuideReadingOptions,
): ConditionResult {
  if (directive.tag === "#xprate") return evaluateXpRate(directive.arguments, profile.xpRate);
  if (directive.tag === "#season")
    return directive.arguments.split(/[;,\s]+/).includes("0") ? "match" : "exclude";
  // The installed loader maps non-SoM/non-SoD Forever to season zero, including its legacy #era fallback.
  if (["#som", "#hardcore", "#hardcoreserver", "#ssf"].includes(directive.tag)) return "exclude";
  if (["#era", "#era/som", "#softcore", "#softcoreserver", "#ah"].includes(directive.tag))
    return "match";
  if (directive.tag === "#phase") return "unknown";
  if (directive.tag === ".dungeon") {
    const negated = directive.arguments.startsWith("!");
    const chosen = options.dungeons.includes(directive.arguments.replace(/^!/, "").toUpperCase());
    return chosen !== negated ? "match" : "exclude";
  }
  if (directive.tag === ".group") return profile.party.size > 1 ? "unknown" : "exclude";
  if (directive.tag === ".solo") return profile.party.size === 1 ? "match" : "unknown";
  return "match";
}

export function getGuideStepView(
  step: ImportedStep,
  profile: CharacterProfile,
  options: GuideReadingOptions,
): GuideStepView {
  const directives: ImportedDirective[] = [],
    conditionalDirectives: ImportedDirective[] = [];
  const results: ConditionResult[] = [evaluateChapterCondition(step.condition, profile)];
  const gateTags = new Set([
    "#xprate",
    "#season",
    "#era",
    "#era/som",
    "#som",
    "#hardcore",
    "#hardcoreserver",
    "#softcore",
    "#softcoreserver",
    "#ssf",
    "#ah",
    "#phase",
    ".dungeon",
    ".group",
    ".solo",
  ]);
  for (const directive of step.directives) {
    const condition = evaluateChapterCondition(directive.condition, profile);
    if (condition === "exclude") continue;
    if (gateTags.has(directive.tag))
      results.push(
        condition === "unknown" ? "unknown" : directiveGate(directive, profile, options),
      );
    if (condition === "unknown") conditionalDirectives.push(directive);
    else directives.push(directive);
  }
  return {
    step,
    directives,
    conditionalDirectives,
    condition: results.includes("exclude")
      ? "exclude"
      : results.includes("unknown")
        ? "unknown"
        : "match",
    runtimeChecks: directives.filter((directive) => RUNTIME_CHECK_TAGS.has(directive.tag)),
    optional: directives.some(
      (directive) => directive.tag === "#optional" || directive.tag === "#completewith",
    ),
  };
}

export interface RaceGuideCoverage {
  readonly faction: string;
  readonly raceId: string;
  readonly classSlug: string;
  readonly minimumLevel: number | null;
  readonly maximumLevel: number | null;
  readonly missingBrackets: readonly number[];
  readonly chapterIds: readonly string[];
}
