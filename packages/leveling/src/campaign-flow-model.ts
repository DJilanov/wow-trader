export interface CampaignMovement {
  readonly kind: "flight" | "hearth" | "road";
  readonly destination: string;
  readonly terminal: boolean;
  readonly origin?: string;
}

export interface CampaignActionLocation {
  readonly zone: string;
  readonly insideDungeon?: string;
  /** A reviewed replacement visit takes precedence over inherited source chapter geography. */
  readonly visitOverride?: true;
}

export type CampaignUtilityTag =
  ".fp" | ".fly" | ".hs" | ".home" | ".zone" | ".trainer" | ".vendor";
