import { serveHealerAsset } from "../../../../lib/healer-simulator";

interface HealerAssetContext {
  readonly params: Promise<{ readonly release: string; readonly name: string }>;
}
export async function GET(request: Request, context: HealerAssetContext): Promise<Response> {
  const { release, name } = await context.params;
  return serveHealerAsset(request, release, name);
}
