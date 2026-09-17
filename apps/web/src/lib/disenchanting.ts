import { createFraction, type Fraction } from "@wow-trader/economics";

export const TBC_DISENCHANT_MODEL_VERSION = "tbc-disenchant-table-v1";

export const DISENCHANT_MATERIAL_ITEM_IDS = [
  10_938, 10_939, 10_940, 10_978, 10_998, 11_082, 11_083, 11_084, 11_134, 11_135, 11_137, 11_138,
  11_139, 11_174, 11_175, 11_176, 11_177, 11_178, 14_343, 14_344, 16_202, 16_203, 16_204, 20_725,
  22_445, 22_446, 22_447, 22_448, 22_449, 22_450,
] as const;

export interface DisenchantSourceItem {
  readonly classId: number;
  readonly quality: number;
  readonly itemLevel: number;
}

export interface DisenchantOutcome {
  readonly materialItemId: number;
  readonly quantity: number;
  readonly probability: Fraction;
}

export interface ExpectedDisenchantMaterial {
  readonly materialItemId: number;
  readonly expectedQuantity: Fraction;
}

export interface DisenchantDistribution {
  readonly sourceType: "armor" | "weapon";
  readonly sourceQuality: 2 | 3 | 4;
  readonly sourceItemLevel: number;
  readonly requiredEnchantingSkill: number;
  readonly outcomes: readonly DisenchantOutcome[];
  readonly expectedMaterials: readonly ExpectedDisenchantMaterial[];
  readonly modelVersion: typeof TBC_DISENCHANT_MODEL_VERSION;
  readonly evidence: string;
}

interface DisenchantBracket {
  readonly minimumItemLevel: number;
  readonly maximumItemLevel: number;
  readonly outcomes: readonly DisenchantOutcome[];
}

const MATERIAL = {
  lesserMagicEssence: 10_938,
  greaterMagicEssence: 10_939,
  strangeDust: 10_940,
  smallGlimmeringShard: 10_978,
  lesserAstralEssence: 10_998,
  greaterAstralEssence: 11_082,
  soulDust: 11_083,
  largeGlimmeringShard: 11_084,
  lesserMysticEssence: 11_134,
  greaterMysticEssence: 11_135,
  visionDust: 11_137,
  smallGlowingShard: 11_138,
  largeGlowingShard: 11_139,
  lesserNetherEssence: 11_174,
  greaterNetherEssence: 11_175,
  dreamDust: 11_176,
  smallRadiantShard: 11_177,
  largeRadiantShard: 11_178,
  smallBrilliantShard: 14_343,
  largeBrilliantShard: 14_344,
  lesserEternalEssence: 16_202,
  greaterEternalEssence: 16_203,
  illusionDust: 16_204,
  nexusCrystal: 20_725,
  arcaneDust: 22_445,
  greaterPlanarEssence: 22_446,
  lesserPlanarEssence: 22_447,
  smallPrismaticShard: 22_448,
  largePrismaticShard: 22_449,
  voidCrystal: 22_450,
} as const;

const ARMOR_UNCOMMON: readonly DisenchantBracket[] = [
  bracket(
    5,
    15,
    group(MATERIAL.strangeDust, [1, 2], 80),
    group(MATERIAL.lesserMagicEssence, [1, 2], 20),
  ),
  bracket(
    16,
    20,
    group(MATERIAL.strangeDust, [2, 3], 75),
    group(MATERIAL.greaterMagicEssence, [1, 2], 20),
    group(MATERIAL.smallGlimmeringShard, [1], 5),
  ),
  bracket(
    21,
    25,
    group(MATERIAL.strangeDust, [4, 5, 6], 75),
    group(MATERIAL.lesserAstralEssence, [1, 2], 15),
    group(MATERIAL.smallGlimmeringShard, [1], 10),
  ),
  bracket(
    26,
    30,
    group(MATERIAL.soulDust, [1, 2], 75),
    group(MATERIAL.greaterAstralEssence, [1, 2], 20),
    group(MATERIAL.largeGlimmeringShard, [1], 5),
  ),
  bracket(
    31,
    35,
    group(MATERIAL.soulDust, [2, 3, 4, 5], 75),
    group(MATERIAL.lesserMysticEssence, [1, 2], 20),
    group(MATERIAL.smallGlowingShard, [1], 5),
  ),
  bracket(
    36,
    40,
    group(MATERIAL.visionDust, [1, 2], 75),
    group(MATERIAL.greaterMysticEssence, [1, 2], 20),
    group(MATERIAL.largeGlowingShard, [1], 5),
  ),
  bracket(
    41,
    45,
    group(MATERIAL.visionDust, [2, 3, 4, 5], 75),
    group(MATERIAL.lesserNetherEssence, [1, 2], 20),
    group(MATERIAL.smallRadiantShard, [1], 5),
  ),
  bracket(
    46,
    50,
    group(MATERIAL.dreamDust, [1, 2], 75),
    group(MATERIAL.greaterNetherEssence, [1, 2], 20),
    group(MATERIAL.largeRadiantShard, [1], 5),
  ),
  bracket(
    51,
    55,
    group(MATERIAL.dreamDust, [2, 3, 4, 5], 75),
    group(MATERIAL.lesserEternalEssence, [1, 2], 20),
    group(MATERIAL.smallBrilliantShard, [1], 5),
  ),
  bracket(
    56,
    60,
    group(MATERIAL.illusionDust, [1, 2], 75),
    group(MATERIAL.greaterEternalEssence, [1, 2], 20),
    group(MATERIAL.largeBrilliantShard, [1], 5),
  ),
  bracket(
    61,
    65,
    group(MATERIAL.illusionDust, [2, 3, 4, 5], 75),
    group(MATERIAL.greaterEternalEssence, [2, 3], 20),
    group(MATERIAL.largeBrilliantShard, [1], 5),
  ),
  bracket(
    66,
    80,
    group(MATERIAL.arcaneDust, [1, 2, 3], 75),
    group(MATERIAL.lesserPlanarEssence, [1, 2, 3], 22),
    group(MATERIAL.smallPrismaticShard, [1], 3),
  ),
  bracket(
    81,
    99,
    group(MATERIAL.arcaneDust, [2, 3], 75),
    group(MATERIAL.lesserPlanarEssence, [2, 3], 22),
    group(MATERIAL.smallPrismaticShard, [1], 3),
  ),
  bracket(
    100,
    120,
    group(MATERIAL.arcaneDust, [2, 3, 4, 5], 75),
    group(MATERIAL.greaterPlanarEssence, [1, 2], 22),
    group(MATERIAL.largePrismaticShard, [1], 3),
  ),
];

const WEAPON_UNCOMMON: readonly DisenchantBracket[] = [
  bracket(
    6,
    15,
    group(MATERIAL.strangeDust, [1, 2], 20),
    group(MATERIAL.lesserMagicEssence, [1, 2], 80),
  ),
  bracket(
    16,
    20,
    group(MATERIAL.strangeDust, [2, 3], 20),
    group(MATERIAL.greaterMagicEssence, [1, 2], 75),
    group(MATERIAL.smallGlimmeringShard, [1], 5),
  ),
  bracket(
    21,
    25,
    group(MATERIAL.strangeDust, [4, 5, 6], 15),
    group(MATERIAL.greaterMagicEssence, [1, 2], 75),
    group(MATERIAL.smallGlimmeringShard, [1], 10),
  ),
  bracket(
    26,
    30,
    group(MATERIAL.soulDust, [1, 2], 20),
    group(MATERIAL.greaterMagicEssence, [1, 2], 75),
    group(MATERIAL.largeGlimmeringShard, [1], 5),
  ),
  bracket(
    31,
    35,
    group(MATERIAL.soulDust, [2, 3, 4, 5], 20),
    group(MATERIAL.lesserMysticEssence, [1, 2], 75),
    group(MATERIAL.smallGlowingShard, [1], 5),
  ),
  bracket(
    36,
    40,
    group(MATERIAL.visionDust, [1, 2], 20),
    group(MATERIAL.greaterMysticEssence, [1, 2], 75),
    group(MATERIAL.largeGlowingShard, [1], 5),
  ),
  bracket(
    41,
    45,
    group(MATERIAL.visionDust, [2, 3, 4, 5], 20),
    group(MATERIAL.lesserNetherEssence, [1, 2], 75),
    group(MATERIAL.smallRadiantShard, [1], 5),
  ),
  bracket(
    46,
    50,
    group(MATERIAL.dreamDust, [1, 2], 20),
    group(MATERIAL.greaterNetherEssence, [1, 2], 75),
    group(MATERIAL.largeRadiantShard, [1], 5),
  ),
  bracket(
    51,
    55,
    group(MATERIAL.dreamDust, [2, 3, 4, 5], 20),
    group(MATERIAL.lesserEternalEssence, [1, 2], 75),
    group(MATERIAL.smallBrilliantShard, [1], 5),
  ),
  bracket(
    56,
    60,
    group(MATERIAL.illusionDust, [1, 2], 20),
    group(MATERIAL.greaterEternalEssence, [1, 2], 75),
    group(MATERIAL.largeBrilliantShard, [1], 5),
  ),
  bracket(
    61,
    65,
    group(MATERIAL.illusionDust, [2, 3, 4, 5], 20),
    group(MATERIAL.greaterEternalEssence, [2, 3], 75),
    group(MATERIAL.largeBrilliantShard, [1], 5),
  ),
  bracket(
    66,
    99,
    group(MATERIAL.arcaneDust, [2, 3], 22),
    group(MATERIAL.lesserPlanarEssence, [2, 3], 75),
    group(MATERIAL.smallPrismaticShard, [1], 3),
  ),
  bracket(
    100,
    120,
    group(MATERIAL.arcaneDust, [2, 3, 4, 5], 22),
    group(MATERIAL.greaterPlanarEssence, [1, 2], 75),
    group(MATERIAL.largePrismaticShard, [1], 3),
  ),
];

const RARE: readonly DisenchantBracket[] = [
  bracket(11, 25, group(MATERIAL.smallGlimmeringShard, [1], 100)),
  bracket(26, 30, group(MATERIAL.largeGlimmeringShard, [1], 100)),
  bracket(31, 35, group(MATERIAL.smallGlowingShard, [1], 100)),
  bracket(36, 40, group(MATERIAL.largeGlowingShard, [1], 100)),
  bracket(41, 45, group(MATERIAL.smallRadiantShard, [1], 100)),
  bracket(46, 50, group(MATERIAL.largeRadiantShard, [1], 100)),
  bracket(51, 55, group(MATERIAL.smallBrilliantShard, [1], 100)),
  bracket(
    56,
    65,
    group(MATERIAL.largeBrilliantShard, [1], 99.5),
    group(MATERIAL.nexusCrystal, [1], 0.5),
  ),
  bracket(
    66,
    99,
    group(MATERIAL.smallPrismaticShard, [1], 99.5),
    group(MATERIAL.nexusCrystal, [1], 0.5),
  ),
  bracket(
    100,
    120,
    group(MATERIAL.largePrismaticShard, [1], 99.5),
    group(MATERIAL.voidCrystal, [1], 0.5),
  ),
];

const ARMOR_EPIC: readonly DisenchantBracket[] = [
  bracket(40, 45, group(MATERIAL.smallRadiantShard, [2, 3, 4], 100)),
  bracket(46, 50, group(MATERIAL.largeRadiantShard, [2, 3, 4], 100)),
  bracket(51, 55, group(MATERIAL.smallBrilliantShard, [2, 3, 4], 100)),
  bracket(56, 60, group(MATERIAL.nexusCrystal, [1], 100)),
  bracket(61, 80, group(MATERIAL.nexusCrystal, [1, 2], 100)),
  bracket(95, 100, group(MATERIAL.voidCrystal, [1, 2], 100)),
  bracket(
    105,
    164,
    weighted(MATERIAL.voidCrystal, 1, 1, 3),
    weighted(MATERIAL.voidCrystal, 2, 2, 3),
  ),
];

const WEAPON_EPIC: readonly DisenchantBracket[] = [
  bracket(40, 45, group(MATERIAL.smallRadiantShard, [2, 3, 4], 100)),
  bracket(46, 50, group(MATERIAL.largeRadiantShard, [2, 3, 4], 100)),
  bracket(51, 55, group(MATERIAL.smallBrilliantShard, [2, 3, 4], 100)),
  bracket(56, 60, group(MATERIAL.nexusCrystal, [1], 100)),
  bracket(
    61,
    80,
    weighted(MATERIAL.nexusCrystal, 1, 1, 3),
    weighted(MATERIAL.nexusCrystal, 2, 2, 3),
  ),
  bracket(95, 100, group(MATERIAL.voidCrystal, [1, 2], 100)),
  bracket(
    105,
    164,
    weighted(MATERIAL.voidCrystal, 1, 1, 3),
    weighted(MATERIAL.voidCrystal, 2, 2, 3),
  ),
];

export function getDisenchantDistribution(
  product: string,
  buildNumber: number,
  source: DisenchantSourceItem,
): DisenchantDistribution | null {
  if (product !== "wow_anniversary" || buildNumber !== 69_795) return null;
  if (source.itemLevel < 0 || !Number.isInteger(source.itemLevel)) return null;
  if (source.classId !== 2 && source.classId !== 4) return null;
  if (source.quality !== 2 && source.quality !== 3 && source.quality !== 4) return null;

  const sourceType = source.classId === 2 ? "weapon" : "armor";
  const brackets = selectBrackets(sourceType, source.quality);
  const selected = brackets.find(
    (candidate) =>
      source.itemLevel >= candidate.minimumItemLevel &&
      source.itemLevel <= candidate.maximumItemLevel,
  );
  if (!selected) return null;

  const requiredEnchantingSkill = getRequiredEnchantingSkill(source.quality, source.itemLevel);
  if (requiredEnchantingSkill === null) return null;

  return {
    sourceType,
    sourceQuality: source.quality,
    sourceItemLevel: source.itemLevel,
    requiredEnchantingSkill,
    outcomes: selected.outcomes,
    expectedMaterials: aggregateExpectedMaterials(selected.outcomes),
    modelVersion: TBC_DISENCHANT_MODEL_VERSION,
    evidence: `Static TBC table for ${qualityName(source.quality)} ${sourceType}, item level ${source.itemLevel}; requires Enchanting ${requiredEnchantingSkill}.`,
  };
}

function selectBrackets(
  sourceType: "armor" | "weapon",
  quality: 2 | 3 | 4,
): readonly DisenchantBracket[] {
  if (quality === 2) return sourceType === "armor" ? ARMOR_UNCOMMON : WEAPON_UNCOMMON;
  if (quality === 3) return RARE;
  return sourceType === "armor" ? ARMOR_EPIC : WEAPON_EPIC;
}

function getRequiredEnchantingSkill(quality: 2 | 3 | 4, itemLevel: number): number | null {
  if (quality === 2 && itemLevel < 5) return null;
  if (quality !== 2 && itemLevel < 1) return null;
  if (quality === 4 && itemLevel >= 90) return itemLevel <= 170 ? 300 : null;
  if (itemLevel <= 20 && quality === 2) return 1;
  if (itemLevel <= 25) return 25;
  if (itemLevel <= 30) return 50;
  if (itemLevel <= 35) return 75;
  if (itemLevel <= 40) return 100;
  if (itemLevel <= 45) return 125;
  if (itemLevel <= 50) return 150;
  if (itemLevel <= 55) return 175;
  if (itemLevel <= 60) return 200;
  if (itemLevel <= 99) return 225;
  if (itemLevel <= 150) return 275;
  return null;
}

function bracket(
  minimumItemLevel: number,
  maximumItemLevel: number,
  ...outcomeGroups: readonly (readonly DisenchantOutcome[])[]
): DisenchantBracket {
  const outcomes = outcomeGroups.flat();
  const total = outcomes.reduce(
    (sum, outcome) => addFractions(sum, outcome.probability),
    createFraction(0n, 1n),
  );
  if (total.numerator !== total.denominator) {
    throw new Error(
      `Disenchant probabilities for ${minimumItemLevel}-${maximumItemLevel} do not sum to one`,
    );
  }
  return { minimumItemLevel, maximumItemLevel, outcomes };
}

function group(
  materialItemId: number,
  quantities: readonly number[],
  probabilityPercent: number,
): readonly DisenchantOutcome[] {
  if (quantities.length === 0) throw new RangeError("A disenchant group needs a quantity");
  const probability = percentFraction(probabilityPercent);
  return quantities.map((quantity) => ({
    materialItemId,
    quantity,
    probability: createFraction(
      probability.numerator,
      probability.denominator * BigInt(quantities.length),
    ),
  }));
}

function weighted(
  materialItemId: number,
  quantity: number,
  probabilityNumerator: number,
  probabilityDenominator: number,
): readonly DisenchantOutcome[] {
  return [
    {
      materialItemId,
      quantity,
      probability: createFraction(BigInt(probabilityNumerator), BigInt(probabilityDenominator)),
    },
  ];
}

function percentFraction(value: number): Fraction {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError("Probability percent must be between zero and 100");
  }
  const tenths = Math.round(value * 10);
  if (Math.abs(value * 10 - tenths) > Number.EPSILON) {
    throw new RangeError("Probability percent supports one decimal place");
  }
  return createFraction(BigInt(tenths), 1_000n);
}

function aggregateExpectedMaterials(
  outcomes: readonly DisenchantOutcome[],
): readonly ExpectedDisenchantMaterial[] {
  const expected = new Map<number, Fraction>();
  for (const outcome of outcomes) {
    const contribution = createFraction(
      outcome.probability.numerator * BigInt(outcome.quantity),
      outcome.probability.denominator,
    );
    expected.set(
      outcome.materialItemId,
      addFractions(expected.get(outcome.materialItemId) ?? createFraction(0n, 1n), contribution),
    );
  }
  return [...expected.entries()]
    .sort(([left], [right]) => left - right)
    .map(([materialItemId, expectedQuantity]) => ({ materialItemId, expectedQuantity }));
}

function addFractions(left: Fraction, right: Fraction): Fraction {
  return createFraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function qualityName(quality: 2 | 3 | 4): string {
  if (quality === 2) return "uncommon";
  if (quality === 3) return "rare";
  return "epic";
}
