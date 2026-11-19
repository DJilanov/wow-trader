import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import type { CatalogBundle, CatalogItem, CatalogSnapshotManifest } from "@wow-trader/contracts";
import { describe, expect, it } from "vitest";

import { auditCatalogSnapshot } from "./audit.js";
import { diffCatalogs } from "./diff.js";
import { createSnapshotKey } from "./import.js";
import { assessCatalogPromotion } from "./promotion.js";
import { verifyRecipeReagents } from "./reagent-source.js";
import { verifyTeachingResolutions, type TeachingSourceRows } from "./teaching-source.js";
import { createSemanticCatalogDiff } from "./semantic-diff.js";
import { validateCatalog } from "./validation.js";

describe("createSnapshotKey", () => {
  it("includes the extractor and normalized snapshot schema versions", () => {
    expect(createSnapshotKey(createGoldenBundle())).toBe(
      `wow_anniversary:2.5.6.69795:69795:enUS:${"c".repeat(64)}:definition-revision:0.4.0:catalog-snapshot-manifest.v4`,
    );
  });
});

describe("validateCatalog", () => {
  it("passes the TBC golden recipe topology", () => {
    const report = validateCatalog(createGoldenBundle(), { requireTbcGoldenRecipe: true });

    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("reports missing references and a broken golden output", () => {
    const bundle = createGoldenBundle();
    bundle.items = bundle.items.filter((item) => item.itemId !== 7_080);

    const report = validateCatalog(bundle, { requireTbcGoldenRecipe: true });

    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("output_item_missing");
  });
});

describe("diffCatalogs", () => {
  it("treats reagent changes as recipe topology changes", () => {
    const before = createGoldenBundle();
    const after = createGoldenBundle();
    after.manifest.buildNumber = 69_796;
    after.recipeInputs[0] = { ...after.recipeInputs[0]!, quantity: 2 };

    const diff = diffCatalogs(before, after);

    expect(diff.recipes.changed).toEqual([17_563]);
    expect(diff.fromBuild).toBe(69_795);
    expect(diff.toBuild).toBe(69_796);
  });
});

describe("createSemanticCatalogDiff", () => {
  it("explains item and recipe economics changes without comparing raw evidence", () => {
    const before = createGoldenBundle();
    const after = createGoldenBundle();
    after.manifest.buildNumber += 1;
    after.items[0] = { ...after.items[0]!, sellPriceCopper: "125", rawRecord: { changed: true } };
    after.recipeInputs[0] = { ...after.recipeInputs[0]!, quantity: 3 };

    const diff = createSemanticCatalogDiff(before, after);

    expect(diff.items).toEqual([
      expect.objectContaining({
        id: 7_080,
        kind: "changed",
        fields: [expect.objectContaining({ field: "sellPriceCopper", impact: "economy" })],
      }),
    ]);
    expect(diff.recipes).toEqual([
      expect.objectContaining({
        id: 17_563,
        kind: "changed",
        fields: [expect.objectContaining({ field: "inputs", impact: "economy" })],
      }),
    ]);
    expect(diff.summary.economyChanges).toBe(2);
  });
});

describe("assessCatalogPromotion", () => {
  it("allows raw evidence, item metadata, spell, and recipe craft-time changes", () => {
    const before = createGoldenBundle();
    const after = createPromotionTarget(before);
    after.items[0] = {
      ...after.items[0]!,
      sellPriceCopper: "99",
      rawRecord: { updated: true },
    };
    after.spells[0] = { ...after.spells[0]!, description: "Updated description" };
    after.recipes[0] = { ...after.recipes[0]!, craftTimeMs: 3_000, rawRecord: { updated: true } };

    const assessment = assessCatalogPromotion(before, after);

    expect(assessment.decision).toBe("auto_publish");
    expect(assessment.blockers).toEqual([]);
    expect(assessment.changes.items.changed).toEqual([7_080]);
    expect(assessment.changes.recipeCraftTimes.changed).toEqual([17_563]);
    expect(assessment.changes.recipeEconomics.changed).toEqual([]);
  });

  it("requires review when recipe economics change", () => {
    const before = createGoldenBundle();
    const after = createPromotionTarget(before);
    after.recipeInputs[0] = { ...after.recipeInputs[0]!, quantity: 2 };

    const assessment = assessCatalogPromotion(before, after);

    expect(assessment.decision).toBe("review_required");
    expect(assessment.blockers.map((blocker) => blocker.code)).toContain(
      "recipe_economics_changed",
    );
    expect(assessment.changes.recipeEconomics.changed).toEqual([17_563]);
  });

  it("automatically accepts quantity-only updates verified against the actual source rows", () => {
    const before = createGoldenBundle();
    const after = createPromotionTarget(before);
    after.recipeInputs[0] = { ...after.recipeInputs[0]!, quantity: 2 };
    const evidence = reagentEvidence(after);
    const assessment = assessCatalogPromotion(before, after, evidence);
    expect(assessment.decision).toBe("auto_publish");
    expect(assessment.sourceVerifiedReagentQuantityChanges).toEqual([17_563]);
  });

  it("rejects stale or mismatched source evidence for a quantity update", () => {
    const before = createGoldenBundle();
    const after = createPromotionTarget(before);
    const stale = reagentEvidence(after);
    after.recipeInputs[0] = { ...after.recipeInputs[0]!, quantity: 2 };
    expect(assessCatalogPromotion(before, after, stale).decision).toBe("review_required");
    const mismatch = verifyRecipeReagents(after, [
      { SpellID: 17_563, Reagent: [], ReagentCount: [] },
    ]);
    expect(assessCatalogPromotion(before, after, mismatch).decision).toBe("review_required");
  });

  it("automatically resolves a newly readable native teaching item and its true skill rank", () => {
    const { before, after, native } = teachingResolutionFixture();
    const evidence = verifyTeachingResolutions(after, native);
    expect(evidence.verifiedRecipeIds).toEqual([17_563]);
    const result = assessCatalogPromotion(before, after, undefined, evidence);
    expect(result.decision).toBe("auto_publish");
    expect(result.sourceVerifiedTeachingItemResolutions).toEqual([17_563]);
    expect(result.changes.recipeEconomics.changed).toEqual([17_563]);
  });

  it.each([
    "missing-source",
    "wrong-trigger",
    "wrong-link",
    "wrong-rank",
    "wrong-item-rank",
    "wrong-profession",
    "conflicting-ability",
    "indirect-link",
    "duplicate-link",
    "missing-item",
  ])("does not qualify teaching resolution with %s", (failure) => {
    const { before, after, native } = teachingResolutionFixture();
    if (failure === "missing-source") native.itemLinks = null;
    if (failure === "wrong-trigger")
      native.itemEffects = [{ id: 1, SpellID: 17_563, TriggerType: 0 }];
    if (failure === "wrong-link") native.itemLinks = [{ ItemEffectID: 1, ItemID: 99 }];
    if (failure === "wrong-rank") after.recipes[0]!.requiredSkillRank = 204;
    if (failure === "wrong-item-rank")
      after.items.find((item) => item.itemId === 13_486)!.requiredSkillRank = 204;
    if (failure === "wrong-profession") after.recipes[0]!.professionSkillLineId = 164;
    if (failure === "conflicting-ability")
      native.abilities = [
        { Spell: 17_563, SkillLine: 171, MinSkillLineRank: 1 },
        { Spell: 17_563, SkillLine: 171, MinSkillLineRank: 2 },
      ];
    if (failure === "indirect-link") after.recipeTeachingItems[0]!.learningSpellId = 17_564;
    if (failure === "duplicate-link")
      after.recipeTeachingItems.push({ ...after.recipeTeachingItems[0]! });
    if (failure === "missing-item")
      after.items = after.items.filter((item) => item.itemId !== 13_486);
    const evidence = verifyTeachingResolutions(after, native);
    expect(evidence.verifiedRecipeIds).toEqual([]);
    expect(assessCatalogPromotion(before, after, undefined, evidence).decision).toBe(
      "review_required",
    );
  });

  it.each([
    "no-proof",
    "stale-proof",
    "existing-item",
    "not-pending",
    "output",
    "input",
    "cooldown",
    "extractor",
    "already-complete",
    "removed-old-link",
  ])("retains review for teaching changes with %s", (failure) => {
    const { before, after, native } = teachingResolutionFixture();
    const evidence = verifyTeachingResolutions(after, native);
    if (failure === "stale-proof") after.items[0]!.requiredSkillRank += 1;
    if (failure === "existing-item")
      before.items.push({ ...after.items.find((item) => item.itemId === 13_486)! });
    if (failure === "not-pending") before.recipes[0]!.rawRecord.unresolvedTeachingItems = [];
    if (failure === "output") after.recipeOutputs[0]!.maximumQuantity = 3;
    if (failure === "input") after.recipeInputs[0]!.quantity = 5;
    if (failure === "cooldown") after.recipes[0]!.cooldownMs = 1;
    if (failure === "extractor") after.manifest.extractor.version = "9.0.0";
    if (failure === "already-complete") before.recipes[0]!.extractionStatus = "complete";
    if (failure === "removed-old-link")
      before.recipeTeachingItems.push({
        recipeSpellId: 17_563,
        teachingItemId: 100_000,
        learningSpellId: null,
      });
    expect(
      assessCatalogPromotion(
        before,
        after,
        undefined,
        failure === "no-proof" ? undefined : evidence,
      ).decision,
    ).toBe("review_required");
  });

  it.each(["item", "output", "rank", "cooldown", "teaching", "extractor"])(
    "keeps %s changes under review even with verified quantities",
    (change) => {
      const before = createGoldenBundle();
      const after = createPromotionTarget(before);
      after.recipeInputs[0] = { ...after.recipeInputs[0]!, quantity: 2 };
      if (change === "item")
        after.recipeInputs[0] = { ...after.recipeInputs[0]!, reagentItemId: 99 };
      if (change === "output")
        after.recipeOutputs[0] = { ...after.recipeOutputs[0]!, minimumQuantity: 2 };
      if (change === "rank") after.recipes[0] = { ...after.recipes[0]!, requiredSkillRank: 99 };
      if (change === "cooldown") after.recipes[0] = { ...after.recipes[0]!, cooldownMs: 99 };
      if (change === "teaching") after.recipeTeachingItems = [];
      if (change === "extractor") after.manifest.extractor.version = "9.0.0";
      expect(assessCatalogPromotion(before, after, reagentEvidence(after)).decision).toBe(
        "review_required",
      );
    },
  );

  it("keeps broad quantity changes outside the small automatic update budget", () => {
    const before = createGoldenBundle();
    before.recipes.push({ ...before.recipes[0]!, recipeSpellId: 17_565 });
    before.recipeInputs.push({ ...before.recipeInputs[0]!, recipeSpellId: 17_565 });
    const after = createPromotionTarget(before);
    after.recipeInputs = after.recipeInputs.map((input) => ({
      ...input,
      quantity: input.quantity + 1,
    }));
    expect(assessCatalogPromotion(before, after, reagentEvidence(after)).decision).toBe(
      "review_required",
    );
  });

  it("requires an exact definitions revision and applied hotfixes", () => {
    const before = createGoldenBundle();
    const after = createPromotionTarget(before);
    after.manifest.definitions.revision = "floating";
    after.manifest.hotfix = { status: "missing", sha256: null };

    const assessment = assessCatalogPromotion(before, after);

    expect(assessment.decision).toBe("review_required");
    expect(assessment.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(["definitions_unverified", "hotfix_missing"]),
    );
  });

  it("stops automatic promotion on excessive normalized row-count drift", () => {
    const before = createGoldenBundle();
    const after = createPromotionTarget(before);
    after.items = after.items.slice(0, 5);

    const assessment = assessCatalogPromotion(before, after);

    expect(assessment.decision).toBe("review_required");
    expect(assessment.blockers.map((blocker) => blocker.code)).toContain("item_count_drift");
  });
});

describe("auditCatalogSnapshot", () => {
  it.each([1, 2])(
    "checks normalized reagent quantity %s against checksum-verified raw rows",
    async (quantity) => {
      const directory = await mkdtemp(join(tmpdir(), "wow-trader-reagent-audit-"));
      try {
        const base = createGoldenBundle();
        const fixture = {
          ...createItemAuditFixture(),
          recipes: base.recipes,
          recipeInputs: [{ ...base.recipeInputs[0]!, quantity }],
          reagentRows: [{ id: 1, SpellID: 17_563, Reagent: [12_808], ReagentCount: [1] }],
        };
        const path = await writeAuditSnapshot(directory, fixture.normalizedItems, fixture);
        const report = await auditCatalogSnapshot(path);
        expect(report.valid).toBe(quantity === 1);
        expect(report.recipeReagents.sourceAvailable).toBe(true);
        expect(report.recipeReagents.mismatchedRecipeIds).toEqual(quantity === 1 ? [] : [17_563]);
        await writeFile(join(directory, "raw/SpellReagents.effective.ndjson.gz"), gzipSync("{}\n"));
        await expect(auditCatalogSnapshot(path)).rejects.toThrow(/checksum/i);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
  it("proves normalized item coverage while reporting structural IDs without names", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wow-trader-catalog-audit-"));
    try {
      const fixture = createItemAuditFixture();
      const manifestPath = await writeAuditSnapshot(directory, fixture.normalizedItems, fixture);

      const report = await auditCatalogSnapshot(manifestPath);

      expect(report.valid).toBe(true);
      expect(report.artifacts.verified).toBe(35);
      expect(report.items.normalizedRecords).toBe(1);
      expect(report.items.sourceIdsWithoutUsableName).toEqual({ count: 1, sampleIds: [2] });
      expect(report.items.sourceIdsMissingFromNormalized.count).toBe(0);
      expect(report.items.normalizedFieldMismatches.count).toBe(0);
      expect(report.items.rawRecordMismatches.count).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails when a named source item is absent from the normalized catalog", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wow-trader-catalog-audit-"));
    try {
      const fixture = createItemAuditFixture();
      const manifestPath = await writeAuditSnapshot(directory, [], fixture);

      const report = await auditCatalogSnapshot(manifestPath);

      expect(report.valid).toBe(false);
      expect(report.items.sourceIdsMissingFromNormalized).toEqual({ count: 1, sampleIds: [1] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("audits an item icon resolved from its default appearance", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wow-trader-catalog-audit-"));
    try {
      const fixture = createAppearanceIconAuditFixture();
      const manifestPath = await writeAuditSnapshot(directory, fixture.normalizedItems, fixture);

      const report = await auditCatalogSnapshot(manifestPath);

      expect(report.valid).toBe(true);
      expect(report.items.normalizedFieldMismatches.count).toBe(0);
      expect(report.items.rawRecordMismatches.count).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function createGoldenBundle(): CatalogBundle {
  return {
    manifest: {
      schemaVersion: "catalog-snapshot-manifest.v4",
      product: "wow_anniversary",
      clientVersion: "2.5.6.69795",
      buildNumber: 69_795,
      buildKey: "a".repeat(32),
      cdnKey: "b".repeat(32),
      locale: "enUS",
      extractedAt: "2026-09-15T00:00:00.000Z",
      hotfix: { status: "applied", sha256: "c".repeat(64) },
      definitions: { source: "wowdev/WoWDBDefs", revision: "definition-revision" },
      extractor: { name: "wow-trader-extractor", version: "0.4.0", revision: null },
      rawTables: {},
      normalizedArtifacts: {},
    },
    items: [
      createItem(7_080, "Essence of Water"),
      createItem(12_808, "Essence of Undeath"),
      createItem(13_486, "Recipe: Transmute Undeath to Water"),
      createItem(22_451, "Primal Air"),
      createItem(22_572, "Mote of Air"),
      {
        ...createItem(32_837, "Warglaive of Azzinoth"),
        quality: 5,
        requiredLevel: 70,
        itemLevel: 156,
        delayMs: 2_800,
        maxDurability: 125,
        itemSetId: 699,
      },
    ],
    spells: [
      createSpell(15_810, "Attack Power 44"),
      createSpell(17_563, "Transmute Undeath to Water"),
      createSpell(17_564, "Learn Transmute Undeath to Water"),
      createSpell(28_100, "Create Primal Air"),
    ],
    itemStats: [
      { itemId: 32_837, slot: 0, statType: 3, value: 22 },
      { itemId: 32_837, slot: 1, statType: 7, value: 29 },
      { itemId: 32_837, slot: 2, statType: 31, value: 21 },
    ],
    itemDamages: [{ itemId: 32_837, slot: 0, damageType: 0, minimum: 214, maximum: 398 }],
    itemResistances: [],
    itemSockets: [],
    itemEffects: [
      {
        itemEffectId: 1,
        itemId: 32_837,
        slot: 0,
        spellId: 15_810,
        triggerType: 1,
        charges: 0,
        cooldownMs: -1,
        categoryCooldownMs: -1,
        spellCategoryId: null,
        specializationId: null,
        playerConditionId: null,
      },
    ],
    itemSets: [
      {
        itemSetId: 699,
        name: "The Twin Blades of Azzinoth",
        flags: 0,
        requiredSkillId: null,
        requiredSkillRank: 0,
        rawRecord: {},
      },
    ],
    itemSetMembers: [{ itemSetId: 699, itemId: 32_837, slot: 0 }],
    itemSetEffects: [],
    gameClasses: [],
    gameRaces: [],
    itemClasses: [],
    itemSubclasses: [],
    itemLimitCategories: [],
    gemProperties: [],
    itemEnchantments: [],
    itemEnchantmentEffects: [],
    itemRandomEnchantments: [],
    itemBonusTrees: [],
    itemBonusTreeNodes: [],
    itemBonuses: [],
    professions: [{ skillLineId: 171, name: "Alchemy", slug: "alchemy", rawRecord: {} }],
    recipes: [
      {
        recipeSpellId: 17_563,
        professionSkillLineId: 171,
        requiredSkillRank: 275,
        craftTimeMs: 0,
        cooldownMs: 86_400_000,
        cooldownCategoryId: null,
        categoryCooldownMs: 0,
        outputKind: "item",
        extractionStatus: "complete",
        rawRecord: {},
      },
    ],
    recipeInputs: [{ recipeSpellId: 17_563, reagentItemId: 12_808, quantity: 1, optional: false }],
    recipeOutputs: [
      {
        recipeSpellId: 17_563,
        outputItemId: 7_080,
        enchantmentId: null,
        minimumQuantity: 1,
        maximumQuantity: 1,
        expectedQuantityNumerator: 1,
        expectedQuantityDenominator: 1,
      },
    ],
    recipeTeachingItems: [
      { recipeSpellId: 17_563, teachingItemId: 13_486, learningSpellId: 17_564 },
    ],
    transformations: [
      {
        transformationId: 127_630,
        spellId: 28_100,
        sourceItemId: 22_572,
        kind: "item_use",
        cooldownMs: 0,
        categoryCooldownMs: 0,
        extractionStatus: "complete",
        rawRecord: {},
      },
    ],
    transformationInputs: [{ transformationId: 127_630, itemId: 22_572, quantity: 10 }],
    transformationOutputs: [
      {
        transformationId: 127_630,
        itemId: 22_451,
        minimumQuantity: 1,
        maximumQuantity: 1,
        expectedQuantityNumerator: 1,
        expectedQuantityDenominator: 1,
      },
    ],
  };
}

function createPromotionTarget(source: CatalogBundle): CatalogBundle {
  const target = structuredClone(source);
  target.manifest.buildNumber += 1;
  target.manifest.clientVersion = "2.5.6.69796";
  target.manifest.buildKey = "d".repeat(32);
  target.manifest.cdnKey = "e".repeat(32);
  target.manifest.definitions = {
    source: "wowdev/WoWDBDefs",
    revision: "f".repeat(40),
  };
  target.manifest.hotfix = { status: "applied", sha256: "a".repeat(64) };
  return target;
}

function reagentEvidence(bundle: CatalogBundle) {
  return verifyRecipeReagents(
    bundle,
    bundle.recipes.map((recipe) => {
      const rows = bundle.recipeInputs.filter((row) => row.recipeSpellId === recipe.recipeSpellId);
      return {
        SpellID: recipe.recipeSpellId,
        Reagent: rows.map((row) => row.reagentItemId),
        ReagentCount: rows.map((row) => row.quantity),
      };
    }),
  );
}

function teachingResolutionFixture(): {
  before: CatalogBundle;
  after: CatalogBundle;
  native: { -readonly [Key in keyof TeachingSourceRows]: TeachingSourceRows[Key] };
} {
  const before = createGoldenBundle();
  const link = { recipeSpellId: 17_563, teachingItemId: 13_486, learningSpellId: null };
  before.items = before.items.filter((item) => item.itemId !== link.teachingItemId);
  for (let id = 100_000; id < 100_020; id += 1)
    before.items.push(createItem(id, `Unchanged item ${id}`));
  before.recipeTeachingItems = [];
  before.recipes[0] = {
    ...before.recipes[0]!,
    requiredSkillRank: 1,
    extractionStatus: "ambiguous",
    rawRecord: { unresolvedTeachingItems: [link] },
  };
  const after = createPromotionTarget(before);
  after.items.push({ ...createItem(13_486, "A newly readable plan"), requiredSkillRank: 205 });
  after.recipeTeachingItems = [link];
  after.recipes[0] = {
    ...after.recipes[0]!,
    requiredSkillRank: 205,
    extractionStatus: "complete",
    rawRecord: { unresolvedTeachingItems: [] },
  };
  return {
    before,
    after,
    native: {
      itemEffects: [{ id: 1, SpellID: 17_563, TriggerType: 6 }],
      itemLinks: [{ ItemEffectID: 1, ItemID: 13_486 }],
      abilities: [{ Spell: 17_563, SkillLine: 171, MinSkillLineRank: 1 }],
      itemSparse: [{ id: 13_486, RequiredSkillRank: 205 }],
    },
  };
}

function createItem(itemId: number, name: string): CatalogBundle["items"][number] {
  return {
    itemId,
    name,
    description: "",
    classId: 7,
    subclassId: 0,
    quality: 1,
    requiredLevel: 0,
    itemLevel: 0,
    requiredSkillId: null,
    requiredSkillRank: 0,
    stackSize: 20,
    binding: 0,
    inventoryType: 0,
    allowableClassMask: -1,
    allowableRaceMask: [-1, -1],
    maxCount: 0,
    maxDurability: 0,
    delayMs: 0,
    damageType: 0,
    itemSetId: null,
    limitCategoryId: null,
    socketBonusEnchantmentId: null,
    gemPropertiesId: null,
    randomSuffixGroupId: null,
    randomPropertyId: null,
    requiredAbilityId: null,
    minimumFactionId: null,
    minimumReputation: 0,
    buyPriceCopper: "0",
    sellPriceCopper: "0",
    iconFileDataId: null,
    rawRecord: {},
  };
}

function createSpell(spellId: number, name: string): CatalogBundle["spells"][number] {
  return {
    spellId,
    name,
    description: "",
    auraDescription: "",
    durationMs: 0,
    maximumDurationMs: 0,
    procChance: null,
    procCharges: null,
    procCooldownMs: null,
    descriptionVariables: "",
    rawRecord: {},
  };
}

interface ItemAuditFixture {
  readonly itemRows: readonly Record<string, unknown>[];
  readonly modifiedAppearanceRows: readonly Record<string, unknown>[];
  readonly appearanceRows: readonly Record<string, unknown>[];
  readonly sparseRows: readonly Record<string, unknown>[];
  readonly searchNameRows: readonly Record<string, unknown>[];
  readonly normalizedItems: readonly CatalogItem[];
  readonly recipes?: CatalogBundle["recipes"];
  readonly recipeInputs?: CatalogBundle["recipeInputs"];
  readonly reagentRows?: readonly Record<string, unknown>[];
}

function createItemAuditFixture(): ItemAuditFixture {
  const item = {
    id: 1,
    ClassID: 7,
    SubclassID: 0,
    IconFileDataID: 123,
  };
  const unnamedItem = {
    id: 2,
    ClassID: 15,
    SubclassID: 4,
    IconFileDataID: 456,
  };
  const sparse = {
    id: 1,
    Display_lang: "Test Item",
    Description_lang: "Test description",
    OverallQualityID: 2,
    RequiredLevel: 10,
    ItemLevel: 15,
    RequiredSkill: 171,
    RequiredSkillRank: 50,
    Stackable: 20,
    Bonding: 1,
    InventoryType: 0,
    AllowableClass: -1,
    AllowableRace: [-1, -1],
    BuyPrice: 100,
    SellPrice: 25,
  };
  const normalizedItem: CatalogItem = {
    itemId: 1,
    name: "Test Item",
    description: "Test description",
    classId: 7,
    subclassId: 0,
    quality: 2,
    requiredLevel: 10,
    itemLevel: 15,
    requiredSkillId: 171,
    requiredSkillRank: 50,
    stackSize: 20,
    binding: 1,
    inventoryType: 0,
    allowableClassMask: -1,
    allowableRaceMask: [-1, -1],
    maxCount: 0,
    maxDurability: 0,
    delayMs: 0,
    damageType: 0,
    itemSetId: null,
    limitCategoryId: null,
    socketBonusEnchantmentId: null,
    gemPropertiesId: null,
    randomSuffixGroupId: null,
    randomPropertyId: null,
    requiredAbilityId: null,
    minimumFactionId: null,
    minimumReputation: 0,
    buyPriceCopper: "100",
    sellPriceCopper: "25",
    iconFileDataId: 123,
    rawRecord: {
      item,
      itemSparse: sparse,
      itemSearchName: null,
      itemModifiedAppearance: null,
      itemAppearance: null,
    },
  };
  return {
    itemRows: [item, unnamedItem],
    modifiedAppearanceRows: [],
    appearanceRows: [],
    sparseRows: [sparse],
    searchNameRows: [],
    normalizedItems: [normalizedItem],
  };
}

function createAppearanceIconAuditFixture(): ItemAuditFixture {
  const fixture = createItemAuditFixture();
  const item = { ...fixture.itemRows[0], IconFileDataID: 0 };
  const modifiedAppearance = {
    id: 310_952,
    ItemID: 1,
    ItemAppearanceModifierID: 0,
    ItemAppearanceID: 133_306,
    OrderIndex: 0,
  };
  const appearance = {
    id: 133_306,
    DefaultIconFileDataID: 7_731_377,
  };
  return {
    ...fixture,
    itemRows: [item, fixture.itemRows[1]!],
    modifiedAppearanceRows: [modifiedAppearance],
    appearanceRows: [appearance],
    normalizedItems: [
      {
        ...fixture.normalizedItems[0]!,
        iconFileDataId: 7_731_377,
        rawRecord: {
          item,
          itemSparse: fixture.sparseRows[0],
          itemSearchName: null,
          itemModifiedAppearance: modifiedAppearance,
          itemAppearance: appearance,
        },
      },
    ],
  };
}

async function writeAuditSnapshot(
  directory: string,
  normalizedItems: readonly CatalogItem[],
  fixture: ItemAuditFixture,
): Promise<string> {
  await Promise.all([
    mkdir(join(directory, "raw"), { recursive: true }),
    mkdir(join(directory, "normalized"), { recursive: true }),
  ]);

  const rawTables = {
    ...(fixture.reagentRows
      ? {
          "SpellReagents.effective": await writeNdjsonArtifact(
            directory,
            "raw/SpellReagents.effective.ndjson.gz",
            fixture.reagentRows,
          ),
        }
      : {}),
    "Item.effective": await writeNdjsonArtifact(
      directory,
      "raw/Item.effective.ndjson.gz",
      fixture.itemRows,
    ),
    "ItemSparse.effective": await writeNdjsonArtifact(
      directory,
      "raw/ItemSparse.effective.ndjson.gz",
      fixture.sparseRows,
    ),
    "ItemSearchName.effective": await writeNdjsonArtifact(
      directory,
      "raw/ItemSearchName.effective.ndjson.gz",
      fixture.searchNameRows,
    ),
    "ItemModifiedAppearance.effective": await writeNdjsonArtifact(
      directory,
      "raw/ItemModifiedAppearance.effective.ndjson.gz",
      fixture.modifiedAppearanceRows,
    ),
    "ItemAppearance.effective": await writeNdjsonArtifact(
      directory,
      "raw/ItemAppearance.effective.ndjson.gz",
      fixture.appearanceRows,
    ),
  };
  const normalizedArtifactNames = [
    "items",
    "spells",
    "item-stats",
    "item-damages",
    "item-resistances",
    "item-sockets",
    "item-effects",
    "item-sets",
    "item-set-members",
    "item-set-effects",
    "game-classes",
    "game-races",
    "item-classes",
    "item-subclasses",
    "item-limit-categories",
    "gem-properties",
    "item-enchantments",
    "item-enchantment-effects",
    "item-random-enchantments",
    "item-bonus-trees",
    "item-bonus-tree-nodes",
    "item-bonuses",
    "professions",
    "recipes",
    "recipe-inputs",
    "recipe-outputs",
    "recipe-teaching-items",
    "transformations",
    "transformation-inputs",
    "transformation-outputs",
  ] as const;
  const normalizedArtifacts = Object.fromEntries(
    await Promise.all(
      normalizedArtifactNames.map(async (name) => [
        name,
        await writeNdjsonArtifact(
          directory,
          `normalized/${name}.ndjson.gz`,
          name === "items"
            ? normalizedItems
            : name === "recipes"
              ? (fixture.recipes ?? [])
              : name === "recipe-inputs"
                ? (fixture.recipeInputs ?? [])
                : [],
        ),
      ]),
    ),
  );
  const manifest: CatalogSnapshotManifest = {
    schemaVersion: "catalog-snapshot-manifest.v4",
    product: "wow_anniversary",
    clientVersion: "test",
    buildNumber: 1,
    buildKey: "a".repeat(32),
    cdnKey: "b".repeat(32),
    locale: "enUS",
    extractedAt: "2026-09-15T00:00:00.000Z",
    hotfix: { status: "not_available", sha256: null },
    definitions: { source: "test", revision: "test" },
    extractor: { name: "test", version: "test", revision: null },
    rawTables,
    normalizedArtifacts,
  };
  const manifestPath = join(directory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
  return manifestPath;
}

async function writeNdjsonArtifact(
  directory: string,
  path: string,
  records: readonly unknown[],
): Promise<{ path: string; recordCount: number; sha256: string }> {
  const content =
    records.length === 0 ? "\n" : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
  const compressed = gzipSync(content);
  await writeFile(join(directory, path), compressed);
  return {
    path,
    recordCount: records.length,
    sha256: createHash("sha256").update(compressed).digest("hex"),
  };
}
