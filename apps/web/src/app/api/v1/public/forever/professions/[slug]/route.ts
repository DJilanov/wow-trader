import { getProfessionDetail } from "../../../../../../../lib/data";
import { FOREVER_CLIENT_PRODUCT } from "../../../../../../../lib/game-versions";
import { publicJsonResponse } from "../../../../../../../lib/public-api";
import { helperAbsoluteUrl } from "../../../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly slug: string }>;
}

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const slug = (await params).slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return publicJsonResponse(
      { error: "invalid_profession_slug" },
      { status: 400, maxAgeSeconds: 60 },
    );
  }
  try {
    const profession = await getProfessionDetail(slug, FOREVER_CLIENT_PRODUCT);
    if (!profession) {
      return publicJsonResponse(
        { error: "profession_not_found" },
        { status: 404, maxAgeSeconds: 300 },
      );
    }
    return publicJsonResponse(
      {
        schemaVersion: "forever-profession.v1",
        canonicalUrl: helperAbsoluteUrl(
          `/forever/encyclopedia/professions/${encodeURIComponent(slug)}`,
        ),
        profession,
      },
      { maxAgeSeconds: 3_600 },
    );
  } catch (error: unknown) {
    console.error(`Unable to load public Forever profession ${slug}`, error);
    return publicJsonResponse(
      { error: "profession_unavailable" },
      { status: 503, maxAgeSeconds: 30 },
    );
  }
}
