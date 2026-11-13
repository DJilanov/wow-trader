local _, Addon = ...
local Value = {}
Addon.Valuation = Value

local MAX_MONEY = 9007199254
local pendingItems = {}

function Value.Readable(value)
  if type(issecretvalue) == "function" and issecretvalue(value) then return nil end
  if type(canaccessvalue) == "function" and not canaccessvalue(value) then return nil end
  return value
end

function Value.Integer(value, minimum, maximum)
  value = Value.Readable(value)
  if type(value) ~= "number" or value ~= value or value < minimum or value > maximum or
     value ~= math.floor(value) then return nil end
  return value
end

function Value.Call(callback, ...)
  if type(callback) ~= "function" then return nil end
  local result = { pcall(callback, ...) }
  if not result[1] then return nil end
  return Value.Readable(result[2])
end

function Value.ItemID(reference)
  reference = Value.Readable(reference)
  if type(reference) == "number" then return Value.Integer(reference, 1, 2147483647) end
  if type(reference) ~= "string" then return nil end
  return Value.Integer(tonumber(string.match(reference, "item:(%d+)")), 1, 2147483647)
end

function Value.HasVariant(reference)
  if type(Value.Readable(reference)) ~= "string" then return false end
  local payload = string.match(reference, "item:([^|]+)")
  if not payload then return false end
  local fields = {}
  for field in string.gmatch(payload .. ":", "([^:]*):") do table.insert(fields, field) end
  local suffix = tonumber(fields[7])
  local bonusCount = tonumber(fields[13])
  return (suffix ~= nil and suffix ~= 0) or (bonusCount ~= nil and bonusCount ~= 0)
end

function Value.ItemInfo(reference)
  local itemId = Value.ItemID(reference)
  if not itemId then return nil end
  local reader = C_Item and C_Item.GetItemInfo or GetItemInfo
  if type(reader) ~= "function" then return nil end
  local result = { pcall(reader, reference) }
  if not result[1] then return nil end
  local name = Value.Readable(result[2])
  if type(name) ~= "string" then
    local now = Value.Call(GetServerTime) or time()
    if not pendingItems[itemId] or now - pendingItems[itemId] >= 30 then
      pendingItems[itemId] = now
      Value.Call(C_Item and C_Item.RequestLoadItemDataByID, itemId)
    end
    return nil
  end
  return { itemId = itemId, name = name, link = Value.Readable(result[3]),
    quality = Value.Integer(result[4], 0, 8), itemLevel = Value.Integer(result[5], 0, 10000),
    vendor = Value.Integer(result[12], 0, MAX_MONEY), classId = Value.Integer(result[13], 0, 99),
    subclassId = Value.Integer(result[14], 0, 99), bindType = Value.Integer(result[15], 0, 99),
    variant = Value.HasVariant(reference) }
end

function Value.Fee(auctionHouseType)
  if auctionHouseType == "neutral" then return 1500 end
  if auctionHouseType == "alliance" or auctionHouseType == "horde" or auctionHouseType == "region" then return 500 end
  return nil
end

function Value.Net(gross, fee)
  if not Value.Integer(gross, 0, MAX_MONEY) or not Value.Integer(fee, 0, 10000) then return nil end
  return gross - math.floor(gross / 10000) * fee - math.ceil((gross % 10000) * fee / 10000)
end

function Value.Product(price, quantity)
  if not Value.Integer(price, 0, MAX_MONEY) or not Value.Integer(quantity, 0, 1000000) then return nil end
  return Value.Integer(price * quantity, 0, MAX_MONEY)
end

function Value.Price(quote, mode)
  if type(quote) ~= "table" then return nil end
  local price = quote.current
  if mode == "normal" then price = quote.normal end
  return Value.Integer(price, 1, MAX_MONEY)
end

function Value.ReagentCost(quote, quantity, mode)
  if mode == "normal" then return Value.Product(Value.Price(quote, mode), quantity) end
  if type(quote) ~= "table" or not quote.current then return nil end
  local remaining, cost = quantity, 0
  for _, level in ipairs(quote.levels or {}) do
    local units = Value.Integer(level.quantity, 1, 1000000000)
    local price = Value.Integer(level.unitPriceCopper, 1, MAX_MONEY)
    if not units or not price then return nil end
    local take = math.min(remaining, units)
    local part = Value.Product(price, take)
    if not part or not Value.Integer(cost + part, 0, MAX_MONEY) then return nil end
    cost = cost + part; remaining = remaining - take
    if remaining == 0 then return cost end
  end
  return nil
end

function Value.PurchaseCost(quote, quantity)
  if quantity == 0 then return 0, 0 end
  if type(quote) ~= "table" or not quote.current then return nil end
  local lots = {}
  for _, level in ipairs(quote.levels or {}) do
    if type(level.lots) ~= "table" then return nil end
    for _, lot in ipairs(level.lots) do
      local size = Value.Integer(lot.stackSize, 1, 1000000)
      local price = Value.Integer(tonumber(Value.Readable(lot.buyoutCopper)), 1, MAX_MONEY)
      local count = Value.Integer(lot.listingCount, 1, 1000000000)
      if not size or not price or not count then return nil end
      table.insert(lots, { size = size, price = price, count = count })
    end
  end
  local bestCost, bestQuantity
  -- Two bounded feasible budgets avoid presenting fractional auction stacks as spendable gold.
  for _, byUnit in ipairs({ true, false }) do
    table.sort(lots, function(a, b)
      local left, right = byUnit and a.price / a.size or a.price, byUnit and b.price / b.size or b.price
      if left ~= right then return left < right end
      return a.size < b.size
    end)
    local units, cost = 0, 0
    for _, lot in ipairs(lots) do
      local take = math.min(lot.count, math.ceil((quantity - units) / lot.size))
      local part = Value.Product(lot.price, take)
      if not part or not Value.Integer(cost + part, 0, MAX_MONEY) then break end
      units = units + take * lot.size; cost = cost + part
      if units >= quantity then
        if not bestCost or cost < bestCost then bestCost = cost; bestQuantity = units end
        break
      end
    end
  end
  return bestCost, bestQuantity
end

function Value.Disenchant(info, context, mode, getQuote)
  local result = { available = false, reason = "This item has no supported disenchant bracket.", materials = {} }
  if not info or not info.itemLevel or not info.classId or not info.quality then
    result.reason = "Waiting for item information."; return result
  end
  if info.bindType == 4 or (info.classId ~= 2 and info.classId ~= 4) or info.quality < 2 or info.quality > 4 then return result end
  local data = Addon.DisenchantData
  if not data then result.reason = "Reinstall the Collector to load its disenchant model."; return result end
  local verified = context.clientProduct == data.verifiedProduct and context.clientBuild == data.verifiedBuild
  local reference = context.clientProduct == "wow_classic_beta"
  if not verified and not reference then return result end
  local referenceLevel = info.itemLevel
  local eligibility
  if reference then
    local client = Addon.ClientValuationData
    local synced = WOW_TRADER_MARKET_DATA and WOW_TRADER_MARKET_DATA.clientValuation
    if synced and synced.clientProduct == context.clientProduct and synced.clientBuild == context.clientBuild then
      client = synced
    end
    if not client or client.clientProduct ~= context.clientProduct or client.clientBuild ~= context.clientBuild then
      result.reasonCode = "client_data_mismatch"
      result.reason = string.format("Disenchant data covers build %s; game build is %s. Update the Collector.",
        tostring(client and client.clientBuild or "unknown"), tostring(context.clientBuild or "unknown"))
      return result
    end
    eligibility = client.items[info.itemId]
    if not eligibility then result.reason = "This item's disenchant eligibility has not been captured."; return result end
    if eligibility[1] ~= info.classId or eligibility[2] ~= info.quality or eligibility[3] ~= info.itemLevel then
      result.reason = "Item information changed; its disenchant model needs a refresh."; return result
    end
    if eligibility[4] ~= true then result.reason = "Client data marks this item as non-disenchantable."; return result end
    if eligibility[7] == true then
      result.reason = "This item uses a special disenchant loot table; its distribution is unavailable."; return result
    end
    if info.classId == 2 and info.quality == 2 and info.itemLevel >= 21 and info.itemLevel <= 30 then
      result.reason = "Reported weapon disenchant inconsistencies in this bracket; value withheld pending verification."; return result
    end
    referenceLevel = eligibility[6]
    if not Value.Integer(referenceLevel, 1, data.referenceMaximumLevel) then
      result.reason = "No Classic-era yield estimate for this item bracket."; return result
    end
  end
  local row = data.rows[info.classId .. ":" .. info.quality .. ":" .. referenceLevel]
  if not row then return result end
  result.estimated = not verified
  result.modelVersion = data.version
  result.requiredSkill = verified and row.skill or (eligibility and eligibility[5] > 0 and eligibility[5] or nil)
  result.evidence = verified and "Versioned TBC distribution" or "Classic-era yield estimate; eligibility checked against this Forever build"
  local gross, net = 0, 0
  local fee = Value.Fee(context.auctionHouseType)
  local missing, invalidPrice = {}, false
  for _, material in ipairs(row.materials) do
    local price = Value.Price(getQuote(material[1]), mode)
    local expected = material[2] / material[3]
    local amount = price and Value.Integer(math.floor(price * expected), 0, MAX_MONEY) or nil
    local proceeds = amount and fee and Value.Net(amount, fee) or nil
    table.insert(result.materials, { itemId = material[1], expectedQuantity = expected, price = price, value = amount })
    if price == nil then table.insert(missing, material[1])
    elseif amount == nil or (fee and proceeds == nil) then invalidPrice = true end
    if proceeds ~= nil then gross = gross + amount; net = net + proceeds end
  end
  if not fee then
    result.reasonCode = "unknown_ah_fee"
    result.reason = "The Auction House cut is unknown; expected materials are still shown."
    return result
  end
  if #missing > 0 then
    result.reasonCode = "missing_material_prices"
    result.missingMaterialIds = missing
    result.reason = string.format("Missing %s AH prices for material item IDs: %s.",
      mode == "normal" and "historical" or "current", table.concat(missing, ", "))
    return result
  end
  if invalidPrice then result.reason = "A disenchant material price exceeds the supported range."; return result end
  if not Value.Integer(gross, 0, MAX_MONEY) or not Value.Integer(net, 0, MAX_MONEY) then return result end
  result.available = true; result.gross = gross; result.net = net; result.reason = nil
  return result
end

function Value.Item(reference, quantity, mode, options)
  options = options or {}
  quantity = Value.Integer(quantity or 1, 1, 1000000)
  mode = mode == "normal" and "normal" or "current"
  local itemId = Value.ItemID(reference)
  local context = options.context or Addon.GetMarketPriceContext()
  local getQuote = options.getQuote or Addon.GetItemPriceQuote
  local info = options.info or Value.ItemInfo(reference)
  local result = { itemId = itemId, info = info, context = context, quantity = quantity, mode = mode,
    available = info ~= nil and quantity ~= nil, auction = {}, disenchant = { available = false, materials = {} } }
  if not itemId or not quantity then result.reason = "Invalid item or quantity."; return result end
  result.vendor = info and Value.Product(info.vendor, quantity) or nil
  local quote = getQuote(itemId)
  result.quote = quote
  local fee = Value.Fee(context.auctionHouseType)
  local price = Value.Price(quote, mode)
  local cannotSell = info and (info.bindType == 1 or info.bindType == 4 or info.bindType == 7 or info.bindType == 8)
  if cannotSell or options.bound then result.auction.reason = "Bound item: cannot be sold on the AH."
  elseif (info and info.variant) or Value.HasVariant(reference) then result.auction.reason = "A variant-specific AH price is unavailable."
  elseif not context.available or not price then result.auction.reason = context.reason or "No matching AH price."
  elseif not fee then result.auction.reason = "The Auction House fee is unknown."
  else
    result.auction.gross = Value.Product(price, quantity)
    result.auction.net = Value.Net(result.auction.gross, fee)
  end
  result.disenchant = Value.Disenchant(info, context, mode, getQuote)
  if result.disenchant.available then
    result.disenchant.gross = Value.Product(result.disenchant.gross, quantity)
    result.disenchant.net = Value.Product(result.disenchant.net, quantity)
    if result.disenchant.net == nil then result.disenchant.available = false end
  end
  return result
end

function Value.Recipe(recipe, craftCount, mode, options)
  options = options or {}
  craftCount = Value.Integer(craftCount or 1, 1, 10000)
  mode = mode == "normal" and "normal" or "current"
  local result = { recipe = recipe, craftCount = craftCount, mode = mode, reagents = {}, routes = {}, available = false }
  if not craftCount then result.reason = "Choose between 1 and 10,000 crafts."; return result end
  local context = options.context or Addon.GetMarketPriceContext()
  local getQuote = options.getQuote or Addon.GetItemPriceQuote
  result.context = context
  local total, additional, complete = 0, 0, recipe.complete ~= false
  local combined = {}
  for _, reagent in ipairs(recipe.reagents or {}) do
    local id = Value.Integer(reagent.itemId, 1, 2147483647)
    local count = Value.Product(Value.Integer(reagent.quantity, 1, 1000000), craftCount)
    if not id or not count then complete = false
    else combined[id] = (combined[id] or 0) + count end
  end
  local ids = {}; for id in pairs(combined) do table.insert(ids, id) end; table.sort(ids)
  for _, id in ipairs(ids) do
    local count = combined[id]
    local owned = Value.Integer(Value.Call((C_Item and C_Item.GetItemCount) or GetItemCount, id, false), 0, 1000000000) or 0
    local quote = getQuote(id)
    local cost = Value.ReagentCost(quote, count, mode)
    local missing = math.max(0, count - owned)
    local cash, purchased
    if missing == 0 then cash = 0; purchased = 0
    elseif mode == "normal" then cash = Value.ReagentCost(quote, missing, mode)
    else cash, purchased = Value.PurchaseCost(quote, missing) end
    local vendor = options.getVendor and options.getVendor(id)
    if vendor and vendor.availableQuantity == -1 and Value.Integer(vendor.unitPrice, 1, MAX_MONEY) then
      local vendorCost, vendorCash = Value.Product(vendor.unitPrice, count), Value.Product(vendor.unitPrice, missing)
      if vendorCost and (not cost or vendorCost < cost) then cost = vendorCost end
      if vendorCash and (not cash or vendorCash < cash) then cash = vendorCash; purchased = missing end
    end
    local info = Value.ItemInfo(id)
    table.insert(result.reagents, { itemId = id, name = info and info.name or ("Item " .. id),
      quantity = count, owned = owned, missing = missing, cost = cost, cash = cash,
      purchased = purchased, leftover = purchased and purchased - missing or nil })
    if cost == nil then complete = false else total = total + cost end
    if cash == nil then additional = nil elseif additional then additional = additional + cash end
  end
  result.additionalCost = additional
  if not Value.Integer(total, 0, MAX_MONEY) then complete = false end
  result.cost = complete and total or nil
  local minimum = Value.Integer(recipe.quantityMin, 1, 1000000)
  local maximum = Value.Integer(recipe.quantityMax, 1, 1000000)
  if not minimum or not maximum or minimum ~= maximum then
    result.reason = "Variable or unknown output: a guaranteed craft profit cannot be calculated."; return result
  end
  if not recipe.outputItemId then result.reason = "This recipe has no directly sellable item output."; return result end
  local outputQuantity = Value.Product(minimum, craftCount)
  if not Value.Integer(outputQuantity, 1, 1000000) then
    result.reason = "The selected quantity exceeds the supported output limit."; return result
  end
  result.outputQuantity = outputQuantity
  result.output = Value.Item(recipe.outputLink or recipe.outputItemId, outputQuantity, mode,
    { context = context, getQuote = getQuote, info = options.outputInfo })
  local candidates = { { key = "auction", proceeds = result.output.auction.net },
    { key = "disenchant", proceeds = result.output.disenchant.available and result.output.disenchant.net or nil,
      estimated = result.output.disenchant.estimated }, { key = "vendor", proceeds = result.output.vendor } }
  local marketUsable = context.available and (mode == "normal" or context.fresh)
  for _, route in ipairs(candidates) do
    route.profit = complete and route.proceeds ~= nil and route.proceeds - total or nil
    route.actionable = route.profit ~= nil and marketUsable and mode == "current" and not recipe.cooldownExcluded
    result.routes[route.key] = route
    if route.profit ~= nil and (not result.best or route.profit > result.best.profit) then result.best = route end
  end
  result.available = result.best ~= nil
  if recipe.cooldownExcluded then result.reason = "Cooldown recipe: excluded from repeatable profit rankings."
  elseif not complete then result.reason = recipe.reason or "Missing reagent prices or recipe information."
  elseif not context.available then result.reason = context.reason
  elseif not context.fresh then result.reason = "Prices are stale. Scan and synchronize before acting."
  elseif mode == "normal" then result.reason = "Historical normal prices are a planning estimate."
  else result.reason = "Estimated profit after AH cut, before deposits. Owned materials are valued." end
  result.rankable = result.available and complete and marketUsable and not recipe.cooldownExcluded
  return result
end
