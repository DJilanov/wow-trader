local clock = 1793448000
local realm = "TestRealm"
function GetServerTime() return clock end
function GetBuildInfo() return "1.60.0", "70532" end
function GetCurrentRegion() return 3 end
function GetNormalizedRealmName() return realm end
function UnitFactionGroup() return "Alliance" end
function GetItemInfo(id) return "Item " .. id end
function GetAddOnMetadata(_, key) if key == "X-WowTrader-Product" then return "wow_anniversary" end end
function CreateFrame() return { RegisterEvent = function() end, SetScript = function() end } end
DEFAULT_CHAT_FRAME = { AddMessage = function() end }
SlashCmdList = {}
date = os.date
time = function() return clock end
local Addon = {}
local root = "apps/addon/WowTraderCollector/"
assert(loadfile(root .. "MarketPolicy.lua"))("WowTraderCollector", Addon)
assert(loadfile(root .. "Collector.lua"))("WowTraderCollector", Addon)
WOW_TRADER_SAVED = { schemaVersion = 1, installationId = "test", scans = {}, marketWatchlist = {} }
local function scan(id, price, itemId, build)
  return { scanId = id, clientProduct = "wow_classic_beta", clientBuild = build or 70532,
    region = "EU", realmId = "TestRealm", auctionHouseType = "alliance", completeness = 1,
    completedAt = clock, auctionHouseStayedOpen = true,
    itemSnapshots = {{ itemId = itemId or 1, marketKey = tostring(itemId or 1),
      priceLevels = {{ unitPriceCopper = price, quantity = 100, listingCount = 5 }} }} }
end
assert(Addon.GetMarketIntelligenceSnapshot("").available == false)
local history = {}
for i = 1, 10 do history[i] = {clock - (11 - i) * 1800, 10000, 100, 5, 1} end
WOW_TRADER_MARKET_DATA = { schemaVersion = 2, modelVersion = "robust-market-signal-v1",
  clientProduct = "wow_classic_beta", clientBuild = 70532, region = "EU", realmId = "TestRealm",
  auctionHouseType = "alliance", items = { [1] = { name = "Copper", history = history } } }
table.insert(WOW_TRADER_SAVED.scans, scan("a", 10000))
assert(Addon.GetItemMarketIntelligence(1).signal == "normal")
clock = clock + 1800; table.insert(WOW_TRADER_SAVED.scans, scan("b", 6000))
assert(Addon.GetItemMarketIntelligence(1).signal == "falling", "Local scan must replace synchronized signal")
for _, id in ipairs({"c", "d"}) do clock = clock + 1800; table.insert(WOW_TRADER_SAVED.scans, scan(id, 6000)) end
local item = Addon.GetItemMarketIntelligence(1)
assert(item.signal == "bargain" and item.buy.state == "opportunity" and item.buy.quantity == 10)
assert(Addon.ToggleMarketWatch(1))
assert(#Addon.GetMarketIntelligenceSnapshot("", { onlyWatched = true, onlyBuys = true }).items == 1)
assert(Addon.GetMarketIntelligenceSnapshot("", { budgetCopper = 6000 }).items[1].buy.quantity == 1)
clock = clock + 1800; table.insert(WOW_TRADER_SAVED.scans, scan("e", 20000))
item = Addon.GetItemMarketIntelligence(1)
assert(item.current == 20000 and item.signal ~= "bargain" and item.buy.state ~= "opportunity")
table.insert(WOW_TRADER_SAVED.scans, scan("other-build", 1, 1, 70533))
assert(Addon.GetItemMarketIntelligence(1).current == 20000, "Never combine local builds")
clock = clock + 3601
assert(Addon.GetItemMarketIntelligence(1).buy.state == "stale")
realm = "OtherRealm"
assert(Addon.GetMarketIntelligenceSnapshot("").available == false, "Never combine realms")
realm = "TestRealm"; clock = clock + 1800
table.insert(WOW_TRADER_SAVED.scans, scan("missing-item", 6000, 2))
assert(Addon.GetItemMarketIntelligence(1) == nil, "Do not recommend a delisted item")
WOW_TRADER_MARKET_DATA = nil
WOW_TRADER_SAVED.scans = {}
for i = 1, 8 do clock = clock + 1800; table.insert(WOW_TRADER_SAVED.scans, scan("local-" .. i, i <= 5 and 10000 or 6000)) end
item = Addon.GetItemMarketIntelligence(1)
assert(item.signal == "bargain" and item.buy.state == "opportunity", "Local history works without a desktop pack")
local sharedHistory = {}
for i = 1, 11 do sharedHistory[i] = {clock - (11 - i) * 1800, i <= 8 and 10000 or 6000, 100, 5, 1} end
WOW_TRADER_MARKET_DATA = { schemaVersion = 2, modelVersion = "robust-market-signal-v1",
  clientProduct = "wow_classic_beta", clientBuild = 70532, region = "EU", realmId = "TestRealm",
  auctionHouseType = "alliance", sourceScanEpoch = clock + 1,
  items = { [1] = { name = "Shared Copper", history = sharedHistory,
    levels = {{ unitPriceCopper = 6000, quantity = 100, listingCount = 5 }} } } }
WOW_TRADER_SAVED.scans = {}
item = Addon.GetItemMarketIntelligence(1)
assert(item.buy.state == "opportunity", "A fresh shared depth pack works without a local scan")
table.insert(WOW_TRADER_SAVED.scans, scan("older-local", 20000))
assert(Addon.GetItemMarketIntelligence(1).current == 6000, "Older local scans cannot replace a newer shared book")
print("Addon scan refresh, budgets, watchlist, stale, scope, delisting and local-history controls passed")
