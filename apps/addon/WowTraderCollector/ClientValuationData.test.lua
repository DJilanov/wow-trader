local root = "apps/addon/WowTraderCollector/"
local Addon = {}
assert(loadfile(root .. "DisenchantData.lua"))("WowTraderCollector", Addon)
assert(loadfile(root .. "ClientValuationData.lua"))("WowTraderCollector", Addon)
assert(loadfile(root .. "Valuation.lua"))("WowTraderCollector", Addon)
local data, Value = Addon.ClientValuationData, Addon.Valuation
local context = { available = true, fresh = true, clientProduct = data.clientProduct,
  clientBuild = data.clientBuild, auctionHouseType = "alliance" }
local function Quote() return { current = 10000, normal = 10000 } end
local eligible, excluded, supported = 0, 0, 0
for id, row in pairs(data.items) do
  local result = Value.Disenchant({ itemId = id, classId = row[1], quality = row[2], itemLevel = row[3], bindType = 2 },
    context, "current", Quote)
  if row[4] then
    eligible = eligible + 1
    if row[7] then assert(not result.available, "Special disenchant loot tables must not inherit an ordinary bracket") end
    if result.available then
      supported = supported + 1
      assert(result.estimated == true, "Client eligibility must never be confused with verified loot probabilities")
      for _, material in ipairs(result.materials) do
        assert(material.itemId <= 20725, "A Forever estimate must never contain Outland materials")
      end
    end
  else
    excluded = excluded + 1
    assert(not result.available, "Client-ineligible equipment cannot produce a disenchant value")
  end
end
assert(eligible > 4000 and excluded > 1000 and supported > 3000, "Review actual client coverage, not only isolated fixtures")
local pendant = data.items[4614]
assert(pendant and not pendant[4], "Pendant of Myzrael carries the no-disenchant flag")
local gloves = data.items[4307]
assert(gloves and gloves[4] and gloves[3] == 10, "Heavy Linen Gloves match the captured launch item data")
local leggings = data.items[2865]
assert(leggings and leggings[1] == 4 and leggings[2] == 2 and leggings[3] == 21 and leggings[4],
  "Rough Bronze Leggings remain eligible in the captured client build")
local leggingsValue = Value.Disenchant({ itemId = 2865, classId = 4, quality = 2, itemLevel = 21, bindType = 2 },
  context, "current", Quote)
assert(leggingsValue.available and leggingsValue.estimated and leggingsValue.net == 38712,
  "Rough Bronze Leggings retain the complete weighted, fee-adjusted reference valuation")
assert(data.cooldownRecipes[18560], "The captured Mooncloth cooldown remains excluded even when ready")
context.clientBuild = context.clientBuild + 1
assert(not Value.Disenchant({ itemId = 4307, classId = 4, quality = 2, itemLevel = 10 }, context, "current", Quote).available,
  "A new client build must receive its own eligibility snapshot")
print(string.format("Launch client data: %d eligible, %d excluded, %d supported reference valuations; no Outland materials or cross-build eligibility", eligible, excluded, supported))
