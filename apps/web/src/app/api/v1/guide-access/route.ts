import { getGuideDownloadAccess } from "../../../../lib/guide-access-service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(): Promise<Response> {
  return Response.json(await getGuideDownloadAccess(), {
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
