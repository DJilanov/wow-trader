import type { SupportedClientProduct } from "./game-versions";
import { getMarketWorkspace, type WorkspaceRouteFilter } from "./market-workspace-data";
import {
  parseProfessionSpecialization,
  type CraftingSpecializationProfile,
} from "./specializations";

export interface OpportunityDetailsRouteContext {
  readonly params: Promise<{ readonly recipeSpellId: string }>;
}

export async function handleOpportunityDetailsRequest(
  request: Request,
  context: OpportunityDetailsRouteContext,
  clientProduct: SupportedClientProduct,
): Promise<Response> {
  const { recipeSpellId: rawRecipeSpellId } = await context.params;
  const recipeSpellId = Number(rawRecipeSpellId);
  if (!Number.isSafeInteger(recipeSpellId) || recipeSpellId <= 0) {
    return Response.json({ error: "invalid_recipe" }, { status: 400 });
  }

  const search = new URL(request.url).searchParams;
  const route = parseRoute(search.get("route"));
  try {
    const workspace = await getMarketWorkspace({
      clientProduct,
      market: search.get("market") ?? "",
      route,
      recipeSpellId,
      specializations: parseSpecializations(search),
      useAltCrafting: search.get("network") === "1",
    });
    const opportunity = workspace.opportunities.find(
      (entry) => entry.recipeSpellId === recipeSpellId && entry.route === route,
    );
    if (!opportunity) {
      return Response.json({ error: "opportunity_not_found" }, { status: 404 });
    }
    return Response.json({ opportunity }, { headers: { "cache-control": "private, max-age=30" } });
  } catch {
    return Response.json({ error: "data_unavailable" }, { status: 503 });
  }
}

function parseRoute(value: string | null): WorkspaceRouteFilter {
  return value === "auction_house" || value === "disenchant" || value === "vendor" ? value : "best";
}

function parseSpecializations(search: URLSearchParams): CraftingSpecializationProfile {
  return {
    alchemy: parseProfessionSpecialization(
      search.get("alchemySpecialization") ?? undefined,
      "alchemy",
    ),
    blacksmithing: parseProfessionSpecialization(
      search.get("blacksmithingSpecialization") ?? undefined,
      "blacksmithing",
    ),
    engineering: parseProfessionSpecialization(
      search.get("engineeringSpecialization") ?? undefined,
      "engineering",
    ),
    leatherworking: parseProfessionSpecialization(
      search.get("leatherworkingSpecialization") ?? undefined,
      "leatherworking",
    ),
    tailoring: parseProfessionSpecialization(
      search.get("tailoringSpecialization") ?? undefined,
      "tailoring",
    ),
  };
}
