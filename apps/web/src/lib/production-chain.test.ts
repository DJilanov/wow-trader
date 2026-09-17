import { describe, expect, it } from "vitest";

import {
  buildProductionChain,
  type ProductionChainItem,
  type ProductionMethodSource,
} from "./production-chain";

describe("buildProductionChain", () => {
  it("scales each intermediate input to the number of required crafts", () => {
    const [heavyLeather] = buildProductionChain(
      [{ ...item(23_793, "Heavy Knothide Leather"), quantity: 4 }],
      [
        method({
          id: "recipe:32455",
          spellId: 32_455,
          name: "Heavy Knothide Leather",
          output: item(23_793, "Heavy Knothide Leather"),
          input: { ...item(21_881, "Knothide Leather"), quantity: 5 },
        }),
      ],
    );

    expect(heavyLeather?.state).toBe("craftable");
    expect(heavyLeather?.methods[0]?.crafts).toBe(4);
    expect(heavyLeather?.methods[0]?.inputs[0]?.requiredQuantity).toBe(20);
  });

  it("keeps cooldown routes informational while allowing a normal item conversion", () => {
    const [primalAir] = buildProductionChain(
      [{ ...item(22_451, "Primal Air"), quantity: 4 }],
      [
        method({
          id: "transformation:127630",
          spellId: 28_100,
          name: "Create Primal Air",
          kind: "item_use",
          output: item(22_451, "Primal Air"),
          input: { ...item(22_572, "Mote of Air"), quantity: 10 },
        }),
        method({
          id: "recipe:28569",
          spellId: 28_569,
          name: "Transmute: Primal Water to Air",
          output: item(22_451, "Primal Air"),
          input: { ...item(22_478, "Primal Water"), quantity: 1 },
          categoryCooldownMs: 72_000_000,
        }),
      ],
    );

    expect(primalAir?.state).toBe("craftable");
    expect(primalAir?.methods.map((candidate) => candidate.kind)).toEqual([
      "item_use",
      "profession",
    ]);
    expect(primalAir?.methods[0]?.inputs[0]?.requiredQuantity).toBe(40);
    expect(primalAir?.methods[1]).toMatchObject({
      timeGated: true,
      economicEligible: false,
    });
  });

  it("treats an item with only cooldown producers as an acquisition leaf", () => {
    const [material] = buildProductionChain(
      [{ ...item(20, "Cooldown material"), quantity: 1 }],
      [
        method({
          id: "recipe:1",
          spellId: 1,
          name: "Daily craft",
          output: item(20, "Cooldown material"),
          input: { ...item(10, "Raw material"), quantity: 1 },
          cooldownMs: 86_400_000,
        }),
      ],
    );

    expect(material?.state).toBe("acquire");
    expect(material?.methods[0]?.timeGated).toBe(true);
  });

  it("stops a reversible conversion before it reuses the requested ancestor", () => {
    const primalEarth = item(22_452, "Primal Earth");
    const moteEarth = item(22_573, "Mote of Earth");
    const [material] = buildProductionChain(
      [{ ...primalEarth, quantity: 1 }],
      [
        method({
          id: "recipe:35751",
          spellId: 35_751,
          name: "Earth Shatter",
          output: { ...moteEarth, minimumQuantity: 10, maximumQuantity: 10 },
          input: { ...primalEarth, quantity: 1 },
        }),
        method({
          id: "transformation:127631",
          spellId: 28_101,
          name: "Create Primal Earth",
          kind: "item_use",
          output: primalEarth,
          input: { ...moteEarth, quantity: 10 },
        }),
      ],
    );

    const moteInput = material?.methods[0]?.inputs[0];
    expect(material?.state).toBe("craftable");
    expect(moteInput?.state).toBe("acquire");
    expect(moteInput?.methods[0]).toMatchObject({ cyclic: true, economicEligible: false });
  });
});

function item(itemId: number, name: string): ProductionChainItem {
  return { itemId, name, iconFileDataId: null, quality: 1 };
}

function method(values: {
  readonly id: string;
  readonly spellId: number;
  readonly name: string;
  readonly output: ProductionChainItem & {
    readonly minimumQuantity?: number;
    readonly maximumQuantity?: number;
  };
  readonly input: ProductionChainItem & { readonly quantity: number };
  readonly kind?: ProductionMethodSource["kind"];
  readonly cooldownMs?: number;
  readonly categoryCooldownMs?: number;
}): ProductionMethodSource {
  return {
    methodId: values.id,
    spellId: values.spellId,
    kind: values.kind ?? "profession",
    name: values.name,
    profession:
      values.kind === "item_use" ? null : { name: "Leatherworking", slug: "leatherworking" },
    requiredSkillRank: values.kind === "item_use" ? 0 : 325,
    cooldownMs: values.cooldownMs ?? 0,
    categoryCooldownMs: values.categoryCooldownMs ?? 0,
    output: {
      ...values.output,
      minimumQuantity: values.output.minimumQuantity ?? 1,
      maximumQuantity: values.output.maximumQuantity ?? 1,
    },
    inputs: [values.input],
  };
}
