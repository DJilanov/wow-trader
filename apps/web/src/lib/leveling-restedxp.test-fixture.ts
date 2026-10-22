import { createHash } from "node:crypto";
import {
  activeCampaignActions,
  campaignExportProgress,
  campaignExportSelectionSchema,
  compileCampaignAddon,
  restedXpDocumentSetSchema,
  type CampaignPlan,
  type CampaignAddonArtifact,
  type RestedXpDocumentSet,
} from "@wow-trader/leveling";
import { guideTestPlan } from "../components/leveling-guide.test-fixture";
import { RESTEDXP_REVIEW_TARGET, type RestedXpExportRequest } from "./leveling-restedxp-contract";

export function restedXpTestFixture(): {
  readonly plan: CampaignPlan;
  readonly input: RestedXpExportRequest;
  readonly artifact: CampaignAddonArtifact;
  readonly documents: RestedXpDocumentSet;
} {
  const original = guideTestPlan();
  const plan = {
    ...original,
    actions: original.actions.map((action, index) => ({ ...action, leaderOnly: index === 0 })),
  };
  const selection = campaignExportSelectionSchema.parse({});
  const actions = activeCampaignActions(plan, campaignExportProgress(selection));
  const input: RestedXpExportRequest = {
    race: "human",
    classSlug: "warrior",
    routeRelease: plan.release,
    selection,
    format: "documents",
    actionSha256: createHash("sha256").update(JSON.stringify(actions)).digest("hex"),
  };
  const artifact = compileCampaignAddon(plan, actions, {
    ...RESTEDXP_REVIEW_TARGET,
    nativeSources: [],
    includeObservers: false,
  });
  const documents = restedXpDocumentSetSchema.parse({
    schema: "kfc-restedxp-documents.v1",
    publication: "review",
    compilerRevision: "fixture-v1",
    routeRelease: plan.release,
    sourceBuild: plan.targetBuild,
    runtimeBuild: 70450,
    restedXpVersion: "v4.11.27",
    nativePolicy: artifact.nativePolicy,
    selection,
    documents: artifact.documents,
  });
  return { plan, input, artifact, documents };
}
