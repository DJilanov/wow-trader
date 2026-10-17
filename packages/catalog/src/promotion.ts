import { canonicalJson, type CatalogBundle, type JsonValue } from "@wow-trader/contracts";

import type { EntityDiff } from "./diff.js";

export type CatalogPromotionDecision = "auto_publish" | "review_required";

export interface CatalogPromotionBlocker {
  readonly code:
    | "product_changed"
    | "locale_changed"
    | "build_not_forward"
    | "hotfix_missing"
    | "definitions_unverified"
    | "extractor_changed"
    | "item_count_drift"
    | "spell_count_drift"
    | "profession_topology_changed"
    | "recipe_economics_changed"
    | "transformation_economics_changed";
  readonly message: string;
}

export interface CatalogPromotionAssessment {
  readonly decision: CatalogPromotionDecision;
  readonly sourceBuild: number;
  readonly targetBuild: number;
  readonly blockers: readonly CatalogPromotionBlocker[];
  readonly changes: {
    readonly items: EntityDiff;
    readonly spells: EntityDiff;
    readonly professions: EntityDiff;
    readonly recipeEconomics: EntityDiff;
    readonly recipeCraftTimes: EntityDiff;
    readonly transformations: EntityDiff;
  };
}

const MAX_COUNT_DRIFT_RATIO = 0.1;
const EXACT_GIT_REVISION = /^[a-f0-9]{40}$/;

export function assessCatalogPromotion(
  source: CatalogBundle,
  target: CatalogBundle,
): CatalogPromotionAssessment {
  const blockers: CatalogPromotionBlocker[] = [];
  if (source.manifest.product !== target.manifest.product) {
    blockers.push({ code: "product_changed", message: "Catalog products do not match." });
  }
  if (source.manifest.locale !== target.manifest.locale) {
    blockers.push({ code: "locale_changed", message: "Catalog locales do not match." });
  }
  if (
    target.manifest.buildNumber < source.manifest.buildNumber ||
    (target.manifest.buildNumber === source.manifest.buildNumber &&
      target.manifest.hotfix.sha256 === source.manifest.hotfix.sha256)
  ) {
    blockers.push({
      code: "build_not_forward",
      message: "Automatic promotion requires a newer build or a new hotfix snapshot.",
    });
  }
  if (target.manifest.hotfix.status !== "applied" || !target.manifest.hotfix.sha256) {
    blockers.push({
      code: "hotfix_missing",
      message: "The target snapshot does not contain an applied local hotfix cache.",
    });
  }
  if (
    target.manifest.definitions.source !== "wowdev/WoWDBDefs" ||
    !EXACT_GIT_REVISION.test(target.manifest.definitions.revision)
  ) {
    blockers.push({
      code: "definitions_unverified",
      message: "The target snapshot is not pinned to an exact wowdev/WoWDBDefs revision.",
    });
  }
  if (
    source.manifest.extractor.name !== target.manifest.extractor.name ||
    source.manifest.extractor.version !== target.manifest.extractor.version
  ) {
    blockers.push({
      code: "extractor_changed",
      message: "Extractor name or version changed and requires review.",
    });
  }

  addCountDriftBlocker(
    blockers,
    "item_count_drift",
    "Item",
    source.items.length,
    target.items.length,
  );
  addCountDriftBlocker(
    blockers,
    "spell_count_drift",
    "Spell",
    source.spells.length,
    target.spells.length,
  );

  const changes = {
    items: diffProjectedRecords(
      source.items,
      target.items,
      (record) => record.itemId,
      omitRawRecord,
    ),
    spells: diffProjectedRecords(
      source.spells,
      target.spells,
      (record) => record.spellId,
      omitRawRecord,
    ),
    professions: diffProjectedRecords(
      source.professions,
      target.professions,
      (record) => record.skillLineId,
      (record) => ({ skillLineId: record.skillLineId, slug: record.slug }),
    ),
    recipeEconomics: diffProjectedRecords(
      recipeTopologies(source, false),
      recipeTopologies(target, false),
      (record) => record.recipeSpellId,
      (record) => record,
    ),
    recipeCraftTimes: diffProjectedRecords(
      source.recipes,
      target.recipes,
      (record) => record.recipeSpellId,
      (record) => ({ recipeSpellId: record.recipeSpellId, craftTimeMs: record.craftTimeMs }),
    ),
    transformations: diffProjectedRecords(
      transformationTopologies(source),
      transformationTopologies(target),
      (record) => record.transformationId,
      (record) => record,
    ),
  } satisfies CatalogPromotionAssessment["changes"];

  addTopologyBlocker(
    blockers,
    changes.professions,
    "profession_topology_changed",
    "Profession identifiers changed.",
  );
  addTopologyBlocker(
    blockers,
    changes.recipeEconomics,
    "recipe_economics_changed",
    "Recipe reagents, yields, cooldowns, requirements, or outputs changed.",
  );
  addTopologyBlocker(
    blockers,
    changes.transformations,
    "transformation_economics_changed",
    "Item transformation inputs, outputs, or cooldowns changed.",
  );

  return {
    decision: blockers.length === 0 ? "auto_publish" : "review_required",
    sourceBuild: source.manifest.buildNumber,
    targetBuild: target.manifest.buildNumber,
    blockers,
    changes,
  };
}

function recipeTopologies(bundle: CatalogBundle, includeCraftTime: boolean) {
  return bundle.recipes.map((recipe) => ({
    recipeSpellId: recipe.recipeSpellId,
    professionSkillLineId: recipe.professionSkillLineId,
    requiredSkillRank: recipe.requiredSkillRank,
    ...(includeCraftTime ? { craftTimeMs: recipe.craftTimeMs } : {}),
    cooldownMs: recipe.cooldownMs,
    cooldownCategoryId: recipe.cooldownCategoryId,
    categoryCooldownMs: recipe.categoryCooldownMs,
    outputKind: recipe.outputKind,
    extractionStatus: recipe.extractionStatus,
    inputs: bundle.recipeInputs
      .filter((input) => input.recipeSpellId === recipe.recipeSpellId)
      .sort(compareCanonical),
    outputs: bundle.recipeOutputs
      .filter((output) => output.recipeSpellId === recipe.recipeSpellId)
      .sort(compareCanonical),
    teachingItems: bundle.recipeTeachingItems
      .filter((item) => item.recipeSpellId === recipe.recipeSpellId)
      .sort(compareCanonical),
  }));
}

function transformationTopologies(bundle: CatalogBundle) {
  return bundle.transformations.map((transformation) => ({
    transformationId: transformation.transformationId,
    spellId: transformation.spellId,
    sourceItemId: transformation.sourceItemId,
    kind: transformation.kind,
    cooldownMs: transformation.cooldownMs,
    categoryCooldownMs: transformation.categoryCooldownMs,
    extractionStatus: transformation.extractionStatus,
    inputs: bundle.transformationInputs
      .filter((input) => input.transformationId === transformation.transformationId)
      .sort(compareCanonical),
    outputs: bundle.transformationOutputs
      .filter((output) => output.transformationId === transformation.transformationId)
      .sort(compareCanonical),
  }));
}

function omitRawRecord<T extends { readonly rawRecord: unknown }>(record: T): Omit<T, "rawRecord"> {
  const { rawRecord, ...projected } = record;
  void rawRecord;
  return projected;
}

function diffProjectedRecords<T, P>(
  source: readonly T[],
  target: readonly T[],
  selectId: (record: T) => number,
  project: (record: T) => P,
): EntityDiff {
  const sourceById = new Map(source.map((record) => [selectId(record), project(record)]));
  const targetById = new Map(target.map((record) => [selectId(record), project(record)]));
  const added = [...targetById.keys()].filter((id) => !sourceById.has(id)).sort(numericSort);
  const removed = [...sourceById.keys()].filter((id) => !targetById.has(id)).sort(numericSort);
  const changed = [...targetById.entries()]
    .filter(([id, record]) => {
      const previous = sourceById.get(id);
      return previous !== undefined && serialize(previous) !== serialize(record);
    })
    .map(([id]) => id)
    .sort(numericSort);
  return { added, removed, changed };
}

function addCountDriftBlocker(
  blockers: CatalogPromotionBlocker[],
  code: "item_count_drift" | "spell_count_drift",
  label: string,
  sourceCount: number,
  targetCount: number,
): void {
  const denominator = Math.max(sourceCount, 1);
  const ratio = Math.abs(targetCount - sourceCount) / denominator;
  if (ratio <= MAX_COUNT_DRIFT_RATIO) return;
  blockers.push({
    code,
    message: `${label} count changed from ${sourceCount} to ${targetCount}, beyond the 10% automatic-promotion limit.`,
  });
}

function addTopologyBlocker(
  blockers: CatalogPromotionBlocker[],
  diff: EntityDiff,
  code:
    "profession_topology_changed" | "recipe_economics_changed" | "transformation_economics_changed",
  message: string,
): void {
  if (diff.added.length + diff.removed.length + diff.changed.length === 0) return;
  blockers.push({ code, message });
}

function compareCanonical(left: unknown, right: unknown): number {
  return serialize(left).localeCompare(serialize(right));
}

function serialize(value: unknown): string {
  return canonicalJson(value as JsonValue);
}

function numericSort(left: number, right: number): number {
  return left - right;
}
