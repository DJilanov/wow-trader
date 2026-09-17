import { createFraction, type Fraction } from "@wow-trader/economics";

import type { WorkspaceRecipeCandidate } from "./workspace";

export type ProfessionSpecializationSlug =
  | "none"
  | "all"
  | "transmutation-master"
  | "potion-master"
  | "elixir-master"
  | "armorsmith"
  | "master-axesmith"
  | "master-hammersmith"
  | "master-swordsmith"
  | "gnomish-engineer"
  | "goblin-engineer"
  | "dragonscale-leatherworker"
  | "elemental-leatherworker"
  | "tribal-leatherworker"
  | "mooncloth-tailor"
  | "shadoweave-tailor"
  | "spellfire-tailor";

export type SpecializedProfessionSlug =
  "alchemy" | "blacksmithing" | "engineering" | "leatherworking" | "tailoring";

export type CraftingSpecializationProfile = Readonly<
  Partial<Record<SpecializedProfessionSlug, ProfessionSpecializationSlug>>
>;

export interface ProfessionSpecializationOption {
  readonly slug: ProfessionSpecializationSlug;
  readonly name: string;
  readonly spellId: number | null;
  readonly description: string;
}

export interface ProfessionSpecializationProfile {
  readonly professionSlug: SpecializedProfessionSlug;
  readonly professionName: string;
  readonly parameterName: string;
  readonly selected: ProfessionSpecializationSlug;
  readonly options: readonly ProfessionSpecializationOption[];
}

export interface AppliedSpecialization {
  readonly slug: Exclude<ProfessionSpecializationSlug, "none" | "all">;
  readonly name: string;
  readonly spellId: number;
  readonly expectedOutputMultiplier: Fraction;
  readonly minimumOutputMultiplier: number;
  readonly maximumOutputMultiplier: number;
  readonly modelVersion: string;
  readonly evidence: string;
  readonly effectKind: "provisional_yield" | "guaranteed_yield" | "recipe_access";
}

interface SpecializationDefinition extends ProfessionSpecializationOption {
  readonly slug: Exclude<ProfessionSpecializationSlug, "none" | "all">;
  readonly spellId: number;
  readonly professionSlug: SpecializedProfessionSlug;
  readonly unlockedRecipeSpellIds: ReadonlySet<number>;
  readonly yieldRule?: {
    readonly expectedOutputMultiplier: Fraction;
    readonly minimumOutputMultiplier: number;
    readonly maximumOutputMultiplier: number;
    readonly matches: (candidate: WorkspaceRecipeCandidate) => boolean;
    readonly modelVersion: string;
    readonly evidence: string;
    readonly effectKind: "provisional_yield" | "guaranteed_yield";
  };
}

const NO_SPECIALIZATION: ProfessionSpecializationOption = {
  slug: "none",
  name: "No specialization",
  spellId: null,
  description: "Use only recipes that do not require a profession specialization.",
};

const ALL_SPECIALIZATIONS: ProfessionSpecializationOption = {
  slug: "all",
  name: "All branches (multiple alts)",
  spellId: null,
  description: "Assume the account has an eligible specialist for every branch in this profession.",
};

const PROVISIONAL_TBC_EXPECTED_MULTIPLIER = createFraction(6n, 5n);
const PROVISIONAL_TBC_MODEL_VERSION = "tbc-alchemy-mastery-provisional-v1";
const GUARANTEED_DOUBLE_OUTPUT = createFraction(2n, 1n);
const TBC_SPECIALIZATION_LOCK_MODEL_VERSION = "tbc-profession-specialization-locks-v1";

const ALCHEMY_MASTERY_EVIDENCE =
  "Provisional TBC planning model: 1.20× expected output with a possible 1–5× outcome. The server-side proc distribution is not present in client data and has not yet been calibrated from WoW Trader craft observations.";

function alchemyYieldRule(
  matches: (candidate: WorkspaceRecipeCandidate) => boolean,
): NonNullable<SpecializationDefinition["yieldRule"]> {
  return {
    expectedOutputMultiplier: PROVISIONAL_TBC_EXPECTED_MULTIPLIER,
    minimumOutputMultiplier: 1,
    maximumOutputMultiplier: 5,
    matches,
    modelVersion: PROVISIONAL_TBC_MODEL_VERSION,
    evidence: ALCHEMY_MASTERY_EVIDENCE,
    effectKind: "provisional_yield",
  };
}

function tailoringYieldRule(
  recipeSpellId: number,
  clothName: string,
): NonNullable<SpecializationDefinition["yieldRule"]> {
  return {
    expectedOutputMultiplier: GUARANTEED_DOUBLE_OUTPUT,
    minimumOutputMultiplier: 2,
    maximumOutputMultiplier: 2,
    matches: (candidate) => candidate.recipeSpellId === recipeSpellId,
    modelVersion: "tbc-tailoring-specialization-yield-v1",
    evidence: `TBC ${clothName} specialists produce two pieces from the matching time-gated cloth craft instead of one.`,
    effectKind: "guaranteed_yield",
  };
}

const TBC_SPECIALIZATIONS: readonly SpecializationDefinition[] = [
  {
    slug: "transmutation-master",
    name: "Transmutation Master",
    spellId: 28_672,
    professionSlug: "alchemy",
    description: "Model expected bonus output from eligible transmutations.",
    unlockedRecipeSpellIds: new Set(),
    yieldRule: alchemyYieldRule((candidate) => candidate.outputKind === "conversion"),
  },
  {
    slug: "potion-master",
    name: "Potion Master",
    spellId: 28_675,
    professionSlug: "alchemy",
    description: "Model expected bonus output from potion recipes.",
    unlockedRecipeSpellIds: new Set(),
    yieldRule: alchemyYieldRule((candidate) =>
      candidate.outputs.some((output) => output.classId === 0 && output.subclassId === 1),
    ),
  },
  {
    slug: "elixir-master",
    name: "Elixir Master",
    spellId: 28_677,
    professionSlug: "alchemy",
    description: "Model expected bonus output from elixir and flask recipes.",
    unlockedRecipeSpellIds: new Set(),
    yieldRule: alchemyYieldRule((candidate) =>
      candidate.outputs.some(
        (output) => output.classId === 0 && (output.subclassId === 2 || output.subclassId === 3),
      ),
    ),
  },
  {
    slug: "armorsmith",
    name: "Armorsmith",
    spellId: 9788,
    professionSlug: "blacksmithing",
    description: "Allow the TBC Armorsmith-only armor recipe lines.",
    unlockedRecipeSpellIds: setOf(36_122, 36_124, 36_129, 36_130, 34_533, 34_529, 34_534),
  },
  {
    slug: "master-axesmith",
    name: "Master Axesmith",
    spellId: 17_041,
    professionSlug: "blacksmithing",
    description: "Allow the TBC Axesmith weapon lines.",
    unlockedRecipeSpellIds: setOf(36_135, 36_134, 34_541, 34_543, 34_542, 34_544, 36_260, 36_261),
  },
  {
    slug: "master-hammersmith",
    name: "Master Hammersmith",
    spellId: 17_040,
    professionSlug: "blacksmithing",
    description: "Allow the TBC Hammersmith weapon lines.",
    unlockedRecipeSpellIds: setOf(36_137, 36_136, 34_547, 34_545, 34_548, 34_546, 36_263, 36_262),
  },
  {
    slug: "master-swordsmith",
    name: "Master Swordsmith",
    spellId: 17_039,
    professionSlug: "blacksmithing",
    description: "Allow the TBC Swordsmith weapon lines.",
    unlockedRecipeSpellIds: setOf(36_133, 36_131, 34_535, 34_538, 34_537, 34_540, 36_258, 36_259),
  },
  {
    slug: "gnomish-engineer",
    name: "Gnomish Engineer",
    spellId: 20_219,
    professionSlug: "engineering",
    description: "Allow recipes taught only to Gnomish Engineers.",
    unlockedRecipeSpellIds: setOf(30_568, 30_569, 30_570, 30_574, 30_575, 36_955),
  },
  {
    slug: "goblin-engineer",
    name: "Goblin Engineer",
    spellId: 20_221,
    professionSlug: "engineering",
    description: "Allow recipes taught only to Goblin Engineers.",
    unlockedRecipeSpellIds: setOf(30_558, 30_560, 30_563, 30_565, 30_566, 36_954),
  },
  {
    slug: "dragonscale-leatherworker",
    name: "Dragonscale Leatherworking",
    spellId: 10_656,
    professionSlug: "leatherworking",
    description: "Allow the TBC Dragonscale specialist mail sets.",
    unlockedRecipeSpellIds: setOf(35_575, 35_576, 35_577, 35_580, 35_582, 35_584, 36_076, 36_079),
  },
  {
    slug: "elemental-leatherworker",
    name: "Elemental Leatherworking",
    spellId: 10_658,
    professionSlug: "leatherworking",
    description: "Allow the TBC Primalstrike specialist set.",
    unlockedRecipeSpellIds: setOf(35_589, 35_590, 35_591),
  },
  {
    slug: "tribal-leatherworker",
    name: "Tribal Leatherworking",
    spellId: 10_660,
    professionSlug: "leatherworking",
    description: "Allow the TBC Windhawk specialist set.",
    unlockedRecipeSpellIds: setOf(35_585, 35_587, 35_588),
  },
  {
    slug: "mooncloth-tailor",
    name: "Mooncloth Tailoring",
    spellId: 26_799,
    professionSlug: "tailoring",
    description: "Allow Primal Mooncloth recipes and double its cloth cooldown output.",
    unlockedRecipeSpellIds: setOf(26_760, 26_761, 26_762, 26_763),
    yieldRule: tailoringYieldRule(26_751, "Primal Mooncloth"),
  },
  {
    slug: "shadoweave-tailor",
    name: "Shadoweave Tailoring",
    spellId: 26_801,
    professionSlug: "tailoring",
    description: "Allow Frozen Shadoweave recipes and double Shadowcloth cooldown output.",
    unlockedRecipeSpellIds: setOf(26_756, 26_757, 26_758, 26_759),
    yieldRule: tailoringYieldRule(36_686, "Shadowcloth"),
  },
  {
    slug: "spellfire-tailor",
    name: "Spellfire Tailoring",
    spellId: 26_797,
    professionSlug: "tailoring",
    description: "Allow Spellfire recipes and double Spellcloth cooldown output.",
    unlockedRecipeSpellIds: setOf(26_752, 26_753, 26_754),
    yieldRule: tailoringYieldRule(31_373, "Spellcloth"),
  },
];

const SPECIALIZED_PROFESSIONS: readonly {
  readonly slug: SpecializedProfessionSlug;
  readonly name: string;
  readonly parameterName: string;
}[] = [
  { slug: "alchemy", name: "Alchemy", parameterName: "alchemySpecialization" },
  {
    slug: "blacksmithing",
    name: "Blacksmithing",
    parameterName: "blacksmithingSpecialization",
  },
  { slug: "engineering", name: "Engineering", parameterName: "engineeringSpecialization" },
  {
    slug: "leatherworking",
    name: "Leatherworking",
    parameterName: "leatherworkingSpecialization",
  },
  { slug: "tailoring", name: "Tailoring", parameterName: "tailoringSpecialization" },
];

export function parseProfessionSpecialization(
  value: string | undefined,
  professionSlug?: SpecializedProfessionSlug,
): ProfessionSpecializationSlug {
  if (value === "none" || value === "all") return value;
  const definition = TBC_SPECIALIZATIONS.find((entry) => entry.slug === value);
  return definition && (!professionSlug || definition.professionSlug === professionSlug)
    ? definition.slug
    : "none";
}

export function getCraftingSpecializationProfiles(
  product: string,
  buildNumber: number,
  selected: CraftingSpecializationProfile,
  visibleProfessionSlug?: string,
): readonly ProfessionSpecializationProfile[] {
  if (!supportsTbcSpecializations(product, buildNumber)) return [];
  return SPECIALIZED_PROFESSIONS.filter(
    (profession) => !visibleProfessionSlug || profession.slug === visibleProfessionSlug,
  ).map((profession) => ({
    professionSlug: profession.slug,
    professionName: profession.name,
    parameterName: profession.parameterName,
    selected: parseProfessionSpecialization(selected[profession.slug], profession.slug),
    options: getProfessionSpecializationOptions(product, buildNumber, profession.slug),
  }));
}

export function getProfessionSpecializationOptions(
  product: string,
  buildNumber: number,
  professionSlug: string,
): readonly ProfessionSpecializationOption[] {
  if (!supportsTbcSpecializations(product, buildNumber)) return [NO_SPECIALIZATION];
  const definitions = TBC_SPECIALIZATIONS.filter(
    (specialization) => specialization.professionSlug === professionSlug,
  );
  return definitions.length === 0
    ? [NO_SPECIALIZATION]
    : [NO_SPECIALIZATION, ALL_SPECIALIZATIONS, ...definitions];
}

export function isRecipeAvailableWithSpecialization(
  product: string,
  buildNumber: number,
  selected: CraftingSpecializationProfile,
  candidate: WorkspaceRecipeCandidate,
): boolean {
  if (!supportsTbcSpecializations(product, buildNumber)) return true;
  const required = TBC_SPECIALIZATIONS.find((specialization) =>
    specialization.unlockedRecipeSpellIds.has(candidate.recipeSpellId),
  );
  if (!required) return true;
  const selection = selected[required.professionSlug] ?? "none";
  return selection === "all" || selection === required.slug;
}

export function resolveSpecialization(
  product: string,
  buildNumber: number,
  selected: CraftingSpecializationProfile,
  candidate: WorkspaceRecipeCandidate,
): AppliedSpecialization | null {
  if (!supportsTbcSpecializations(product, buildNumber)) return null;
  const selection = selected[candidate.professionSlug as SpecializedProfessionSlug] ?? "none";
  if (selection === "none") return null;

  const definitions = TBC_SPECIALIZATIONS.filter(
    (definition) => definition.professionSlug === candidate.professionSlug,
  );
  const specialization =
    selection === "all"
      ? definitions.find(
          (definition) =>
            definition.unlockedRecipeSpellIds.has(candidate.recipeSpellId) ||
            definition.yieldRule?.matches(candidate),
        )
      : definitions.find((definition) => definition.slug === selection);
  if (!specialization) return null;
  const affectsRecipe =
    specialization.unlockedRecipeSpellIds.has(candidate.recipeSpellId) ||
    specialization.yieldRule?.matches(candidate);
  if (!affectsRecipe) return null;

  const yieldRule = specialization.yieldRule?.matches(candidate)
    ? specialization.yieldRule
    : undefined;
  return {
    slug: specialization.slug,
    name: specialization.name,
    spellId: specialization.spellId,
    expectedOutputMultiplier: yieldRule?.expectedOutputMultiplier ?? createFraction(1n, 1n),
    minimumOutputMultiplier: yieldRule?.minimumOutputMultiplier ?? 1,
    maximumOutputMultiplier: yieldRule?.maximumOutputMultiplier ?? 1,
    modelVersion: yieldRule?.modelVersion ?? TBC_SPECIALIZATION_LOCK_MODEL_VERSION,
    evidence:
      yieldRule?.evidence ??
      `Recipe access requires ${specialization.name} in the build-locked TBC specialization map.`,
    effectKind: yieldRule?.effectKind ?? "recipe_access",
  };
}

export function applySpecialization(
  candidate: WorkspaceRecipeCandidate,
  specialization: AppliedSpecialization | null,
): WorkspaceRecipeCandidate {
  if (!specialization) return candidate;
  return {
    ...candidate,
    outputs: candidate.outputs.map((output) => ({
      ...output,
      minimumQuantity: output.minimumQuantity * specialization.minimumOutputMultiplier,
      maximumQuantity: output.maximumQuantity * specialization.maximumOutputMultiplier,
      expectedQuantity: multiplyFractions(
        output.expectedQuantity,
        specialization.expectedOutputMultiplier,
      ),
    })),
  };
}

function supportsTbcSpecializations(product: string, buildNumber: number): boolean {
  return product === "wow_anniversary" && buildNumber === 69_795;
}

function setOf(...values: readonly number[]): ReadonlySet<number> {
  return new Set(values);
}

function multiplyFractions(left: Fraction, right: Fraction): Fraction {
  return createFraction(left.numerator * right.numerator, left.denominator * right.denominator);
}
