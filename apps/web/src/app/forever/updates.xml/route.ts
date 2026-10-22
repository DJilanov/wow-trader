import { getForeverSnapshot } from "../../../lib/forever";
import { talentUpdateFeed } from "../../../lib/talent-update-feed";

export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  const headers = {
    "Content-Type": "application/rss+xml; charset=utf-8",
    "X-Robots-Tag": "noindex",
  };
  try {
    const snapshot = await getForeverSnapshot();
    if (!snapshot)
      return new Response("Published reference unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "300", "X-Robots-Tag": "noindex" },
      });
    return new Response(talentUpdateFeed(snapshot), {
      headers: { ...headers, "Cache-Control": "public, max-age=300" },
    });
  } catch {
    console.error("Published talent update feed unavailable");
    return new Response("Published reference unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "300", "X-Robots-Tag": "noindex" },
    });
  }
}
