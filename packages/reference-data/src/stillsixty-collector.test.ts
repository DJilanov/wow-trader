import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  crawlStillSixtyRecipes,
  downloadStillSixtyPlan,
  parseCompetitorRecord,
  type CompetitorFetch,
} from "./stillsixty-collector.js";
import {
  buildStillSixtyRecipePlan,
  STILLSIXTY_RECIPE_SITEMAP_URL,
  STILLSIXTY_ROBOTS_URL,
} from "./stillsixty-reference.js";

const robots = "User-agent: *\nAllow: /\nDisallow: /api/\n";
const sitemap =
  '<?xml version="1.0"?><urlset><url><loc>https://www.stillsixty.com/recipe/2538</loc></url></urlset>';
const html = [
  '<link rel="canonical" href="https://www.stillsixty.com/recipe/2538">',
  "<main><h1>Herb Baked Egg</h1>",
  '<li data-acquisition="trainer">Profession trainer</li>',
  '<a href="/npc/1355">Cook Ghilm</a>',
  "</main>",
].join("");

function response(
  url: string,
  body: string,
  status = 200,
  headers?: Readonly<Record<string, string>>,
) {
  const encoded = new TextEncoder().encode(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: new Headers(headers),
    arrayBuffer: async (): Promise<ArrayBuffer> => encoded.buffer,
  };
}

describe("StillSixty collection controls", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "stillsixty-collector-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("downloads only a robots-allowed sitemap and builds a queue intersection", async () => {
    const requests: string[] = [];
    const fetcher: CompetitorFetch = async (url) => {
      requests.push(url);
      return url === STILLSIXTY_ROBOTS_URL ? response(url, robots) : response(url, sitemap);
    };

    const plan = await downloadStillSixtyPlan({
      queue: [
        { game: "forever", kind: "spell", id: 2538 },
        { game: "forever", kind: "spell", id: 99999 },
      ],
      now: () => new Date("2026-10-18T10:00:00.000Z"),
      fetch: fetcher,
    });

    expect(requests).toEqual([STILLSIXTY_ROBOTS_URL, STILLSIXTY_RECIPE_SITEMAP_URL]);
    expect(plan.summary).toMatchObject({ matchedRecipeCount: 1, unmatchedRecipeCount: 1 });
  });

  it("stages normalized evidence and a resumable status record", async () => {
    const plan = buildStillSixtyRecipePlan(
      [{ game: "forever", kind: "spell", id: 2538 }],
      sitemap,
      new Date("2026-10-18T10:00:00.000Z"),
    );
    const requests: string[] = [];
    const fetcher: CompetitorFetch = async (url) => {
      requests.push(url);
      return url === STILLSIXTY_ROBOTS_URL ? response(url, robots) : response(url, html);
    };
    const staging = join(root, "staging");
    const statusPath = join(root, "state", "status.json");

    const status = await crawlStillSixtyRecipes({
      plan,
      stagingDirectory: staging,
      statusPath,
      limit: 1,
      requestsPerHour: 48,
      now: () => new Date("2026-10-18T10:00:00.000Z"),
      fetch: fetcher,
      sleep: async (): Promise<void> => {},
    });

    expect(requests).toEqual([STILLSIXTY_ROBOTS_URL, plan.tasks[0]?.sourceUrl]);
    expect(status).toMatchObject({
      completedRecipeSpellIds: [2538],
      failures: [],
      stopReason: "complete",
    });
    const record = parseCompetitorRecord(
      JSON.parse(await readFile(join(staging, "stillsixty-spell-2538.json"), "utf8")),
    );
    expect(record).toMatchObject({
      recipeSpellId: 2538,
      rightsStatus: "review_required",
      access: { robotsUrl: STILLSIXTY_ROBOTS_URL },
    });
  });

  it("does not request entity pages when robots disallows them", async () => {
    const plan = buildStillSixtyRecipePlan([{ game: "forever", kind: "spell", id: 2538 }], sitemap);
    let requests = 0;
    const fetcher: CompetitorFetch = async (url) => {
      requests += 1;
      return response(url, "User-agent: *\nDisallow: /recipe/\n");
    };

    await expect(
      crawlStillSixtyRecipes({
        plan,
        stagingDirectory: join(root, "staging"),
        statusPath: join(root, "status.json"),
        limit: 1,
        fetch: fetcher,
      }),
    ).rejects.toThrow(/robots policy/);
    expect(requests).toBe(1);
  });

  it("stops and records a cooldown when the source returns 429", async () => {
    const plan = buildStillSixtyRecipePlan(
      [{ game: "forever", kind: "spell", id: 2538 }],
      sitemap,
      new Date("2026-10-18T10:00:00.000Z"),
    );
    const fetcher: CompetitorFetch = async (url) =>
      url === STILLSIXTY_ROBOTS_URL
        ? response(url, robots)
        : response(url, "rate limited", 429, { "retry-after": "60" });

    const status = await crawlStillSixtyRecipes({
      plan,
      stagingDirectory: join(root, "staging"),
      statusPath: join(root, "status.json"),
      limit: 1,
      now: () => new Date("2026-10-18T10:00:00.000Z"),
      fetch: fetcher,
    });

    expect(status.stopReason).toBe("rate_limited");
    expect(status.blockedUntil).toBe("2026-10-18T10:05:00.000Z");
    expect(status.failures).toHaveLength(1);
  });
});
