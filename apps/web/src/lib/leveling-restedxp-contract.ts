import { z } from "zod";
import {
  CAMPAIGN_RACES,
  campaignExportSelectionSchema,
  campaignPartyStarterSchema,
  classSlugs,
  getLevelingRace,
} from "@wow-trader/leveling";

export const RESTEDXP_REVIEW_TARGET = {
  runtimeBuild: 70450,
  interfaceVersion: 16001,
  restedXpVersion: "v4.11.27",
  version: "0.2.0-review.6",
} as const;

export const restedXpExportRequestSchema = z
  .object({
    race: z.enum(CAMPAIGN_RACES),
    classSlug: z.enum(classSlugs),
    routeRelease: z.string().min(1).max(100),
    actionSha256: z.string().regex(/^[a-f0-9]{64}$/),
    selection: campaignExportSelectionSchema,
    format: z.enum(["documents", "addon"]),
    partyStarter: campaignPartyStarterSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!getLevelingRace("alliance", value.race)?.classes.includes(value.classSlug))
      context.addIssue({ code: "custom", message: "Class is unavailable for this race." });
  });
export type RestedXpExportRequest = z.infer<typeof restedXpExportRequestSchema>;

export const restedXpExportMessages: Readonly<Record<string, string>> = {
  export_disabled: "The downloadable guide is not released here yet. The web guide remains free.",
  sign_in_required: "Sign in with Discord before downloading the guide.",
  guide_access_required:
    "Downloads require the KFC Certified role or approved supporter access. The web guide remains free.",
  access_unavailable:
    "We could not verify your guide access. No download was started. Try again shortly.",
  invalid_origin: "Open this guide on its own website and try again.",
  invalid_export: "These route settings cannot be exported. Reload the guide and try again.",
  export_too_large: "There are too many route settings to export.",
  json_required: "The export request was not valid. Reload the guide and try again.",
  route_changed:
    "The route was updated. Reload this page before exporting so your download matches the guide.",
  export_unavailable:
    "The review guide could not be generated. Your saved route has not changed. Try again later.",
  export_busy: "Another export is being prepared. Wait a moment and try again.",
  unsupported_selection:
    "Some selected optional quests are not modeled by the addon yet. Remove those selections before exporting.",
};
