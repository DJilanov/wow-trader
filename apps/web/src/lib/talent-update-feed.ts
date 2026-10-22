import type { PublishedForeverSnapshot } from "@wow-trader/forever-data/server";
import { helperAbsoluteUrl } from "./seo";

type FeedSnapshot = Pick<PublishedForeverSnapshot, "checksum" | "generated" | "publishedAt">;

function xml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!,
  );
}

export function talentUpdateFeed(snapshot: FeedSnapshot | null, now = new Date()): string {
  if (
    snapshot &&
    (!/^[a-f0-9]{64}$/.test(snapshot.checksum) ||
      !Number.isFinite(snapshot.publishedAt.getTime()) ||
      snapshot.publishedAt > now)
  )
    throw new Error("Invalid published talent revision");
  const url = helperAbsoluteUrl("/forever/encyclopedia");
  const item = snapshot
    ? `<item><title>Forever talent reference published</title><link>${url}</link><guid isPermaLink="false">${xml(`${url}#talents-${snapshot.checksum}`)}</guid><pubDate>${snapshot.publishedAt.toUTCString()}</pubDate><description>${xml(`A reviewed reference snapshot is published. Source generation date: ${snapshot.generated}. Revision: ${snapshot.checksum}. Check evidence labels and re-review saved builds; publication is not a gameplay balance endorsement.`)}</description></item>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>KFC Tools: Forever talent reference updates</title><link>${url}</link><description>Published talent reference revisions, not unreviewed upstream changes or game availability announcements.</description>${item}</channel></rss>`;
}
