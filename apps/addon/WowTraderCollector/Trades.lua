local _, Addon = ...
local frame = CreateFrame("Frame")
local inbox, pending, ambiguous = {}, nil, false
local function Read(value)
  if type(issecretvalue) == "function" and issecretvalue(value) then return nil end
  if type(canaccessvalue) == "function" and not canaccessvalue(value) then return nil end
  return value
end
local function Number(value, minimum)
  value = Read(value)
  if type(value) ~= "number" or value < minimum or value > 9007199254740991 or value ~= math.floor(value) then return nil end
  return value
end
local function String(value)
  value = Read(value)
  if type(value) ~= "string" or value == "" then return nil end
  return value
end
local function Call(callback, ...)
  if type(callback) ~= "function" then return nil end
  local ok, value = pcall(callback, ...)
  if ok then return Read(value) end
end
local function Saved()
  if type(WOW_TRADER_SAVED) ~= "table" then return nil end
  if type(WOW_TRADER_SAVED.tradeEvents) ~= "table" then WOW_TRADER_SAVED.tradeEvents = {} end
  if type(WOW_TRADER_SAVED.watchChanges) ~= "table" then WOW_TRADER_SAVED.watchChanges = {} end
  local data = type(WOW_TRADER_ACCOUNT_DATA) == "table" and WOW_TRADER_ACCOUNT_DATA or {}
  local trades, changes = {}, {}
  for _, id in ipairs(data.acknowledgedTrades or {}) do trades[id] = true end
  for _, id in ipairs(data.acknowledgedChanges or {}) do changes[id] = true end
  local pendingTrades, pendingChanges = {}, {}
  for _, event in ipairs(WOW_TRADER_SAVED.tradeEvents) do if not trades[event.eventId] then table.insert(pendingTrades, event) end end
  for _, change in ipairs(WOW_TRADER_SAVED.watchChanges) do if not changes[change.changeId] then table.insert(pendingChanges, change) end end
  WOW_TRADER_SAVED.tradeEvents = pendingTrades;WOW_TRADER_SAVED.watchChanges = pendingChanges
  return WOW_TRADER_SAVED
end
local function KnownItemId(name)
  local found = nil
  local saved = Saved()
  for _, scan in ipairs(saved and saved.scans or {}) do
    for _, item in ipairs(scan.itemSnapshots or {}) do
      if item.itemName == name then
        if found and found ~= item.itemId then return nil end
        found = item.itemId
      end
    end
  end
  if found then return found end
  local info = (C_Item and C_Item.GetItemInfo) or GetItemInfo
  if type(info) == "function" then
    local ok, _, link = pcall(info, name)
    link = ok and String(link) or nil
    if link then return tonumber(string.match(link, "item:(%d+)")) end
  end
end
local function RefreshInbox()
  inbox = {}
  local saved = Saved()
  if not saved or not saved.tradeLedgerEnabled or type(GetInboxInvoiceInfo) ~= "function" then return end
  local count = Number(Call(GetInboxNumItems), 0)
  if not count then return end
  saved.tradeUnsupported = 0
  for index = 1, math.min(count, 100) do
    local ok, kind, itemName, _, bid, _, deposit, fee, _, _, _, quantity = pcall(GetInboxInvoiceInfo, index)
    kind = ok and String(kind) or nil
    if kind == "buyer" or kind == "seller" then
      itemName = String(itemName);bid = Number(bid, 1);deposit = Number(deposit, 0);fee = Number(fee, 0)
      quantity = Number(quantity, 1)
      local itemId = itemName and KnownItemId(itemName) or nil
      local money, attachedQuantity = nil, nil
      if type(GetInboxHeaderInfo) == "function" then
        local headerOk, _, _, _, _, value = pcall(GetInboxHeaderInfo, index)
        if headerOk then money = Number(value, 0) end
      end
      if kind == "buyer" and type(GetInboxItem) == "function" then
        local itemOk, _, id, _, units = pcall(GetInboxItem, index, 1)
        if itemOk then itemId = Number(id, 1) or itemId;attachedQuantity = Number(units, 1);quantity = attachedQuantity or quantity end
      end
      local available = (kind == "seller" and money and money > 0) or (kind == "buyer" and attachedQuantity and attachedQuantity > 0)
      if available and itemName and itemId and quantity and bid and (kind ~= "seller" or (fee and deposit and money == bid + deposit - fee)) then
        inbox[index] = { kind = kind == "seller" and "sale" or "purchase", itemId = itemId,
          itemName = itemName, quantity = quantity, amountCopper = string.format("%.0f", bid),
          auctionFeeCopper = kind == "seller" and string.format("%.0f", fee) or "0",
          depositCopper = deposit and string.format("%.0f", deposit) or nil }
      elseif available then saved.tradeUnsupported = saved.tradeUnsupported + 1 end
    end
  end
end
local function ObserveCollection(index, method)
  local saved = Saved()
  if not saved or not saved.tradeLedgerEnabled or ambiguous then return end
  index = Number(index, 1)
  if pending then
    if pending.index ~= index then
      pending = nil;ambiguous = true
      saved.tradeUnsupported = (saved.tradeUnsupported or 0) + 1
    end
    return
  end
  local entry = index and inbox[index] or nil
  if not entry or (method == "money" and entry.kind ~= "sale") or (method == "item" and entry.kind ~= "purchase") then return end
  local context = Addon.GetCollectorContext and Addon.GetCollectorContext()
  if not context then return end
  pending = { entry = entry, context = context, startedAt = time(), id = Addon.NewObservationId(), index = index }
end
local function ConfirmCollection(itemId)
  local saved = Saved()
  if not pending or not saved then return end
  local action = pending;pending = nil
  itemId = Number(itemId, 1)
  if time() - action.startedAt > 30 or (itemId and itemId ~= action.entry.itemId) then return end
  local event = action.entry
  event.eventId = action.id;event.sourceKey = "mail:" .. action.id
  event.product = action.context.clientProduct;event.clientBuild = action.context.clientBuild
  local auctionHouse = saved.tradeAuctionHouseType or "unknown"
  event.market = action.context.region .. "|" .. action.context.realmId .. "|" .. auctionHouse
  event.characterName = action.context.characterName;event.occurredAtEpoch = time();event.evidence = "mail_receipt"
  table.insert(saved.tradeEvents, event)
  while #saved.tradeEvents > 500 do table.remove(saved.tradeEvents, 1) end
end
function Addon.GetTradeLedgerStatus()
  local saved = Saved()
  return { enabled = saved and saved.tradeLedgerEnabled == true, events = saved and #saved.tradeEvents or 0,
    unsupported = saved and saved.tradeUnsupported or 0, market = saved and saved.tradeAuctionHouseType or "unknown" }
end
function Addon.SetTradeLedgerEnabled(enabled)
  local saved = Saved()
  if saved then saved.tradeLedgerEnabled = enabled == true end
  if not enabled then pending = nil;inbox = {} else RefreshInbox() end
end
function Addon.SetTradeLedgerMarket(market)
  local saved = Saved()
  if saved and (market == "alliance" or market == "horde" or market == "neutral" or market == "unknown") then saved.tradeAuctionHouseType = market end
end
frame:RegisterEvent("MAIL_SHOW")
frame:RegisterEvent("MAIL_INBOX_UPDATE")
frame:RegisterEvent("MAIL_SUCCESS")
frame:RegisterEvent("MAIL_FAILED")
frame:RegisterEvent("MAIL_CLOSED")
frame:SetScript("OnEvent", function(_, event, itemId)
  if event == "MAIL_SHOW" then ambiguous = false;RefreshInbox()
  elseif event == "MAIL_INBOX_UPDATE" then RefreshInbox()
  elseif event == "MAIL_SUCCESS" then ConfirmCollection(itemId)
  elseif event == "MAIL_FAILED" or event == "MAIL_CLOSED" then pending = nil end
end)
if type(hooksecurefunc) == "function" then
  for _, hook in ipairs({ { "TakeInboxMoney", "money" }, { "TakeInboxItem", "item" }, { "AutoLootMailItem", "all" } }) do
    if type(_G[hook[1]]) == "function" then
      local method = hook[2]
      pcall(hooksecurefunc, hook[1], function(index) ObserveCollection(index, method) end)
    end
  end
end
