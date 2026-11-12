local root = "apps/addon/WowTraderCollector/"
local widgets = {}
local Widget = {}; Widget.__index = Widget
local function New(name)
  local widget = setmetatable({ name = name, shown = true, width = 0, height = 0, text = "", scripts = {}, lines = {} }, Widget)
  table.insert(widgets, widget)
  if name then _G[name] = widget end
  return widget
end
function Widget:SetSize(w, h) self.width = w; self.height = h end
function Widget:SetWidth(w) self.width = w end
function Widget:SetHeight(h) self.height = h end
function Widget:GetWidth() return self.width end
function Widget:GetHeight() return self.height end
function Widget:SetScript(name, callback) self.scripts[name] = callback end
function Widget:HookScript(name, callback)
  local old = self.scripts[name]
  self.scripts[name] = function(...) if old then old(...) end; callback(...) end
end
function Widget:SetText(text)
  self.text = text; self.lines = { text }
  if self.scripts.OnTextChanged then self.scripts.OnTextChanged(self) end
end
function Widget:GetText() return self.text end
function Widget:SetPoint(...) self.point = { ... } end
function Widget:ClearAllPoints() self.point = nil end
function Widget:GetLeft() return 20 end
function Widget:GetRight() return 1120 end
function Widget:GetTop() return 950 end
function Widget:GetEffectiveScale() return 1 end
function Widget:IsShown() return self.shown end
function Widget:SetShown(value) if value then self:Show() else self:Hide() end end
function Widget:Show() self.shown = true; if self.scripts.OnShow then self.scripts.OnShow(self) end end
function Widget:Hide() self.shown = false; if self.scripts.OnHide then self.scripts.OnHide(self) end end
function Widget:SetEnabled(value) self.enabled = value end
function Widget:CreateFontString() return New() end
function Widget:CreateTexture() return New() end
function Widget:SetScrollChild(child) self.scrollChild = child end
function Widget:GetStringHeight() return math.max(14, math.ceil(#self.text / 45) * 14) end
function Widget:SetVerticalScroll(value) self.verticalScroll = value end
function Widget:ClearFocus() if self.scripts.OnEditFocusLost then self.scripts.OnEditFocusLost(self) end end
function Widget:AddLine(text) table.insert(self.lines, text) end
function Widget:AddDoubleLine(left, right) table.insert(self.lines, left .. " " .. right) end
function Widget:NumLines() return #self.lines end
function Widget:GetName() return self.name end
for _, key in ipairs({ "RegisterEvent", "SetAllPoints", "SetColorTexture", "SetJustifyH", "SetSpacing", "SetFrameStrata",
  "SetClampedToScreen", "SetMovable", "EnableMouse", "RegisterForDrag", "SetAutoFocus", "SetNumeric", "SetMaxLetters",
  "SetOwner", "StartMoving", "StopMovingOrSizing" }) do Widget[key] = function() end end
CreateFrame = function(_, name) return New(name) end
UIParent = New("UIParent"); UIParent:SetSize(1920, 1080)
DEFAULT_CHAT_FRAME = { AddMessage = function() end }
SlashCmdList = {}; UISpecialFrames = {}
GameTooltip = New("GameTooltip")
GetItemInfo = function(id) return "Item " .. id, "item:" .. id, 2, 20, 1, "Armor", "Cloth", 1, "INVTYPE_HAND", 1, 100, 4, 1, 2 end
GetItemCount = function() return 0 end
GetServerTime = function() return 1793793600 end
time = GetServerTime
local Addon = {}
assert(loadfile(root .. "DisenchantData.lua"))("WowTraderCollector", Addon)
assert(loadfile(root .. "Valuation.lua"))("WowTraderCollector", Addon)
assert(loadfile(root .. "Crafting.lua"))("WowTraderCollector", Addon)
local context = { available = true, fresh = true, clientProduct = "wow_anniversary", clientBuild = 69795,
  auctionHouseType = "alliance", realmId = "TestRealm", ageSeconds = 0, revision = {} }
Addon.GetMarketPriceContext = function() return context end
Addon.GetItemPriceQuote = function(id) return { current = id == 2589 and 100 or 10000, normal = 9000, observations = 6,
  levels = { { unitPriceCopper = 100, quantity = 100, lots = { { stackSize = 1, buyoutCopper = 100, listingCount = 100 } } } } } end
local learned = { recipeID = 100, name = "Heavy Linen Gloves", learned = true }
C_TradeSkillUI = {
  GetRecipeInfo = function() return learned end,
  GetRecipeSchematic = function() return { quantityMin = 1, quantityMax = 1, outputItemID = 4307,
    reagentSlotSchematics = { { required = true, quantityRequired = 2, dataSlotIndex = 1, reagents = { { itemID = 2589 } } } } } end,
  GetRecipeOutputItemData = function() return { itemID = 4307 } end,
  GetAllRecipeIDs = function() return {100} end,
}
assert(loadfile(root .. "ValuationUI.lua"))("WowTraderCollector", Addon)
local observer = widgets[#widgets]
observer.scripts.OnUpdate(observer, 1)
assert(WoWTraderCraftingPrices == nil, "No crafting UI is created before a profession is opened")
ProfessionsFrame = New("ProfessionsFrame")
ProfessionsFrame.CraftingPage = { SchematicForm = { GetRecipeInfo = function() return learned end },
  SelectRecipe = function() end, CreateMultipleInputBox = New() }
observer.scripts.OnUpdate(observer, 1)
local panel = WoWTraderCraftingPrices
assert(panel and panel:IsShown() and panel.content:GetText():find("Heavy Linen Gloves", 1, true))
assert(panel.content:GetText():find("Sell on AH", 1, true) and panel.content:GetText():find("Disenchant", 1, true))
assert(panel.point[4] >= 0 and panel.point[4] + panel:GetWidth() <= UIParent:GetWidth(), "The panel fits the desktop viewport")
ProfessionsFrame.CraftingPage.CreateMultipleInputBox:SetText("3")
assert(panel.quantity:GetText() == "3" and panel.content:GetText():find("3 craft(s) -> 3 item(s)", 1, true), "Native quantity changes update the panel")
panel.quantity:SetText("5"); panel.quantity:ClearFocus()
assert(panel.content:GetText():find("5 craft(s) -> 5 item(s)", 1, true), "Calculator quantity updates independently")
panel.all.scripts.OnClick(panel.all)
assert(panel.list:IsShown() and not panel.scroll:IsShown() and panel.rows[1].name:GetText() == "Heavy Linen Gloves")
panel.route.scripts.OnClick(panel.route)
assert(panel.route:GetText() == "Sort: Sell on AH >", "Profit list switches selling routes")
panel.search:SetText("not found")
assert(panel.empty:IsShown() and not panel.rows[1]:IsShown(), "Search has a real empty state")
panel.search:SetText("")
panel.rows[1].scripts.OnClick(panel.rows[1])
assert(panel.scroll:IsShown(), "Clicking a ranked recipe selects it and shows its valuation")
context.fresh = false; context.ageSeconds = 4000
observer.scripts.OnUpdate(observer, 1)
assert(panel.freshness:GetText():find("STALE", 1, true) and panel.content:GetText():find("Reference exit:", 1, true), "Stale values are clearly references")
GameTooltip:SetText("Native item")
Addon.AppendValuationTooltip(GameTooltip, { id = 4307 })
local craftText = table.concat(GameTooltip.lines, "\n")
assert(craftText:find("Cost to make / item 0g 02s 00c", 1, true), "Item tooltips show the complete material cost")
assert(craftText:find("Buy missing materials / craft 0g 02s 00c", 1, true), "Missing-material cash is separate from material value")
local count = GameTooltip:NumLines()
Addon.AppendValuationTooltip(GameTooltip, { id = 4307 })
assert(GameTooltip:NumLines() == count, "Tooltip callbacks cannot duplicate pricing lines")
GameTooltip:Hide(); GameTooltip:SetText("Native item"); GameTooltip:Show()
Addon.AppendValuationTooltip(GameTooltip, { id = 4307 })
assert(GameTooltip:NumLines() == count, "Reopening a tooltip restores its prices")
local secret = {}
issecretvalue = function(value) return value == secret end
Addon.AppendValuationTooltip(GameTooltip, { id = secret })
assert(GameTooltip:NumLines() == count, "Secret item references never reach tooltip arithmetic")
ProfessionsFrame:Hide(); observer.scripts.OnUpdate(observer, 1)
assert(not panel:IsShown(), "Closing the native profession also hides its price panel")
assert(Addon.Crafting.CostForItem(4307).perItem == 200, "Known recipe costs remain available after closing the profession")
UIParent:SetSize(1024, 700); ProfessionsFrame:Show(); observer.scripts.OnUpdate(observer, 1)
assert(panel.point[4] >= 0 and panel.point[4] + panel:GetWidth() <= UIParent:GetWidth(), "The panel also fits a compact viewport")
local registered
Enum = { TooltipDataType = { Item = 2 } }
TooltipDataProcessor = { AddTooltipPostCall = function(kind, callback) assert(kind == 2); registered = callback end }
assert(loadfile(root .. "UI.lua"))("WowTraderCollector", Addon)
assert(type(registered) == "function", "The production UI registers the modern tooltip callback")
GameTooltip:SetText("Native item"); registered(GameTooltip, { id = 4307 })
assert(table.concat(GameTooltip.lines, "\n"):find("AH after cut", 1, true), "Modern item tooltips receive the valuation")
TooltipDataProcessor = nil
ItemRefTooltip = nil; ShoppingTooltip1 = New("ShoppingTooltip1")
GameTooltip.GetItem = function() return "Gloves", "item:4307" end
assert(loadfile(root .. "UI.lua"))("WowTraderCollector", Addon)
assert(type(ShoppingTooltip1.scripts.OnTooltipSetItem) == "function", "Missing optional tooltip frames do not prevent comparison hooks")
GameTooltip:SetText("Native item"); GameTooltip.scripts.OnTooltipSetItem(GameTooltip)
assert(table.concat(GameTooltip.lines, "\n"):find("AH after cut", 1, true), "Legacy item tooltips receive the same valuation")
print("Crafting UI lifecycle, quantities, route sorting, search, native selection, stale labels, tooltip reuse and viewport controls passed")

local completeQuote = Addon.GetItemPriceQuote
Addon.GetItemPriceQuote = function(id)
  if id == 10939 then return nil end
  return completeQuote(id)
end
GameTooltip:SetText("Native item")
Addon.AppendValuationTooltip(GameTooltip, { id = 4307 })
local missingText = table.concat(GameTooltip.lines, "\n")
assert(missingText:find("Disenchant average after AH cut Material prices missing", 1, true))
assert(missingText:find("Versioned TBC distribution", 1, true), "Keep provenance alongside the failure reason")
assert(missingText:find("AH prices missing for: Item 10939", 1, true), "A missing material is named alongside the known yield evidence")
Addon.GetItemPriceQuote = completeQuote
print("Disenchant tooltip retains the reason when evidence exists but material pricing is incomplete")

Addon.GetItemPriceQuote = function(id) if id ~= 2589 then return completeQuote(id) end end
local unavailableCraft = Addon.Crafting.CostForItem(4307)
assert(unavailableCraft and unavailableCraft.perItem == nil and unavailableCraft.reason, "Missing reagent prices never become a zero crafting cost")
Addon.GetItemPriceQuote = completeQuote
local oldSchematic = C_TradeSkillUI.GetRecipeSchematic
C_TradeSkillUI.GetRecipeSchematic = function(...)
  local schematic = oldSchematic(...); schematic.quantityMin = 2; schematic.quantityMax = 2; return schematic
end
Addon.Crafting.Invalidate()
assert(Addon.Crafting.CostForItem(4307).perItem == 100 and Addon.Crafting.CostForItem(4307).perCraft == 200,
  "Multi-output crafts separate cost per item from cash per craft")
C_TradeSkillUI.GetRecipeSchematic = function(...)
  local schematic = oldSchematic(...); schematic.quantityMax = 3; return schematic
end
Addon.Crafting.Invalidate()
assert(Addon.Crafting.CostForItem(4307).perItem == nil, "Variable output never promises an exact cost per item")
C_TradeSkillUI.GetRecipeSchematic = oldSchematic
Addon.Crafting.Invalidate()
print("Craft tooltip material costs, missing prices, closed profession and output quantity controls passed")

for _, key in ipairs({ "SetToplevel", "SetTexture", "SetTextColor", "SetJustifyV", "SetScale",
  "SetStatusBarTexture", "SetStatusBarColor", "SetMinMaxValues", "SetValue" }) do
  Widget[key] = function() end
end
local scannerSnapshot = {
  providerAvailable = true, provider = "blizzard_replicate", clientVersion = "1.60.1", clientBuild = "70888",
  auctionHouseType = "alliance", auctionHouseOpen = true, throttleReady = true, cooldownRemaining = 869,
  active = true, status = "awaiting_response", responseWaitSeconds = 31, responseTimeoutSeconds = 120,
  inCombat = false, queuedScanCount = 0, progressMaximum = 0, progressValue = 0, recentScans = {},
  canScan = false, canCancel = true, canReload = false,
  quality = { marketCount = 0, reportedRowCount = 0, pricedRowCount = 0, noBuyoutRowCount = 0,
    unresolvedRowCount = 0, invalidRowCount = 0, secretRowCount = 0, completeness = 0, scanDurationMs = 0 },
}
Addon.GetScannerSnapshot = function() return scannerSnapshot end
Addon.ShowScannerPanel()
local scanner = WoWTraderScannerFrame
assert(scanner.widgets.statusTitle:GetText() == "Waiting for the auction list")
assert(scanner.widgets.statusDetail:GetText():find("31 seconds", 1, true) and
  scanner.widgets.statusDetail:GetText():find("120 seconds", 1, true), "Waiting has a truthful elapsed time and limit")
scannerSnapshot.status = "finalizing"; scannerSnapshot.resolvingCount = 14
scanner.scripts.OnUpdate(scanner, 1)
assert(scanner.widgets.statusTitle:GetText() == "Checking the remaining listings" and
  scanner.widgets.statusDetail:GetText():find("14 listings", 1, true), "Finalization has a truthful progress state")
scannerSnapshot.status = "failed"; scannerSnapshot.active = false
scannerSnapshot.failureCode = "request_timeout"; scannerSnapshot.failureReason = "No auction list arrived within 120 seconds."
scannerSnapshot.canCancel = false; scannerSnapshot.canReload = true
scanner.scripts.OnUpdate(scanner, 1)
assert(scanner.widgets.statusTitle:GetText() == "No auction list received")
assert(scanner.widgets.statusDetail:GetText() == scannerSnapshot.failureReason, "The specific failure stays visible")
assert(scanner.widgets.reloadButton.enabled and not scanner.widgets.scanButton.enabled,
  "Failure diagnostics can be saved while repeat requests stay disabled during cooldown")
print("Scanner waiting countdown, explicit timeout reason and save-diagnostics controls passed")
