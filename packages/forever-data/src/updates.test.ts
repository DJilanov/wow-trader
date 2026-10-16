import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BLIZZARD_TOPIC_ID,
  changedClasses,
  notesChecksum,
  parseOfficialNotes,
  type DiscoursePost,
} from "./updates.js";
import {
  fetchOfficialNotes,
  getPublishedOfficialNotes,
  readOfficialNotesHealth,
  syncOfficialNotes,
} from "./updates-server.js";

function post(number: number, cooked: string): DiscoursePost {
  return {
    id: number + 100,
    post_number: number,
    user_id: 12,
    staff: true,
    username: "Official",
    created_at: "2026-10-15T21:00:00.000Z",
    updated_at: "2026-10-16T00:16:31.000Z",
    version: 1,
    cooked,
  };
}
const html =
  "<p><strong>Classes</strong></p><ul><li><strong>Mage</strong><ul><li><strong>Arcane</strong><ul><li>Missile Barrage: Moved to row 1; now a two-point talent.</li><li>Arcane Blast: Coefficient reduced 40%.</li></ul></li></ul></li><li><strong>Druid</strong><ul><li>Shred: Tooltip corrected. This is a visual bug, damage unchanged.</li></ul></li></ul><p><strong>Quests</strong></p><ul><li>Wetlands: Quest completion fixed.</li></ul>";
function topic(body = html): Record<string, unknown> {
  return {
    id: BLIZZARD_TOPIC_ID,
    title: "Development notes",
    posts_count: 0,
    post_stream: { stream: [101], posts: [post(1, body)] },
  };
}
function source(body = html): { fetcher: typeof fetch; requests: string[] } {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input): Promise<Response> => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("robots.txt")) return new Response("User-agent: *\nAllow: /");
    return Response.json(topic(body));
  };
  return { fetcher, requests };
}

describe("Official Forever development notes", () => {
  it("parses class/spec context and resets it outside classes without executing HTML", () => {
    const notes = parseOfficialNotes(topic(html + "<script>globalThis.infected=true;</script>"));
    const changes = notes.posts[0]!.changes;
    expect(changes).toHaveLength(4);
    expect(changes[0]).toMatchObject({
      className: "Mage",
      specialization: "Arcane",
      subject: "Missile Barrage",
      kind: "structure",
    });
    expect(changes[1]).toMatchObject({ kind: "tuning" });
    expect(changes[2]).toMatchObject({ className: "Druid", specialization: null, kind: "tooltip" });
    expect(changes[3]).toMatchObject({ className: null, category: "Quests" });
    expect(JSON.stringify(notes)).not.toContain("infected");
  });
  it("ignores ordinary replies and other staff rather than trusting display names", () => {
    const input = topic();
    input.post_stream = {
      stream: [101, 102, 103],
      posts: [post(1, html), { ...post(2, html), staff: false }, { ...post(3, html), user_id: 13 }],
    };
    expect(parseOfficialNotes(input).posts.map((row) => row.postId)).toEqual([101]);
    expect(() => parseOfficialNotes({ ...input, id: BLIZZARD_TOPIC_ID + 1 })).toThrow();
  });
  it("follows stream identities rather than posts_count and rejects incomplete or conflicting results", () => {
    const input = { ...topic(), post_stream: { stream: [101, 106], posts: [post(1, html)] } };
    expect(() => parseOfficialNotes(input)).toThrow(/Incomplete/);
    expect(parseOfficialNotes(input, [post(6, html)]).posts).toHaveLength(2);
    expect(() => parseOfficialNotes(topic(), [post(1, html + "<li>Changed issue.</li>")])).toThrow(
      /Conflicting/,
    );
    expect(() => parseOfficialNotes(topic(), [post(8, html)])).toThrow(/outside/);
  });
  it("does not change content identity for unrelated forum counters", () => {
    expect(notesChecksum(parseOfficialNotes(topic()))).toBe(
      notesChecksum(parseOfficialNotes({ ...topic(), views: 10000 })),
    );
    const changed = parseOfficialNotes(topic(html.replace("40%", "30%")));
    expect(changedClasses(parseOfficialNotes(topic()), changed)).toEqual(["Mage"]);
    expect(notesChecksum(changed)).not.toBe(notesChecksum(parseOfficialNotes(topic())));
  });
  it("keeps paragraph-only updates and rejects duplicate numbers or backwards timestamps", () => {
    expect(
      parseOfficialNotes(topic("<p>Items</p><p>A dungeon weapon now has a shorter cooldown.</p>"))
        .posts[0]?.changes[0],
    ).toMatchObject({ category: "Items", kind: "tuning" });
    expect(() =>
      parseOfficialNotes({
        ...topic(),
        post_stream: {
          stream: [101, 102],
          posts: [post(1, html), { ...post(2, html), post_number: 1 }],
        },
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      parseOfficialNotes({
        ...topic(),
        post_stream: {
          stream: [101],
          posts: [{ ...post(1, html), updated_at: "2020-01-01T00:00:00Z" }],
        },
      }),
    ).toThrow(/timestamps/);
  });
  it("honors source cooldown even for forced checks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "forever-cooldown-"));
    const time = new Date();
    let calls = 0;
    const options = {
      directory,
      force: true,
      now: (): Date => time,
      sleep: async (): Promise<void> => {},
      fetcher: async (): Promise<Response> => {
        calls++;
        return new Response("limited", { status: 429, headers: { "retry-after": "3600" } });
      },
    };
    try {
      await expect(syncOfficialNotes(options)).rejects.toThrow("HTTP 429");
      expect(await syncOfficialNotes(options)).toMatchObject({ state: "not_due" });
      expect(calls).toBe(1);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
  it("uses conditional requests only with a usable previous publication", async () => {
    const directory = await mkdtemp(join(tmpdir(), "forever-conditional-"));
    try {
      await syncOfficialNotes({
        directory,
        fetcher: source().fetcher,
        sleep: async (): Promise<void> => {},
      });
      const publication = await getPublishedOfficialNotes(null, directory);
      const health = await readOfficialNotesHealth(directory);
      if (!publication || !health) throw new Error("Expected local fixture publication");
      let header: string | null = null;
      const fetcher: typeof fetch = async (input, init): Promise<Response> => {
        if (String(input).endsWith("robots.txt")) return new Response("");
        header = new Headers(init?.headers).get("if-none-match");
        return new Response(null, { status: 304 });
      };
      expect(
        await fetchOfficialNotes({
          fetcher,
          sleep: async (): Promise<void> => {},
          previous: { published: publication, health: { ...health, etag: '"revision"' } },
        }),
      ).toBeNull();
      expect(header).toBe('"revision"');
      await expect(
        fetchOfficialNotes({ fetcher, sleep: async (): Promise<void> => {} }),
      ).rejects.toThrow(/Unusable/);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
  it("fetches a missing stream page through the documented same-topic API", async () => {
    const requests: string[] = [];
    const fetcher: typeof fetch = async (input): Promise<Response> => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("robots.txt")) return new Response("User-agent: *\nAllow: /");
      if (url.includes("posts.json"))
        return Response.json({ post_stream: { posts: [post(6, html)] } });
      return Response.json({
        ...topic(),
        post_stream: { stream: [101, 106], posts: [post(1, html)] },
      });
    };
    const result = await fetchOfficialNotes({ fetcher, sleep: async (): Promise<void> => {} });
    expect(result?.notes.posts).toHaveLength(2);
    expect(requests[2]).toContain("/631316/posts.json?post_ids%5B%5D=106");
  });
  it("rejects a robots prohibition before requesting topic data", async () => {
    let requests = 0;
    await expect(
      fetchOfficialNotes({
        fetcher: async (): Promise<Response> => {
          requests++;
          return new Response("User-agent: *\nDisallow: /en/wow/");
        },
        sleep: async (): Promise<void> => {},
      }),
    ).rejects.toThrow(/robots/);
    expect(requests).toBe(1);
  });
  it("rejects access errors, challenges, redirects and oversized responses", async () => {
    for (const status of [403, 429, 503]) {
      let requests = 0;
      await expect(
        fetchOfficialNotes({
          fetcher: async (): Promise<Response> =>
            ++requests === 1 ? new Response("") : new Response("blocked", { status }),
          sleep: async (): Promise<void> => {},
        }),
      ).rejects.toThrow(`HTTP ${status}`);
      expect(requests).toBe(2);
    }
    await expect(
      fetchOfficialNotes({
        fetcher: async (input): Promise<Response> =>
          String(input).endsWith("robots.txt")
            ? new Response("")
            : new Response("challenge", { headers: { "content-type": "text/html" } }),
        sleep: async (): Promise<void> => {},
      }),
    ).rejects.toThrow(/JSON/);
    await expect(
      fetchOfficialNotes({
        fetcher: async (): Promise<Response> =>
          new Response("", { headers: { "content-length": "3000001" } }),
      }),
    ).rejects.toThrow(/large/);
  });
  it("archives atomically, checks once daily and preserves the last good publication on failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "forever-notes-"));
    const capture = source();
    let time = new Date("2026-10-16T07:00:00Z");
    const options = {
      directory,
      now: (): Date => time,
      fetcher: capture.fetcher,
      sleep: async (): Promise<void> => {},
    };
    try {
      expect(await syncOfficialNotes(options)).toMatchObject({ state: "updated" });
      const before = await readFile(join(directory, "published.json"), "utf8");
      expect(await syncOfficialNotes(options)).toMatchObject({ state: "not_due" });
      expect(capture.requests).toHaveLength(2);
      time = new Date("2026-10-17T07:00:00Z");
      expect(await syncOfficialNotes(options)).toMatchObject({ state: "unchanged" });
      expect(await readFile(join(directory, "published.json"), "utf8")).toBe(before);
      time = new Date("2026-10-18T07:00:00Z");
      await expect(
        syncOfficialNotes({
          ...options,
          fetcher: async (): Promise<Response> => new Response("down", { status: 503 }),
        }),
      ).rejects.toThrow();
      expect(await readFile(join(directory, "published.json"), "utf8")).toBe(before);
      expect((await readOfficialNotesHealth(directory))?.error).toBe("source_http_503");
      expect((await getPublishedOfficialNotes(null, directory))?.notes.posts).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("rejects concurrent jobs without clearing another job's lock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "forever-notes-lock-"));
    const { writeFile } = await import("node:fs/promises");
    try {
      await writeFile(join(directory, ".sync.lock"), "owner");
      await expect(
        syncOfficialNotes({ directory, fetcher: source().fetcher }),
      ).rejects.toMatchObject({ code: "EEXIST" });
      expect(await readFile(join(directory, ".sync.lock"), "utf8")).toBe("owner");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
