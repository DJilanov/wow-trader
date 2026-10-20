import { getItemDetail } from "../../../../../../../lib/data";
import { FOREVER_CLIENT_PRODUCT } from "../../../../../../../lib/game-versions";
import { publicJsonResponse } from "../../../../../../../lib/public-api";
import { helperAbsoluteUrl } from "../../../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly itemId: string }>;
}

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const itemId = Number((await params).itemId);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) {
    return publicJsonResponse({ error: "invalid_item_id" }, { status: 400, maxAgeSeconds: 60 });
  }
  try {
    const item = await getItemDetail(itemId, FOREVER_CLIENT_PRODUCT);
    if (!item) {
      return publicJsonResponse({ error: "item_not_found" }, { status: 404, maxAgeSeconds: 300 });
    }
    return publicJsonResponse(
      {
        schemaVersion: "forever-item.v1",
        canonicalUrl: helperAbsoluteUrl(`/forever/encyclopedia/items/${item.itemId}`),
        item,
      },
      { maxAgeSeconds: 3_600 },
    );
  } catch (error: unknown) {
    console.error(`Unable to load public Forever item ${itemId}`, error);
    return publicJsonResponse({ error: "item_unavailable" }, { status: 503, maxAgeSeconds: 30 });
  }
}
