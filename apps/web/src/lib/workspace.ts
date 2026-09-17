import {
  calculateCraftingOpportunity,
  calculatePricedCraftingOpportunity,
  createFraction,
  type AvailableCraftingOpportunity,
  type Fraction,
  type PriceLevel,
  type ProductionCraftStep,
  type ProductionPurchase,
} from "@wow-trader/economics";
import { summarizeOrderBook } from "@wow-trader/market";

export type RealizationRoute = "auction_house" | "disenchant" | "vendor";

const MINIMUM_SUPPORTED_AUCTION_LISTINGS = 3;

export interface WorkspaceInputCandidate {
  readonly itemId: number;
  readonly name: string;
  readonly quantity: number;
  readonly iconFileDataId: number | null;
  readonly quality: number;
  readonly priceLevels: readonly PriceLevel[];
}

export interface WorkspaceOutputCandidate {
  readonly itemId: number;
  readonly name: string;
  readonly classId: number;
  readonly subclassId: number;
  readonly quality: number;
  readonly itemLevel: number;
  readonly iconFileDataId: number | null;
  readonly minimumQuantity: number;
  readonly maximumQuantity: number;
  readonly expectedQuantity: Fraction;
  readonly vendorSellPriceCopper: bigint;
  readonly priceLevels: readonly {
    readonly unitPriceCopper: bigint;
    readonly quantity: number;
    readonly listingCount: number;
  }[];
  readonly disenchant: WorkspaceDisenchantCandidate | null;
}

export interface WorkspaceDisenchantCandidate {
  readonly requiredEnchantingSkill: number;
  readonly modelVersion: string;
  readonly evidence: string;
  readonly materials: readonly WorkspaceDisenchantMaterialCandidate[];
}

export interface WorkspaceDisenchantMaterialCandidate {
  readonly itemId: number;
  readonly name: string;
  readonly iconFileDataId: number | null;
  readonly quality: number;
  readonly expectedQuantity: Fraction;
  readonly priceLevels: readonly {
    readonly unitPriceCopper: bigint;
    readonly quantity: number;
    readonly listingCount: number;
  }[];
}

export interface WorkspaceRecipeCandidate {
  readonly recipeSpellId: number;
  readonly recipeName: string;
  readonly professionName: string;
  readonly professionSlug: string;
  readonly requiredSkillRank: number;
  readonly cooldownMs: number;
  readonly categoryCooldownMs: number;
  readonly outputKind: "item" | "enchantment" | "service" | "conversion";
  readonly inputs: readonly WorkspaceInputCandidate[];
  readonly outputs: readonly WorkspaceOutputCandidate[];
}

export interface WorkspaceInputCost {
  readonly itemId: number;
  readonly name: string;
  readonly quantity: number;
  readonly iconFileDataId: number | null;
  readonly quality: number;
  readonly costCopper: bigint;
  readonly highestUnitPriceCopper: bigint;
}

export interface WorkspaceMaterialPlan {
  readonly totalCostCopper: bigint;
  readonly directPurchaseCostCopper: bigint | null;
  readonly savingsVsDirectPurchaseCopper: bigint | null;
  readonly purchases: readonly (ProductionPurchase & {
    readonly name: string;
    readonly iconFileDataId: number | null;
    readonly quality: number;
  })[];
  readonly craftSteps: readonly ProductionCraftStep[];
  readonly crossProfessionTransferCount: number;
}

export interface WorkspaceOutputValue {
  readonly itemId: number;
  readonly name: string;
  readonly iconFileDataId: number | null;
  readonly quality: number;
  readonly expectedQuantity: Fraction;
  readonly unitValueCopper: bigint;
}

export interface WorkspaceRouteEvaluation {
  readonly route: RealizationRoute;
  readonly result: AvailableCraftingOpportunity;
  readonly inputs: readonly WorkspaceInputCost[];
  readonly outputs: readonly WorkspaceOutputValue[];
  readonly omittedOutputCount: number;
  readonly requiredEnchantingSkill: number | null;
  readonly modelVersion: string | null;
  readonly evidence: string | null;
  readonly directReagentCostCopper: bigint | null;
  readonly networkSavingsCopper: bigint | null;
  readonly craftSteps: readonly ProductionCraftStep[];
  readonly crossProfessionTransferCount: number;
}

export function evaluateWorkspaceRecipe(
  candidate: WorkspaceRecipeCandidate,
  auctionHouseCutBasisPoints: number,
  materialPlan?: WorkspaceMaterialPlan,
): readonly WorkspaceRouteEvaluation[] {
  if (candidate.inputs.length === 0 || candidate.outputs.length === 0) return [];

  const requestInputs = candidate.inputs.map((input) => ({
    itemId: input.itemId,
    quantity: input.quantity,
    priceLevels: input.priceLevels,
  }));
  const evaluations: WorkspaceRouteEvaluation[] = [];

  const auctionOutputs = candidate.outputs.flatMap((output) => {
    if (output.priceLevels.length === 0) return [];
    const summary = summarizeOrderBook(output.priceLevels);
    if (summary.listingCount < MINIMUM_SUPPORTED_AUCTION_LISTINGS) return [];
    return [
      {
        itemId: output.itemId,
        name: output.name,
        iconFileDataId: output.iconFileDataId,
        quality: output.quality,
        expectedQuantity: output.expectedQuantity,
        expectedUnitPriceCopper: summary.weightedTenthPercentilePriceCopper,
        fillRateBasisPoints: 10_000,
      },
    ];
  });
  addEvaluation(
    evaluations,
    candidate,
    "auction_house",
    requestInputs,
    auctionOutputs,
    auctionHouseCutBasisPoints,
    candidate.outputs.length - auctionOutputs.length,
    materialPlan,
  );

  const vendorOutputs = candidate.outputs.flatMap((output) =>
    output.vendorSellPriceCopper > 0n
      ? [
          {
            itemId: output.itemId,
            name: output.name,
            iconFileDataId: output.iconFileDataId,
            quality: output.quality,
            expectedQuantity: output.expectedQuantity,
            expectedUnitPriceCopper: output.vendorSellPriceCopper,
            fillRateBasisPoints: 10_000,
          },
        ]
      : [],
  );
  addEvaluation(
    evaluations,
    candidate,
    "vendor",
    requestInputs,
    vendorOutputs,
    0,
    candidate.outputs.length - vendorOutputs.length,
    materialPlan,
  );

  const disenchantOutputs = createDisenchantOutputs(candidate.outputs);
  if (disenchantOutputs) {
    addEvaluation(
      evaluations,
      candidate,
      "disenchant",
      requestInputs,
      disenchantOutputs.outputs,
      auctionHouseCutBasisPoints,
      0,
      materialPlan,
      {
        requiredEnchantingSkill: disenchantOutputs.requiredEnchantingSkill,
        modelVersion: disenchantOutputs.modelVersion,
        evidence: disenchantOutputs.evidence,
      },
    );
  }

  return evaluations;
}

function addEvaluation(
  evaluations: WorkspaceRouteEvaluation[],
  candidate: WorkspaceRecipeCandidate,
  route: RealizationRoute,
  inputs: readonly {
    readonly itemId: number;
    readonly quantity: number;
    readonly priceLevels: readonly PriceLevel[];
  }[],
  outputs: readonly {
    readonly itemId: number;
    readonly name: string;
    readonly iconFileDataId: number | null;
    readonly quality: number;
    readonly expectedQuantity: Fraction;
    readonly expectedUnitPriceCopper: bigint;
    readonly fillRateBasisPoints: number;
  }[],
  auctionHouseCutBasisPoints: number,
  omittedOutputCount: number,
  materialPlan: WorkspaceMaterialPlan | undefined,
  routeEvidence: {
    readonly requiredEnchantingSkill: number;
    readonly modelVersion: string;
    readonly evidence: string;
  } | null = null,
): void {
  if (outputs.length === 0) return;
  const commonRequest = {
    crafts: 1,
    outputs,
    auctionHouseCutBasisPoints,
    fixedCostCopper: 0n,
    listingDepositCopper: 0n,
    expectedDepositLossCopper: 0n,
    cooldownOpportunityCostCopper: 0n,
  } as const;
  const result = materialPlan
    ? calculatePricedCraftingOpportunity({
        ...commonRequest,
        reagentCostCopper: materialPlan.totalCostCopper,
        acquisitionByItem: new Map(
          materialPlan.purchases.map((purchase) => [purchase.itemId, purchase.acquisition]),
        ),
      })
    : calculateCraftingOpportunity({ ...commonRequest, inputs });
  if (!result.viable) return;

  const inputDetails = materialPlan
    ? materialPlan.purchases.map((purchase) => {
        if (purchase.acquisition.highestUnitPriceCopper === null) {
          throw new Error(`Missing acquisition detail for item ${purchase.itemId}`);
        }
        return {
          itemId: purchase.itemId,
          name: purchase.name,
          quantity: purchase.quantity,
          iconFileDataId: purchase.iconFileDataId,
          quality: purchase.quality,
          costCopper: purchase.acquisition.totalCostCopper,
          highestUnitPriceCopper: purchase.acquisition.highestUnitPriceCopper,
        };
      })
    : candidate.inputs.map((input) => {
        const acquisition = result.acquisitionByItem.get(input.itemId);
        if (!acquisition?.highestUnitPriceCopper) {
          throw new Error(`Missing acquisition detail for item ${input.itemId}`);
        }
        return {
          itemId: input.itemId,
          name: input.name,
          quantity: input.quantity,
          iconFileDataId: input.iconFileDataId,
          quality: input.quality,
          costCopper: acquisition.totalCostCopper,
          highestUnitPriceCopper: acquisition.highestUnitPriceCopper,
        };
      });
  const outputDetails = outputs.map((output) => ({
    itemId: output.itemId,
    name: output.name,
    iconFileDataId: output.iconFileDataId,
    quality: output.quality,
    expectedQuantity: output.expectedQuantity,
    unitValueCopper: output.expectedUnitPriceCopper,
  }));

  evaluations.push({
    route,
    result,
    inputs: inputDetails,
    outputs: outputDetails,
    omittedOutputCount,
    requiredEnchantingSkill: routeEvidence?.requiredEnchantingSkill ?? null,
    modelVersion: routeEvidence?.modelVersion ?? null,
    evidence: routeEvidence?.evidence ?? null,
    directReagentCostCopper: materialPlan?.directPurchaseCostCopper ?? result.reagentCostCopper,
    networkSavingsCopper: materialPlan?.savingsVsDirectPurchaseCopper ?? 0n,
    craftSteps: materialPlan?.craftSteps ?? [],
    crossProfessionTransferCount: materialPlan?.crossProfessionTransferCount ?? 0,
  });
}

function createDisenchantOutputs(outputs: readonly WorkspaceOutputCandidate[]): {
  readonly outputs: readonly {
    readonly itemId: number;
    readonly name: string;
    readonly iconFileDataId: number | null;
    readonly quality: number;
    readonly expectedQuantity: Fraction;
    readonly expectedUnitPriceCopper: bigint;
    readonly fillRateBasisPoints: number;
  }[];
  readonly requiredEnchantingSkill: number;
  readonly modelVersion: string;
  readonly evidence: string;
} | null {
  if (outputs.some((output) => !output.disenchant)) return null;

  const materials = new Map<
    number,
    {
      readonly itemId: number;
      readonly name: string;
      readonly iconFileDataId: number | null;
      readonly quality: number;
      expectedQuantity: Fraction;
      readonly expectedUnitPriceCopper: bigint;
      readonly fillRateBasisPoints: number;
    }
  >();
  let requiredEnchantingSkill = 0;
  let modelVersion: string | null = null;
  const evidence: string[] = [];

  for (const output of outputs) {
    const disenchant = output.disenchant;
    if (!disenchant) return null;
    if (modelVersion !== null && modelVersion !== disenchant.modelVersion) return null;
    modelVersion = disenchant.modelVersion;
    requiredEnchantingSkill = Math.max(requiredEnchantingSkill, disenchant.requiredEnchantingSkill);
    evidence.push(disenchant.evidence);

    for (const material of disenchant.materials) {
      if (material.priceLevels.length === 0) return null;
      const summary = summarizeOrderBook(material.priceLevels);
      if (summary.listingCount < MINIMUM_SUPPORTED_AUCTION_LISTINGS) return null;
      const expectedQuantity = multiplyFractions(
        output.expectedQuantity,
        material.expectedQuantity,
      );
      const existing = materials.get(material.itemId);
      if (existing) {
        if (existing.expectedUnitPriceCopper !== summary.weightedTenthPercentilePriceCopper) {
          throw new Error(`Conflicting market value for disenchant material ${material.itemId}`);
        }
        existing.expectedQuantity = addFractions(existing.expectedQuantity, expectedQuantity);
      } else {
        materials.set(material.itemId, {
          itemId: material.itemId,
          name: material.name,
          iconFileDataId: material.iconFileDataId,
          quality: material.quality,
          expectedQuantity,
          expectedUnitPriceCopper: summary.weightedTenthPercentilePriceCopper,
          fillRateBasisPoints: 10_000,
        });
      }
    }
  }

  if (materials.size === 0 || modelVersion === null) return null;
  return {
    outputs: [...materials.values()],
    requiredEnchantingSkill,
    modelVersion,
    evidence: [...new Set(evidence)].join(" "),
  };
}

function multiplyFractions(left: Fraction, right: Fraction): Fraction {
  return createFraction(left.numerator * right.numerator, left.denominator * right.denominator);
}

function addFractions(left: Fraction, right: Fraction): Fraction {
  return createFraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}
