import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import {
  CAMPAIGN_ADDON_COMPILER_REVISION,
  activeCampaignActions,
  campaignExportProgress,
  campaignUnmodeledExtras,
  compileCampaignAddon,
  restedXpDocumentSetSchema,
  type CampaignAddonArtifact,
  type RestedXpDocumentSet,
} from "@wow-trader/leveling";
import { getLevelingCampaign, getLevelingCampaignExportSources } from "./leveling-campaign";
import { RESTEDXP_REVIEW_TARGET, type RestedXpExportRequest } from "./leveling-restedxp-contract";

export function restedXpReviewExportAvailable(): boolean {
  // Review access is deliberately local/non-production. This is not a paid-content entitlement.
  return (
    process.env.NODE_ENV !== "production" && process.env.LEVELING_RESTEDXP_REVIEW_EXPORT === "1"
  );
}

type ExportFailure = "route_changed" | "export_unavailable" | "unsupported_selection";
export type CampaignReviewExport =
  | { readonly error: ExportFailure }
  | {
      readonly artifact: CampaignAddonArtifact;
      readonly documents: RestedXpDocumentSet;
      readonly identity: string;
    };

export async function buildCampaignReviewExport(
  input: RestedXpExportRequest,
): Promise<CampaignReviewExport> {
  const plan = await getLevelingCampaign(input.race, input.classSlug);
  if (!plan || plan.release !== input.routeRelease) return { error: "route_changed" };
  const progress = campaignExportProgress(input.selection);
  if (campaignUnmodeledExtras(plan, progress).length) return { error: "unsupported_selection" };
  const actions = activeCampaignActions(plan, progress);
  const actionSha256 = createHash("sha256").update(JSON.stringify(actions)).digest("hex");
  if (actionSha256 !== input.actionSha256) return { error: "route_changed" };
  const sources = await getLevelingCampaignExportSources();
  if (!sources) return { error: "export_unavailable" };
  const artifact = compileCampaignAddon(plan, actions, {
    ...RESTEDXP_REVIEW_TARGET,
    nativeSources: sources,
    includeObservers: false,
    ...(input.partyStarter ? { partyStarter: input.partyStarter } : {}),
  });
  const documents = restedXpDocumentSetSchema.parse({
    schema: "kfc-restedxp-documents.v1",
    publication: "review",
    compilerRevision: CAMPAIGN_ADDON_COMPILER_REVISION,
    routeRelease: plan.release,
    sourceBuild: plan.targetBuild,
    runtimeBuild: RESTEDXP_REVIEW_TARGET.runtimeBuild,
    restedXpVersion: RESTEDXP_REVIEW_TARGET.restedXpVersion,
    nativePolicy: artifact.nativePolicy,
    edition: {
      leader: { race: input.race, classSlug: input.classSlug },
      partyStarter: input.partyStarter,
    },
    selection: input.selection,
    documents: artifact.documents,
  });
  const identity = createHash("sha256").update(JSON.stringify(documents)).digest("hex");
  return { artifact, documents, identity };
}

export function campaignReviewAddonZip(
  result: Exclude<CampaignReviewExport, { readonly error: ExportFailure }>,
): Uint8Array {
  return zipSync(
    {
      "KFCForeverGuides/Guides.lua": strToU8(result.artifact.lua),
      "KFCForeverGuides/KFCForeverGuides.toc": strToU8(result.artifact.toc),
      "KFCForeverGuides/README.txt": strToU8(result.artifact.readme),
      "KFCForeverGuides/review.json": strToU8(
        JSON.stringify(
          {
            publication: "review",
            identity: result.identity,
            runtimeBuild: result.documents.runtimeBuild,
            restedXpVersion: result.documents.restedXpVersion,
            compilerRevision: result.documents.compilerRevision,
            routeRelease: result.documents.routeRelease,
            nativePolicy: result.documents.nativePolicy,
            selection: result.documents.selection,
            edition: result.documents.edition,
            guideSummaries: result.artifact.guides,
          },
          null,
          2,
        ),
      ),
    },
    { level: 6, mtime: new Date("2026-10-18T00:00:00Z") },
  );
}
