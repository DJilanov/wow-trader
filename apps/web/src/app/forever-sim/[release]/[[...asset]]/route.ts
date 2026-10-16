import { serveSimulatorAsset } from "../../../../lib/forever-simulator";

export const dynamic = "force-dynamic";
interface AssetContext {
  readonly params: Promise<{ readonly release: string; readonly asset?: readonly string[] }>;
}
export async function GET(request: Request, context: AssetContext): Promise<Response> {
  const { release, asset } = await context.params;
  return serveSimulatorAsset(request, release, asset ?? []);
}
export async function HEAD(request: Request, context: AssetContext): Promise<Response> {
  return GET(request, context);
}
