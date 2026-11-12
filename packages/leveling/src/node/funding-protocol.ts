import type { CampaignFundingScenario, CampaignFundingState } from "../campaign-funding-scenarios.js";

export interface FundingWorkerRequest {
  readonly batch: number;
  readonly plan: SharedArrayBuffer;
  readonly signal: SharedArrayBuffer;
  readonly scenarios: readonly { readonly index: number; readonly scenario: CampaignFundingScenario }[];
}

export type FundingWorkerResponse = {
  readonly batch: number;
  readonly threadId: number;
  readonly elapsedMs: number;
} & (
  | { readonly ok: true; readonly entries: readonly { readonly index: number; readonly state: CampaignFundingState }[] }
  | { readonly ok: false; readonly error: string }
);
