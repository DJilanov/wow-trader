import { createHash } from "node:crypto";
import { parse, type Node } from "acorn";
import { simple } from "acorn-walk";
import { load, type CheerioAPI } from "cheerio";
import {
  referenceRecordSchema,
  referenceTaskSchema,
  type ReferenceRecord,
  type ReferenceTask,
} from "./contracts.js";

interface Expression extends Node {
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
  properties?: Array<{
    type: string;
    computed?: boolean;
    kind?: string;
    key: Expression;
    value: Expression;
  }>;
}

function literal(node: Expression | undefined, depth = 0): unknown {
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

function field(node: Expression | undefined, key: string): Expression | undefined {
  return node?.properties?.find(
    (property) => !property.computed && (property.key.name ?? property.key.value) === key,
  )?.value;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function plainText(html: string): string {
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

function calls(script: string, name: string): Expression[] {
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
  for (const element of $("script").toArray()) {
    const script = $(element).text();
    if (script.length > 2_000_000) throw new Error("Reference script too large");
    if (task.kind === "item" && script.includes("WH.Gatherer.addData")) {
      for (const call of calls(script, "WH.Gatherer.addData")) {
        if (literal(call.arguments?.[0]) !== 3) continue;
        if (literal(call.arguments?.[1]) !== (task.game === "tbc" ? 5 : 16))
          throw new Error("Gatherer edition mismatch");
        const entry = object(object(literal(call.arguments?.[2]))?.[String(task.id)]);
        if (!entry) continue;
        if (entry.name_enus !== name) throw new Error("Reference item name mismatch");
        const equip = object(entry.jsonequip);
        for (const [key, value] of Object.entries(equip ?? {}))
          if (numericKeys.has(key) && typeof value === "number" && Number.isFinite(value))
            numericFacts[key] = value;
      }
    }
    if (script.includes("new Listview")) {
      for (const call of calls(script, "Listview")) {
        const config = call.arguments?.[0];
        const idNode = field(config, "id"),
          kindNode = field(config, "template");
        if (!idNode || !kindNode) continue;
        const relation = literal(idNode),
          kind = literal(kindNode);
        if (
          typeof relation !== "string" ||
          typeof kind !== "string" ||
          !allowedRelations.has(relation) ||
          !relationKinds.has(kind)
        )
          continue;
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
          )
            relations.push({
              relation,
              kind: kind as ReferenceRecord["relations"][number]["kind"],
              id: row.id,
              name: plainText(row.name),
            });
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
          const identity = link.pathname.match(new RegExp(`^/${task.game}/(npc|object)=([1-9]\\d*)(?:/|$)`));
          const id = Number(identity?.[2]);
          if (link.origin !== "https://www.wowhead.com" || link.search || link.hash ||
              link.username || link.password || !identity || !Number.isSafeInteger(id) || id > 2147483647)
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
  const tooltipLines = options.itemXml ? parseItemXml(options.itemXml, task, name) : [];
  if (options.itemXml) {
    const xml = load(options.itemXml, { xmlMode: true });
    numericFacts.classId = Number(xml("wowhead > item > class").attr("id"));
    numericFacts.subclassId = Number(xml("wowhead > item > subclass").attr("id"));
    if (
      !Number.isSafeInteger(numericFacts.classId) ||
      !Number.isSafeInteger(numericFacts.subclassId)
    )
      throw new Error("Item classification missing");
  }
  const quest =
    task.kind === "quest"
      ? parseQuestSections($)
      : { objectives: [], description: "", rewards: [] };
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
  const tooltip = load(item.children("htmlTooltip").text());
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

function parseQuestSections($: CheerioAPI): {
  objectives: string[];
  description: string;
  rewards: string[];
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
  const description = textBetween(
    contents.findIndex((node) => $(node).is("h2") && $(node).text().trim() === "Description"),
  );
  const rewards = contents.flatMap((node, index) => {
    if (!$(node).is("h2") || !/^(?:Rewards|Gains)$/.test($(node).text().trim())) return [];
    const text = textBetween(index)
      .replace(/^Upon completion of this quest you will gain:\s*/i, "")
      .trim();
    return text ? [text] : [];
  });
  return { objectives: objectiveText ? [objectiveText] : [], description, rewards };
}
