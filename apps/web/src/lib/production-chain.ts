import { isTimeGatedCraft } from "@wow-trader/economics";

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_METHODS_PER_ITEM = 6;

export interface ProductionChainItem {
  readonly itemId: number;
  readonly name: string;
  readonly iconFileDataId: number | null;
  readonly quality: number;
}

export interface ProductionMethodSource {
  readonly methodId: string;
  readonly spellId: number;
  readonly kind: "profession" | "item_use";
  readonly name: string;
  readonly profession: { readonly name: string; readonly slug: string } | null;
  readonly requiredSkillRank: number;
  readonly cooldownMs: number;
  readonly categoryCooldownMs: number;
  readonly output: ProductionChainItem & {
    readonly minimumQuantity: number;
    readonly maximumQuantity: number;
  };
  readonly inputs: readonly (ProductionChainItem & { readonly quantity: number })[];
}

export interface ProductionMethodNode extends Omit<ProductionMethodSource, "inputs"> {
  readonly crafts: number | null;
  readonly producedQuantity: number | null;
  readonly leftoverQuantity: number | null;
  readonly deterministic: boolean;
  readonly timeGated: boolean;
  readonly cyclic: boolean;
  readonly economicEligible: boolean;
  readonly inputs: readonly ProductionMaterialNode[];
}

export interface ProductionMaterialNode extends ProductionChainItem {
  readonly requiredQuantity: number;
  readonly state: "craftable" | "acquire" | "cycle" | "depth_limit";
  readonly methods: readonly ProductionMethodNode[];
  readonly omittedMethodCount: number;
}

export interface ProductionChainOptions {
  readonly maxDepth?: number;
  readonly maxMethodsPerItem?: number;
}

export function buildProductionChain(
  requirements: readonly (ProductionChainItem & { readonly quantity: number })[],
  methods: readonly ProductionMethodSource[],
  options: ProductionChainOptions = {},
): readonly ProductionMaterialNode[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxMethodsPerItem = options.maxMethodsPerItem ?? DEFAULT_MAX_METHODS_PER_ITEM;
  if (!Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new RangeError("Production-chain depth must be a positive integer");
  }
  if (!Number.isInteger(maxMethodsPerItem) || maxMethodsPerItem < 1) {
    throw new RangeError("Production-chain method limit must be a positive integer");
  }

  const methodsByOutput = new Map<number, ProductionMethodSource[]>();
  for (const method of methods) {
    const existing = methodsByOutput.get(method.output.itemId);
    if (existing) existing.push(method);
    else methodsByOutput.set(method.output.itemId, [method]);
  }

  const makeNode = (
    item: ProductionChainItem,
    requiredQuantity: number,
    depth: number,
    path: ReadonlySet<number>,
  ): ProductionMaterialNode => {
    if (path.has(item.itemId)) {
      return { ...item, requiredQuantity, state: "cycle", methods: [], omittedMethodCount: 0 };
    }

    const availableMethods = [...(methodsByOutput.get(item.itemId) ?? [])].sort(compareMethods);
    if (depth >= maxDepth && availableMethods.length > 0) {
      return {
        ...item,
        requiredQuantity,
        state: "depth_limit",
        methods: [],
        omittedMethodCount: availableMethods.length,
      };
    }

    const nextPath = new Set(path).add(item.itemId);
    const visibleMethods = availableMethods.slice(0, maxMethodsPerItem).map((method) => {
      const deterministic =
        method.output.minimumQuantity > 0 &&
        method.output.minimumQuantity === method.output.maximumQuantity;
      const crafts = deterministic
        ? Math.ceil(requiredQuantity / method.output.minimumQuantity)
        : null;
      const producedQuantity = crafts === null ? null : crafts * method.output.minimumQuantity;
      const timeGated = isTimeGatedCraft(method.cooldownMs, method.categoryCooldownMs);
      const potentiallyEligible = deterministic && !timeGated;
      const inputs = method.inputs.map((input) =>
        potentiallyEligible
          ? makeNode(input, input.quantity * (crafts ?? 1), depth + 1, nextPath)
          : makeTerminalNode(input, input.quantity * (crafts ?? 1)),
      );
      const cyclic = inputs.some((input) => input.state === "cycle");
      return {
        ...method,
        crafts,
        producedQuantity,
        leftoverQuantity: producedQuantity === null ? null : producedQuantity - requiredQuantity,
        deterministic,
        timeGated,
        cyclic,
        economicEligible: potentiallyEligible && !cyclic,
        inputs,
      };
    });
    const craftable = visibleMethods.some((method) => method.economicEligible);
    return {
      ...item,
      requiredQuantity,
      state: craftable ? "craftable" : "acquire",
      methods: visibleMethods,
      omittedMethodCount: Math.max(0, availableMethods.length - visibleMethods.length),
    };
  };

  return requirements.map((requirement) =>
    makeNode(requirement, requirement.quantity, 0, new Set()),
  );
}

function makeTerminalNode(
  item: ProductionChainItem,
  requiredQuantity: number,
): ProductionMaterialNode {
  return {
    ...item,
    requiredQuantity,
    state: "acquire",
    methods: [],
    omittedMethodCount: 0,
  };
}

function compareMethods(left: ProductionMethodSource, right: ProductionMethodSource): number {
  const leftTimeGated = isTimeGatedCraft(left.cooldownMs, left.categoryCooldownMs);
  const rightTimeGated = isTimeGatedCraft(right.cooldownMs, right.categoryCooldownMs);
  if (leftTimeGated !== rightTimeGated) return leftTimeGated ? 1 : -1;
  if (left.kind !== right.kind) return left.kind === "item_use" ? -1 : 1;
  return left.name.localeCompare(right.name) || left.methodId.localeCompare(right.methodId);
}
