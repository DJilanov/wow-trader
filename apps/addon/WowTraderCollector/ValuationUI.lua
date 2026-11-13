local _, Addon = ...
local Value, Crafting = Addon.Valuation, Addon.Crafting
local tooltipRecords = setmetatable({}, { __mode = "k" })
local tooltipHooks = setmetatable({}, { __mode = "k" })
local quantityHooks = setmetatable({}, { __mode = "k" })
local panel, launcher
local mode, route, tab, page, craftCount = "current", "best", "selected", 1, 1
local routeNames = { best = "Best exit", auction = "Sell on AH", disenchant = "Disenchant", vendor = "Vendor" }
local selectedKey, userHidden, attachedWindow

local function Money(value)
  if value == nil then return "Unavailable" end
  local negative = value < 0
  value = math.floor(math.abs(value))
  return (negative and "-" or "") .. string.format("%dg %02ds %02dc", math.floor(value / 10000), math.floor(value / 100) % 100, value % 100)
end

local function Profit(value)
  return value == nil and "Unavailable" or ((value >= 0 and "|cff66dd88" or "|cffff7777") .. Money(value) .. "|r")
end

local function DisenchantValueText(value)
  if value.available then return Money(value.net) end
  if value.reasonCode == "client_data_mismatch" then return "Data update needed" end
  if value.reasonCode == "insufficient_market_depth" then return string.format("Below %d listed", Addon.MarketPolicy.MINIMUM_RESALE_MARKET_QUANTITY) end
  if value.reasonCode == "missing_material_prices" then return "Material prices missing" end
  if value.reasonCode == "unknown_ah_fee" then return "AH cut unknown" end
  return "Unavailable"
end

local function DisenchantReason(value)
  if value.reasonCode ~= "missing_material_prices" then return value.reason end
  local names = {}
  for _, id in ipairs(value.missingMaterialIds or {}) do
    local info = Value.ItemInfo(id)
    table.insert(names, info and info.name or ("Item " .. id))
  end
  return "AH prices missing for: " .. table.concat(names, ", ") .. ". Expected materials are still shown."
end

local function Freshness(context)
  if not context.available then return context.reason or "Scan the AH or synchronize Companion, then /reload." end
  local age = math.max(0, math.floor((context.ageSeconds or 0) / 60))
  return string.format("%s / %s | Scan: %dm ago%s", context.realmId or "Unknown realm", context.auctionHouseType or "Unknown AH",
    age, context.fresh and "" or " | STALE")
end

function Addon.AppendValuationTooltip(tooltip, data)
  if not tooltip or type(tooltip.AddLine) ~= "function" then return end
  if not tooltipHooks[tooltip] and type(tooltip.HookScript) == "function" then
    tooltipHooks[tooltip] = true
    local function Clear() tooltipRecords[tooltip] = nil end
    pcall(tooltip.HookScript, tooltip, "OnHide", Clear)
    pcall(tooltip.HookScript, tooltip, "OnTooltipCleared", Clear)
  end
  local reference = type(Value.Readable(data)) == "table" and (Value.Readable(data.hyperlink) or Value.Readable(data.id)) or nil
  if not reference and type(tooltip.GetItem) == "function" then
    local ok, _, link = pcall(tooltip.GetItem, tooltip)
    if ok then reference = Value.Readable(link) end
  end
  local id = Value.ItemID(reference)
  if not id then return end
  local lines = Value.Call(tooltip.NumLines, tooltip)
  local previous = tooltipRecords[tooltip]
  if previous and previous.id == id and lines ~= nil and previous.lines == lines then return end
  local value = Value.Item(reference, 1, "current")
  local quote = value.quote
  tooltip:AddLine(" ")
  tooltip:AddLine("WoW Trader |cffa9a196(per item)|r", 0.95, 0.72, 0.28)
  tooltip:AddDoubleLine("Vendor", Money(value.vendor), 0.8, 0.8, 0.8, 1, 1, 1)
  tooltip:AddDoubleLine("AH latest ask", Money(quote and quote.current), 0.8, 0.8, 0.8, 1, 1, 1)
  tooltip:AddDoubleLine("AH historical normal", Money(quote and quote.normal), 0.8, 0.8, 0.8, 1, 1, 1)
  local craft = Crafting.CostForItem(id)
  if craft then
    tooltip:AddDoubleLine("Cost to make / item", Money(craft.perItem), 0.8, 0.8, 0.8, 0.7, 0.9, 1)
    if craft.perCraft then
      tooltip:AddDoubleLine("Buy missing materials / craft", Money(craft.additionalCost), 0.8, 0.8, 0.8, 1, 1, 1)
      tooltip:AddLine(craft.recipeName .. " | Owned materials are valued; recipe already learned.", 0.7, 0.65, 0.6, true)
      if craft.outputQuantity > 1 then
        tooltip:AddLine(string.format("One craft makes %d items for %s.", craft.outputQuantity, Money(craft.perCraft)), 0.7, 0.65, 0.6, true)
      end
    elseif craft.reason then tooltip:AddLine(craft.reason, 0.7, 0.65, 0.6, true) end
  end
  if value.auction.net ~= nil then
    tooltip:AddDoubleLine("AH after cut", Money(value.auction.net), 0.8, 0.8, 0.8, 1, 1, 1)
  elseif value.auction.reason then tooltip:AddLine(value.auction.reason, 0.7, 0.65, 0.6, true) end
  local de = value.disenchant
  tooltip:AddDoubleLine("Disenchant average after AH cut", DisenchantValueText(de),
    0.8, 0.8, 0.8, 0.7, 0.9, 1)
  if de.evidence then tooltip:AddLine(de.evidence, 0.75, 0.65, 0.45, true) end
  if de.reason then tooltip:AddLine(DisenchantReason(de), 0.7, 0.65, 0.6, true) end
  if Value.Call(IsShiftKeyDown) then
    for _, reagent in ipairs(craft and craft.reagents or {}) do
      tooltip:AddDoubleLine(string.format("  %d x %s / craft", reagent.quantity, reagent.name), Money(reagent.cost), 0.8, 0.8, 0.8, 1, 1, 1)
    end
    if quote then tooltip:AddLine(string.format("History: %d independent observations", quote.observations or 0), 0.8, 0.8, 0.8) end
    for _, material in ipairs(de.materials) do
      local info = Value.ItemInfo(material.itemId)
      tooltip:AddDoubleLine(string.format("  %.2f x %s", material.expectedQuantity, info and info.name or ("Item " .. material.itemId)),
        Money(material.value), 0.8, 0.8, 0.8, 1, 1, 1)
    end
    if de.requiredSkill then tooltip:AddLine("Requires Enchanting " .. de.requiredSkill, 0.8, 0.8, 0.8) end
    local intel = Value.Call(Addon.GetItemMarketIntelligence, id)
    if intel and intel.buy and intel.buy.maximumBuy then
      tooltip:AddDoubleLine("Buy ceiling", Money(intel.buy.maximumBuy), 0.8, 0.8, 0.8, 1, 1, 1)
      tooltip:AddLine(intel.buy.reason, 0.7, 0.7, 0.7, true)
    end
  elseif #de.materials > 0 then tooltip:AddLine("Hold Shift for expected disenchant materials.", 0.6, 0.6, 0.6) end
  tooltip:AddLine(Freshness(value.context), value.context.fresh and 0.6 or 1, value.context.fresh and 0.7 or 0.5, 0.5, true)
  tooltip:AddLine("AH asks are not completed sales. Deposits are excluded.", 0.6, 0.6, 0.6, true)
  tooltipRecords[tooltip] = { id = id, lines = Value.Call(tooltip.NumLines, tooltip) }
end

local function Text(parent, text, size)
  local label = parent:CreateFontString(nil, "OVERLAY", size or "GameFontHighlightSmall")
  label:SetText(text or ""); label:SetJustifyH("LEFT")
  return label
end

local function Button(parent, title, width, onClick)
  local button = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
  button:SetSize(width, 24); button:SetText(title); button:SetScript("OnClick", onClick)
  return button
end

local function Background(frame)
  local texture = frame:CreateTexture(nil, "BACKGROUND")
  texture:SetAllPoints(); texture:SetColorTexture(0.055, 0.05, 0.045, 0.98)
  local top = frame:CreateTexture(nil, "BORDER")
  top:SetColorTexture(0.78, 0.58, 0.23, 1); top:SetPoint("TOPLEFT"); top:SetPoint("TOPRIGHT"); top:SetHeight(2)
end

local Refresh

local function RenderSelected()
  local recipe = Crafting.SelectedRecipe()
  if not recipe then
    panel.content:SetText("Select a learned recipe in your profession window.\n\nAH prices and disenchant estimates appear here alongside the vendor value.")
    panel.scrollChild:SetHeight(120); panel.content:SetHeight(120)
    return
  end
  local value = Value.Recipe(recipe, craftCount, mode, { getVendor = Crafting.VendorQuote })
  local lines = { "|cffffcc66" .. recipe.name .. "|r", "" }
  if value.outputQuantity then table.insert(lines, string.format("%d craft(s) -> %d item(s)", craftCount, value.outputQuantity)) end
  table.insert(lines, "Materials: " .. Money(value.cost))
  table.insert(lines, "Buy missing materials: " .. Money(value.additionalCost))
  local output = value.output
  if output then
    local quote = output.quote
    table.insert(lines, "Output AH latest / item: " .. Money(quote and quote.current))
    table.insert(lines, "Output AH normal / item: " .. Money(quote and quote.normal))
  end
  table.insert(lines, "")
  table.insert(lines, "|cffffcc66Return / profit after materials|r")
  for _, key in ipairs({ "auction", "disenchant", "vendor" }) do
    local exit = value.routes[key]
    local estimate = exit and exit.estimated and " (reference estimate)" or ""
    local profit = exit and exit.profit
    table.insert(lines, routeNames[key] .. estimate .. ": " .. Money(exit and exit.proceeds) .. " / " ..
      (value.rankable and Profit(profit) or Money(profit)))
  end
  if value.best then
    table.insert(lines, "")
    table.insert(lines, (value.rankable and "Best estimated exit: " or "Reference exit: ") .. routeNames[value.best.key] .. " | " ..
      (value.rankable and Profit(value.best.profit) or Money(value.best.profit)) .. (value.best.estimated and " (reference yields)" or ""))
  end
  table.insert(lines, value.reason or "Waiting for complete recipe data.")
  table.insert(lines, "")
  table.insert(lines, "|cffffcc66Inputs (bag inventory)|r")
  for _, reagent in ipairs(value.reagents) do
    table.insert(lines, string.format("%d x %s  |  %s", reagent.quantity, reagent.name, Money(reagent.cost)))
    table.insert(lines, string.format("  In bags: %d | Missing: %d", reagent.owned, reagent.missing))
    if reagent.leftover and reagent.leftover > 0 then table.insert(lines, "  After buying whole stacks: " .. reagent.leftover .. " left over") end
  end
  table.insert(lines, mode == "normal" and "Historical budget estimate." or "AH spend uses whole stacks; surplus remains yours.")
  if output then
    if output.auction.reason then table.insert(lines, output.auction.reason) end
    local de = output.disenchant
    if de.evidence then table.insert(lines, ""); table.insert(lines, de.evidence) end
    if de.reason then table.insert(lines, DisenchantReason(de)) end
    if de.requiredSkill then table.insert(lines, "Requires Enchanting " .. de.requiredSkill) end
    if #de.materials > 0 then
      table.insert(lines, "Expected disenchant materials per output item:")
      for _, material in ipairs(de.materials) do
        local info = Value.ItemInfo(material.itemId)
        table.insert(lines, string.format("  %.2f x %s | %s", material.expectedQuantity,
          info and info.name or ("Item " .. material.itemId), Money(material.value)))
      end
    end
  end
  table.insert(lines, "")
  table.insert(lines, "Extra specialization procs are not assumed. Vendor reagent prices are used after visiting their merchant this session.")
  panel.content:SetText(table.concat(lines, "\n"))
  panel.content:SetHeight(panel.content:GetStringHeight() + 20)
  panel.scrollChild:SetHeight(math.max(1, panel.content:GetStringHeight() + 20))
end

local function RenderRecipes()
  local rows = Crafting.RankedRecipes(mode, route, panel.search:GetText())
  local pages = math.max(1, math.ceil(#rows / panel.visibleRows))
  page = math.min(page, pages)
  panel.pages:SetText(string.format("%d / %d  |  %d recipes", page, pages, #rows))
  panel.previous:SetEnabled(page > 1); panel.next:SetEnabled(page < pages)
  for index, row in ipairs(panel.rows) do
    local entry = rows[(page - 1) * panel.visibleRows + index]
    if entry and index <= panel.visibleRows then
      row.recipe = entry.value.recipe
      row.name:SetText(entry.value.recipe.name)
      row.profit:SetText(Profit(entry.profit) .. (entry.route and entry.route.estimated and " *" or ""))
      row:Show()
    else row.recipe = nil; row:Hide() end
  end
  panel.empty:SetShown(#rows == 0)
end

Refresh = function()
  if not panel or not panel:IsShown() then return end
  panel.freshness:SetText(Freshness(Addon.GetMarketPriceContext()))
  panel.selected:SetText(tab == "selected" and "[Selected recipe]" or "Selected recipe")
  panel.all:SetText(tab == "recipes" and "[Recipe profits]" or "Recipe profits")
  panel.scroll:SetShown(tab == "selected")
  panel.list:SetShown(tab == "recipes")
  panel.quantity:SetShown(tab == "selected"); panel.quantityLabel:SetShown(tab == "selected")
  panel.route:SetShown(tab == "recipes"); panel.search:SetShown(tab == "recipes")
  if tab == "selected" then RenderSelected() else RenderRecipes() end
end

local function Position(window)
  local screenWidth, screenHeight = UIParent:GetWidth(), UIParent:GetHeight()
  local ratio = (Value.Call(window.GetEffectiveScale, window) or 1) / UIParent:GetEffectiveScale()
  local left, right, top = Value.Call(window.GetLeft, window), Value.Call(window.GetRight, window), Value.Call(window.GetTop, window)
  panel:SetHeight(math.min(610, screenHeight - 24))
  panel.visibleRows = math.max(1, math.min(9, math.floor((panel:GetHeight() - 184 - 44 - 55) / 32)))
  local width = panel:GetWidth()
  local x = screenWidth - width - 12
  if right and right * ratio + 8 + width <= screenWidth then x = right * ratio + 8
  elseif left and left * ratio - width - 8 >= 0 then x = left * ratio - width - 8 end
  local y = math.min(screenHeight - 12, top and top * ratio or screenHeight - 40)
  panel:ClearAllPoints(); panel:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", math.max(0, x), y)
end

local function EnsurePanel()
  if panel then return panel end
  panel = CreateFrame("Frame", "WoWTraderCraftingPrices", UIParent)
  panel.visibleRows = 9
  panel:SetSize(380, 610); panel:SetFrameStrata("DIALOG"); panel:SetClampedToScreen(true)
  panel:SetMovable(true); panel:EnableMouse(true); panel:RegisterForDrag("LeftButton")
  panel:SetScript("OnDragStart", function(self) if not Value.Call(InCombatLockdown) then self:StartMoving() end end)
  panel:SetScript("OnDragStop", function(self) self:StopMovingOrSizing() end)
  Background(panel)
  local title = Text(panel, "WoW Trader | Crafting", "GameFontNormalLarge"); title:SetPoint("TOPLEFT", 14, -14)
  local close = CreateFrame("Button", nil, panel, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", -2, -2); close:SetScript("OnClick", function() userHidden = true; panel:Hide() end)
  panel.freshness = Text(panel); panel.freshness:SetPoint("TOPLEFT", 14, -44); panel.freshness:SetWidth(350); panel.freshness:SetHeight(36)
  panel.selected = Button(panel, "Selected recipe", 170, function() tab = "selected"; Refresh() end)
  panel.selected:SetPoint("TOPLEFT", 14, -86)
  panel.all = Button(panel, "Recipe profits", 170, function() tab = "recipes"; Refresh() end)
  panel.all:SetPoint("LEFT", panel.selected, "RIGHT", 8, 0)
  panel.mode = Button(panel, "Latest asks", 135, function(self)
    mode = mode == "current" and "normal" or "current"
    self:SetText(mode == "current" and "Latest asks" or "Historical normal"); page = 1; Refresh()
  end)
  panel.mode:SetPoint("TOPLEFT", 14, -118)
  panel.quantityLabel = Text(panel, "Calculate crafts:"); panel.quantityLabel:SetPoint("LEFT", panel.mode, "RIGHT", 10, 0)
  panel.quantity = CreateFrame("EditBox", nil, panel, "InputBoxTemplate")
  panel.quantity:SetSize(64, 24); panel.quantity:SetPoint("LEFT", panel.quantityLabel, "RIGHT", 12, 0)
  panel.quantity:SetAutoFocus(false); panel.quantity:SetNumeric(true); panel.quantity:SetMaxLetters(5); panel.quantity:SetText("1")
  panel.quantity:SetScript("OnEnterPressed", function(self) self:ClearFocus() end)
  panel.quantity:SetScript("OnEscapePressed", function(self) self:SetText(tostring(craftCount)); self:ClearFocus() end)
  panel.quantity:SetScript("OnEditFocusLost", function(self)
    craftCount = Value.Integer(tonumber(self:GetText()), 1, 10000) or craftCount
    self:SetText(tostring(craftCount)); Refresh()
  end)
  local routes = { "best", "auction", "disenchant", "vendor" }
  panel.route = Button(panel, "Sort: " .. routeNames[route] .. " >", 205, function(self)
    for index, key in ipairs(routes) do if key == route then route = routes[index % #routes + 1]; break end end
    self:SetText("Sort: " .. routeNames[route] .. " >"); page = 1; Refresh()
  end)
  panel.route:SetPoint("LEFT", panel.mode, "RIGHT", 8, 0)
  panel.search = CreateFrame("EditBox", nil, panel, "InputBoxTemplate")
  panel.search:SetSize(330, 24); panel.search:SetPoint("TOPLEFT", 20, -150); panel.search:SetAutoFocus(false)
  panel.searchHint = Text(panel.search, "Search learned recipes...")
  panel.searchHint:SetPoint("LEFT", 3, 0)
  panel.search:SetScript("OnTextChanged", function(self)
    panel.searchHint:SetShown(self:GetText() == ""); page = 1; Refresh()
  end)
  panel.search:SetScript("OnEnterPressed", function(self) self:ClearFocus() end)
  panel.search:SetScript("OnEscapePressed", function(self) self:SetText(""); self:ClearFocus() end)
  panel.scroll = CreateFrame("ScrollFrame", nil, panel, "UIPanelScrollFrameTemplate")
  panel.scroll:SetPoint("TOPLEFT", 14, -156); panel.scroll:SetPoint("BOTTOMRIGHT", -30, 44)
  panel.scrollChild = CreateFrame("Frame", nil, panel.scroll); panel.scrollChild:SetSize(328, 1)
  panel.scroll:SetScrollChild(panel.scrollChild)
  panel.content = Text(panel.scrollChild); panel.content:SetPoint("TOPLEFT"); panel.content:SetWidth(328)
  panel.content:SetSpacing(5)
  panel.list = CreateFrame("Frame", nil, panel)
  panel.list:SetPoint("TOPLEFT", 14, -184); panel.list:SetPoint("BOTTOMRIGHT", -14, 44)
  local heading = Text(panel.list, "Recipe"); heading:SetPoint("TOPLEFT")
  local profitHeading = Text(panel.list, "Profit / craft"); profitHeading:SetPoint("TOPRIGHT")
  panel.rows = {}
  for index = 1, 9 do
    local row = CreateFrame("Button", nil, panel.list)
    row:SetSize(350, 31); row:SetPoint("TOPLEFT", 0, -24 - (index - 1) * 32)
    row.name = Text(row); row.name:SetPoint("LEFT", 2, 0); row.name:SetWidth(205); row.name:SetHeight(28)
    row.profit = Text(row); row.profit:SetPoint("RIGHT", -2, 0); row.profit:SetJustifyH("RIGHT")
    row:SetScript("OnClick", function(self)
      if self.recipe and Crafting.SelectRecipe(self.recipe) then tab = "selected"; Refresh() end
    end)
    row:SetScript("OnEnter", function(self)
      if not self.recipe then return end
      GameTooltip:SetOwner(self, "ANCHOR_LEFT"); GameTooltip:SetText(self.recipe.name)
      GameTooltip:AddLine("Click to select this recipe. No item is crafted.", 0.8, 0.8, 0.8, true)
      if Value.Call(InCombatLockdown) then GameTooltip:AddLine("Recipe selection is available after combat.", 1, 0.5, 0.4, true) end
      GameTooltip:Show()
    end)
    row:SetScript("OnLeave", function() GameTooltip:Hide() end)
    panel.rows[index] = row
  end
  panel.empty = Text(panel.list, "No learned repeatable recipes match.\nOpen your profession and clear the search.")
  panel.empty:SetPoint("TOPLEFT", 4, -40); panel.empty:SetWidth(335)
  panel.previous = Button(panel.list, "Previous", 85, function() page = math.max(1, page - 1); Refresh() end)
  panel.previous:SetPoint("BOTTOMLEFT")
  panel.next = Button(panel.list, "Next", 85, function() page = page + 1; Refresh() end)
  panel.next:SetPoint("BOTTOMRIGHT")
  panel.pages = Text(panel.list); panel.pages:SetPoint("BOTTOM", 0, 7)
  local footer = Text(panel, "After AH cut, before deposits. * Reference yields. Drag to move.")
  footer:SetPoint("BOTTOMLEFT", 14, 16); footer:SetWidth(350)
  panel:Hide()
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, panel:GetName()) end
  return panel
end

function Addon.ToggleCraftingPrices()
  local window = Crafting.Window()
  if not window then
    DEFAULT_CHAT_FRAME:AddMessage("|cffc9a86aWoW Trader:|r Open a crafting profession first."); return
  end
  EnsurePanel()
  userHidden = panel:IsShown()
  if userHidden then panel:Hide() else Position(window); panel:Show(); Refresh() end
end

local function Attach()
  local window = Crafting.Window()
  if not window then
    if panel then panel:Hide() end
    if launcher then launcher:Hide() end
    attachedWindow = nil; return
  end
  if not launcher then
    launcher = Button(UIParent, "WoW Trader prices", 150, Addon.ToggleCraftingPrices)
    launcher:SetClampedToScreen(true); launcher:SetFrameStrata("DIALOG")
  end
  if attachedWindow ~= window then
    attachedWindow = window
    launcher:ClearAllPoints(); launcher:SetPoint("TOPRIGHT", window, "BOTTOMRIGHT", -8, -2)
    EnsurePanel(); Position(window)
    if not userHidden then panel:Show() end
    local input = window.CraftingPage and window.CraftingPage.CreateMultipleInputBox or TradeSkillInputBox
    if input and type(input.HookScript) == "function" and not quantityHooks[input] then
      local function UpdateQuantity(self)
        local count = Value.Integer(tonumber(Value.Call(self.GetText, self)), 1, 10000)
        if count then craftCount = count; panel.quantity:SetText(tostring(count)); Refresh() end
      end
      quantityHooks[input] = pcall(input.HookScript, input, "OnTextChanged", UpdateQuantity)
      if quantityHooks[input] then UpdateQuantity(input) end
    end
  end
  launcher:Show()
end

local observer = CreateFrame("Frame")
local elapsed = 0
observer:SetScript("OnUpdate", function(_, delta)
  elapsed = elapsed + delta
  if elapsed < 0.5 then return end
  elapsed = 0; Attach()
  if not panel or not panel:IsShown() then return end
  local recipe = Crafting.SelectedRecipe()
  local key = recipe and recipe.recipeId or nil
  if selectedKey ~= key then selectedKey = key; panel.scroll:SetVerticalScroll(0) end
  Refresh()
end)

SLASH_WOWTRADERPRICES1 = "/wowtraderprices"
SlashCmdList.WOWTRADERPRICES = Addon.ToggleCraftingPrices
