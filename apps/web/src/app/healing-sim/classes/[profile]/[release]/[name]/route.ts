import { healerSimulatorDirectory, serveHealerAsset } from "../../../../../../lib/healer-simulator";
import { servePaladinHealerAsset } from "../../../../../../lib/paladin-healer-simulator";

interface HealerClassAssetContext {
  readonly params: Promise<{
    readonly profile: string;
    readonly release: string;
    readonly name: string;
  }>;
}
export async function GET(request: Request, context: HealerClassAssetContext): Promise<Response> {
  const { profile, release, name } = await context.params;
  if (profile === "healing-paladin") return servePaladinHealerAsset(request, release, name);
  if (profile !== "healing-druid") return new Response(null, { status: 404 });
  return serveHealerAsset(request, release, name, healerSimulatorDirectory(profile), profile);
}

export const HEAD = GET;
