import { createHash } from "node:crypto";

import { load } from "cheerio";
import { z } from "zod";

import { referenceTaskSchema, type ReferenceTask } from "./contracts.js";

export const STILLSIXTY_ORIGIN = "https://www.stillsixty.com";
export const STILLSIXTY_ROBOTS_URL = `${STILLSIXTY_ORIGIN}/robots.txt`;
export const STILLSIXTY_RECIPE_SITEMAP_URL = `${STILLSIXTY_ORIGIN}/sitemap/recipes.xml`;
export const STILLSIXTY_CRAWLER_USER_AGENT =
  "WoWTraderReferenceBot/0.1 (+https://helper.kfcguild.online/forever/data)";
export const STILLSIXTY_CRAWLER_AGENT_NAME = "WoWTraderReferenceBot";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const acquisitionKindSchema = z.enum([
  "trainer",
  "vendor",
  "quest",
  "drop",
  "item",
  "reputation",
  "unknown",
]);
const relatedEntitySchema = z
  .object({
    kind: z.enum(["npc", "quest", "item", "object", "spell"]),
    id: z.number().int().positive().max(2_147_483_647),
    name: z.string().min(1).max(300),
    sourceUrl: z.url(),
  })
  .strict();

export const competitorRecipeReferenceSchema = z
  .object({
    schema: z.literal("competitor-recipe-reference.v1"),
    source: z.literal("stillsixty"),
    game: z.literal("forever"),
    recipeSpellId: z.number().int().positive().max(2_147_483_647),
    name: z.string().min(1).max(300),
    sourceUrl: z.url(),
    sourceCatalogBuildNumber: z.number().int().positive().nullable(),
    capturedAt: z.iso.datetime(),
    sourcePageSha256: sha256Schema,
    parserVersion: z.literal(1),
    rightsStatus: z.literal("review_required"),
    acquisitions: z
      .array(
        z
          .object({
            kind: acquisitionKindSchema,
            rawKind: z.string().min(1).max(80),
            unconfirmed: z.boolean(),
            entities: z.array(relatedEntitySchema).max(100),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export type CompetitorRecipeReference = z.infer<typeof competitorRecipeReferenceSchema>;

export const stagedCompetitorRecipeReferenceSchema = competitorRecipeReferenceSchema
  .extend({
    access: z
      .object({
        robotsUrl: z.literal(STILLSIXTY_ROBOTS_URL),
        robotsCheckedAt: z.iso.datetime(),
        userAgent: z.literal(STILLSIXTY_CRAWLER_USER_AGENT),
      })
      .strict(),
  })
  .strict();
export type StagedCompetitorRecipeReference = z.infer<typeof stagedCompetitorRecipeReferenceSchema>;

const planTaskSchema = z
  .object({
    recipeSpellId: z.number().int().positive().max(2_147_483_647),
    sourceUrl: z.url(),
  })
  .strict();

export const competitorRecipePlanSchema = z
  .object({
    schema: z.literal("competitor-recipe-plan.v1"),
    source: z.literal("stillsixty"),
    game: z.literal("forever"),
    createdAt: z.iso.datetime(),
    robotsUrl: z.literal(STILLSIXTY_ROBOTS_URL),
    recipeSitemapUrl: z.literal(STILLSIXTY_RECIPE_SITEMAP_URL),
    userAgent: z.literal(STILLSIXTY_CRAWLER_USER_AGENT),
    sourceSitemapSha256: sha256Schema,
    inputQueueSha256: sha256Schema,
    rights: z
      .object({
        status: z.literal("review_required"),
        declaredUpstream: z.literal(
          "CMaNGOS Classic database (GPL-3.0) plus Forever changes and client data",
        ),
        note: z.literal(
          "Robots access permission does not grant data-reuse rights; records remain staged until reviewed.",
        ),
      })
      .strict(),
    summary: z
      .object({
        unresolvedRecipeCount: z.number().int().nonnegative(),
        sitemapRecipeCount: z.number().int().nonnegative(),
        matchedRecipeCount: z.number().int().nonnegative(),
        unmatchedRecipeCount: z.number().int().nonnegative(),
      })
      .strict(),
    tasks: z.array(planTaskSchema).max(100_000),
  })
  .strict();
export type CompetitorRecipePlan = z.infer<typeof competitorRecipePlanSchema>;

export function parseStillSixtyRecipePage(
  html: string,
  recipeSpellId: number,
  capturedAt: string,
): CompetitorRecipeReference {
  if (Buffer.byteLength(html) > 2_000_000) throw new Error("StillSixty page exceeds 2 MB");
  const $ = load(html);
  const canonical = $('link[rel="canonical"]').attr("href");
  const expectedUrl = `${STILLSIXTY_ORIGIN}/recipe/${recipeSpellId}`;
  if (canonical !== expectedUrl) throw new Error("StillSixty recipe canonical mismatch");

  const name = $("main h1").first().text().replace(/\s+/g, " ").trim();
  if (!name) throw new Error("StillSixty recipe name missing");

  const acquisitionElements = $("[data-acquisition]").toArray();
  if (acquisitionElements.length === 0) {
    throw new Error("StillSixty acquisition markers missing; parser review required");
  }
  const acquisitions = acquisitionElements.map((element) => {
    const card = $(element);
    const rawKind = card.attr("data-acquisition")?.trim().toLocaleLowerCase("en");
    if (!rawKind) throw new Error("StillSixty acquisition marker is empty");
    const entities = extractRelatedEntities($, card.find("a[href]").toArray());
    return {
      kind: normalizeAcquisitionKind(rawKind),
      rawKind,
      unconfirmed: /(?:unconfirmed|not yet confirmed)/i.test(card.text()),
      entities,
    };
  });

  if (
    acquisitions.length === 1 &&
    acquisitions[0]?.kind === "trainer" &&
    acquisitions[0].entities.length === 0
  ) {
    acquisitions[0] = {
      ...acquisitions[0],
      entities: extractRelatedEntities($, $('a[href^="/npc/"]').toArray()),
    };
  }

  return competitorRecipeReferenceSchema.parse({
    schema: "competitor-recipe-reference.v1",
    source: "stillsixty",
    game: "forever",
    recipeSpellId,
    name,
    sourceUrl: expectedUrl,
    sourceCatalogBuildNumber: null,
    capturedAt: new Date(capturedAt).toISOString(),
    sourcePageSha256: sha256(html),
    parserVersion: 1,
    rightsStatus: "review_required",
    acquisitions,
  });
}

export function buildStillSixtyRecipePlan(
  queue: readonly ReferenceTask[],
  sitemapXml: string,
  createdAt = new Date(),
): CompetitorRecipePlan {
  const unresolvedRecipeIds = new Set(
    queue
      .map((task) => referenceTaskSchema.parse(task))
      .filter((task) => task.game === "forever" && task.kind === "spell")
      .map((task) => task.id),
  );
  const sitemapRecipes = parseStillSixtyRecipeSitemap(sitemapXml);
  const tasks = sitemapRecipes
    .filter((entry) => unresolvedRecipeIds.has(entry.recipeSpellId))
    .sort((left, right) => left.recipeSpellId - right.recipeSpellId);
  return competitorRecipePlanSchema.parse({
    schema: "competitor-recipe-plan.v1",
    source: "stillsixty",
    game: "forever",
    createdAt: createdAt.toISOString(),
    robotsUrl: STILLSIXTY_ROBOTS_URL,
    recipeSitemapUrl: STILLSIXTY_RECIPE_SITEMAP_URL,
    userAgent: STILLSIXTY_CRAWLER_USER_AGENT,
    sourceSitemapSha256: sha256(sitemapXml),
    inputQueueSha256: sha256(JSON.stringify(queue)),
    rights: {
      status: "review_required",
      declaredUpstream: "CMaNGOS Classic database (GPL-3.0) plus Forever changes and client data",
      note: "Robots access permission does not grant data-reuse rights; records remain staged until reviewed.",
    },
    summary: {
      unresolvedRecipeCount: unresolvedRecipeIds.size,
      sitemapRecipeCount: sitemapRecipes.length,
      matchedRecipeCount: tasks.length,
      unmatchedRecipeCount: unresolvedRecipeIds.size - tasks.length,
    },
    tasks,
  });
}

export function parseStillSixtyRecipeSitemap(
  sitemapXml: string,
): readonly { readonly recipeSpellId: number; readonly sourceUrl: string }[] {
  if (Buffer.byteLength(sitemapXml) > 2_000_000) {
    throw new Error("StillSixty recipe sitemap exceeds 2 MB");
  }
  const $ = load(sitemapXml, { xmlMode: true });
  const recipes = new Map<number, string>();
  $("url > loc").each((_, element) => {
    const value = $(element).text().trim();
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("StillSixty sitemap contains an invalid URL");
    }
    if (url.origin !== STILLSIXTY_ORIGIN || url.search || url.hash) {
      throw new Error("StillSixty sitemap contains an out-of-scope URL");
    }
    const match = /^\/recipe\/(\d+)$/.exec(url.pathname);
    if (!match) throw new Error("StillSixty recipe sitemap contains a non-recipe URL");
    const recipeSpellId = Number(match[1]);
    if (!Number.isSafeInteger(recipeSpellId) || recipeSpellId <= 0) {
      throw new Error("StillSixty sitemap contains an invalid recipe ID");
    }
    const previous = recipes.get(recipeSpellId);
    if (previous && previous !== url.href) {
      throw new Error("StillSixty sitemap contains conflicting recipe URLs");
    }
    recipes.set(recipeSpellId, url.href);
  });
  if (recipes.size === 0) throw new Error("StillSixty recipe sitemap is empty");
  return [...recipes].map(([recipeSpellId, sourceUrl]) => ({ recipeSpellId, sourceUrl }));
}

function normalizeAcquisitionKind(rawKind: string): z.infer<typeof acquisitionKindSchema> {
  switch (rawKind) {
    case "trainer":
      return "trainer";
    case "vendor":
    case "merchant":
      return "vendor";
    case "quest":
      return "quest";
    case "creature":
    case "object":
    case "drop":
      return "drop";
    case "item":
      return "item";
    case "favor":
    case "reputation":
      return "reputation";
    default:
      return "unknown";
  }
}

function extractRelatedEntities(
  $: ReturnType<typeof load>,
  links: readonly ReturnType<ReturnType<typeof load>>[number][],
): z.infer<typeof relatedEntitySchema>[] {
  const entities = new Map<string, z.infer<typeof relatedEntitySchema>>();
  for (const element of links) {
    const href = $(element).attr("href");
    if (!href) continue;
    const url = new URL(href, STILLSIXTY_ORIGIN);
    if (url.origin !== STILLSIXTY_ORIGIN || url.search || url.hash) continue;
    const match = /^\/(npc|quest|item|object|spell)\/(\d+)(?:\/.*)?$/.exec(url.pathname);
    if (!match) continue;
    const kind = match[1] as z.infer<typeof relatedEntitySchema>["kind"];
    const id = Number(match[2]);
    const name = $(element).text().replace(/\s+/g, " ").trim();
    if (!name || !Number.isSafeInteger(id) || id <= 0) continue;
    const entity = relatedEntitySchema.parse({ kind, id, name, sourceUrl: url.href });
    entities.set(`${kind}:${id}`, entity);
  }
  return [...entities.values()];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
