local _, Addon = ...
local Policy = {}
Addon.MarketPolicy = Policy

-- Conservative bound keeps all money * quantity * basis-point arithmetic exact in Lua 5.1.
local MAX_PRICE = 9007199254
local function Integer(value, minimum, maximum)
  value = tonumber(value)
  if type(value) ~= "number" or value ~= value or value < minimum or value > maximum or value ~= math.floor(value) then return nil end
  return value
end
Policy.Integer = Integer

local function Median(values, round)
  table.sort(values)
  local middle = math.floor(#values / 2) + 1
  if #values % 2 == 1 then return values[middle] end
  return math.floor((values[middle - 1] + values[middle]) / 2 + (round and 0.5 or 0))
end

-- Observation columns: Unix time, p10 ask, available units, listing count, completeness.
function Policy.Analyze(observations)
  local buckets = {}
  local latest = 0
  for _, row in ipairs(observations) do
    local timestamp = tonumber(row[1])
    if not timestamp or timestamp ~= timestamp or timestamp < 1 or timestamp > 9007199254740 then timestamp = nil end
    local price = Integer(row[2], 1, MAX_PRICE)
    local quantity = Integer(row[3], 0, 1000000000)
    local listings = Integer(row[4], 0, 1000000000)
    local completeness = tonumber(row[5])
    if timestamp and price and quantity and listings and completeness and completeness >= 0.98 and completeness <= 1 then
      local key = math.floor(timestamp / 1800)
      local old = buckets[key]
      if not old or timestamp > old[1] or (timestamp == old[1] and completeness > old[5]) then
        buckets[key] = { timestamp, price, quantity, listings, completeness }
      end
      latest = math.max(latest, timestamp)
    end
  end
  local history = {}
  for _, row in pairs(buckets) do
    if row[1] >= latest - 604800 then table.insert(history, row) end
  end
  table.sort(history, function(left, right) return left[1] < right[1] end)
  while #history > 336 do table.remove(history, 1) end
  if #history < 6 then return { status = "collecting", observations = #history, minimum = 6 } end
  local prices, quantities = {}, {}
  local completeness = 0
  for _, row in ipairs(history) do
    table.insert(prices, row[2]); table.insert(quantities, row[3]); completeness = completeness + row[5]
  end
  local normal = Median(prices, false)
  local normalQuantity = Median(quantities, true)
  local deviations = {}
  for _, row in ipairs(history) do table.insert(deviations, math.abs(row[2] - normal)) end
  local band = math.max(1, math.floor(normal / 20), Median(deviations, false) * 2)
  local low, high = math.max(1, normal - band), normal + band
  local current = history[#history]
  local supply = normalQuantity == 0 and 10000 or math.floor(current[3] / normalQuantity * 10000 + 0.5)
  local thin = current[4] <= 2 or current[3] < math.max(3, math.floor(normalQuantity * 0.25))
  local first = history[#history - 2][2]
  local middle = history[#history - 1][2]
  local last = current[2]
  local direction = "flat"
  local threshold = math.max(1, math.floor(band / 2))
  if first <= middle and middle <= last and last - first > threshold then direction = "up" end
  if first >= middle and middle >= last and first - last > threshold then direction = "down" end
  local signal = thin and "too_thin" or "normal"
  if last > high then
    if thin or supply <= 6000 then signal = "spike_risk"
    elseif direction == "up" then signal = "rising" end
  elseif last < low then
    if supply >= 15000 then signal = "oversupplied"
    elseif direction == "down" then signal = "falling"
    elseif not thin then signal = "bargain" end
  end
  return {
    status = "available", observations = #history, minimum = 6, signal = signal,
    current = last, normal = normal, low = low, high = high, normalQuantity = normalQuantity,
    quantity = current[3], listings = current[4], supplyBP = supply, direction = direction,
    differenceBP = math.modf((last - normal) * 10000 / normal),
    confidenceBP = math.min(10000, math.min(5000, math.floor(#history / 48 * 5000)) +
      math.floor(completeness / #history * 3000) + math.min(2000, current[4] * 200 + math.min(1000, current[3] * 20))),
  }
end

function Policy.Summarize(levels)
  local sorted, quantity, listings = {}, 0, 0
  for _, level in ipairs(levels or {}) do
    local price = Integer(level.unitPriceCopper, 1, MAX_PRICE)
    local units = Integer(level.quantity, 1, 1000000000)
    local count = Integer(level.listingCount, 1, 1000000000)
    if not price or not units or not count then return nil end
    table.insert(sorted, { unitPriceCopper = price, quantity = units, listingCount = count })
    quantity = quantity + units; listings = listings + count
  end
  if quantity == 0 or quantity > 1000000000 or listings > 1000000000 then return nil end
  table.sort(sorted, function(left, right) return left.unitPriceCopper < right.unitPriceCopper end)
  local target, total = math.max(1, math.ceil(quantity * 0.1)), 0
  for _, level in ipairs(sorted) do
    total = total + level.quantity
    if total >= target then return { current = level.unitPriceCopper, quantity = quantity, listings = listings, levels = sorted } end
  end
  return nil
end

function Policy.Quote(intelligence, levels, observedAt, now, auctionHouseType, budget, maximumQuantity)
  local fee = auctionHouseType == "neutral" and 1500 or
    ((auctionHouseType == "alliance" or auctionHouseType == "horde" or auctionHouseType == "region") and 500 or nil)
  local result = { state = "unavailable", reason = "A known Auction House fee and usable prices are required.",
    quantity = 0, buyCost = 0, grossResale = 0, auctionFee = 0, netResale = 0, profit = 0, returnBP = 0, feeBP = fee }
  local age = now - (tonumber(observedAt) or 0)
  if age < -300 or age > 3600 then
    result.state = "stale"; result.reason = "Scan again: buy suggestions require prices less than one hour old."; return result
  end
  if intelligence.status ~= "available" then
    result.state = "collecting"; result.reason = string.format("Collecting %d/6 independent half-hour observations.", intelligence.observations or 0); return result
  end
  local book = Policy.Summarize(levels)
  if not fee or not book then return result end
  if book.listings < 3 or book.quantity < math.max(3, math.floor(intelligence.normalQuantity * 0.25)) then
    result.reason = "There is too little current listed supply to size a buy."; return result
  end
  local target = intelligence.low
  if not Integer(target, 1, MAX_PRICE) or not Integer(intelligence.normal, 1, MAX_PRICE) then return result end
  local netUnit = target - math.ceil(target * fee / 10000)
  local ceiling = math.min(math.floor(netUnit * 10000 / 12000), math.floor(intelligence.normal * 8500 / 10000))
  result.targetResale = target; result.maximumBuy = ceiling
  if intelligence.signal ~= "normal" and intelligence.signal ~= "bargain" then
    result.state = "wait"; result.reason = "Wait: falling, inflated, oversupplied or thin markets do not qualify for a buy suggestion."; return result
  end
  if intelligence.listings < 3 or ceiling <= 0 then return result end
  local maximum = Integer(maximumQuantity or 100, 1, 100)
  if not maximum or (budget ~= nil and not Integer(budget, 0, 9007199254740991)) then return result end
  local cap = math.min(maximum, math.max(1, math.floor(intelligence.normalQuantity * 1000 / 10000)))
  for _, level in ipairs(book.levels) do
    if level.unitPriceCopper > ceiling or result.quantity >= cap then break end
    local units = math.min(level.quantity, cap - result.quantity)
    if budget ~= nil then units = math.min(units, math.floor((budget - result.buyCost) / level.unitPriceCopper)) end
    result.quantity = result.quantity + units; result.buyCost = result.buyCost + units * level.unitPriceCopper
    if units < level.quantity and budget ~= nil then break end
  end
  if result.quantity == 0 then
    result.state = "wait"; result.reason = "No listed units fit the buy ceiling, quantity cap and budget."; return result
  end
  result.grossResale = target * result.quantity
  result.auctionFee = math.ceil(result.grossResale * fee / 10000)
  result.netResale = result.grossResale - result.auctionFee
  result.profit = result.netResale - result.buyCost
  result.returnBP = math.floor(result.profit * 10000 / result.buyCost)
  result.state = "opportunity"
  result.reason = "Below the buy ceiling, with a conservative resale target. Verify the actual auction stacks before buying."
  return result
end
