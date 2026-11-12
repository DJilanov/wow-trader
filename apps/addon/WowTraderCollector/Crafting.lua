local _, Addon = ...
local Value = Addon.Valuation
local Crafting = {}
Addon.Crafting = Crafting

local LONG_COOLDOWNS = {
  [11479] = true, [11480] = true, [17187] = true, [17559] = true, [17560] = true,
  [17561] = true, [17562] = true, [17563] = true, [17564] = true, [17565] = true,
  [17566] = true, [18560] = true, [28566] = true, [28567] = true, [28568] = true,
  [28569] = true, [28580] = true, [28581] = true, [28582] = true, [28583] = true,
  [28584] = true, [28585] = true, [29688] = true, [31373] = true, [36686] = true,
  [26751] = true,
}
local revision = 0
local listCache = nil
local vendorPrices = {}
local tooltipRecipes = {}
local recipeCache

local function Table(value)
  value = Value.Readable(value)
  return type(value) == "table" and value or nil
end

local function Method(object, key, ...)
  if type(object) ~= "table" or type(object[key]) ~= "function" then return nil end
  return Value.Call(object[key], object, ...)
end

function Crafting.Window()
  if ProfessionsFrame and Method(ProfessionsFrame, "IsShown") then return ProfessionsFrame, "modern" end
  if TradeSkillFrame and Method(TradeSkillFrame, "IsShown") then return TradeSkillFrame, "legacy" end
  if CraftFrame and Method(CraftFrame, "IsShown") then return CraftFrame, "craft" end
  return nil
end

local function FlavorAPI(craft, craftAPI, tradeSkillAPI)
  if craft then return craftAPI end
  return tradeSkillAPI
end

local function SelectedForm()
  local page = ProfessionsFrame and ProfessionsFrame.CraftingPage
  return page and page.SchematicForm
end

local function CooldownExcluded(recipeId, reader, index)
  if LONG_COOLDOWNS[recipeId] then return true end
  local client = Addon.ClientValuationData
  local context = Value.Call(Addon.GetCollectorContext) or Value.Call(Addon.GetMarketPriceContext)
  if client and context and client.clientProduct == context.clientProduct and client.clientBuild == context.clientBuild and
     client.cooldownRecipes[recipeId] then return true end
  local base = Value.Call(GetSpellBaseCooldown, recipeId)
  if Value.Integer(base, 0, 2147483647) and base >= 3600000 then return true end
  if type(reader) ~= "function" then return false end
  local result = { pcall(reader, index or recipeId) }
  if not result[1] then return true end
  if (type(result[2]) ~= "nil" and Value.Readable(result[2]) == nil) or
     (type(result[3]) ~= "nil" and Value.Readable(result[3]) == nil) then return true end
  local remaining = Value.Integer(result[2], 0, 2147483647)
  return Value.Readable(result[3]) == true or (remaining ~= nil and remaining > 0)
end

local function OutputAllocations(transaction)
  if not transaction or type(transaction.CreateCraftingReagentInfoTbl) ~= "function" then return nil, true end
  local source = Table(Method(transaction, "CreateCraftingReagentInfoTbl"))
  if not source then return nil, false end
  local allocations = {}
  for _, raw in ipairs(source) do
    local allocation = Table(raw)
    local reagent = allocation and Table(allocation.reagent)
    local id = reagent and Value.Integer(reagent.itemID, 1, 2147483647)
    local currency = reagent and Value.Integer(reagent.currencyID, 1, 2147483647)
    local count = allocation and Value.Integer(allocation.quantity, 1, 1000000)
    local slot = allocation and Value.Integer(allocation.dataSlotIndex, 1, 10000)
    if (not id and not currency) or not count or not slot then return nil, false end
    table.insert(allocations, { reagent = { itemID = id, currencyID = currency }, quantity = count, dataSlotIndex = slot })
  end
  return allocations, true
end

function Crafting.ReadModernRecipe(recipeId, useSelection)
  recipeId = Value.Integer(recipeId, 1, 2147483647)
  if not recipeId or type(C_TradeSkillUI) ~= "table" then return nil end
  local info = Table(Value.Call(C_TradeSkillUI.GetRecipeInfo, recipeId))
  if not info or Value.Readable(info.learned) ~= true then return nil end
  local form = useSelection and SelectedForm() or nil
  local transaction = Method(form, "GetTransaction")
  local selected = Table(Method(form, "GetRecipeInfo"))
  if not selected or Value.Readable(selected.recipeID) ~= recipeId then transaction = nil; form = nil end
  local schematic = transaction and Table(Method(transaction, "GetRecipeSchematic")) or
    Table(Value.Call(C_TradeSkillUI.GetRecipeSchematic, recipeId, false))
  if not schematic then return nil end
  local outputAllocations, allocationsReadable = OutputAllocations(transaction)
  local output = allocationsReadable and Table(Value.Call(C_TradeSkillUI.GetRecipeOutputItemData, recipeId, outputAllocations)) or nil
  local result = { recipeId = recipeId, name = Value.Readable(info.name) or ("Recipe " .. recipeId),
    outputItemId = output and Value.Integer(output.itemID, 1, 2147483647) or Value.Integer(schematic.outputItemID, 1, 2147483647),
    outputLink = output and Value.Readable(output.hyperlink),
    quantityMin = Value.Integer(schematic.quantityMin, 1, 1000000),
    quantityMax = Value.Integer(schematic.quantityMax, 1, 1000000),
    reagents = {}, complete = true, apiFlavor = "modern",
    cooldownExcluded = CooldownExcluded(recipeId, C_TradeSkillUI.GetRecipeCooldown) }
  if Value.Readable(info.disabled) or Value.Readable(info.isRecraft) or Value.Readable(info.isSalvageRecipe) or
     Value.Readable(info.isGatheringRecipe) then
    result.complete = false; result.reason = "Disabled, salvage, gathering or recrafting recipe."
  end
  if Value.Readable(info.supportsQualities) == true and not output then
    result.complete = false; result.reason = "The selected output quality has not loaded."
  end
  if not allocationsReadable then result.complete = false; result.reason = "Selected output reagents are not readable." end
  local allocations = {}
  if transaction then
    for _, reader in ipairs({ "CreateReagentInfoTbl", "CreateCraftingReagentInfoTbl" }) do
      for _, raw in ipairs(Table(Method(transaction, reader)) or {}) do
        local allocation = Table(raw)
        if not allocation then result.complete = false; break end
        local slot = Value.Integer(allocation.dataSlotIndex, 1, 10000)
        if slot then
          allocations[slot] = allocations[slot] or {}
          table.insert(allocations[slot], allocation)
        end
      end
    end
  end
  local slots = Table(schematic.reagentSlotSchematics)
  if not slots then result.complete = false end
  for _, slot in ipairs(slots or {}) do
    local required = Value.Readable(slot.required)
    local quantity = Value.Integer(slot.quantityRequired, 0, 1000000)
    local choices = Table(slot.reagents)
    local selectedAllocations = allocations[Value.Readable(slot.dataSlotIndex)]
    if selectedAllocations and #selectedAllocations > 0 then
      local allocated = 0
      for _, allocation in ipairs(selectedAllocations) do
        local reagent = Table(allocation.reagent)
        local id = reagent and Value.Integer(reagent.itemID, 1, 2147483647)
        local count = Value.Integer(allocation.quantity, 1, 1000000)
        if id and count then
          table.insert(result.reagents, { itemId = id, quantity = count }); allocated = allocated + count
        else result.complete = false end
      end
      if required == true and (not quantity or allocated ~= quantity) then result.complete = false end
    elseif required == true then
      local id = choices and #choices == 1 and Value.Integer(choices[1].itemID, 1, 2147483647)
      if id and quantity and quantity > 0 then table.insert(result.reagents, { itemId = id, quantity = quantity })
      else result.complete = false; result.reason = "Select the exact reagents; currencies and unresolved alternatives cannot be priced." end
    elseif required ~= false then
      result.complete = false; result.reason = "A reagent slot could not be read."
    end
  end
  return result
end

function Crafting.ReadLegacyRecipe(index, flavor)
  index = Value.Integer(index, 1, 100000)
  if not index then return nil end
  local craft = flavor == "craft"
  local infoReader = FlavorAPI(craft, GetCraftInfo, GetTradeSkillInfo)
  if type(infoReader) ~= "function" then return nil end
  local info = { pcall(infoReader, index) }
  if not info[1] then return nil end
  local name, kind = Value.Readable(info[2]), Value.Readable(info[craft and 4 or 3])
  if type(name) ~= "string" or kind == "header" then return nil end
  local outputLink = Value.Call(FlavorAPI(craft, GetCraftItemLink, GetTradeSkillItemLink), index)
  local recipeLink = Value.Call(FlavorAPI(craft, GetCraftRecipeLink, GetTradeSkillRecipeLink), index)
  local recipeId = type(recipeLink) == "string" and tonumber(string.match(recipeLink, "enchant:(%d+)") or string.match(recipeLink, "spell:(%d+)")) or nil
  local result = { recipeId = recipeId or index, index = index, apiFlavor = craft and "craft" or "legacy",
    name = name, outputItemId = Value.ItemID(outputLink), outputLink = outputLink,
    reagents = {}, complete = true, quantityMin = craft and 1 or nil, quantityMax = craft and 1 or nil,
    cooldownExcluded = CooldownExcluded(recipeId, FlavorAPI(craft, GetCraftCooldown, GetTradeSkillCooldown), index) }
  local produced = FlavorAPI(craft, GetCraftNumMade, GetTradeSkillNumMade)
  if type(produced) == "function" then
    local values = { pcall(produced, index) }
    if values[1] then
      result.quantityMin = Value.Integer(values[2], 1, 1000000)
      result.quantityMax = Value.Integer(values[3], 1, 1000000) or result.quantityMin
    end
  end
  local count = Value.Integer(Value.Call(FlavorAPI(craft, GetCraftNumReagents, GetTradeSkillNumReagents), index), 0, 1000)
  if count == nil then result.complete = false end
  for reagentIndex = 1, count or 0 do
    local link = Value.Call(FlavorAPI(craft, GetCraftReagentItemLink, GetTradeSkillReagentItemLink), index, reagentIndex)
    local reader = FlavorAPI(craft, GetCraftReagentInfo, GetTradeSkillReagentInfo)
    local values = type(reader) == "function" and { pcall(reader, index, reagentIndex) } or {}
    local id, quantity = Value.ItemID(link), values[1] and Value.Integer(values[4], 1, 1000000)
    if id and quantity then table.insert(result.reagents, { itemId = id, quantity = quantity })
    else result.complete = false end
  end
  return result
end

function Crafting.SelectedRecipe()
  local _, flavor = Crafting.Window()
  if flavor == "modern" then
    local info = Table(Method(SelectedForm(), "GetRecipeInfo"))
    return info and Crafting.ReadModernRecipe(Value.Readable(info.recipeID), true)
  elseif flavor == "legacy" then
    return Crafting.ReadLegacyRecipe(Value.Call(GetTradeSkillSelectionIndex), flavor)
  elseif flavor == "craft" then
    return Crafting.ReadLegacyRecipe(Value.Call(GetCraftSelectionIndex), flavor)
  end
  return nil
end

function Crafting.Invalidate()
  recipeCache = nil
  revision = revision + 1; listCache = nil
end

function Crafting.VendorQuote(itemId)
  local quote = vendorPrices[itemId]
  if not quote then return nil end
  local guid = Value.Call(UnitGUID, "player")
  local now = Value.Call(GetServerTime) or time()
  if guid ~= quote.character or now - quote.observedAt > 86400 then return nil end
  return quote
end

function Crafting.CaptureVendorPrices()
  local count = Value.Integer(Value.Call(GetMerchantNumItems), 0, 10000)
  if not count or type(GetMerchantItemInfo) ~= "function" then return end
  for index = 1, count do
    local id = Value.ItemID(Value.Call(GetMerchantItemLink, index))
    local values = { pcall(GetMerchantItemInfo, index) }
    if id and values[1] then
      local price, stack = Value.Integer(values[4], 1, 9007199254), Value.Integer(values[5], 1, 1000000)
      local stock = Value.Readable(values[6])
      if price and stack and stock == -1 and Value.Readable(values[9]) ~= true and
         Value.Readable(values[7]) == true then
        vendorPrices[id] = { unitPrice = math.ceil(price / stack), availableQuantity = -1,
          observedAt = Value.Call(GetServerTime) or time(), character = Value.Call(UnitGUID, "player") }
      end
    end
  end
  Crafting.Invalidate()
end

local function RecipeList()
  local _, flavor = Crafting.Window()
  if recipeCache and recipeCache.flavor == flavor then return recipeCache.recipes end
  local recipes = {}
  if flavor == "modern" then
    local ids = Table(Value.Call(C_TradeSkillUI.GetAllRecipeIDs)) or Table(Value.Call(C_TradeSkillUI.GetFilteredRecipeIDs))
    if not ids then return recipes end
    for _, id in ipairs(ids) do
      local recipe = Crafting.ReadModernRecipe(Value.Readable(id), false)
      if recipe then table.insert(recipes, recipe) end
    end
  elseif flavor then
    local count = Value.Integer(Value.Call(FlavorAPI(flavor == "craft", GetNumCrafts, GetNumTradeSkills)), 0, 100000) or 0
    for index = 1, count do
      local recipe = Crafting.ReadLegacyRecipe(index, flavor)
      if recipe then table.insert(recipes, recipe) end
    end
  end
  if flavor then
    recipeCache = { flavor = flavor, recipes = recipes }
    local byOutput = {}
    for _, recipe in ipairs(recipes) do
      if recipe.outputItemId then
        byOutput[recipe.outputItemId] = byOutput[recipe.outputItemId] or {}
        table.insert(byOutput[recipe.outputItemId], recipe)
      end
    end
    tooltipRecipes = byOutput
  end
  return recipes
end

function Crafting.CostForItem(itemId)
  itemId = Value.Integer(itemId, 1, 2147483647)
  if not itemId then return nil end
  if Crafting.Window() then RecipeList() end
  local recipes = tooltipRecipes[itemId]
  if not recipes then return nil end
  local best, unavailable
  for _, recipe in ipairs(recipes) do
    local value = Value.Recipe(recipe, 1, "current", { getVendor = Crafting.VendorQuote })
    local output = value.outputQuantity
    if value.cost ~= nil and output then
      local perItem = math.ceil(value.cost / output)
      if not best or perItem < best.perItem then
        best = { perItem = perItem, perCraft = value.cost, outputQuantity = output,
          additionalCost = value.additionalCost, recipeName = recipe.name, reagents = value.reagents }
      end
    else unavailable = value.reason end
  end
  return best or { reason = unavailable or "Waiting for complete recipe and material prices." }
end

function Crafting.RankedRecipes(mode, route, query)
  local context = Addon.GetMarketPriceContext()
  local _, flavor = Crafting.Window()
  local stale = context.available and not context.fresh
  local minute = math.floor((Value.Call(GetServerTime) or time()) / 60)
  if not listCache or listCache.market ~= context.revision or listCache.revision ~= revision or
     listCache.mode ~= mode or listCache.flavor ~= flavor or listCache.stale ~= stale or listCache.minute ~= minute then
    local rows = {}
    for _, recipe in ipairs(RecipeList()) do
      local value = Value.Recipe(recipe, 1, mode, { context = context, getVendor = Crafting.VendorQuote })
      table.insert(rows, value)
    end
    listCache = { market = context.revision, revision = revision, mode = mode, flavor = flavor, stale = stale, minute = minute, rows = rows }
  end
  query = type(query) == "string" and string.lower(query) or ""
  local rows = {}
  for _, value in ipairs(listCache.rows) do
    if not value.recipe.cooldownExcluded and (query == "" or string.find(string.lower(value.recipe.name), query, 1, true)) then
      local selected = route == "best" and value.best or value.routes[route]
      table.insert(rows, { value = value, route = selected, profit = value.rankable and selected and selected.profit or nil })
    end
  end
  table.sort(rows, function(a, b)
    if (a.profit ~= nil) ~= (b.profit ~= nil) then return a.profit ~= nil end
    if a.profit ~= b.profit then return a.profit > b.profit end
    return a.value.recipe.name < b.value.recipe.name
  end)
  return rows
end

function Crafting.SelectRecipe(recipe)
  if Value.Call(InCombatLockdown) then return false end
  if recipe.apiFlavor == "modern" then
    local info = Value.Call(C_TradeSkillUI.GetRecipeInfo, recipe.recipeId)
    local page = ProfessionsFrame and ProfessionsFrame.CraftingPage
    if not Table(info) or not page or type(page.SelectRecipe) ~= "function" then return false end
    local ok = pcall(page.SelectRecipe, page, info)
    return ok
  end
  local callback = FlavorAPI(recipe.apiFlavor == "craft", CraftFrame_SetSelection, TradeSkillFrame_SetSelection)
  if type(callback) ~= "function" then return false end
  return pcall(callback, recipe.index)
end

local frame = CreateFrame("Frame")
for _, event in ipairs({ "TRADE_SKILL_SHOW", "TRADE_SKILL_LIST_UPDATE", "TRADE_SKILL_DATA_SOURCE_CHANGED",
  "CRAFT_SHOW", "CRAFT_UPDATE", "BAG_UPDATE_DELAYED", "GET_ITEM_INFO_RECEIVED", "MERCHANT_SHOW", "MERCHANT_UPDATE" }) do
  pcall(frame.RegisterEvent, frame, event)
end
frame:SetScript("OnEvent", function(_, event)
  if event == "MERCHANT_SHOW" or event == "MERCHANT_UPDATE" then Crafting.CaptureVendorPrices()
  else Crafting.Invalidate() end
end)
