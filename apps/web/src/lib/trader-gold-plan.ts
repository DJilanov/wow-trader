import { auctionPriceLevels, marketItemObservations } from "@wow-trader/db";
import {
  analyzePriceHistory,
  auctionHouseFeeBasisPoints,
  buildSharedGoldPlan,
  quoteBuyOpportunity,
  type GoldPlanCandidate,
  type GoldPlanInventory,
  type MarketPriceLevel,
} from "@wow-trader/market";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { loadMarketHistory, marketScans, rawUploads } from "@wow-trader/db";
import { z } from "zod";
import { traderWatchSchema } from "@wow-trader/contracts";
import { getDatabase } from "./database";
import { formatCopper } from "./format";
import { getMarketItemBrowser, parseBuyBudget } from "./market-item-browser-data";
import { loadTraderAccount, type TraderCharacter } from "./trader-account-data";
import { getMarketWorkspace } from "./market-workspace-data";
import {
  getCraftingSpecializationProfiles,
  type CraftingSpecializationProfile,
} from "./specializations";

export const goldPlanRequestSchema = z.object({
  product: traderWatchSchema.shape.product,
  market: traderWatchSchema.shape.market,
  budget: z.string().regex(/^\d{1,9}(?:\.\d{1,4})?$/),
  mode: z.enum(["both", "buy", "craft"]).default("both"),
  useInventory: z.boolean().default(true),
});
export interface GoldPlanView {
  readonly status: "ready" | "stale" | "empty";
  readonly message: string;
  readonly observedAt: string | null;
  readonly budget: string;
  readonly spent: string;
  readonly remaining: string;
  readonly expectedProfit: string;
  readonly ownedValue: string;
  readonly charactersUsed: number;
  readonly actions: readonly {
    readonly name: string;
    readonly kind: string;
    readonly detail: string;
    readonly spent: string;
    readonly ownedValue: string;
    readonly profit: string;
    readonly purchases: readonly {
      readonly itemId: number;
      readonly name: string;
      readonly stackSize: number;
      readonly stacks: number;
      readonly price: string;
    }[];
    readonly ownedInputs: readonly { readonly name: string; readonly quantity: number }[];
  }[];
}
export async function createTraderGoldPlan(
  input: z.infer<typeof goldPlanRequestSchema>,
  ownerId: string | null,
): Promise<GoldPlanView> {
  const database = getDatabase(),
    budget = parseBuyBudget(input.budget)!;
  const empty: GoldPlanView = {
    status: "empty",
    message: "No eligible action fits this market, your recipes and budget.",
    observedAt: null,
    budget: formatCopper(budget),
    spent: "0c",
    remaining: formatCopper(budget),
    expectedProfit: "0c",
    ownedValue: "0c",
    charactersUsed: 0,
    actions: [],
  };
  const [region, realmId, faction] = input.market.split("|");
  const [scan] = await database
    .select({
      id: marketScans.scanId,
      clientBuild: marketScans.clientBuild,
      completedAt: marketScans.completedAt,
      auctionHouseType: marketScans.auctionHouseType,
    })
    .from(marketScans)
    .innerJoin(rawUploads, eq(rawUploads.payloadId, marketScans.payloadId))
    .where(
      and(
        eq(rawUploads.clientProduct, input.product),
        eq(marketScans.region, region!),
        eq(marketScans.realmId, realmId!),
        sql`${marketScans.auctionHouseType}::text = ${faction}`,
        eq(marketScans.qualityAccepted, true),
      ),
    )
    .orderBy(desc(marketScans.completedAt), desc(marketScans.scanId))
    .limit(1);
  if (!scan) return { ...empty, message: "Upload a full scan for this market first." };
  const age = Date.now() - scan.completedAt.getTime(),
    fee = auctionHouseFeeBasisPoints(scan.auctionHouseType);
  if (age > 3_600_000 || age < -300_000 || fee === null)
    return {
      ...empty,
      status: "stale",
      observedAt: scan.completedAt.toISOString(),
      message:
        "A scan under one hour old and a known AH fee are needed. Scan in game, save with /reload, and let Companion upload.",
    };
  const account = ownerId ? await loadTraderAccount(ownerId) : null;
  const characters = (account?.characters ?? []).filter(
    (character) =>
      character.product === input.product &&
      character.clientBuild === scan.clientBuild &&
      character.region === region &&
      character.realm === realmId &&
      character.faction === faction,
  );
  const known = new Map<
    number,
    { skill: number; character: TraderCharacter; profile: CraftingSpecializationProfile }
  >();
  for (const character of characters) {
    let profile: CraftingSpecializationProfile = {};
    for (const profession of getCraftingSpecializationProfiles(
      input.product,
      scan.clientBuild,
      {},
    )) {
      const option = profession.options.find(
        (entry) =>
          entry.spellId !== null && character.specializationSpellIds.includes(entry.spellId),
      );
      if (option) profile = { ...profile, [profession.professionSlug]: option.slug };
    }
    for (const recipe of character.recipes) {
      if (recipe.isDayCooldown) continue;
      const profession = character.professions.find(
        (row) => row.professionSkillLineId === recipe.professionSkillLineId,
      );
      if (!profession) continue;
      if (
        !known.has(recipe.recipeSpellId) ||
        known.get(recipe.recipeSpellId)!.skill < profession.skillLevel
      )
        known.set(recipe.recipeSpellId, { skill: profession.skillLevel, character, profile });
    }
  }
  const workspace =
    input.mode !== "buy" && known.size
      ? await getMarketWorkspace({
          clientProduct: input.product,
          market: input.market,
          useAltCrafting: true,
          knownRecipeSpellIds: [...known.keys()].sort((a, b) => a - b),
          recipeSpecializations: Object.fromEntries(
            [...known].map(([id, entry]) => [String(id), entry.profile]),
          ),
          pageSize: 100,
          sort: "profit",
        })
      : null;
  const recipes = (workspace?.opportunities ?? []).filter((opportunity) => {
    if (
      opportunity.cooldownLabel ||
      opportunity.requiredSkillRank > (known.get(opportunity.recipeSpellId)?.skill ?? -1)
    )
      return false;
    return opportunity.craftSteps.every(
      (step) => step.requiredSkillRank <= (known.get(step.recipeSpellId)?.skill ?? -1),
    );
  });
  const observations = await database
    .select()
    .from(marketItemObservations)
    .where(
      and(
        eq(marketItemObservations.scanId, scan.id),
        sql`${marketItemObservations.marketKey} = ${marketItemObservations.itemId}::text`,
      ),
    );
  const byItem = new Map(observations.map((row) => [row.itemId, row]));
  const ids = new Set(
    recipes.flatMap((recipe) => [
      ...recipe.inputs.map((row) => row.itemId),
      ...recipe.outputs.map((row) => row.itemId),
    ]),
  );
  const buying =
    input.mode !== "craft"
      ? await getMarketItemBrowser({
          clientProduct: input.product,
          market: input.market,
          filter: "buy",
          budget: input.budget,
          pageSize: 100,
        })
      : null;
  const buyIds = buying?.rows.map((row) => row.itemId) ?? [];
  const buyNames = new Map(buying?.rows.map((row) => [row.itemId, row.name]) ?? []);
  if (input.mode !== "craft") for (const id of buyIds) ids.add(id);
  if (!ids.size)
    return {
      ...empty,
      observedAt: scan.completedAt.toISOString(),
      message:
        input.mode === "craft"
          ? "Connect your account and open each profession in game to upload known recipes. Crafting also requires the exact published catalog."
          : buying?.readiness?.historyReadyItems === 0
            ? "Six independent half-hour observations per item are needed before a buying plan can use its normal price."
            : "No whole-stack purchase currently meets the buying limits. View all prices to inspect the evidence.",
    };
  const scope = {
    clientProduct: input.product,
    clientBuild: scan.clientBuild,
    region: region!,
    realmId: realmId!,
    auctionHouseType: scan.auctionHouseType,
  };
  const [history, levels] = await Promise.all([
    loadMarketHistory(database, scope, scan.completedAt, scan.id, [...ids]),
    database
      .select()
      .from(auctionPriceLevels)
      .where(
        and(
          eq(auctionPriceLevels.scanId, scan.id),
          inArray(auctionPriceLevels.itemId, [...ids]),
          sql`${auctionPriceLevels.marketKey} = ${auctionPriceLevels.itemId}::text`,
        ),
      ),
  ]);
  const books = new Map<number, MarketPriceLevel[]>();
  for (const { itemId, lots, ...level } of levels) {
    const book = books.get(itemId) ?? [];
    book.push({
      ...level,
      ...(lots
        ? { lots: lots.map((lot) => ({ ...lot, buyoutCopper: BigInt(lot.buyoutCopper) })) }
        : {}),
    });
    books.set(itemId, book);
  }
  const candidates: GoldPlanCandidate[] = [];
  if (input.mode !== "craft")
    for (const itemId of buyIds) {
      const watch = account?.watches.find(
        (item) =>
          item.itemId === itemId && item.market === input.market && item.product === input.product,
      );
      const quote = quoteBuyOpportunity({
        intelligence: analyzePriceHistory(history.byItem.get(itemId) ?? []),
        levels: books.get(itemId) ?? [],
        observedAt: scan.completedAt,
        now: new Date(),
        auctionHouseType: scan.auctionHouseType,
        maximumSpendCopper: budget,
        ...(watch
          ? {
              maximumQuantity: watch.maximumUnits,
              ...(watch.maximumBuyCopper
                ? { maximumBuyPriceCopper: BigInt(watch.maximumBuyCopper) }
                : {}),
            }
          : {}),
      });
      if (
        quote.state !== "opportunity" ||
        (watch && quote.profitCopper < BigInt(watch.minimumProfitCopper))
      )
        continue;
      candidates.push({
        id: "buy:" + itemId,
        itemId,
        name: buyNames.get(itemId) ?? byItem.get(itemId)?.itemName ?? `Item ${itemId}`,
        kind: "buy",
        expectedNetRevenueCopper: quote.netResaleCopper,
        maximumExecutions: 1,
        inputs: [],
        purchases: [{ itemId, lots: quote.lots }],
        detail: `Buy ${quote.auctionCount} whole auctions (${quote.quantity} units); target resale ${formatCopper(quote.targetResalePriceCopper!)} each.`,
        outputCaps: [{ itemId, quantity: quote.quantity, limit: quote.quantity }],
      });
    }
  for (const recipe of recipes) {
    const id = `craft:${recipe.recipeSpellId}:${recipe.route}`;
    candidates.push({
      id,
      name: recipe.recipeName,
      itemId: recipe.primaryOutputItemId,
      kind: recipe.route,
      expectedNetRevenueCopper: BigInt(recipe.netValueCopper),
      maximumExecutions: Math.min(20, Math.max(1, recipe.executableCrafts)),
      inputs: recipe.inputs.map((row) => ({ itemId: row.itemId, quantity: row.quantity })),
      detail: [
        known.get(recipe.recipeSpellId)?.character.name,
        recipe.professionName,
        recipe.routeLabel,
        ...recipe.craftSteps.map((step) => `${step.recipeName} (${step.professionName})`),
      ]
        .filter(Boolean)
        .join(" → "),
      outputCaps:
        recipe.route === "vendor"
          ? []
          : recipe.outputs.map((output) => ({
              itemId: output.itemId,
              quantity: Math.max(1, Math.ceil(Number(output.expectedQuantity))),
              limit: Math.max(
                1,
                Math.floor((byItem.get(output.itemId)?.availableQuantity ?? 0) * 0.1),
              ),
            })),
    });
  }
  const inventory: GoldPlanInventory[] = [];
  if (input.useInventory)
    for (const character of characters)
      if (
        Date.now() - Date.parse(character.observedAt) <= 3_600_000 &&
        Date.now() - Date.parse(character.observedAt) >= -300_000
      )
        for (const row of character.inventory) {
          const price = byItem.get(row.itemId)?.tenthPercentilePriceCopper;
          if (ids.has(row.itemId) && price !== undefined)
            inventory.push({
              ...row,
              opportunityValueCopper: price - (price * BigInt(fee) + 9999n) / 10000n,
            });
        }
  const plan = buildSharedGoldPlan({
    budgetCopper: budget,
    candidates,
    books,
    inventory,
    maximumActions: 20,
  });
  const names = new Map<number, string>();
  for (const recipe of recipes) for (const row of recipe.inputs) names.set(row.itemId, row.name);
  const name = (itemId: number): string =>
    names.get(itemId) ?? byItem.get(itemId)?.itemName ?? `Item ${itemId}`;
  return {
    ...empty,
    status: plan.actions.length ? "ready" : "empty",
    observedAt: scan.completedAt.toISOString(),
    charactersUsed: characters.length,
    message: plan.actions.length
      ? "One upfront budget, whole auction stacks, shared reagent stock and no daily cooldowns. Expected resale profit remains conditional."
      : "No qualified whole-stack purchase or owned recipe fits this budget. More history, fresh character snapshots or different limits may help.",
    spent: formatCopper(plan.spentCopper),
    remaining: formatCopper(plan.remainingCopper),
    expectedProfit: formatCopper(plan.expectedProfitCopper),
    ownedValue: formatCopper(plan.ownedMaterialValueCopper),
    actions: plan.actions.map((action) => ({
      name: action.candidate.name,
      kind: action.candidate.kind,
      detail: action.candidate.detail,
      spent: formatCopper(action.purchaseCostCopper),
      ownedValue: formatCopper(action.ownedMaterialValueCopper),
      profit: formatCopper(action.expectedProfitCopper),
      purchases: action.purchases.flatMap((purchase) =>
        purchase.lots.map((lot) => ({
          itemId: purchase.itemId,
          name: name(purchase.itemId),
          stackSize: lot.stackSize,
          stacks: lot.listingCount,
          price: formatCopper(lot.buyoutCopper),
        })),
      ),
      ownedInputs: action.ownedInputs.map((row) => ({
        name: name(row.itemId),
        quantity: row.quantity,
      })),
    })),
  };
}
