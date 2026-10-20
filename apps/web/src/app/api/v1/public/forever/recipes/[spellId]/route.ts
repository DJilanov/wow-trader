import { getRecipeDetail } from "../../../../../../../lib/data";
import { FOREVER_CLIENT_PRODUCT } from "../../../../../../../lib/game-versions";
import { publicJsonResponse } from "../../../../../../../lib/public-api";
import { helperAbsoluteUrl } from "../../../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly spellId: string }>;
}

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const spellId = Number((await params).spellId);
  if (!Number.isSafeInteger(spellId) || spellId <= 0) {
    return publicJsonResponse({ error: "invalid_spell_id" }, { status: 400, maxAgeSeconds: 60 });
  }
  try {
    const recipe = await getRecipeDetail(spellId, FOREVER_CLIENT_PRODUCT);
    if (!recipe) {
      return publicJsonResponse({ error: "recipe_not_found" }, { status: 404, maxAgeSeconds: 300 });
    }
    return publicJsonResponse(
      {
        schemaVersion: "forever-recipe.v1",
        canonicalUrl: helperAbsoluteUrl(`/forever/encyclopedia/recipes/${recipe.recipeSpellId}`),
        recipe,
      },
      { maxAgeSeconds: 3_600 },
    );
  } catch (error: unknown) {
    console.error(`Unable to load public Forever recipe ${spellId}`, error);
    return publicJsonResponse({ error: "recipe_unavailable" }, { status: 503, maxAgeSeconds: 30 });
  }
}
