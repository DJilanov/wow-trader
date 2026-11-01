import { readCompositionCatalog } from "../../../../lib/forever-raid-composition-data";
import support from "../../../../lib/data/forever-raid-support.v1.json";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  const catalog = await readCompositionCatalog();
  return Response.json({ ...catalog, support }, { headers: { "Cache-Control": "no-store" } });
}
