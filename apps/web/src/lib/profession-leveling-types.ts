export interface LevelingIngredient {
  readonly itemId: number;
  readonly quantity: number;
}

export interface LevelingAcquisition {
  readonly label: string;
  readonly costCopper: string;
  readonly itemId?: number;
  readonly requiredLevel?: number;
  readonly requiredSkill?: number;
}

export interface LevelingRecipe {
  readonly id: number;
  readonly name: string;
  readonly requiredSkill: number;
  readonly requiredSkillKnown?: boolean;
  readonly yellowSkill: number;
  readonly graySkill: number;
  readonly skillUps: number;
  readonly inputs: readonly LevelingIngredient[];
  readonly output: LevelingIngredient | null;
  readonly acquisition: readonly LevelingAcquisition[];
  readonly restriction: string | null;
}

export interface LevelingItem {
  readonly id: number;
  readonly name: string;
  readonly levels: readonly {
    readonly unitPriceCopper: string;
    readonly quantity: number;
    readonly listingCount: number;
    readonly lots:
      | readonly {
          readonly stackSize: number;
          readonly listingCount: number;
          readonly buyoutCopper: string;
        }[]
      | null;
  }[];
}

export interface ProfessionLevelingData {
  readonly professions: readonly {
    readonly id: number;
    readonly slug: string;
    readonly name: string;
  }[];
  readonly markets: readonly { readonly value: string; readonly label: string }[];
  readonly market: string;
  readonly profession: string;
  readonly scan: { readonly at: string; readonly build: number; readonly fresh: boolean } | null;
  readonly recipes: readonly LevelingRecipe[];
  readonly items: readonly LevelingItem[];
  readonly limitation: string | null;
}

export interface ProfessionLevelingOptions {
  readonly from: number;
  readonly to: number;
  readonly playerLevel: number;
  readonly mode: "orange" | "expected";
  readonly knownRecipeIds: readonly number[];
  readonly recipeCosts: Readonly<Record<string, string>>;
  readonly recipeSkills?: Readonly<Record<string, number>>;
}

export interface ProfessionLevelingStep {
  readonly from: number;
  readonly to: number;
  readonly recipeId: number;
  readonly recipeName: string;
  readonly crafts: number;
  readonly learning: string | null;
}

export interface ProfessionLevelingPlan {
  readonly from: number;
  readonly reached: number;
  readonly target: number;
  readonly status: "complete" | "partial";
  readonly mode: "orange" | "expected";
  readonly totalCopper: string;
  readonly materialCopper: string;
  readonly recipeCopper: string;
  readonly steps: readonly ProfessionLevelingStep[];
  readonly shopping: readonly {
    readonly itemId: number;
    readonly name: string;
    readonly needed: number;
    readonly purchased: number;
    readonly costCopper: string;
    readonly recipeQuantity: number;
  }[];
  readonly excluded: number;
  readonly searchLimited: boolean;
  readonly transitions: number;
}
