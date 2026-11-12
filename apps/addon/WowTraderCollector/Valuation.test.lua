local root = "apps/addon/WowTraderCollector/"
local Addon = {}
local checks = 0
local function check(condition, message)
  checks = checks + 1; assert(condition, message)
end
local clock = 1793793600
time = function() return clock end
GetServerTime = time
UnitGUID = function() return "private-character" end
local owned = {}
GetItemCount = function(id) return owned[id] or 0 end
local itemInfo = {
  [4307] = { name = "Gloves", quality = 2, level = 20, vendor = 100, class = 4, bind = 2 },
  [2589] = { name = "Linen Cloth", quality = 1, level = 5, vendor = 13, class = 7, bind = 0 },
  [2320] = { name = "Coarse Thread", quality = 1, level = 5, vendor = 2, class = 7, bind = 0 },
}
local secret = {}
issecretvalue = function(value) return value == secret end
canaccessvalue = function(value) return value ~= secret end
GetItemInfo = function(reference)
  local id = type(reference) == "number" and reference or tonumber(reference:match("item:(%d+)"))
  local row = itemInfo[id]
  if not row then return nil end
  return row.name, "item:" .. id, row.quality, row.level, 1, "Armor", "Cloth", 1, "INVTYPE_HAND", 1,
    row.vendor, row.class, 1, row.bind
end
CreateFrame = function() return { RegisterEvent = function() end, SetScript = function() end } end
assert(loadfile(root .. "DisenchantData.lua"))("WowTraderCollector", Addon)
assert(loadfile(root .. "Valuation.lua"))("WowTraderCollector", Addon)
local Value = Addon.Valuation
local context = { available = true, fresh = true, clientProduct = "wow_anniversary", clientBuild = 69795,
  auctionHouseType = "alliance", ageSeconds = 0, realmId = "TestRealm", revision = {} }
local function quote(price, normal, size, count)
  size, count = size or 1, count or 100
  return { current = price, normal = normal or price, levels = {
    { unitPriceCopper = price, quantity = size * count, listingCount = count,
      lots = { { stackSize = size, buyoutCopper = price * size, listingCount = count } } },
  } }
end
local quotes = { [4307] = quote(10000), [2589] = quote(1000), [2320] = quote(100),
  [10940] = quote(1000), [10939] = quote(2000), [10978] = quote(10000) }
Addon.GetMarketPriceContext = function() return context end
Addon.GetItemPriceQuote = function(id) return quotes[id] end
local recipe = { recipeId = 1, name = "Gloves", outputItemId = 4307, quantityMin = 1, quantityMax = 1,
  reagents = { { itemId = 2589, quantity = 2 } }, complete = true }
local item = Value.Item(4307)
check(Value.Price({ current = 10000 }, "normal") == nil, "Historical mode must never silently substitute a current ask")
check(item.info.vendor == 100 and item.info.classId == 4 and item.info.bindType == 2, "Read correct GetItemInfo tuple positions")
check(item.auction.gross == 10000 and item.auction.net == 9500, "Faction AH fee")
check(item.disenchant.available and item.disenchant.gross == 2975 and item.disenchant.net == 2826, "Probability-weighted DE includes every material and AH fees")
check(item.disenchant.estimated == false and item.disenchant.requiredSkill == 1, "Verified build is distinguished from reference estimates")
context.auctionHouseType = "neutral"
check(Value.Item(4307).auction.net == 8500, "Neutral AH cut")
context.auctionHouseType = "unknown"
check(Value.Item(4307).auction.net == nil and not Value.Item(4307).disenchant.available, "Unknown AH fee cannot produce market proceeds")
check(Value.Item(4307).disenchant.reasonCode == "unknown_ah_fee" and #Value.Item(4307).disenchant.materials > 0,
  "Unknown AH fees remain separate from the known material distribution")
context.auctionHouseType = "alliance"
quotes[10939] = nil
check(not Value.Item(4307).disenchant.available and Value.Item(4307).disenchant.gross == nil, "Missing DE material never produces a partial value")
local missingValue = Value.Item(4307).disenchant
check(missingValue.reasonCode == "missing_material_prices" and #missingValue.missingMaterialIds == 1 and
  missingValue.missingMaterialIds[1] == 10939 and #missingValue.materials == 3,
  "A missing price identifies the exact material while retaining all expected yields")
quotes[10939] = quote(2000)
context.clientProduct, context.clientBuild = "wow_classic_beta", 70755
Addon.ClientValuationData = { clientProduct = "wow_classic_beta", clientBuild = 70755,
  items = { [4307] = {4, 2, 20, true, 0, 20} }, cooldownRecipes = {} }
check(Value.Item(4307).disenchant.estimated == true, "Forever explicitly identifies reference probabilities")
itemInfo[4307].level = 80
check(not Value.Item(4307).disenchant.available, "Forever cannot accidentally yield TBC materials")
Addon.ClientValuationData.items[4307] = {4, 2, 80, true, 0, 65}
quotes[16204], quotes[16203], quotes[14344] = quote(1000), quote(2000), quote(10000)
check(Value.Item(4307).disenchant.available, "High-level Forever brackets retain Classic-era materials")
Addon.ClientValuationData.items[4307][4] = false
check(not Value.Item(4307).disenchant.available, "Client no-disenchant flags override all inferred brackets")
Addon.ClientValuationData.clientBuild = 70756
check(not Value.Item(4307).disenchant.available, "Forever eligibility cannot cross client builds")
check(Value.Item(4307).disenchant.reasonCode == "client_data_mismatch" and
  Value.Item(4307).disenchant.reason:find("70756", 1, true) and Value.Item(4307).disenchant.reason:find("70755", 1, true),
  "A stale data pack reports both build numbers instead of a generic failure")
Addon.ClientValuationData.clientBuild = 70755
itemInfo[4307].level = 20
context.clientProduct, context.clientBuild = "wow_anniversary", 69796
check(not Value.Item(4307).disenchant.available, "An unreviewed TBC build cannot inherit a verified model")
context.clientBuild = 69795
itemInfo[4307].bind = 1
check(Value.Item(4307).auction.net == nil and Value.Item(4307).disenchant.available, "BoP outputs may be disenchanted but not auctioned")
itemInfo[4307].bind = 2
check(Value.Item("item:4307:0:0:0:0:0:1182:0:60:0:0:0:0").auction.net == nil, "Random suffix variants never inherit base-item AH valuations")
check(Value.Item("item:4307:0:0:0:0:0:0:0:60:0:0:0:1:123").auction.net == nil, "Bonus variants require their own market")
check(Value.Item("item:4307:0:0:0:0:0:0:0:60:0:0:0:0").auction.net == 9500, "Plain item links remain supported")
owned[2589] = 6
local evaluation = Value.Recipe(recipe, 3, "current")
check(evaluation.cost == 6000 and evaluation.additionalCost == 0, "Owned reagents still carry full opportunity cost")
check(evaluation.routes.auction.profit == 22500 and evaluation.routes.disenchant.profit == 2478, "Three crafts apply output count and fees exactly once")
check(evaluation.outputQuantity == 3 and evaluation.rankable and evaluation.best.key == "auction", "Select the strongest supported exit")
owned[2589] = 0
quotes[2589] = quote(1000, 900, 20, 1)
evaluation = Value.Recipe(recipe, 1, "current")
check(evaluation.cost == 2000 and evaluation.additionalCost == 20000, "Consumed cost is distinct from buying an entire auction stack")
check(evaluation.reagents[1].leftover == 18, "Whole-stack purchase exposes leftover materials")
quotes[2589].levels[1].lots = nil
check(Value.Recipe(recipe).additionalCost == nil, "Missing stack identities cannot invent an exact cash budget")
quotes[2589] = quote(1000)
quotes[2589].levels[1].quantity = 1
check(Value.Recipe(recipe).cost == nil and not Value.Recipe(recipe).rankable, "Insufficient reagent depth cannot fund a craft")
quotes[2589] = nil
check(Value.Recipe(recipe).routes.auction.profit == nil, "Missing reagent quote blocks profit, not zero-cost materials")
evaluation = Value.Recipe(recipe, 1, "current", { getVendor = function() return { availableQuantity = -1, unitPrice = 100 } end })
check(evaluation.cost == 200 and evaluation.additionalCost == 200, "Observed unlimited vendor stock can replace missing AH reagent prices")
evaluation = Value.Recipe(recipe, 1, "current", { getVendor = function() return { availableQuantity = 1, unitPrice = 100 } end })
check(evaluation.cost == nil, "Limited vendor stock is not treated as unlimited")
quotes[2589] = quote(1000, 900)
context.fresh = false
evaluation = Value.Recipe(recipe)
check(not evaluation.rankable and not evaluation.routes.auction.actionable, "Stale prices cannot create actionable profit rankings")
evaluation = Value.Recipe(recipe, 1, "normal")
check(evaluation.cost == 1800 and not evaluation.routes.auction.actionable, "Historical planning remains separate from current recommendations")
context.fresh = true
recipe.cooldownExcluded = true
check(not Value.Recipe(recipe).rankable, "Daily cooldown recipes are excluded")
recipe.cooldownExcluded = false
recipe.quantityMin, recipe.quantityMax = 2, 2
check(Value.Recipe(recipe).routes.auction.profit == 17000, "Multiple output items are included")
recipe.quantityMax = 3
check(not Value.Recipe(recipe).available, "Variable output is never silently treated as one guaranteed item")
recipe.quantityMin, recipe.quantityMax = 1000000, 1000000
check(not Value.Recipe(recipe, 10000).available, "Overflow cannot collapse to a one-item valuation")
recipe.quantityMin, recipe.quantityMax = 1, 1
recipe.reagents = { { itemId = 2589, quantity = 1 }, { itemId = 2589, quantity = 1 } }
owned[2589] = 1
check(Value.Recipe(recipe).additionalCost == 1000, "Repeated reagent IDs cannot double-count owned inventory")
check(Value.Integer(secret, 0, 10) == nil and Value.Item(secret).itemId == nil, "Secret values are rejected before arithmetic or comparison")
check(Value.Product(9007199254, 1000000) == nil and Value.Net(9007199254740992, 500) == nil, "Unsafe money arithmetic is rejected")

assert(loadfile(root .. "Crafting.lua"))("WowTraderCollector", Addon)
local Crafting = Addon.Crafting
local selectedId = 100
local schematics = {
  [100] = { name = "Modern gloves", outputItemID = 4307, quantityMin = 1, quantityMax = 1,
    reagentSlotSchematics = { { required = true, quantityRequired = 2, dataSlotIndex = 1, reagents = { { itemID = 2589 } } } } },
  [18560] = { outputItemID = 4307, quantityMin = 1, quantityMax = 1, reagentSlotSchematics = {} },
}
C_TradeSkillUI = {
  GetRecipeInfo = function(id) return { recipeID = id, name = "Recipe " .. id, learned = id ~= 101 } end,
  GetRecipeSchematic = function(id) return schematics[id] end,
  GetRecipeOutputItemData = function() return { itemID = 4307, hyperlink = "item:4307" } end,
  GetRecipeCooldown = function() return nil, false end,
  GetAllRecipeIDs = function() return { 100, 101, 18560 } end,
}
ProfessionsFrame = { IsShown = function() return true end, CraftingPage = {
  SchematicForm = { GetRecipeInfo = function() return { recipeID = selectedId } end },
  SelectRecipe = function(_, info) selectedId = info.recipeID end,
} }
local modern = Crafting.SelectedRecipe()
check(modern.complete and modern.outputItemId == 4307 and modern.reagents[1].quantity == 2, "Modern selected recipe reads item output and mandatory reagents")
check(Crafting.ReadModernRecipe(101) == nil, "Unknown recipes cannot appear as craftable")
check(Crafting.ReadModernRecipe(18560).cooldownExcluded, "A ready daily cooldown stays excluded even if the API returns no remaining cooldown")
local cooldownReader = C_TradeSkillUI.GetRecipeCooldown
C_TradeSkillUI.GetRecipeCooldown = function() return secret, secret end
check(Crafting.ReadModernRecipe(100).cooldownExcluded, "Secret cooldown values are excluded before comparison")
C_TradeSkillUI.GetRecipeCooldown = cooldownReader
local slot = schematics[100].reagentSlotSchematics[1]
slot.reagents[2] = { itemID = 2320 }
check(not Crafting.ReadModernRecipe(100).complete, "Unselected alternative reagents cannot be guessed")
ProfessionsFrame.CraftingPage.SchematicForm.GetTransaction = function() return {
  GetRecipeSchematic = function() return schematics[100] end,
  CreateReagentInfoTbl = function() return { { dataSlotIndex = 1, reagent = { itemID = 2320 }, quantity = 2 } } end,
} end
check(Crafting.SelectedRecipe().reagents[1].itemId == 2320 and Crafting.SelectedRecipe().complete, "Exact selected alternative is valued")
ProfessionsFrame.CraftingPage.SchematicForm.GetTransaction = nil
local originalOutput = C_TradeSkillUI.GetRecipeOutputItemData
local outputCalls = 0
C_TradeSkillUI.GetRecipeOutputItemData = function(...) outputCalls = outputCalls + 1; return originalOutput(...) end
ProfessionsFrame.CraftingPage.SchematicForm.GetTransaction = function() return {
  GetRecipeSchematic = function() return schematics[100] end,
  CreateCraftingReagentInfoTbl = function() return { { dataSlotIndex = 1, reagent = { itemID = secret }, quantity = 2 } } end,
} end
check(not Crafting.SelectedRecipe().complete and outputCalls == 0, "Secret allocated reagents cannot be forwarded to Blizzard's output API")
ProfessionsFrame.CraftingPage.SchematicForm.GetTransaction = function() return {
  GetRecipeSchematic = function() return schematics[100] end,
  CreateCraftingReagentInfoTbl = function() return secret end,
} end
check(not Crafting.SelectedRecipe().complete and outputCalls == 0, "Unreadable allocation tables cannot be treated as an empty selection")
ProfessionsFrame.CraftingPage.SchematicForm.GetTransaction = nil
C_TradeSkillUI.GetRecipeOutputItemData = originalOutput
slot.reagents[2] = nil
local ranked = Crafting.RankedRecipes("current", "best", "")
check(#ranked == 1 and ranked[1].value.recipe.recipeId == 100, "Rankings exclude unlearned and daily cooldown recipes")
check(#Crafting.RankedRecipes("current", "best", "no match") == 0, "Recipe search filters by crafted recipe name")
InCombatLockdown = function() return true end
check(not Crafting.SelectRecipe(modern), "Never change native recipe selection in combat")
InCombatLockdown = function() return false end
check(Crafting.SelectRecipe(modern), "User-clicked native recipe selection works outside combat")
ProfessionsFrame = nil
TradeSkillFrame = { IsShown = function() return true end }
GetTradeSkillSelectionIndex = function() return 1 end
GetTradeSkillInfo = function() return "Legacy gloves", "optimal" end
GetTradeSkillItemLink = function() return "item:4307" end
GetTradeSkillRecipeLink = function() return "|Henchant:200|h[Legacy gloves]|h" end
GetTradeSkillNumMade = function() return 1, 1 end
GetTradeSkillNumReagents = function() return 1 end
GetTradeSkillReagentItemLink = function() return "item:2589" end
GetTradeSkillReagentInfo = function() return "Linen Cloth", 1, 2, 10 end
GetNumTradeSkills = function() return 1 end
local legacy = Crafting.SelectedRecipe()
check(legacy.recipeId == 200 and legacy.complete and legacy.reagents[1].quantity == 2, "Legacy trade-skill adapter reads correct tuple positions")
TradeSkillFrame = nil; CraftFrame = { IsShown = function() return true end }
GetCraftSelectionIndex = function() return 1 end
GetCraftInfo = function() return "Enchant gloves", "Rank 1", "optimal" end
GetCraftNumReagents = function() return 1 end
GetCraftReagentItemLink = GetTradeSkillReagentItemLink
GetCraftReagentInfo = GetTradeSkillReagentInfo
local enchant = Crafting.SelectedRecipe()
check(enchant and enchant.outputItemId == nil and not Value.Recipe(enchant).available, "Direct enchants show costs without invented auctionable outputs")
print(checks .. " item valuation, crafting, fees, scope, quantities, cooldown, secret-value and profession adapter controls passed")
