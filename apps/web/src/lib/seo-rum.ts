import { z } from "zod";

import { HELPER_BASE_PATH } from "./site-path";

export const seoRumMetricSchema = z
  .object({
    schema: z.literal("seo-rum.v1"),
    routeTemplate: z
      .string()
      .min(1)
      .max(180)
      .regex(/^\/[A-Za-z0-9._/[\]-]+$/),
    build: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9._-]+$/),
    metric: z.enum(["CLS", "FCP", "INP", "LCP", "TTFB"]),
    value: z.number().finite().min(0).max(120_000),
    rating: z.enum(["good", "needs-improvement", "poor"]),
    device: z.enum(["mobile", "desktop"]),
  })
  .strict();

export type SeoRumMetric = z.infer<typeof seoRumMetricSchema>;

export interface SeoRumAggregate {
  readonly schema: "seo-rum-aggregate.v1";
  readonly date: string;
  readonly updatedAt: string;
  readonly groups: Readonly<
    Record<
      string,
      {
        readonly routeTemplate: string;
        readonly build: string;
        readonly metric: SeoRumMetric["metric"];
        readonly device: SeoRumMetric["device"];
        readonly count: number;
        readonly sum: number;
        readonly minimum: number;
        readonly maximum: number;
        readonly ratings: Readonly<Record<SeoRumMetric["rating"], number>>;
        readonly histogram: Readonly<Record<string, number>>;
      }
    >
  >;
}

const DYNAMIC_ROUTES: readonly [RegExp, string][] = [
  [/^\/(forever|tbc)\/encyclopedia\/items\/\d+$/, "/$1/encyclopedia/items/[itemId]"],
  [/^\/(forever|tbc)\/encyclopedia\/recipes\/\d+$/, "/$1/encyclopedia/recipes/[spellId]"],
  [/^\/forever\/encyclopedia\/quests\/\d+$/, "/forever/encyclopedia/quests/[questId]"],
  [/^\/forever\/encyclopedia\/npcs\/\d+$/, "/forever/encyclopedia/npcs/[npcId]"],
  [/^\/forever\/encyclopedia\/objects\/\d+$/, "/forever/encyclopedia/objects/[objectId]"],
  [/^\/forever\/encyclopedia\/maps\/\d+$/, "/forever/encyclopedia/maps/[mapId]"],
  [/^\/forever\/encyclopedia\/instances\/\d+$/, "/forever/encyclopedia/instances/[instanceId]"],
  [/^\/forever\/encyclopedia\/bosses\/\d+$/, "/forever/encyclopedia/bosses/[bossId]"],
  [/^\/forever\/encyclopedia\/changes\/\d+-to-\d+$/, "/forever/encyclopedia/changes/[comparison]"],
  [
    /^\/forever\/encyclopedia\/(npcs|objects)\/page\/\d+$/,
    "/forever/encyclopedia/$1/page/[pageNumber]",
  ],
  [
    /^\/(forever|tbc)\/encyclopedia\/professions\/[a-z0-9-]+$/,
    "/$1/encyclopedia/professions/[profession]",
  ],
  [
    /^\/forever\/encyclopedia\/(talents|spellbooks)\/[a-z0-9-]+$/,
    "/forever/encyclopedia/$1/[class]",
  ],
  [/^\/forever\/simulator\/[a-z0-9-]+$/, "/forever/simulator/[specialization]"],
  [/^\/forever\/markets\/[^/]+\/[^/]+$/, "/forever/markets/[region]/[realm]"],
  [
    /^\/forever\/leveling\/routes\/[a-z0-9-]+\/chapters\/[a-z0-9-]+$/,
    "/forever/leveling/routes/[route]/chapters/[chapter]",
  ],
];

export function normalizeSeoRumRoute(pathname: string): string | null {
  const withoutBasePath =
    pathname === HELPER_BASE_PATH
      ? "/"
      : pathname.startsWith(`${HELPER_BASE_PATH}/`)
        ? pathname.slice(HELPER_BASE_PATH.length)
        : pathname;
  if (!withoutBasePath.startsWith("/") || withoutBasePath.length > 180) return null;
  for (const [pattern, replacement] of DYNAMIC_ROUTES) {
    if (pattern.test(withoutBasePath)) return withoutBasePath.replace(pattern, replacement);
  }
  return /^\/(?:[a-z0-9._-]+\/?)*$/.test(withoutBasePath) ? withoutBasePath : null;
}

export function addSeoRumMetric(
  aggregate: SeoRumAggregate | null,
  input: SeoRumMetric,
  now: Date,
): SeoRumAggregate {
  const date = now.toISOString().slice(0, 10);
  if (aggregate && aggregate.date !== date) throw new Error("RUM aggregate date mismatch");
  const key = [input.routeTemplate, input.build, input.metric, input.device].join("|");
  const previous = aggregate?.groups[key];
  const bucket = histogramBucket(input.metric, input.value);
  const groups = { ...(aggregate?.groups ?? {}) };
  groups[key] = {
    routeTemplate: input.routeTemplate,
    build: input.build,
    metric: input.metric,
    device: input.device,
    count: (previous?.count ?? 0) + 1,
    sum: round((previous?.sum ?? 0) + input.value),
    minimum: previous ? Math.min(previous.minimum, input.value) : input.value,
    maximum: previous ? Math.max(previous.maximum, input.value) : input.value,
    ratings: {
      good: (previous?.ratings.good ?? 0) + (input.rating === "good" ? 1 : 0),
      "needs-improvement":
        (previous?.ratings["needs-improvement"] ?? 0) +
        (input.rating === "needs-improvement" ? 1 : 0),
      poor: (previous?.ratings.poor ?? 0) + (input.rating === "poor" ? 1 : 0),
    },
    histogram: {
      ...(previous?.histogram ?? {}),
      [bucket]: (previous?.histogram[bucket] ?? 0) + 1,
    },
  };
  return {
    schema: "seo-rum-aggregate.v1",
    date,
    updatedAt: now.toISOString(),
    groups,
  };
}

function histogramBucket(metric: SeoRumMetric["metric"], value: number): string {
  const bounds =
    metric === "CLS"
      ? [0.05, 0.1, 0.25, 0.5, 1, 2]
      : [100, 300, 800, 1_200, 2_500, 4_000, 6_000, 10_000];
  const upper = bounds.find((bound) => value <= bound);
  return upper === undefined ? `>${bounds.at(-1)}` : `<=${upper}`;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
