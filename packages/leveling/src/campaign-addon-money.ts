import type { CampaignAction } from "./campaign.js";

interface CampaignMoneyRequirement {
  readonly questId: number;
  readonly gold: string;
  readonly description: string;
}

/** RXP's .money comparison completes its own step at the cash threshold. */
export function campaignMoneyRequirement(action: CampaignAction): CampaignMoneyRequirement | null {
  const copper = action.minimumMoneyCopper;
  if (copper === undefined) return null;
  const change = action.questChanges[0];
  if (!Number.isSafeInteger(copper) || copper <= 0 || action.questChanges.length !== 1 || change?.state !== "rewarded")
    throw new Error(`Invalid hand-in money requirement: ${action.id}.`);
  const wholeGold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const smallChange = copper % 100;
  const fraction = String(copper % 10000).padStart(4, "0").replace(/0+$/, "");
  const amount = [
    wholeGold ? `${wholeGold} gold` : "",
    silver ? `${silver} silver` : "",
    smallChange ? `${smallChange} copper` : "",
  ].filter(Boolean).join(" ");
  return {
    questId: change.questId,
    gold: `${wholeGold}${fraction ? `.${fraction}` : ""}`,
    description: `Have at least ${amount} available for this hand-in. Each player pays their own fee.`,
  };
}
