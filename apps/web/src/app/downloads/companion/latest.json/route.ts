import { getCompanionRelease } from "../../../../lib/companion-release";
import { HELPER_SITE_URL } from "../../../../lib/seo";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const release = await getCompanionRelease();
  if (!release) return Response.json({ error: "release_unavailable" }, { status: 404 });
  return Response.json(
    {
      ...release,
      assets: release.assets.map((asset) => ({
        ...asset,
        downloadUrl: `${HELPER_SITE_URL}/downloads/companion/${asset.id}`,
      })),
    },
    { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
