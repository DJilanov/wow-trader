local ADDON_NAME, Addon = ...

local ADDON_VERSION = "0.10.0"
local SAVED_SCHEMA_VERSION = 1
local MARKET_KEY_VERSION = 1
local MAX_QUEUED_SCANS = 8
local NATIVE_ROWS_PER_FRAME = 250
local NATIVE_FRAME_BUDGET_MS = 8
local NATIVE_RESPONSE_TIMEOUT_SECONDS = 30
local NATIVE_CACHE_TIMEOUT_SECONDS = 60
local NATIVE_RETRY_DELAY_SECONDS = 0.5
local NATIVE_LOCAL_COOLDOWN_SECONDS = 15 * 60
local REGION_NAMES = {
  [1] = "US",
  [2] = "KR",
  [3] = "EU",
  [4] = "TW",
  [5] = "CN",
}

local auctionatorListener = {}
local auctionatorRegistered = false
local auctionHouseOpen = false
local scanStartedAt = nil
local scanAuctionHouseType = nil
local nativeScan = { status = "idle" }
local auctionatorScan = { status = "idle" }

Addon.version = ADDON_VERSION

local function Print(message)
  DEFAULT_CHAT_FRAME:AddMessage("|cffc9a86aWoW Trader:|r " .. message)
end

local function IsInaccessibleValue(value)
  if type(issecretvalue) == "function" and issecretvalue(value) then return true end
  if type(canaccessvalue) == "function" and not canaccessvalue(value) then return true end
  return false
end

local function ReadableValue(value)
  if IsInaccessibleValue(value) then return nil end
  if type(value) == "string" and value == "" then return nil end
  return value
end

local function ReadableString(value)
  value = ReadableValue(value)
  if type(value) ~= "string" then return nil end
  return value
end

local function ReadablePositiveInteger(value)
  if IsInaccessibleValue(value) or type(value) ~= "number" then return nil end
  if value <= 0 or value ~= math.floor(value) then return nil end
  return value
end

local function ReadableNonnegativeInteger(value)
  if IsInaccessibleValue(value) or type(value) ~= "number" then return nil end
  if value < 0 or value ~= math.floor(value) then return nil end
  return value
end

local function SafeCallOne(callback, ...)
  if type(callback) ~= "function" then return nil end
  local succeeded, value = pcall(callback, ...)
  if not succeeded then return nil end
  return ReadableValue(value)
end

local function ProfileMilliseconds()
  if type(debugprofilestop) == "function" then
    local value = SafeCallOne(debugprofilestop)
    if type(value) == "number" then return value end
  end
  local value = SafeCallOne(GetTime)
  return type(value) == "number" and value * 1000 or 0
end

local function NewUuid()
  local template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
  return string.gsub(template, "[xy]", function(character)
    local value
    if character == "x" then
      value = math.random(0, 15)
    else
      value = math.random(8, 11)
    end
    return string.format("%x", value)
  end)
end

local function GetMetadata(field)
  if C_AddOns and C_AddOns.GetAddOnMetadata then
    return C_AddOns.GetAddOnMetadata(ADDON_NAME, field)
  end
  return GetAddOnMetadata(ADDON_NAME, field)
end

local function GetClientProduct()
  local version = GetBuildInfo()
  if type(version) == "string" and string.match(version, "^1%.60%.") then
    return "wow_classic_beta"
  end
  return GetMetadata("X-WowTrader-Product") or "wow_anniversary"
end

local function GetAuctionHouseType()
  if GetAuctionHouseFaction then
    local auctionHouseFaction = SafeCallOne(GetAuctionHouseFaction)
    if auctionHouseFaction == "Neutral" then
      return "neutral"
    elseif auctionHouseFaction == "Alliance" then
      return "alliance"
    elseif auctionHouseFaction == "Horde" then
      return "horde"
    end
  end

  local playerFaction = SafeCallOne(UnitFactionGroup, "player")
  if playerFaction == "Alliance" then
    return "alliance"
  elseif playerFaction == "Horde" then
    return "horde"
  end
  return "unknown"
end

local function GetSourceCharacter()
  local name = SafeCallOne(UnitName, "player")
  local realmId = SafeCallOne(GetNormalizedRealmName) or SafeCallOne(GetRealmName)
  local factionName = SafeCallOne(UnitFactionGroup, "player")
  local faction = "unknown"
  if factionName == "Alliance" then
    faction = "alliance"
  elseif factionName == "Horde" then
    faction = "horde"
  elseif factionName == "Neutral" then
    faction = "neutral"
  end

  if type(name) ~= "string" or type(realmId) ~= "string" then return nil end
  return {
    name = name,
    realmId = realmId,
    faction = faction,
    guid = SafeCallOne(UnitGUID, "player"),
  }
end

local function InitializeSavedVariables()
  if type(WOW_TRADER_SAVED) ~= "table" or WOW_TRADER_SAVED.schemaVersion ~= SAVED_SCHEMA_VERSION then
    WOW_TRADER_SAVED = {
      schemaVersion = SAVED_SCHEMA_VERSION,
      installationId = NewUuid(),
      scans = {},
    }
  end

  if type(WOW_TRADER_SAVED.installationId) ~= "string" or WOW_TRADER_SAVED.installationId == "" then
    WOW_TRADER_SAVED.installationId = NewUuid()
  end
  if type(WOW_TRADER_SAVED.scans) ~= "table" then
    WOW_TRADER_SAVED.scans = {}
  end
  if type(WOW_TRADER_SAVED.nativeScanner) ~= "table" then
    WOW_TRADER_SAVED.nativeScanner = {}
  end
  if type(WOW_TRADER_SAVED.marketWatchlist) ~= "table" then
    WOW_TRADER_SAVED.marketWatchlist = {}
  end
  if type(WOW_TRADER_SAVED.worldDiagnostics) == "table" then
    WOW_TRADER_SAVED.worldDiagnostics.enabled = false
  end
end

local function AddListing(markets, marketKey, itemId, itemLink, stackSize, buyoutPrice)
  marketKey = ReadableString(marketKey)
  itemId = ReadablePositiveInteger(itemId)
  stackSize = ReadablePositiveInteger(stackSize)
  buyoutPrice = ReadablePositiveInteger(buyoutPrice)
  itemLink = ReadableString(itemLink)
  if marketKey == nil or itemId == nil or stackSize == nil or buyoutPrice == nil then return false end

  local unitPrice = math.ceil(buyoutPrice / stackSize)
  local market = markets[marketKey]
  if market == nil then
    market = {
      itemId = itemId,
      marketKey = marketKey,
      itemLink = itemLink,
      levels = {},
    }
    markets[marketKey] = market
  elseif market.itemLink == nil and itemLink ~= nil then
    market.itemLink = itemLink
  end

  local level = market.levels[unitPrice]
  if level == nil then
    market.levels[unitPrice] = {
      unitPriceCopper = unitPrice,
      quantity = stackSize,
      listingCount = 1,
    }
  else
    level.quantity = level.quantity + stackSize
    level.listingCount = level.listingCount + 1
  end
  return true
end

local function NormalizeMarkets(markets)
  local snapshots = {}
  for _, market in pairs(markets) do
    local priceLevels = {}
    for _, level in pairs(market.levels) do
      table.insert(priceLevels, level)
    end
    table.sort(priceLevels, function(left, right)
      return left.unitPriceCopper < right.unitPriceCopper
    end)

    table.insert(snapshots, {
      itemId = market.itemId,
      marketKey = market.marketKey,
      itemLink = market.itemLink,
      priceLevels = priceLevels,
    })
  end
  table.sort(snapshots, function(left, right)
    return left.marketKey < right.marketKey
  end)
  return snapshots
end

local function SaveScan(markets, capturedAt, completedAt, quality)
  InitializeSavedVariables()

  local _, clientBuild = GetBuildInfo()
  local itemSnapshots = NormalizeMarkets(markets)
  local scan = {
    scanId = NewUuid(),
    addonVersion = ADDON_VERSION,
    clientProduct = GetClientProduct(),
    clientBuild = tonumber(clientBuild),
    locale = GetLocale(),
    region = REGION_NAMES[GetCurrentRegion and GetCurrentRegion() or 0] or "UNKNOWN",
    realmId = SafeCallOne(GetNormalizedRealmName) or SafeCallOne(GetRealmName),
    auctionHouseType = scanAuctionHouseType or GetAuctionHouseType(),
    sourceCharacter = GetSourceCharacter(),
    capturedAt = capturedAt,
    completedAt = completedAt,
    completeness = quality.completeness,
    provider = quality.provider,
    apiFlavor = quality.apiFlavor,
    marketKeyVersion = MARKET_KEY_VERSION,
    reportedRowCount = quality.reportedRowCount,
    visitedRowCount = quality.visitedRowCount,
    pricedRowCount = quality.pricedRowCount,
    noBuyoutRowCount = quality.noBuyoutRowCount,
    unresolvedRowCount = quality.unresolvedRowCount,
    invalidRowCount = quality.invalidRowCount,
    secretRowCount = quality.secretRowCount,
    scanDurationMs = quality.scanDurationMs,
    auctionHouseStayedOpen = quality.auctionHouseStayedOpen,
    itemSnapshots = itemSnapshots,
  }

  table.insert(WOW_TRADER_SAVED.scans, scan)
  while #WOW_TRADER_SAVED.scans > MAX_QUEUED_SCANS do
    table.remove(WOW_TRADER_SAVED.scans, 1)
  end

  Print(string.format(
    "captured %d markets from %d priced rows (%d unresolved). Log out or /reload to upload.",
    #scan.itemSnapshots,
    quality.pricedRowCount,
    quality.unresolvedRowCount
  ))
  if type(Addon.PrintMarketAlerts) == "function" then Addon.PrintMarketAlerts() end
  return #itemSnapshots
end

local function IsNativeProviderAvailable()
  return GetClientProduct() == "wow_classic_beta" and type(C_AuctionHouse) == "table" and
    type(C_AuctionHouse.ReplicateItems) == "function" and
    type(C_AuctionHouse.GetNumReplicateItems) == "function" and
    type(C_AuctionHouse.GetReplicateItemInfo) == "function" and
    type(C_AuctionHouse.GetReplicateItemLink) == "function"
end

local function IsNativeScanActive()
  return nativeScan.status == "awaiting_response" or nativeScan.status == "reading" or
    nativeScan.status == "resolving_cache"
end

local function NativeElapsedMilliseconds()
  if type(nativeScan.startedProfileMs) ~= "number" then return 0 end
  return math.max(0, math.floor(ProfileMilliseconds() - nativeScan.startedProfileMs + 0.5))
end

local function NativeCompleteness()
  if nativeScan.reportedRowCount == 0 then return 1 end
  local incomplete = nativeScan.unresolvedRowCount + nativeScan.invalidRowCount +
    nativeScan.secretRowCount
  return math.max(0, math.min(1, (nativeScan.reportedRowCount - incomplete) /
    nativeScan.reportedRowCount))
end

local function NativeQuality()
  return {
    provider = "blizzard_replicate",
    apiFlavor = "c_auction_house_replicate",
    reportedRowCount = nativeScan.reportedRowCount,
    visitedRowCount = nativeScan.visitedRowCount,
    pricedRowCount = nativeScan.pricedRowCount,
    noBuyoutRowCount = nativeScan.noBuyoutRowCount,
    unresolvedRowCount = nativeScan.unresolvedRowCount,
    invalidRowCount = nativeScan.invalidRowCount,
    secretRowCount = nativeScan.secretRowCount,
    scanDurationMs = NativeElapsedMilliseconds(),
    auctionHouseStayedOpen = nativeScan.auctionHouseStayedOpen,
    completeness = NativeCompleteness(),
  }
end

local function FinishNativeScan()
  if not IsNativeScanActive() then return end
  local completedAt = time()
  local markets = nativeScan.markets
  local quality = NativeQuality()
  local marketCount = SaveScan(markets, nativeScan.capturedAt, completedAt, quality)
  InitializeSavedVariables()
  WOW_TRADER_SAVED.nativeScanner.lastSuccessfulAt = completedAt
  WOW_TRADER_SAVED.nativeScanner.lastProvider = quality.provider
  nativeScan = {
    status = "saved",
    completedAt = completedAt,
    quality = quality,
    marketCount = marketCount,
  }
end

local function AbortNativeScan(reason)
  if not IsNativeScanActive() then return false end
  nativeScan.auctionHouseStayedOpen = auctionHouseOpen
  nativeScan = {
    status = "failed",
    failureReason = reason,
    failedAt = time(),
  }
  Print(reason .. " No market snapshot was saved.")
  return true
end

local function ReadNativeRow(index)
  local succeeded, _, _, count, _, _, _, _, _, _, buyoutPrice, _, _, _, _, _, _, itemId,
    hasAllInfo = pcall(C_AuctionHouse.GetReplicateItemInfo, index)
  if not succeeded then return "invalid" end
  if IsInaccessibleValue(count) or IsInaccessibleValue(buyoutPrice) or
     IsInaccessibleValue(itemId) or IsInaccessibleValue(hasAllInfo) then
    return "secret"
  end
  if hasAllInfo ~= true then return "deferred" end

  count = ReadablePositiveInteger(count)
  itemId = ReadablePositiveInteger(itemId)
  buyoutPrice = ReadableNonnegativeInteger(buyoutPrice)
  if count == nil or itemId == nil or buyoutPrice == nil then return "invalid" end
  if buyoutPrice == 0 then return "no_buyout" end

  local linkSucceeded, itemLink = pcall(C_AuctionHouse.GetReplicateItemLink, index)
  if not linkSucceeded or IsInaccessibleValue(itemLink) then itemLink = nil end
  itemLink = ReadableString(itemLink)
  if AddListing(nativeScan.markets, tostring(itemId), itemId, itemLink, count, buyoutPrice) then
    return "priced"
  end
  return "invalid"
end

local function RecordNativeRowResult(result)
  if result == "priced" then
    nativeScan.pricedRowCount = nativeScan.pricedRowCount + 1
  elseif result == "no_buyout" then
    nativeScan.noBuyoutRowCount = nativeScan.noBuyoutRowCount + 1
  elseif result == "invalid" then
    nativeScan.invalidRowCount = nativeScan.invalidRowCount + 1
  elseif result == "secret" then
    nativeScan.secretRowCount = nativeScan.secretRowCount + 1
  end
end

local function StartNativeCachePass()
  nativeScan.status = "resolving_cache"
  nativeScan.retryQueue = nativeScan.deferredRows
  nativeScan.retryNext = {}
  nativeScan.retryCursor = 1
  nativeScan.retryNotBefore = GetTime()
  nativeScan.cacheDeadline = GetTime() + NATIVE_CACHE_TIMEOUT_SECONDS
  nativeScan.deferredRows = nil
end

local function ProcessNativeInitialRows()
  local frameStartedAt = ProfileMilliseconds()
  local processedThisFrame = 0
  while nativeScan.nextIndex < nativeScan.reportedRowCount and
        processedThisFrame < NATIVE_ROWS_PER_FRAME do
    local index = nativeScan.nextIndex
    local result = ReadNativeRow(index)
    nativeScan.visitedRowCount = nativeScan.visitedRowCount + 1
    if result == "deferred" then
      table.insert(nativeScan.deferredRows, index)
    else
      RecordNativeRowResult(result)
    end
    nativeScan.nextIndex = index + 1
    processedThisFrame = processedThisFrame + 1
    if ProfileMilliseconds() - frameStartedAt >= NATIVE_FRAME_BUDGET_MS then break end
  end

  if nativeScan.nextIndex >= nativeScan.reportedRowCount then
    if #nativeScan.deferredRows == 0 then
      FinishNativeScan()
    else
      StartNativeCachePass()
    end
  end
end

local function ProcessNativeCacheRows()
  local now = GetTime()
  if now < nativeScan.retryNotBefore then return end
  local frameStartedAt = ProfileMilliseconds()
  local processedThisFrame = 0

  while nativeScan.retryCursor <= #nativeScan.retryQueue and
        processedThisFrame < NATIVE_ROWS_PER_FRAME do
    local index = nativeScan.retryQueue[nativeScan.retryCursor]
    local result = ReadNativeRow(index)
    if result == "deferred" then
      table.insert(nativeScan.retryNext, index)
    else
      RecordNativeRowResult(result)
    end
    nativeScan.retryCursor = nativeScan.retryCursor + 1
    processedThisFrame = processedThisFrame + 1
    if ProfileMilliseconds() - frameStartedAt >= NATIVE_FRAME_BUDGET_MS then break end
  end

  if nativeScan.retryCursor <= #nativeScan.retryQueue then return end
  if #nativeScan.retryNext == 0 then
    FinishNativeScan()
    return
  end
  if now >= nativeScan.cacheDeadline then
    nativeScan.unresolvedRowCount = #nativeScan.retryNext
    FinishNativeScan()
    return
  end

  nativeScan.retryQueue = nativeScan.retryNext
  nativeScan.retryNext = {}
  nativeScan.retryCursor = 1
  nativeScan.retryNotBefore = now + NATIVE_RETRY_DELAY_SECONDS
end

local function BeginNativeResultRead()
  if nativeScan.status ~= "awaiting_response" then return end
  local count = SafeCallOne(C_AuctionHouse.GetNumReplicateItems)
  count = ReadableNonnegativeInteger(count)
  if count == nil or count > 1000000 then
    AbortNativeScan("Blizzard returned an invalid replication row count.")
    return
  end
  nativeScan.status = "reading"
  nativeScan.reportedRowCount = count
  nativeScan.nextIndex = 0
  if count == 0 then
    AbortNativeScan("Blizzard returned an empty replicated Auction House result.")
  end
end

local function NativeCooldownRemaining()
  InitializeSavedVariables()
  local lastSuccessfulAt = WOW_TRADER_SAVED.nativeScanner.lastSuccessfulAt
  if type(lastSuccessfulAt) ~= "number" then return 0 end
  return math.max(0, NATIVE_LOCAL_COOLDOWN_SECONDS - (time() - lastSuccessfulAt))
end

local function StartNativeScan()
  if not IsNativeProviderAvailable() then
    Print("the native Forever Auction House API is unavailable on this client build.")
    return
  end
  if IsNativeScanActive() then
    Print("a native market scan is already running.")
    return
  end
  if not auctionHouseOpen then
    Print("open the Auction House before starting a market scan.")
    return
  end
  if InCombatLockdown and InCombatLockdown() then
    Print("leave combat before starting a market scan.")
    return
  end

  local cooldownRemaining = NativeCooldownRemaining()
  if cooldownRemaining > 0 then
    Print(string.format("the full-scan cooldown has about %d minute(s) remaining.",
      math.ceil(cooldownRemaining / 60)))
    return
  end
  if type(C_AuctionHouse.IsThrottledMessageSystemReady) == "function" and
     SafeCallOne(C_AuctionHouse.IsThrottledMessageSystemReady) ~= true then
    Print("Blizzard's Auction House message queue is not ready yet.")
    return
  end

  scanAuctionHouseType = GetAuctionHouseType()
  nativeScan = {
    status = "awaiting_response",
    capturedAt = time(),
    startedProfileMs = ProfileMilliseconds(),
    responseDeadline = GetTime() + NATIVE_RESPONSE_TIMEOUT_SECONDS,
    auctionHouseStayedOpen = true,
    markets = {},
    deferredRows = {},
    reportedRowCount = 0,
    visitedRowCount = 0,
    pricedRowCount = 0,
    noBuyoutRowCount = 0,
    unresolvedRowCount = 0,
    invalidRowCount = 0,
    secretRowCount = 0,
  }

  local succeeded = pcall(C_AuctionHouse.ReplicateItems)
  if not succeeded then
    AbortNativeScan("Blizzard rejected the full-market request.")
    return
  end
  Print("native Forever market scan requested; waiting for Blizzard's response.")
end

local function NativeStatus()
  if nativeScan.status == "reading" then
    Print(string.format("native scan reading %d/%d rows.", nativeScan.nextIndex,
      nativeScan.reportedRowCount))
  elseif nativeScan.status == "resolving_cache" then
    local remaining = #nativeScan.retryQueue - nativeScan.retryCursor + 1
    Print(string.format("native scan resolving %d cached item row(s).", math.max(0, remaining)))
  elseif nativeScan.status == "awaiting_response" then
    Print("native scan is waiting for Blizzard's response.")
  elseif nativeScan.status == "saved" then
    Print(string.format("last native scan saved %d market(s); /reload or log out to upload.",
      nativeScan.marketCount or 0))
  elseif nativeScan.status == "failed" then
    Print("last native scan failed: " .. (nativeScan.failureReason or "unknown error"))
  else
    InitializeSavedVariables()
    Print(string.format("native scanner is idle; %d completed scan(s) queued.",
      #WOW_TRADER_SAVED.scans))
  end
end

local function NativeProbe()
  local version, build = GetBuildInfo()
  local ready = nil
  if C_AuctionHouse and type(C_AuctionHouse.IsThrottledMessageSystemReady) == "function" then
    ready = SafeCallOne(C_AuctionHouse.IsThrottledMessageSystemReady)
  end
  Print(string.format(
    "probe: product=%s version=%s build=%s native=%s ahOpen=%s throttleReady=%s scope=%s.",
    GetClientProduct(),
    tostring(version),
    tostring(build),
    IsNativeProviderAvailable() and "yes" or "no",
    auctionHouseOpen and "yes" or "no",
    ready == nil and "unknown" or (ready and "yes" or "no"),
    GetAuctionHouseType()
  ))
end

local function CaptureAuctionatorScan(rawScan)
  if type(rawScan) ~= "table" then
    auctionatorScan = { status = "failed", failureReason = "Auctionator returned invalid data." }
    Print("Auctionator returned an invalid full scan; nothing was saved.")
    return
  end

  local capturedAt = scanStartedAt or time()
  local markets = {}
  local pending = #rawScan
  local pricedRows = 0
  local invalidRows = 0
  local noBuyoutRows = 0
  local finalized = false
  local startedProfileMs = ProfileMilliseconds()
  auctionatorScan = {
    status = "reading",
    reportedRowCount = #rawScan,
    visitedRowCount = 0,
    pricedRowCount = 0,
    noBuyoutRowCount = 0,
    invalidRowCount = 0,
  }

  local function FinalizeScan()
    if finalized then return end
    finalized = true
    local completedAt = time()
    local duration = math.max(0, math.floor(ProfileMilliseconds() - startedProfileMs + 0.5))
    local marketCount = SaveScan(markets, capturedAt, completedAt, {
      provider = "auctionator",
      apiFlavor = "auctionator_full_scan",
      reportedRowCount = #rawScan,
      visitedRowCount = #rawScan,
      pricedRowCount = pricedRows,
      noBuyoutRowCount = noBuyoutRows,
      unresolvedRowCount = 0,
      invalidRowCount = invalidRows,
      secretRowCount = 0,
      scanDurationMs = duration,
      auctionHouseStayedOpen = true,
      completeness = math.max(0, 1 - invalidRows / #rawScan),
    })
    auctionatorScan = {
      status = "saved",
      completedAt = completedAt,
      marketCount = marketCount,
      quality = {
        reportedRowCount = #rawScan,
        visitedRowCount = #rawScan,
        pricedRowCount = pricedRows,
        noBuyoutRowCount = noBuyoutRows,
        unresolvedRowCount = 0,
        invalidRowCount = invalidRows,
        secretRowCount = 0,
        scanDurationMs = duration,
        completeness = math.max(0, 1 - invalidRows / #rawScan),
      },
    }
  end

  local function CompleteOne()
    pending = pending - 1
    auctionatorScan.visitedRowCount = #rawScan - pending
    auctionatorScan.pricedRowCount = pricedRows
    auctionatorScan.noBuyoutRowCount = noBuyoutRows
    auctionatorScan.invalidRowCount = invalidRows
    if pending == 0 then FinalizeScan() end
  end

  if pending == 0 then
    auctionatorScan = { status = "failed", failureReason = "Auctionator returned an empty scan." }
    Print("Auctionator returned an empty full scan; nothing was saved.")
    return
  end

  for _, entry in ipairs(rawScan) do
    local auctionInfo = type(entry) == "table" and entry.auctionInfo or nil
    local itemLink = type(entry) == "table" and ReadableString(entry.itemLink) or nil
    local itemId = type(auctionInfo) == "table" and auctionInfo[17] or nil
    local stackSize = type(auctionInfo) == "table" and auctionInfo[3] or nil
    local buyoutPrice = type(auctionInfo) == "table" and auctionInfo[10] or nil

    if itemLink == nil or not Auctionator or not Auctionator.Utilities then
      invalidRows = invalidRows + 1
      CompleteOne()
    elseif ReadableNonnegativeInteger(buyoutPrice) == 0 then
      noBuyoutRows = noBuyoutRows + 1
      CompleteOne()
    else
      Auctionator.Utilities.DBKeyFromLink(itemLink, function(databaseKeys)
        local marketKey = type(databaseKeys) == "table" and databaseKeys[1] or tostring(itemId or "")
        if AddListing(markets, marketKey, itemId, itemLink, stackSize, buyoutPrice) then
          pricedRows = pricedRows + 1
        else
          invalidRows = invalidRows + 1
        end
        CompleteOne()
      end)
    end
  end
end

function auctionatorListener:ReceiveEvent(eventName, eventData)
  if eventName == Auctionator.FullScan.Events.ScanStart then
    scanStartedAt = time()
    scanAuctionHouseType = GetAuctionHouseType()
    auctionatorScan = { status = "awaiting_response" }
  elseif eventName == Auctionator.FullScan.Events.ScanComplete then
    CaptureAuctionatorScan(eventData)
    scanStartedAt = nil
    scanAuctionHouseType = nil
  elseif eventName == Auctionator.FullScan.Events.ScanFailed then
    scanStartedAt = nil
    scanAuctionHouseType = nil
    auctionatorScan = { status = "failed", failureReason = "Auctionator's full scan failed." }
  end
end

local function AuctionatorIsAvailable()
  return Auctionator and Auctionator.EventBus and Auctionator.FullScan and Auctionator.Utilities and
    type(Auctionator.Utilities.DBKeyFromLink) == "function"
end

local function RegisterAuctionatorEvents()
  if auctionatorRegistered or not AuctionatorIsAvailable() then return end
  Auctionator.EventBus:Register(auctionatorListener, {
    Auctionator.FullScan.Events.ScanStart,
    Auctionator.FullScan.Events.ScanComplete,
    Auctionator.FullScan.Events.ScanFailed,
  })
  auctionatorRegistered = true
end

local function StartAuctionatorScan()
  if not AuctionatorIsAvailable() then
    Print("Auctionator is not installed or is incompatible; the TBC scan is unavailable.")
    return
  end
  local fullScanFrame = Auctionator.State and Auctionator.State.FullScanFrameRef
  if fullScanFrame and fullScanFrame.CanInitiate and fullScanFrame:CanInitiate() then
    fullScanFrame:InitiateScan()
  else
    Print("open the Auction House and wait until Blizzard permits a full scan.")
  end
end

local function GetLastSavedScan()
  InitializeSavedVariables()
  return WOW_TRADER_SAVED.scans[#WOW_TRADER_SAVED.scans]
end

local function SnapshotQuality(scan, marketCount)
  if type(scan) ~= "table" then
    return {
      marketCount = 0,
      reportedRowCount = 0,
      visitedRowCount = 0,
      pricedRowCount = 0,
      noBuyoutRowCount = 0,
      unresolvedRowCount = 0,
      invalidRowCount = 0,
      secretRowCount = 0,
      completeness = 0,
      scanDurationMs = 0,
    }
  end
  local pricedRowCount = scan.pricedRowCount
  if pricedRowCount == nil and type(scan.itemSnapshots) == "table" then
    pricedRowCount = 0
    for _, itemSnapshot in ipairs(scan.itemSnapshots) do
      if type(itemSnapshot) == "table" and type(itemSnapshot.priceLevels) == "table" then
        for _, priceLevel in ipairs(itemSnapshot.priceLevels) do
          pricedRowCount = pricedRowCount + (priceLevel.listingCount or 0)
        end
      end
    end
  end
  pricedRowCount = pricedRowCount or 0
  local reportedRowCount = scan.reportedRowCount or pricedRowCount
  return {
    marketCount = marketCount or (type(scan.itemSnapshots) == "table" and #scan.itemSnapshots or 0),
    reportedRowCount = reportedRowCount,
    visitedRowCount = scan.visitedRowCount or reportedRowCount,
    pricedRowCount = pricedRowCount,
    noBuyoutRowCount = scan.noBuyoutRowCount or 0,
    unresolvedRowCount = scan.unresolvedRowCount or 0,
    invalidRowCount = scan.invalidRowCount or 0,
    secretRowCount = scan.secretRowCount or 0,
    completeness = scan.completeness or 0,
    scanDurationMs = scan.scanDurationMs or 0,
  }
end

local function GetNativeSnapshotQuality()
  if IsNativeScanActive() then
    return SnapshotQuality(NativeQuality(), 0)
  elseif nativeScan.status == "saved" then
    return SnapshotQuality(nativeScan.quality, nativeScan.marketCount)
  end
  return SnapshotQuality(GetLastSavedScan())
end

local function GetAuctionatorSnapshotQuality()
  if auctionatorScan.status == "reading" then
    return SnapshotQuality(auctionatorScan, 0)
  elseif auctionatorScan.status == "saved" then
    return SnapshotQuality(auctionatorScan.quality, auctionatorScan.marketCount)
  end
  return SnapshotQuality(GetLastSavedScan())
end

function Addon.GetScannerSnapshot()
  InitializeSavedVariables()
  local nativeProvider = IsNativeProviderAvailable()
  local providerAvailable = nativeProvider or (AuctionatorIsAvailable() and true or false)
  local status = nativeProvider and nativeScan.status or auctionatorScan.status
  local quality = nativeProvider and GetNativeSnapshotQuality() or GetAuctionatorSnapshotQuality()
  local active
  if nativeProvider then
    active = IsNativeScanActive()
  else
    active = auctionatorScan.status == "awaiting_response" or auctionatorScan.status == "reading"
  end
  local cooldownRemaining = nativeProvider and NativeCooldownRemaining() or 0
  local throttleReady = nil
  if nativeProvider and type(C_AuctionHouse.IsThrottledMessageSystemReady) == "function" then
    throttleReady = SafeCallOne(C_AuctionHouse.IsThrottledMessageSystemReady)
  end
  local inCombat = InCombatLockdown and InCombatLockdown() or false
  local progressValue = 0
  local progressMaximum = quality.reportedRowCount
  local resolvingCount = 0
  if nativeProvider then
    if nativeScan.status == "reading" then
      progressValue = nativeScan.nextIndex or 0
    elseif nativeScan.status == "resolving_cache" then
      progressValue = nativeScan.reportedRowCount or 0
      resolvingCount = math.max(0, #nativeScan.retryQueue - nativeScan.retryCursor + 1)
    elseif nativeScan.status == "saved" then
      progressValue = quality.reportedRowCount
    end
  elseif auctionatorScan.status == "reading" then
    progressValue = auctionatorScan.visitedRowCount or 0
  elseif auctionatorScan.status == "saved" then
    progressValue = quality.reportedRowCount
  end

  local recentScans = {}
  for index = #WOW_TRADER_SAVED.scans, math.max(1, #WOW_TRADER_SAVED.scans - 5), -1 do
    local scan = WOW_TRADER_SAVED.scans[index]
    if type(scan) == "table" then
      local scanQuality = SnapshotQuality(scan)
      table.insert(recentScans, {
        completedAt = scan.completedAt,
        provider = scan.provider or "unknown",
        marketCount = scanQuality.marketCount,
        reportedRowCount = scanQuality.reportedRowCount,
        pricedRowCount = scanQuality.pricedRowCount,
        unresolvedRowCount = scanQuality.unresolvedRowCount,
        completeness = scanQuality.completeness,
      })
    end
  end

  local version, build = GetBuildInfo()
  return {
    addonVersion = ADDON_VERSION,
    clientVersion = tostring(version or "unknown"),
    clientBuild = tostring(build or "unknown"),
    clientProduct = GetClientProduct(),
    provider = nativeProvider and "blizzard_replicate" or "auctionator",
    providerAvailable = providerAvailable and true or false,
    auctionHouseOpen = auctionHouseOpen,
    throttleReady = throttleReady,
    cooldownRemaining = cooldownRemaining,
    inCombat = inCombat and true or false,
    status = status,
    failureReason = nativeProvider and nativeScan.failureReason or auctionatorScan.failureReason,
    active = active,
    canScan = providerAvailable and auctionHouseOpen and not active and not inCombat and
      cooldownRemaining <= 0 and throttleReady ~= false,
    canCancel = nativeProvider and active,
    canReload = #WOW_TRADER_SAVED.scans > 0 and not active and not inCombat,
    progressValue = progressValue,
    progressMaximum = progressMaximum,
    resolvingCount = resolvingCount,
    auctionHouseType = GetAuctionHouseType(),
    queuedScanCount = #WOW_TRADER_SAVED.scans,
    quality = quality,
    recentScans = recentScans,
  }
end

function Addon.StartScan()
  if IsNativeProviderAvailable() then StartNativeScan() else StartAuctionatorScan() end
end

function Addon.CancelScan()
  if not AbortNativeScan("Native market scan cancelled.") then
    Print("no native market scan is running.")
  end
end

function Addon.RunProbe()
  if IsNativeProviderAvailable() then
    NativeProbe()
  else
    local version, build = GetBuildInfo()
    Print(string.format(
      "probe: product=%s version=%s build=%s auctionator=%s ahOpen=%s scope=%s.",
      GetClientProduct(),
      tostring(version),
      tostring(build),
      AuctionatorIsAvailable() and "yes" or "no",
      auctionHouseOpen and "yes" or "no",
      GetAuctionHouseType()
    ))
  end
end

function Addon.PrintStatus()
  if IsNativeProviderAvailable() then NativeStatus() else
    InitializeSavedVariables()
    Print(string.format("Auctionator provider; %d completed scan(s) queued.",
      #WOW_TRADER_SAVED.scans))
  end
end

function Addon.SaveAndReload()
  if IsNativeScanActive() or auctionatorScan.status == "awaiting_response" or
     auctionatorScan.status == "reading" then
    Print("wait for the current market scan to finish before reloading.")
  elseif InCombatLockdown and InCombatLockdown() then
    Print("leave combat before reloading the interface.")
  else
    ReloadUI()
  end
end

local MARKET_SIGNAL_PRIORITY = {
  spike_risk = 1,
  bargain = 2,
  rising = 3,
  oversupplied = 4,
  falling = 5,
  too_thin = 6,
  normal = 7,
  collecting = 8,
}

local function LatestObservedPrice(itemId)
  local scan = GetLastSavedScan()
  if type(scan) ~= "table" or type(scan.itemSnapshots) ~= "table" then return nil end
  for _, snapshot in ipairs(scan.itemSnapshots) do
    if snapshot.itemId == itemId and snapshot.marketKey == tostring(itemId) and
       type(snapshot.priceLevels) == "table" then
      local total = 0
      for _, level in ipairs(snapshot.priceLevels) do total = total + (tonumber(level.quantity) or 0) end
      local target = math.max(1, math.ceil(total * 0.1))
      local observed = 0
      table.sort(snapshot.priceLevels, function(left, right)
        return (tonumber(left.unitPriceCopper) or 0) < (tonumber(right.unitPriceCopper) or 0)
      end)
      for _, level in ipairs(snapshot.priceLevels) do
        observed = observed + (tonumber(level.quantity) or 0)
        if observed >= target then return tonumber(level.unitPriceCopper) end
      end
    end
  end
  return nil
end

local function MarketDataCompatibility(data)
  if type(data) ~= "table" or data.schemaVersion ~= 1 or type(data.items) ~= "table" then
    return false, "No synchronized market history is installed yet."
  end
  local _, build = GetBuildInfo()
  if tonumber(data.clientBuild) ~= tonumber(build) or data.clientProduct ~= GetClientProduct() then
    return false, "The synchronized history belongs to another client build."
  end
  local region = REGION_NAMES[SafeCallOne(GetCurrentRegion) or 0] or "UNKNOWN"
  if data.region ~= region then
    return false, "The synchronized history belongs to another region."
  end
  local realmId = SafeCallOne(GetNormalizedRealmName) or SafeCallOne(GetRealmName)
  if data.realmId ~= realmId or data.auctionHouseType ~= GetAuctionHouseType() then
    return false, "The synchronized history belongs to another realm or Auction House."
  end
  return true, nil
end

function Addon.GetMarketIntelligenceSnapshot(searchText)
  InitializeSavedVariables()
  local data = WOW_TRADER_MARKET_DATA
  local compatible, reason = MarketDataCompatibility(data)
  if not compatible then
    return { available = false, reason = reason, items = {} }
  end
  local query = string.lower(string.match(searchText or "", "^%s*(.-)%s*$"))
  local items = {}
  for itemId, item in pairs(data.items) do
    local name = type(item.name) == "string" and item.name or ("Item " .. tostring(itemId))
    if query == "" or string.find(string.lower(name), query, 1, true) or
       string.find(tostring(itemId), query, 1, true) then
      local current = LatestObservedPrice(itemId) or tonumber(item.current)
      local normal = tonumber(item.normal)
      local differenceBP = item.differenceBP
      if current and normal and normal > 0 then
        differenceBP = math.floor(((current - normal) * 10000) / normal)
      end
      table.insert(items, {
        itemId = itemId,
        name = name,
        signal = item.signal or "collecting",
        observations = item.observations or 0,
        minimum = item.minimum or 6,
        current = current,
        normal = normal,
        differenceBP = differenceBP,
        quantity = item.quantity,
        listings = item.listings,
        confidenceBP = item.confidenceBP,
        watched = WOW_TRADER_SAVED.marketWatchlist[tostring(itemId)] == true,
      })
    end
  end
  table.sort(items, function(left, right)
    if left.watched ~= right.watched then return left.watched end
    local leftPriority = MARKET_SIGNAL_PRIORITY[left.signal] or 99
    local rightPriority = MARKET_SIGNAL_PRIORITY[right.signal] or 99
    if leftPriority ~= rightPriority then return leftPriority < rightPriority end
    local leftDifference = math.abs(tonumber(left.differenceBP) or 0)
    local rightDifference = math.abs(tonumber(right.differenceBP) or 0)
    if leftDifference ~= rightDifference then return leftDifference > rightDifference end
    return left.name < right.name
  end)
  return {
    available = true,
    reason = nil,
    generatedAt = data.generatedAt,
    sourceScanAt = data.sourceScanAt,
    realmId = data.realmId,
    auctionHouseType = data.auctionHouseType,
    modelVersion = data.modelVersion,
    totalItems = #items,
    items = items,
  }
end

function Addon.ToggleMarketWatch(itemId)
  InitializeSavedVariables()
  itemId = tonumber(itemId)
  if not itemId or itemId <= 0 then return false end
  local key = tostring(math.floor(itemId))
  if WOW_TRADER_SAVED.marketWatchlist[key] then
    WOW_TRADER_SAVED.marketWatchlist[key] = nil
    return false
  end
  WOW_TRADER_SAVED.marketWatchlist[key] = true
  return true
end

function Addon.PrintMarketAlerts()
  local snapshot = Addon.GetMarketIntelligenceSnapshot("")
  if not snapshot.available then return end
  local alerts = {}
  for _, item in ipairs(snapshot.items) do
    if item.watched and (item.signal == "bargain" or item.signal == "spike_risk" or
       item.signal == "falling" or item.signal == "oversupplied") then
      table.insert(alerts, item.name .. " (" .. item.signal .. ")")
      if #alerts >= 3 then break end
    end
  end
  if #alerts > 0 then Print("watchlist alerts: " .. table.concat(alerts, ", ") .. ".") end
end

function Addon.GetItemMarketIntelligence(itemId)
  itemId = tonumber(itemId)
  if not itemId then return nil end
  local snapshot = Addon.GetMarketIntelligenceSnapshot(tostring(itemId))
  if not snapshot.available then return nil end
  for _, item in ipairs(snapshot.items) do
    if item.itemId == itemId then return item, snapshot end
  end
  return nil
end

local function IsRetiredDiagnosticsCommand(command)
  return string.find(command, "diagnostics", 1, true) == 1 or
    string.find(command, "questsample", 1, true) == 1 or
    string.find(command, "questscan", 1, true) == 1 or
    string.find(command, "bossmodels", 1, true) == 1
end

SLASH_WOWTRADER1 = "/wowtrader"
SlashCmdList.WOWTRADER = function(command)
  command = string.match(command or "", "^%s*(.-)%s*$")
  local normalizedCommand = string.lower(command)
  if normalizedCommand == "probe" then
    Addon.RunProbe()
    return
  elseif normalizedCommand == "scan" then
    Addon.StartScan()
    return
  elseif normalizedCommand == "status" then
    Addon.PrintStatus()
    return
  elseif normalizedCommand == "cancel" then
    Addon.CancelScan()
    return
  elseif normalizedCommand == "minimap" then
    if type(Addon.ShowMinimapButton) == "function" then
      Addon.ShowMinimapButton()
    else
      Print("the minimap launcher is unavailable.")
    end
    return
  elseif string.find(normalizedCommand, "market", 1, true) == 1 then
    local query = string.match(command, "^[Mm][Aa][Rr][Kk][Ee][Tt]%s*(.-)%s*$") or ""
    if type(Addon.ShowMarketIntelligence) == "function" then
      Addon.ShowMarketIntelligence(query)
    else
      Print("the market intelligence panel is unavailable.")
    end
    return
  elseif string.find(normalizedCommand, "watch ", 1, true) == 1 then
    local itemId = tonumber(string.match(normalizedCommand, "^watch%s+(%d+)$"))
    if not itemId then
      Print("usage: /wowtrader watch <item ID>")
    else
      local watched = Addon.ToggleMarketWatch(itemId)
      Print(string.format("item %d %s the market watchlist.", itemId, watched and "added to" or "removed from"))
    end
    return
  elseif normalizedCommand == "ui" or normalizedCommand == "show" or
         normalizedCommand == "open" or normalizedCommand == "" then
    if type(Addon.ToggleScannerPanel) == "function" then
      Addon.ToggleScannerPanel()
    else
      Print("the scanner panel is unavailable; use probe, scan, status, or cancel.")
    end
    return
  end

  if IsRetiredDiagnosticsCommand(normalizedCommand) then
    Print("world diagnostics are not included in this market-only collector.")
    return
  end

  InitializeSavedVariables()
  Print(string.format(
    "%d market scan(s) queued. Commands: ui, market [item], watch <item ID>, minimap, probe, scan, status, cancel",
    #WOW_TRADER_SAVED.scans
  ))
end

local marketFrame = CreateFrame("Frame")
marketFrame:RegisterEvent("ADDON_LOADED")
marketFrame:RegisterEvent("PLAYER_LOGIN")
marketFrame:RegisterEvent("PLAYER_LOGOUT")
marketFrame:RegisterEvent("AUCTION_HOUSE_SHOW")
marketFrame:RegisterEvent("AUCTION_HOUSE_CLOSED")
marketFrame:SetScript("OnEvent", function(_, eventName, loadedAddonName)
  if eventName == "ADDON_LOADED" then
    if loadedAddonName == ADDON_NAME then InitializeSavedVariables() end
    return
  elseif eventName == "PLAYER_LOGIN" then
    if IsNativeProviderAvailable() then
      marketFrame:RegisterEvent("AUCTION_HOUSE_DISABLED")
      marketFrame:RegisterEvent("REPLICATE_ITEM_LIST_UPDATE")
      marketFrame:RegisterEvent("AUCTION_HOUSE_THROTTLED_MESSAGE_DROPPED")
    else
      RegisterAuctionatorEvents()
      if not AuctionatorIsAvailable() then
        Print("Auctionator is required for TBC market scans.")
      end
    end
    return
  elseif eventName == "AUCTION_HOUSE_SHOW" then
    auctionHouseOpen = true
    return
  elseif eventName == "AUCTION_HOUSE_CLOSED" or eventName == "AUCTION_HOUSE_DISABLED" then
    auctionHouseOpen = false
    if IsNativeScanActive() then
      nativeScan.auctionHouseStayedOpen = false
      AbortNativeScan("The Auction House closed before the native scan completed.")
    end
    return
  elseif eventName == "REPLICATE_ITEM_LIST_UPDATE" then
    BeginNativeResultRead()
    return
  elseif eventName == "AUCTION_HOUSE_THROTTLED_MESSAGE_DROPPED" and
         nativeScan.status == "awaiting_response" then
    AbortNativeScan("Blizzard throttled the full-market request.")
    return
  elseif eventName == "PLAYER_LOGOUT" and IsNativeScanActive() then
    nativeScan.auctionHouseStayedOpen = false
    AbortNativeScan("Logout interrupted the native market scan.")
  end
end)

marketFrame:SetScript("OnUpdate", function()
  if nativeScan.status == "awaiting_response" then
    if GetTime() >= nativeScan.responseDeadline then
      AbortNativeScan("The native market request timed out or is still on server cooldown.")
    end
  elseif nativeScan.status == "reading" then
    ProcessNativeInitialRows()
  elseif nativeScan.status == "resolving_cache" then
    ProcessNativeCacheRows()
  end
end)
