import { describe, expect, it } from "vitest";
import {
  clientProfessionLinksEnvelopeSchema,
  qualifyClientProfessionLinks,
  type ClientProfessionSource,
} from "./client-profession-links.js";

function fixture(): {
  source: ClientProfessionSource;
  base: {
    build: { id: string; product: string; buildNumber: number; locale: string; hotfixHash: string };
    items: object[];
    recipes: object[];
  };
} {
  const item = {
    itemId: 100,
    name: "Pattern: Example",
    classId: 9,
    subclassId: 1,
    requiredSkillId: 165,
    requiredSkillRank: 65,
    binding: 0,
    requiredLevel: 0,
    requiredAbilityId: null,
    minimumFactionId: null,
    minimumReputation: 0,
    allowableClassMask: -1,
    allowableRaceMask: [-1, -1],
  };
  const ability = {
    MinSkillLineRank: 1,
    TrivialSkillLineRankLow: 85,
    TrivialSkillLineRankHigh: 115,
    NumSkillUps: 1,
    ClassMask: 0,
    RaceMasks: [0, 0],
  };
  const build = {
    id: "109a56bb-913f-42c1-87a1-c906a8ffdc76",
    product: "wow_classic_beta",
    buildNumber: 70888,
    locale: "enUS",
    hotfixHash: "a".repeat(64),
  };
  return {
    source: {
      build: { ...build, hotfixHash: "b".repeat(64) },
      items: [item],
      recipes: [
        {
          recipeSpellId: 200,
          professionSkillLineId: 165,
          rawRecord: { skillLineAbility: ability },
        },
      ],
      inputs: [{ recipeSpellId: 200, reagentItemId: 300, quantity: 2, optional: false }],
      outputs: [
        {
          recipeSpellId: 200,
          outputItemId: 400,
          enchantmentId: null,
          minimumQuantity: 1,
          maximumQuantity: 1,
          expectedQuantityNumerator: 1,
          expectedQuantityDenominator: 1,
        },
      ],
      teachingItems: [{ recipeSpellId: 200, teachingItemId: 100, learningSpellId: null }],
      artifacts: [],
    },
    base: {
      build,
      items: [item],
      recipes: [
        {
          id: 200,
          professionId: 165,
          ability: { ...ability, MinSkillLineRank: 0 },
          inputs: [[300, 2, false]],
          outputs: [[400, null, 1, 1, "1", "1"]],
        },
      ],
    },
  };
}

describe("qualified game-client profession relations", () => {
  it("allows a later hotfix only with unchanged item requirements, ingredients, outputs and skill bands", () => {
    const { source, base } = fixture();
    const result = qualifyClientProfessionLinks(source, base);
    expect(result.report.qualified).toBe(1);
    expect(result.bundle.relations[0]?.evidence.catalogBuildId).toBe(base.build.id);
    expect(result.bundle.includedAuthored).toBe(false);
    expect(clientProfessionLinksEnvelopeSchema.parse(result).report.qualified).toBe(1);
  });
  it("rejects another product/build and malformed base data", () => {
    const { source, base } = fixture();
    expect(() =>
      qualifyClientProfessionLinks(
        { ...source, build: { ...source.build, buildNumber: 70889 } },
        base,
      ),
    ).toThrow("match");
    expect(() => qualifyClientProfessionLinks(source, {})).toThrow();
  });
  it("withholds changed reagent or output quantities", () => {
    const { source, base } = fixture();
    expect(
      qualifyClientProfessionLinks(
        { ...source, inputs: [{ ...source.inputs[0]!, quantity: 3 }] },
        base,
      ).report.qualified,
    ).toBe(0);
    expect(
      qualifyClientProfessionLinks(
        { ...source, outputs: [{ ...source.outputs[0]!, minimumQuantity: 2 }] },
        base,
      ).report.qualified,
    ).toBe(0);
  });
  it("withholds changed item requirements and class/skill restrictions", () => {
    const { source, base } = fixture();
    expect(
      qualifyClientProfessionLinks(
        { ...source, items: [{ ...source.items[0]!, requiredSkillRank: 70 }] },
        base,
      ).report.qualified,
    ).toBe(0);
    expect(
      qualifyClientProfessionLinks(
        {
          ...source,
          recipes: [
            {
              ...source.recipes[0]!,
              rawRecord: { skillLineAbility: { MinSkillLineRank: 1, ClassMask: 4 } },
            },
          ],
        },
        base,
      ).report.qualified,
    ).toBe(0);
  });
  it("deduplicates evidence and rejects an applied enchant output as a recipe item", () => {
    const { source, base } = fixture();
    expect(
      qualifyClientProfessionLinks(
        { ...source, teachingItems: [...source.teachingItems, ...source.teachingItems] },
        base,
      ).report.qualified,
    ).toBe(1);
    expect(
      qualifyClientProfessionLinks(
        { ...source, items: [{ ...source.items[0]!, classId: 0 }] },
        base,
      ).report.rejected.not_a_recipe_item,
    ).toBe(1);
  });
});
