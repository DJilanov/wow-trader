import { createLevelingPricer, type LevelingPurchase } from "./profession-leveling-prices";
import type {
  LevelingRecipe,
  ProfessionLevelingData,
  ProfessionLevelingOptions,
  ProfessionLevelingPlan,
  ProfessionLevelingStep,
} from "./profession-leveling-types";

const BEAM_WIDTH = 24;
const MAX_TRANSITIONS = 3_000_000;

interface State {
  readonly total: bigint;
  readonly materials: bigint;
  readonly fees: bigint;
  readonly learned: ReadonlySet<number>;
  readonly expectedCrafts: number;
  readonly demand: ReadonlyMap<number, number>;
  readonly patterns: ReadonlyMap<number, number>;
  readonly inventory: ReadonlyMap<number, number>;
  readonly previous: State | null;
  readonly step: ProfessionLevelingStep | null;
}

export function skillUpChance(
  recipe: LevelingRecipe,
  skill: number,
  mode: ProfessionLevelingOptions["mode"],
): number {
  if (skill < recipe.requiredSkill || skill >= recipe.graySkill) return 0;
  if (skill < recipe.yellowSkill) return 1;
  if (mode === "orange" || recipe.graySkill <= recipe.yellowSkill) return 0;
  // Explicit planning model, not a measured Forever server probability.
  return (recipe.graySkill - skill) / (recipe.graySkill - recipe.yellowSkill);
}

export function buildProfessionLevelingPlan(
  data: Pick<ProfessionLevelingData, "recipes" | "items">,
  options: ProfessionLevelingOptions,
): ProfessionLevelingPlan {
  if (
    !Number.isInteger(options.from) ||
    !Number.isInteger(options.to) ||
    options.from < 1 ||
    options.to > 300 ||
    options.from > options.to ||
    !Number.isInteger(options.playerLevel) ||
    options.playerLevel < 1 ||
    options.playerLevel > 60
  ) {
    throw new RangeError(
      "Choose profession skills from 1 to 300, with the target at or above your current skill, and character level 1–60.",
    );
  }
  const price = createLevelingPricer(data.items);
  const known = new Set(options.knownRecipeIds);
  const unlocked = data.recipes
    .map((recipe) => {
      const override = options.recipeSkills?.[recipe.id];
      return override !== undefined && recipe.requiredSkillKnown === false
        ? { ...recipe, requiredSkill: override, requiredSkillKnown: true }
        : recipe.requiredSkillKnown === false && known.has(recipe.id)
          ? { ...recipe, requiredSkill: options.from, requiredSkillKnown: true }
          : recipe;
    })
    .filter(
      (recipe) =>
        recipe.inputs.length > 0 &&
        recipe.skillUps > 0 &&
        recipe.requiredSkillKnown !== false &&
        (!recipe.restriction || known.has(recipe.id)) &&
        (known.has(recipe.id) ||
          options.recipeCosts[recipe.id] !== undefined ||
          recipe.acquisition.some(
            (acquisition) => (acquisition.requiredLevel ?? 0) <= options.playerLevel,
          )),
    );
  const consumedItems = new Set(
    unlocked.flatMap((recipe) => recipe.inputs.map((input) => input.itemId)),
  );
  const producedItems = new Set(
    unlocked.flatMap((recipe) => (recipe.output ? [recipe.output.itemId] : [])),
  );
  const recipes = unlocked
    .filter((recipe) =>
      recipe.inputs.every(
        (input) => producedItems.has(input.itemId) || price(input.itemId, input.quantity) !== null,
      ),
    )
    .map((recipe) =>
      recipe.output && !consumedItems.has(recipe.output.itemId)
        ? { ...recipe, output: null }
        : recipe,
    );
  const initial: State = {
    total: 0n,
    materials: 0n,
    fees: 0n,
    learned: known,
    expectedCrafts: 0,
    demand: new Map(),
    patterns: new Map(),
    inventory: new Map(),
    previous: null,
    step: null,
  };
  const levels: State[][] = Array.from({ length: options.to + 1 }, () => []);
  levels[options.from] = [initial];
  let best = initial;
  let reached = options.from;
  let limited = false;
  let transitions = 0;
  for (let skill = options.from; skill < options.to; skill++) {
    const states = levels[skill]!;
    states.sort(compare);
    if (states.length > BEAM_WIDTH) {
      states.length = BEAM_WIDTH;
      limited = true;
    }
    const signatures = new Set<string>();
    for (const state of states) {
      const signature = stateSignature(state);
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      for (const recipe of recipes) {
        const chance = skillUpChance(recipe, skill, options.mode);
        if (chance <= 0) continue;
        transitions++;
        if (transitions > MAX_TRANSITIONS) {
          limited = true;
          break;
        }
        const nextSkill = Math.min(options.to, skill + recipe.skillUps);
        const next = advance(state, recipe, skill, nextSkill, chance, options, price);
        if (!next) continue;
        const bucket = levels[nextSkill]!;
        bucket.push(next);
        if (bucket.length > BEAM_WIDTH * 4) {
          bucket.sort(compare);
          bucket.length = BEAM_WIDTH * 2;
          limited = true;
        }
        if (nextSkill > reached || (nextSkill === reached && next.total < best.total)) {
          reached = nextSkill;
          best = next;
        }
      }
      if (transitions > MAX_TRANSITIONS) break;
    }
    if (transitions > MAX_TRANSITIONS) break;
    levels[skill] = [];
  }
  const steps: ProfessionLevelingStep[] = [];
  for (let state: State | null = best; state?.step; state = state.previous) steps.push(state.step);
  steps.reverse();
  const combined: ProfessionLevelingStep[] = [];
  for (const step of steps) {
    const previous = combined.at(-1);
    if (previous?.recipeId === step.recipeId)
      combined[combined.length - 1] = {
        ...previous,
        to: step.to,
        crafts: previous.crafts + step.crafts,
      };
    else combined.push(step);
  }
  const items = new Map(data.items.map((item) => [item.id, item]));
  const ids = new Set([...best.demand.keys(), ...best.patterns.keys()]);
  const shopping = [...ids]
    .map((id) => {
      const needed = (best.demand.get(id) ?? 0) + (best.patterns.get(id) ?? 0);
      const quote = price(id, needed)!;
      return {
        itemId: id,
        name: items.get(id)?.name ?? `Item ${id}`,
        needed,
        purchased: quote.quantity,
        costCopper: quote.cost.toString(),
        recipeQuantity: best.patterns.get(id) ?? 0,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const materialCopper = [...best.demand].reduce(
    (sum, [id, quantity]) => sum + price(id, quantity)!.cost,
    0n,
  );
  return {
    from: options.from,
    reached,
    target: options.to,
    status: reached === options.to ? "complete" : "partial",
    mode: options.mode,
    totalCopper: best.total.toString(),
    materialCopper: materialCopper.toString(),
    recipeCopper: (best.total - materialCopper).toString(),
    steps: combined,
    shopping,
    excluded: data.recipes.length - recipes.length,
    searchLimited: limited,
    transitions,
  };
}

function compare(left: State, right: State): number {
  return left.total < right.total ? -1 : left.total > right.total ? 1 : 0;
}

function stateSignature(state: State): string {
  return (
    `${state.step?.recipeId ?? 0}:${state.expectedCrafts}:` +
    [state.learned, state.demand, state.patterns, state.inventory]
      .map((value) =>
        JSON.stringify([...value].sort((left, right) => String(left).localeCompare(String(right)))),
      )
      .join("|")
  );
}

function advance(
  state: State,
  recipe: LevelingRecipe,
  from: number,
  to: number,
  chance: number,
  options: ProfessionLevelingOptions,
  price: (id: number, quantity: number) => LevelingPurchase | null,
): State | null {
  let fees = state.fees;
  let learned = state.learned;
  let patterns = new Map(state.patterns);
  let learning: string | null = null;
  if (!learned.has(recipe.id)) {
    const override = options.recipeCosts[recipe.id];
    const acquisitions =
      override !== undefined
        ? [{ label: "Your recipe cost", costCopper: override }]
        : recipe.acquisition.filter(
            (option) =>
              (option.requiredLevel ?? 0) <= options.playerLevel &&
              (option.requiredSkill ?? 0) <= from,
          );
    let chosen: { cost: bigint; fee: bigint; patterns: Map<number, number>; label: string } | null =
      null;
    for (const option of acquisitions) {
      if (!/^\d{1,16}$/.test(option.costCopper)) continue;
      const fee = BigInt(option.costCopper);
      const nextPatterns = new Map(patterns);
      let cost = fee;
      if ("itemId" in option && typeof option.itemId === "number") {
        const itemId = option.itemId;
        const demand = state.demand.get(itemId) ?? 0;
        const oldCount = patterns.get(itemId) ?? 0;
        const before = price(itemId, demand + oldCount);
        const after = price(itemId, demand + oldCount + 1);
        if (!before || !after) continue;
        cost += after.cost - before.cost;
        nextPatterns.set(itemId, oldCount + 1);
      }
      if (!chosen || cost < chosen.cost)
        chosen = { cost, fee, patterns: nextPatterns, label: option.label };
    }
    if (!chosen) return null;
    fees += chosen.fee;
    patterns = chosen.patterns;
    learning = chosen.label;
    learned = new Set([...learned, recipe.id]);
  }
  const old = state.step?.recipeId === recipe.id ? state.expectedCrafts : 0;
  const expected = old + 1 / chance;
  const count = Math.ceil(expected - 1e-9) - Math.ceil(old - 1e-9);
  const demand = new Map(state.demand);
  const inventory = new Map(state.inventory);
  for (const input of recipe.inputs) {
    const units = input.quantity * count;
    const available = inventory.get(input.itemId) ?? 0;
    const used = Math.min(available, units);
    inventory.set(input.itemId, available - used);
    const missing = units - used;
    if (missing) demand.set(input.itemId, (demand.get(input.itemId) ?? 0) + missing);
  }
  if (recipe.output && count > 0)
    inventory.set(
      recipe.output.itemId,
      (inventory.get(recipe.output.itemId) ?? 0) + recipe.output.quantity * count,
    );
  let materials = 0n;
  for (const id of new Set([...demand.keys(), ...patterns.keys()])) {
    const quantity = (demand.get(id) ?? 0) + (patterns.get(id) ?? 0);
    const quote = price(id, quantity);
    if (!quote) return null;
    materials += quote.cost;
  }
  return {
    total: materials + fees,
    materials,
    fees,
    learned,
    expectedCrafts: expected,
    demand,
    patterns,
    inventory,
    previous: state,
    step: { from, to, recipeId: recipe.id, recipeName: recipe.name, crafts: count, learning },
  };
}
