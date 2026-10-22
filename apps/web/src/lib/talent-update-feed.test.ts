import { describe, expect, it, vi } from "vitest";
import { talentUpdateFeed } from "./talent-update-feed";

const publication = {
  checksum: "a".repeat(64),
  generated: "2026-10-19 & reviewed",
  publishedAt: new Date("2026-10-20T12:00:00Z"),
};
const now = new Date("2026-10-22T12:00:00Z");
const mocks = vi.hoisted(() => ({ getForeverSnapshot: vi.fn() }));
vi.mock("./forever", () => ({ getForeverSnapshot: mocks.getForeverSnapshot }));

describe("published talent update subscriptions", () => {
  it("uses the real publication date and stable revision without emitting unreviewed changes", () => {
    const feed = talentUpdateFeed(publication, now);
    expect(feed).toContain(publication.checksum);
    expect(feed).toContain("Tue, 20 Oct 2026 12:00:00 GMT");
    expect(feed).toContain("2026-10-19 &amp; reviewed");
    expect(feed).toBe(talentUpdateFeed(publication, new Date("2026-10-23T00:00:00Z")));
    expect(talentUpdateFeed(null, now)).not.toContain("<item>");
    expect(() => talentUpdateFeed({ ...publication, checksum: "<script>" }, now)).toThrow();
    expect(() =>
      talentUpdateFeed({ ...publication, publishedAt: new Date("2099-01-01") }, now),
    ).toThrow();
  });
  it("fails unavailable instead of presenting a fabricated publication or a successful empty feed", async () => {
    const { GET } = await import("../app/forever/updates.xml/route");
    mocks.getForeverSnapshot.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    mocks.getForeverSnapshot.mockResolvedValue(publication);
    const ready = await GET();
    expect(ready.status).toBe(200);
    expect(ready.headers.get("content-type")).toContain("application/rss+xml");
    expect(await ready.text()).toContain(publication.checksum);
  });
});
