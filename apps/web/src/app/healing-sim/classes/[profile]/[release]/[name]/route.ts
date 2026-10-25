import { healerSimulatorDirectory, serveHealerAsset } from "../../../../../../lib/healer-simulator";

interface HealerClassAssetContext {
  readonly params: Promise<{
    readonly profile: string;
    readonly release: string;
    readonly name: string;
  }>;
}
export async function GET(request: Request, context: HealerClassAssetContext): Promise<Response> {
  const { profile, release, name } = await context.params;
  if (profile !== "healing-druid") return new Response(null, { status: 404 });
  return serveHealerAsset(request, release, name, healerSimulatorDirectory(profile), profile);
}
