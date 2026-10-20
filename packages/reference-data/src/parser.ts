import { createHash } from "node:crypto";
import { parse, type Node } from "acorn";
import { simple } from "acorn-walk";
import { load, type CheerioAPI } from "cheerio";
import { parseDropStatistics } from "./drop-statistics.js";
import { parseRequiredQuestItems } from "./quest-items.js";
import {
  referenceRecordSchema,
  referenceTaskSchema,
  type ReferenceRecord,
  type ReferenceTask,
} from "./contracts.js";
import {
  QUEST_XP_PARSER_VERSION,
  questXpRecordSchema,
  type QuestXpRecord,
} from "./quest-xp-contracts.js";

export interface Expression extends Node {
  value?: unknown;
  name?: string;
  operator?: string;
  argument?: Expression;
  arguments?: Expression[];
  elements?: Array<Expression | null>;
  callee?: Expression;
  object?: Expression;
  property?: Expression;
  computed?: boolean;
  left?: Expression;
  right?: Expression;
  properties?: Array<{
    type: string;
    computed?: boolean;
    kind?: string;
    key: Expression;
    value: Expression;
  }>;
}

export function literal(node: Expression | undefined, depth = 0): unknown {
  if (!node || depth > 30) throw new Error("Unsupported reference expression");
  if (node.type === "Literal") return node.value;
  if (node.type === "UnaryExpression" && node.operator === "-") {
    const value = literal(node.argument, depth + 1);
    if (typeof value === "number") return -value;
  }
  if (node.type === "ArrayExpression")
    return node.elements?.map((entry) => literal(entry ?? undefined, depth + 1));
  if (node.type === "ObjectExpression") {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const property of node.properties ?? []) {
      if (property.type !== "Property" || property.computed || property.kind !== "init")
        throw new Error("Unsupported reference property");
      const key = property.key.type === "Identifier" ? property.key.name : property.key.value;
      if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("Unsafe reference property");
      result[key] = literal(property.value, depth + 1);
    }
    return result;
  }
  throw new Error(`Nonliteral reference expression: ${node.type}`);
}

export function field(node: Expression | undefined, key: string): Expression | undefined {
  return node?.properties?.find(
    (property) => !property.computed && (property.key.name ?? property.key.value) === key,
  )?.value;
}

export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function plainText(html: string): string {
  const $ = load(html);
  $("script,style,iframe,object").remove();
  return $.root().text().replace(/\s+/g, " ").trim();
}

function expressionPath(node: Expression | undefined): string {
  if (node?.type === "Identifier") return node.name ?? "";
  if (node?.type === "MemberExpression" && !node.computed)
    return `${expressionPath(node.object)}.${expressionPath(node.property)}`;
  return "";
}

export function calls(script: string, name: string): Expression[] {
  const result: Expression[] = [];
  const inspect = (node: Node): void => {
    const expression = node as Expression;
    if (expressionPath(expression.callee) === name) result.push(expression);
  };
  simple(parse(script, { ecmaVersion: "latest" }), {
    CallExpression: inspect,
    NewExpression: inspect,
  });
  return result;
}

const relationKinds = new Set(["npc", "quest", "spell", "item", "object"]);
const allowedRelations = new Set([
  "taught-by-npc",
  "taught-by-item",
  "dropped-by",
  "sold-by",
  "reward-from",
  "disenchanted-from",
  "contained-in-item",
  "contained-in-object",
  "created-by",
  "created-by-spell",
  "reagent-for",
  "used-by",
  "objective-of",
  "provided-for",
  "series",
]);
const constrainedRelationKinds = new Map<string, string>([
  ["taught-by-npc", "npc"],
  ["taught-by-item", "item"],
]);
const numericKeys = new Set([
  "str",
  "agi",
  "sta",
  "int",
  "spi",
  "armor",
  "blockamount",
  "dmgmin1",
  "dmgmax1",
  "dps",
  "speed",
  "reqlevel",
  "dura",
  "classes",
  "slotbak",
  "buyprice",
  "sellprice",
  "mleatkpwr",
  "mlehitrtng",
  "mlecritstrkrtng",
  "rgdatkpwr",
  "splpwr",
  "splheal",
  "spldmg",
  "armorpenrtng",
  "nsockets",
  "socket1",
  "socket2",
  "socket3",
  "socketbonus",
  "itemset",
  "firres",
  "frores",
  "arcres",
  "shares",
  "natres",
]);

export function parseWowheadPage(
  html: string,
  taskInput: ReferenceTask,
  options: {
    readonly url: string;
    readonly capturedAt: string;
    readonly permissionRef: string;
    readonly itemXml?: string;
  },
): ReferenceRecord {
  const task = referenceTaskSchema.parse(taskInput);
  if (Buffer.byteLength(html) > 4_000_000) throw new Error("Reference page too large");
  const $ = load(html);
  const canonical = $('link[rel="canonical"]').attr("href");
  if (!canonical) throw new Error("Reference canonical missing");
  const fetched = new URL(options.url);
  const expected = `/${task.game}/${task.kind}=${task.id}`;
  if (
    fetched.origin !== "https://www.wowhead.com" ||
    !(fetched.pathname === expected || fetched.pathname.startsWith(`${expected}/`))
  )
    throw new Error("Fetched edition or identity mismatch");
  const name = $("h1").first().text().trim();
  const relations: ReferenceRecord["relations"] = [];
  const numericFacts: Record<string, number> = {};
  let quickFacts: string[] = [];
  let matchingItemData = false;
  let foreignItemData = false;
  let matchingQuestData = false;
  let htmlItemTooltip: string | undefined;
  let htmlClassId: number | undefined;
  let htmlSubclassId: number | undefined;
  for (const element of $("script").toArray()) {
    const script = $(element).text();
    if (script.length > 2_000_000) throw new Error("Reference script too large");
    if (task.kind === "item" && script.includes("WH.Gatherer.addData")) {
      for (const call of calls(script, "WH.Gatherer.addData")) {
        if (literal(call.arguments?.[0]) !== 3) continue;
        if (literal(call.arguments?.[1]) !== (task.game === "tbc" ? 5 : 16)) {
          foreignItemData = true;
          continue;
        }
        const entry = object(object(literal(call.arguments?.[2]))?.[String(task.id)]);
        if (!entry) continue;
        if (entry.name_enus !== name) throw new Error("Reference item name mismatch");
        matchingItemData = true;
        if (typeof entry.classs === "number" && Number.isSafeInteger(entry.classs))
          htmlClassId = entry.classs;
        if (typeof entry.subclass === "number" && Number.isSafeInteger(entry.subclass))
          htmlSubclassId = entry.subclass;
        const equip = object(entry.jsonequip);
        for (const [key, value] of Object.entries(equip ?? {}))
          if (numericKeys.has(key) && typeof value === "number" && Number.isFinite(value))
            numericFacts[key] = value;
      }
    }
    if (task.kind === "item" && script.includes("g_items")) {
      const facts = parseHtmlItemFacts(script, task.id);
      if (facts.tooltip) htmlItemTooltip = facts.tooltip;
      if (facts.classId !== undefined) htmlClassId = facts.classId;
      if (facts.subclassId !== undefined) htmlSubclassId = facts.subclassId;
    }
    if (task.kind === "quest" && script.includes("WH.Gatherer.addData")) {
      for (const call of calls(script, "WH.Gatherer.addData")) {
        if (
          literal(call.arguments?.[0]) !== 5 ||
          literal(call.arguments?.[1]) !== (task.game === "forever" ? 16 : 5)
        )
          continue;
        const entry = object(object(literal(call.arguments?.[2]))?.[String(task.id)]);
        if (!entry) continue;
        if (typeof entry.name_enus !== "string" || entry.name_enus.trim() !== name)
          throw new Error("Reference quest name mismatch");
        matchingQuestData = true;
      }
    }
    if (script.includes("new Listview")) {
      for (const call of calls(script, "Listview")) {
        const config = call.arguments?.[0];
        const idNode = field(config, "id"),
          kindNode = field(config, "template");
        if (!idNode || !kindNode) continue;
        const relationValue = literal(idNode),
          kind = literal(kindNode);
        if (typeof relationValue !== "string" || typeof kind !== "string") continue;
        // Real item pages suffix quest-backed tabs (for example
        // "reward-from-q"); the storage contract uses the unsuffixed id.
        const relation = relationValue.endsWith("-q") ? relationValue.slice(0, -2) : relationValue;
        if (!allowedRelations.has(relation) || !relationKinds.has(kind)) continue;
        const constrainedKind = constrainedRelationKinds.get(relation);
        if (constrainedKind && kind !== constrainedKind)
          throw new Error("Reference acquisition relation kind changed");
        const data = literal(field(config, "data"));
        if (!Array.isArray(data)) throw new Error("Reference relation table changed");
        for (const value of data) {
          const row = object(value);
          if (
            row &&
            typeof row.id === "number" &&
            Number.isSafeInteger(row.id) &&
            row.id > 0 &&
            typeof row.name === "string"
          ) {
            const dropStatistics =
              relation === "dropped-by" && kind === "npc" ? parseDropStatistics(row) : undefined;
            relations.push({
              relation,
              kind: kind as ReferenceRecord["relations"][number]["kind"],
              id: row.id,
              name: plainText(row.name),
              ...(dropStatistics ? { dropStatistics } : {}),
            });
          }
        }
      }
    }
    if (task.kind === "quest" && script.includes("WH.markup.printHtml")) {
      for (const call of calls(script, "WH.markup.printHtml")) {
        if (
          call.arguments?.[1]?.type !== "Literal" ||
          call.arguments[1].value !== "infobox-contents-0"
        )
          continue;
        const markup = literal(call.arguments[0]);
        if (typeof markup !== "string") throw new Error("Quest quick facts changed");
        quickFacts = [...markup.matchAll(/\[li\]([\s\S]*?)\[\/li\]/g)]
          .map((match) =>
            plainText(
              (match[1] ?? "")
                .replace(/\[(race|class)=(\d+)\]/g, "$1 ID $2")
                .replace(/\[[^\]]*\]/g, ""),
            ),
          )
          .filter(Boolean);
        for (const match of markup.matchAll(
          /\[icon name=quest-(start|end)\]([\s\S]*?)\[\/icon\]/g,
        )) {
          const giver = match[2]?.match(/\[url=([^\]]+)\]([^[]+)\[\/url\]/);
          if (!giver) continue;
          const link = new URL(giver[1] ?? "", canonical);
          const identity = link.pathname.match(
            new RegExp(`^/${task.game}/(npc|object)=([1-9]\\d*)(?:/|$)`),
          );
          const id = Number(identity?.[2]);
          if (
            link.origin !== "https://www.wowhead.com" ||
            link.search ||
            link.hash ||
            link.username ||
            link.password ||
            !identity ||
            !Number.isSafeInteger(id) ||
            id > 2147483647
          )
            throw new Error("Quest giver identity or edition mismatch");
          relations.push({
            relation: match[1]!,
            kind: identity[1] === "npc" ? "npc" : "object",
            id,
            name: plainText(giver[2] ?? ""),
          });
        }
      }
    }
  }
  // Related-item preloads can cross editions; a matching primary dataset must still be present.
  if (foreignItemData && !matchingItemData) throw new Error("Gatherer edition mismatch");
  const tooltipLines = options.itemXml
    ? parseItemXml(options.itemXml, task, name)
    : htmlItemTooltip
      ? parseItemTooltipLines(htmlItemTooltip)
      : [];
  if (options.itemXml) {
    const xml = load(options.itemXml, { xmlMode: true });
    numericFacts.classId = Number(xml("wowhead > item > class").attr("id"));
    numericFacts.subclassId = Number(xml("wowhead > item > subclass").attr("id"));
    if (
      !Number.isSafeInteger(numericFacts.classId) ||
      !Number.isSafeInteger(numericFacts.subclassId)
    )
      throw new Error("Item classification missing");
  } else if (task.kind === "item") {
    if (Number.isSafeInteger(htmlClassId)) numericFacts.classId = htmlClassId!;
    if (Number.isSafeInteger(htmlSubclassId)) numericFacts.subclassId = htmlSubclassId!;
  }
  const quest =
    task.kind === "quest"
      ? parseQuestSections($, matchingQuestData)
      : { objectives: [], description: "", rewards: [], questContent: undefined };
  return referenceRecordSchema.parse({
    ...task,
    schema: "wowhead-reference.v1",
    name,
    sourceUrl: canonical,
    capturedAt: options.capturedAt,
    permissionRef: options.permissionRef,
    sourceSha256: createHash("sha256")
      .update(html)
      .update(options.itemXml ?? "")
      .digest("hex"),
    tooltipLines,
    numericFacts,
    quickFacts,
    ...quest,
    ...(task.kind === "quest" ? { requiredItems: parseRequiredQuestItems($, task.game) } : {}),
    relations,
  });
}

function parseItemXml(xml: string, task: ReferenceTask, name: string): string[] {
  if (Buffer.byteLength(xml) > 300_000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Unsupported item XML");
  const $ = load(xml, { xmlMode: true });
  const item = $("wowhead > item");
  if (
    item.length !== 1 ||
    item.attr("id") !== String(task.id) ||
    item.children("name").text() !== name
  )
    throw new Error("Item XML identity mismatch");
  const link = new URL(item.children("link").text());
  const expected = `/${task.game}/item=${task.id}`;
  if (
    link.origin !== "https://www.wowhead.com" ||
    !(link.pathname === expected || link.pathname.startsWith(`${expected}/`))
  )
    throw new Error("Item XML edition mismatch");
  return parseItemTooltipLines(item.children("htmlTooltip").text());
}

function parseItemTooltipLines(html: string): string[] {
  if (Buffer.byteLength(html) > 300_000 || /<!DOCTYPE|<!ENTITY/i.test(html))
    throw new Error("Unsupported item tooltip");
  const tooltip = load(html);
  tooltip("script,style,iframe,object,.whtt-extra,.whtt-sellprice").remove();
  tooltip("br").replaceWith("\n");
  tooltip("td,th,span").append(" ");
  tooltip("tr,table,div").append("\n");
  return tooltip
    .root()
    .text()
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

interface HtmlItemFacts {
  readonly tooltip?: string;
  readonly classId?: number;
  readonly subclassId?: number;
}

function parseHtmlItemFacts(script: string, id: number): HtmlItemFacts {
  if (script.length > 2_000_000) throw new Error("Reference script too large");
  let ast: Node;
  try {
    ast = parse(script, { ecmaVersion: "latest" });
  } catch {
    return {};
  }
  let tooltip: string | undefined;
  let classId: number | undefined;
  let subclassId: number | undefined;
  simple(ast, {
    AssignmentExpression(node: Node): void {
      const assignment = node as Expression;
      const left = assignment.left;
      if (left?.type !== "MemberExpression") return;
      const target = left.object;
      if (target?.type !== "MemberExpression" || !target.computed) return;
      if (target.object?.type !== "Identifier" || target.object.name !== "g_items") return;
      if (literal(target.property) !== id) return;
      const property = left.property;
      const propertyName = property?.type === "Identifier" ? property.name : property?.value;
      if (propertyName !== "tooltip_enus") return;
      try {
        const value = literal(assignment.right);
        if (typeof value === "string") tooltip = value;
      } catch {
        // Leave the tooltip missing; the quality gap will surface it.
      }
    },
  });
  for (const call of calls(script, "$.extend")) {
    const target = call.arguments?.[0];
    if (target?.type !== "MemberExpression" || !target.computed) continue;
    if (target.object?.type !== "Identifier" || target.object.name !== "g_items") continue;
    if (literal(target.property) !== id) continue;
    try {
      const data = object(literal(call.arguments?.[1]));
      if (typeof data?.classs === "number" && Number.isSafeInteger(data.classs))
        classId = data.classs;
      if (typeof data?.subclass === "number" && Number.isSafeInteger(data.subclass))
        subclassId = data.subclass;
    } catch {
      // Leave the classification missing; the quality gap will surface it.
    }
  }
  return {
    ...(tooltip ? { tooltip } : {}),
    ...(classId !== undefined ? { classId } : {}),
    ...(subclassId !== undefined ? { subclassId } : {}),
  };
}

function parseQuestSections(
  $: CheerioAPI,
  matchingQuestData: boolean,
): {
  objectives: string[];
  description: string;
  rewards: string[];
  questContent: {
    objectives: "present" | "none" | "unknown";
    rewards: "present" | "none" | "unknown";
  };
} {
  const article = $("h1").first().parent();
  const clean = article.clone();
  clean.find("script,style,.infobox,.db-page-collection-tracker-cta,.guide-image-links").remove();
  // Quest prose includes sibling text nodes; nextUntil() drops those and can mistake
  // the completion-check widget for a reward. Keep only the named content sections.
  const contents = clean.contents().toArray();
  const textBetween = (index: number): string => {
    if (index < 0) return "";
    const end = contents.findIndex((node, position) => position > index && $(node).is("h1,h2"));
    return contents
      .slice(index + 1, end < 0 ? undefined : end)
      .map((node) => {
        const fragment = $(node).clone();
        if (fragment.text().includes("C_QuestLog.IsQuestFlaggedCompleted")) return "";
        fragment.find("script,style,.mapper,.infobox").remove();
        fragment.find("br").replaceWith(" ");
        fragment.find("td,li").append(" ");
        return fragment.text();
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  };
  const objectiveText = textBetween(contents.findIndex((node) => $(node).is("h1")));
  const progressIndex = contents.findIndex(
    (node) => $(node).is("h2") && $(node).text().trim() === "Progress",
  );
  const progressEnd = contents.findIndex(
    (node, position) => position > progressIndex && $(node).is("h1,h2"),
  );
  const progressRows =
    progressIndex < 0
      ? []
      : contents
          .slice(progressIndex + 1, progressEnd < 0 ? undefined : progressEnd)
          .flatMap((node) => {
            const fragment = $(node);
            const rows = fragment.is("table.icon-list tr")
              ? fragment
              : fragment.find("table.icon-list tr");
            return rows
              .toArray()
              .map((row) => $(row).text().replace(/\s+/g, " ").trim())
              .filter(Boolean);
          });
  const objectives = objectiveText ? [objectiveText] : [...new Set(progressRows)];
  const description = textBetween(
    contents.findIndex((node) => $(node).is("h2") && $(node).text().trim() === "Description"),
  );
  let hasRewardHeading = false;
  const rewards = contents.flatMap((node, index) => {
    if (!$(node).is("h2") || !/^(?:Rewards|Gains)$/.test($(node).text().trim())) return [];
    hasRewardHeading = true;
    const text = textBetween(index)
      .replace(/^Upon completion of this quest you will gain:\s*/i, "")
      .trim();
    return text ? [text] : [];
  });
  return {
    objectives,
    description,
    rewards,
    questContent: {
      objectives: objectives.length ? "present" : matchingQuestData ? "none" : "unknown",
      rewards: rewards.length
        ? "present"
        : matchingQuestData && !hasRewardHeading
          ? "none"
          : "unknown",
    },
  };
}

export function parseQuestXpPage(html: string, record: ReferenceRecord): QuestXpRecord {
  if (record.kind !== "quest") throw new Error("Quest XP extraction requires a quest record");
  if (Buffer.byteLength(html) > 4_000_000) throw new Error("Quest XP page too large");
  referenceRecordSchema.parse(record);
  if (createHash("sha256").update(html).digest("hex") !== record.sourceSha256)
    throw new Error("Quest XP source checksum mismatch");
  const $ = load(html);
  if ($('link[rel="canonical"]').attr("href") !== record.sourceUrl)
    throw new Error("Quest XP canonical mismatch");
  let primary: Record<string, unknown> | null = null;
  let scaling: Record<string, unknown> | null = null;
  let matchingEdition = false;
  for (const element of $("script").toArray()) {
    const script = $(element).text();
    if (script.length > 2_000_000) throw new Error("Quest XP script too large");
    if (script.includes("WH.Gatherer.addData"))
      for (const call of calls(script, "WH.Gatherer.addData")) {
        if (
          literal(call.arguments?.[0]) !== 5 ||
          literal(call.arguments?.[1]) !== (record.game === "forever" ? 16 : 5)
        )
          continue;
        const entry = object(object(literal(call.arguments?.[2]))?.[String(record.id)]);
        if (entry) {
          if (typeof entry.name_enus !== "string" || entry.name_enus.trim() !== record.name)
            throw new Error("Quest XP primary name mismatch");
          matchingEdition = true;
        }
      }
    if (script.includes("$.extend"))
      for (const call of calls(script, "$.extend")) {
        const target = call.arguments?.[0];
        if (
          target?.type !== "MemberExpression" ||
          !target.computed ||
          target.object?.name !== "g_quests" ||
          literal(target.property) !== record.id
        )
          continue;
        const data = object(literal(call.arguments?.[1]));
        if (
          !data ||
          data.id !== record.id ||
          typeof data.name !== "string" ||
          data.name.trim() !== record.name
        )
          throw new Error("Quest XP metadata identity mismatch");
        if (primary) throw new Error("Duplicate primary quest metadata");
        primary = data;
      }
    if (script.includes("WH.Wow.Quest.setupScalingRewards"))
      for (const call of calls(script, "WH.Wow.Quest.setupScalingRewards")) {
        if (scaling) throw new Error("Duplicate quest XP scaling configuration");
        scaling = object(literal(call.arguments?.[0]));
      }
  }
  const number = (value: unknown, minimum: number, maximum: number): number | null => {
    if (value === undefined || value === null || value === -1) return null;
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < minimum ||
      value > maximum
    )
      throw new Error("Invalid primary quest XP number");
    return value;
  };
  const questLevel = number(primary?.level, 1, 60);
  const minimumLevel = primary?.reqlevel === 0 ? 1 : number(primary?.reqlevel, 1, 60);
  const issues: string[] = [];
  let fullXp: number | null = null;
  let referenceBaseXp: number | null = null,
    pageMultiplier: number | null = null;
  const xpByLevel: QuestXpRecord["xpByLevel"] = [];
  const scripts = $("script[src]")
    .toArray()
    .map((element) => $(element).attr("src"));
  const coreRevision = ["52d4f803", "97211824", "25318d8a", "154e707b"].find((revision) =>
    scripts.includes(`https://wow.zamimg.com/js/global-core.js?${revision}`),
  );
  const rendererRevision =
    scripts.includes("https://wow.zamimg.com/js/quest.js?5f36c4ad") && coreRevision
      ? (`quest-5f36c4ad-core-${coreRevision}` as QuestXpRecord["rendererRevision"])
      : null;
  const round = (amount: number): number => {
    const step = amount < 1000 ? 10 : 50;
    return Math.round(amount / step) * step;
  };
  if (!rendererRevision) issues.push("unverified_quest_xp_renderer_revision");
  if (!matchingEdition) issues.push("missing_matching_quest_edition");
  if (!primary) issues.push("missing_primary_quest_dataset");
  if (matchingEdition && primary && rendererRevision) {
    const explicitlyNoXp = primary.xp === undefined && scaling === null;
    const data = object(scaling?.xp),
      levels = object(data?.levels);
    const multiplier = data?.multiplier;
    if (explicitlyNoXp) {
      fullXp = 0;
      referenceBaseXp = 0;
    } else if (
      levels &&
      typeof multiplier === "number" &&
      Number.isFinite(multiplier) &&
      multiplier >= 0 &&
      multiplier <= 20
    ) {
      pageMultiplier = multiplier;
      const bases = new Map<number, number>();
      for (const [key, amount] of Object.entries(levels)) {
        if (!/^[1-9]\d?$/.test(key)) throw new Error("Invalid quest XP table level");
        const level = number(Number(key), 1, 60),
          base = number(amount, 0, 1_000_000);
        if (level === null || base === null) throw new Error("Invalid quest XP level table");
        bases.set(level, base);
      }
      const maximum = number(scaling?.maxLevel, 1, 60),
        minimum = number(scaling?.minLevel, 1, 60);
      if (maximum === null || minimum === null || minimum > maximum)
        throw new Error("Invalid quest XP scaling bounds");
      if (questLevel !== null && minimum === maximum && questLevel === maximum) {
        referenceBaseXp = bases.get(maximum) ?? null;
        fullXp = referenceBaseXp === null ? null : round(Math.round(referenceBaseXp * multiplier));
      }
      for (let level = minimum; level <= 59; level++) {
        const base = bases.get(Math.min(level, maximum));
        if (base === undefined) continue;
        const difference = level - maximum;
        const reduction = difference >= 10 ? 0.1 : difference >= 6 ? 1 - (difference - 5) * 0.2 : 1;
        const reward = round(Math.round(base * multiplier) * reduction);
        if (reward > 1_000_000) throw new Error("Scaled quest XP exceeds budget");
        xpByLevel.push({ level, xp: reward });
      }
    } else issues.push("missing_xp_scaling_configuration");
  }
  if (fullXp === null && !xpByLevel.length) issues.push("missing_numeric_quest_xp");
  return questXpRecordSchema.parse({
    schema: "quest-xp-evidence.v1",
    parserVersion: QUEST_XP_PARSER_VERSION,
    game: record.game,
    kind: "quest",
    id: record.id,
    name: record.name,
    sourceUrl: record.sourceUrl,
    sourceSha256: record.sourceSha256,
    capturedAt: record.capturedAt,
    questLevel,
    minimumLevel,
    fullXp,
    referenceBaseXp,
    pageMultiplier,
    rendererRevision,
    xpByLevel: xpByLevel.sort((a, b) => a.level - b.level),
    status: fullXp !== null || xpByLevel.length ? "available" : "unknown",
    issues,
  });
}
