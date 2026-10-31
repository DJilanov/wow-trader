export interface CampaignMovement {
  readonly kind: "flight" | "hearth" | "road";
  readonly destination: string;
  readonly terminal: boolean;
  readonly origin?: string;
}

export interface CampaignActionLocation {
  readonly zone: string;
  readonly insideDungeon?: string;
}

export type CampaignUtilityTag =
  ".fp" | ".fly" | ".hs" | ".home" | ".zone" | ".trainer" | ".vendor";
