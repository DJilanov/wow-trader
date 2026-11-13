import {
  getClientDisenchantEligibility,
  type ClientDisenchantEvidence,
  type ClientValuationItem,
} from "@wow-trader/catalog";
import { createFraction } from "@wow-trader/economics";
import { getClassicDisenchantReference } from "./disenchanting";
import type { LevelingItemRecovery } from "./profession-leveling-types";

export function getLevelingItemRecovery(
  item: ClientValuationItem & { readonly vendorSellCopper: bigint },
  evidence: ClientDisenchantEvidence | null,
  prices: ReadonlyMap<number, bigint>,
  auctionHouseType: string,
): LevelingItemRecovery {
  const vendor = {
    vendorCopper: item.vendorSellCopper.toString(),
    binding: item.binding,
    disenchant: null,
  };
  if (!evidence || !["alliance", "horde", "neutral"].includes(auctionHouseType)) return vendor;
  const eligibility = getClientDisenchantEligibility(item, evidence.rules);
  if (!eligibility?.eligible || eligibility.specialLoot) return vendor;
  const distribution = getClassicDisenchantReference(
    item,
    eligibility.referenceLevel,
    eligibility.skill,
  );
  if (!distribution) return vendor;
  let value = createFraction(0n, 1n);
  for (const material of distribution.expectedMaterials) {
    const price = prices.get(material.materialItemId);
    if (price === undefined || price <= 0n) return vendor;
    const part = material.expectedQuantity;
    value = createFraction(
      value.numerator * part.denominator + price * part.numerator * value.denominator,
      value.denominator * part.denominator,
    );
  }
  value = createFraction(
    value.numerator * BigInt(auctionHouseType === "neutral" ? 8500 : 9500),
    value.denominator * 10_000n,
  );
  return {
    ...vendor,
    disenchant: {
      numerator: value.numerator.toString(),
      denominator: value.denominator.toString(),
      requiredSkill: eligibility.skill,
      evidence: `${distribution.evidence} ${evidence.manifest.buildNumber}; material sales estimated after AH cut`,
    },
  };
}
