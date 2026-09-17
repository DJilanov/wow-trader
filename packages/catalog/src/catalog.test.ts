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
import { validateCatalog } from "./validation.js";

describe("createSnapshotKey", () => {
  it("includes the normalized snapshot schema version", () => {
    expect(createSnapshotKey(createGoldenBundle())).toBe(
      `wow_anniversary:2.5.6.69795:69795:enUS:${"c".repeat(64)}:definition-revision:catalog-snapshot-manifest.v4`,
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

describe("auditCatalogSnapshot", () => {
  it("proves normalized item coverage while reporting structural IDs without names", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wow-trader-catalog-audit-"));
    try {
      const fixture = createItemAuditFixture();
      const manifestPath = await writeAuditSnapshot(directory, fixture.normalizedItems, fixture);

      const report = await auditCatalogSnapshot(manifestPath);

      expect(report.valid).toBe(true);
      expect(report.artifacts.verified).toBe(33);
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
  readonly sparseRows: readonly Record<string, unknown>[];
  readonly searchNameRows: readonly Record<string, unknown>[];
  readonly normalizedItems: readonly CatalogItem[];
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
    },
  };
  return {
    itemRows: [item, unnamedItem],
    sparseRows: [sparse],
    searchNameRows: [],
    normalizedItems: [normalizedItem],
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
          name === "items" ? normalizedItems : [],
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
