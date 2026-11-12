local root = "apps/addon/WowTraderCollector/"
local checks = 0
local function Check(value, message) checks = checks + 1; assert(value, message) end

local function Scenario(options)
  options = options or {}
  local clock, requests, loaded, frame, requestCalls = 100, {}, {}, nil, 0
  local events, registered, cacheOrder = {}, {}, {}
  local profile = 0
  local rows, missing = options.rows or 100, options.missing or 0
  local unique = options.unique or 64
  local readyOverride
  local function Id(index) return 1000 + index % unique end
  local function Ready(index)
    if type(readyOverride) == "function" then return readyOverride(index) end
    if readyOverride ~= nil then return readyOverride end
    if index >= missing then return true end
    if options.neverReady then return false end
    return loaded[Id(index)] ~= nil and clock >= loaded[Id(index)]
  end
  GetTime = function() return clock end
  time = function() return 1794280000 + math.floor(clock) end
  GetServerTime = time
  debugprofilestop = function() return clock * 1000 + profile end
  GetBuildInfo = function() return "1.60.1", "70862" end
  GetCurrentRegion = function() return 3 end
  GetNormalizedRealmName = function() return "TestRealm" end
  UnitName = function() return "TestPlayer" end
  UnitFactionGroup = function() return "Alliance" end
  GetLocale = function() return "enUS" end
  GetAddOnMetadata = function() return "wow_anniversary" end
  InCombatLockdown = function() return false end
  DEFAULT_CHAT_FRAME = { AddMessage = function() end }
  SlashCmdList = {}
  date = os.date
  issecretvalue = function(value) return type(value) == "table" and value.secret == true end
  canaccessvalue = nil
  CreateFrame = function()
    frame = { RegisterEvent = function(_, event) registered[event] = true end,
      SetScript = function(self, key, callback) self[key] = callback end }
    return frame
  end
  local function Load(id)
    requestCalls = requestCalls + 1
    profile = profile + (options.requestCostMs or 0)
    if options.requestFails then error("Item data request failed") end
    requests[id] = (requests[id] or 0) + 1
    if options.dropFirst and requests[id] == 1 then return end
    if options.failFirst and requests[id] == 1 then
      table.insert(events, { at = clock + 0.1, id = id, success = false })
      return
    end
    if not options.neverLoaded then
      if options.cacheCapacity and not loaded[id] then
        table.insert(cacheOrder, id)
        if #cacheOrder > options.cacheCapacity then loaded[table.remove(cacheOrder, 1)] = nil end
      end
      loaded[id] = loaded[id] or clock + (options.loadDelay or 0)
    end
    if options.loadEvents and not options.neverLoaded then
      table.insert(events, { at = loaded[id], id = id, success = true })
    end
  end
  GetItemInfo = function(reference)
    if options.fallback then Load(tonumber(reference) or tonumber(reference:match("item:(%d+)"))) end
    return "Test item"
  end
  C_Item = {
    RequestLoadItemDataByID = not options.fallback and Load or nil,
    IsItemDataCachedByID = function(id) return loaded[id] ~= nil and clock >= loaded[id] end,
  }
  local replicateCalls = 0
  C_AuctionHouse = {
    ReplicateItems = function()
      replicateCalls = replicateCalls + 1
      if options.replicateFails then error("Rejected full-market call") end
      if options.synchronousResponse then frame.OnEvent(frame, "REPLICATE_ITEM_LIST_UPDATE") end
      if options.synchronousThrottle then frame.OnEvent(frame, "AUCTION_HOUSE_THROTTLED_MESSAGE_DROPPED") end
    end,
    GetNumReplicateItems = function() return rows end,
    IsThrottledMessageSystemReady = function() return true end,
    GetReplicateItemInfo = function(index)
      local count = options.secret and { secret = true } or 2
      local id = Id(index)
      if options.missingId then id = nil end
      local ready = Ready(index)
      local buyout = index >= rows - (options.bidOnly or 0) and 0 or 200
      return "Test item", 1, count, 2, true, 20, "", 100, 1, buyout, 0, nil, nil, nil, nil, 0, id, ready
    end,
    GetReplicateItemLink = function(index)
      if options.missingId then return nil end
      return "item:" .. Id(index)
    end,
  }
  WOW_TRADER_SAVED = { schemaVersion = 1, installationId = "native-cache-regression", scans = {} }
  WOW_TRADER_MARKET_DATA = nil
  local function Reload()
    local addon = {}
    assert(loadfile(root .. "MarketPolicy.lua"))("WowTraderCollector", addon)
    assert(loadfile(root .. "NativeItemCache.lua"))("WowTraderCollector", addon)
    assert(loadfile(root .. "NativePendingRows.lua"))("WowTraderCollector", addon)
    assert(loadfile(root .. "Collector.lua"))("WowTraderCollector", addon)
    frame.OnEvent(frame, "PLAYER_LOGIN")
    frame.OnEvent(frame, "AUCTION_HOUSE_SHOW")
    return addon
  end
  local Addon = Reload()
  Addon.StartScan()
  if not options.deferResponse then frame.OnEvent(frame, "REPLICATE_ITEM_LIST_UPDATE") end
  local function Tick(seconds)
    clock = clock + (seconds or 0.05)
    for index = #events, 1, -1 do
      local event = events[index]
      if event.at <= clock then
        table.remove(events, index)
        frame.OnEvent(frame, "ITEM_DATA_LOAD_RESULT", event.id, event.success)
        frame.OnEvent(frame, "GET_ITEM_INFO_RECEIVED", event.id, event.success)
      end
    end
    frame.OnUpdate(frame)
  end
  return {
    addon = Addon, requests = requests, tick = Tick, id = Id, registered = registered, reload = Reload,
    setReady = function(value) readyOverride = value end,
    event = function(event) frame.OnEvent(frame, event) end,
    requestCalls = function() return requestCalls end,
    replicateCalls = function() return replicateCalls end,
    run = function()
      for _ = 1, 10000 do
        if not Addon.GetScannerSnapshot().active then return WOW_TRADER_SAVED.scans[1] end
        Tick()
      end
      error("Native scan did not terminate")
    end,
  }
end

local scenario = Scenario({ rows = 100, deferResponse = true })
scenario.tick(31)
Check(scenario.addon.GetScannerSnapshot().status == "awaiting_response",
  "A server response slower than 30 seconds must still have time to arrive")
scenario.event("REPLICATE_ITEM_LIST_UPDATE")
Check(scenario.run().completeness == 1, "A delayed response is read without issuing another full-market request")
Check(scenario.replicateCalls() == 1, "Waiting longer must not repeat the request")

scenario = Scenario({ rows = 100, deferResponse = true })
scenario.tick(119)
Check(scenario.addon.GetScannerSnapshot().responseWaitSeconds == 119,
  "The request wait remains visible until its explicit deadline")
scenario.tick(1)
local failed = scenario.addon.GetScannerSnapshot()
Check(failed.status == "failed" and failed.failureCode == "request_timeout",
  "A missing response terminates at 120 seconds with a specific failure code")
Check(failed.canReload and #WOW_TRADER_SAVED.scans == 0,
  "Failure diagnostics can be saved without fabricating an empty market scan")
Check(failed.cooldownRemaining == 780 and not failed.canScan,
  "A timed-out issued request retains the remaining fifteen-minute cooldown")
Check(WOW_TRADER_SAVED.nativeScanner.lastFailure.stage == "awaiting_response" and
  WOW_TRADER_SAVED.nativeScanner.lastFailure.durationMs == 120000,
  "The failure stores its exact stage and elapsed time")
scenario.addon.StartScan()
scenario.event("REPLICATE_ITEM_LIST_UPDATE")
Check(scenario.replicateCalls() == 1 and #WOW_TRADER_SAVED.scans == 0,
  "Immediate retries and late unsolicited results cannot issue or save another scan")
local restored = scenario.reload()
Check(restored.GetScannerSnapshot().failureCode == "request_timeout" and not restored.GetScannerSnapshot().canScan,
  "Reload preserves the failure explanation and request cooldown")
restored.StartScan()
Check(scenario.replicateCalls() == 1, "Reload cannot bypass the request cooldown")
scenario.tick(780)
Check(restored.GetScannerSnapshot().canScan, "The failed-request cooldown expires normally")
restored.StartScan()
scenario.event("REPLICATE_ITEM_LIST_UPDATE")
scenario.tick()
Check(#WOW_TRADER_SAVED.scans == 1 and restored.GetScannerSnapshot().status == "saved",
  "One manual retry after cooldown can save the returned list")
restored = scenario.reload()
Check(restored.GetScannerSnapshot().status == "idle", "A successful scan supersedes a persisted failure")

scenario = Scenario({ rows = 100, deferResponse = true })
scenario.tick(120)
scenario.addon.StartScan()
Check(scenario.replicateCalls() == 1, "No automatic request is generated when the response deadline expires")

scenario = Scenario({ rows = 100, deferResponse = true })
scenario.event("AUCTION_HOUSE_CLOSED")
scenario.event("REPLICATE_ITEM_LIST_UPDATE")
Check(scenario.addon.GetScannerSnapshot().failureCode == "ah_closed" and #WOW_TRADER_SAVED.scans == 0,
  "Closing the AH while waiting never saves a later response")

scenario = Scenario({ rows = 100, deferResponse = true, replicateFails = true })
Check(scenario.addon.GetScannerSnapshot().failureCode == "request_rejected" and
  scenario.addon.GetScannerSnapshot().cooldownRemaining == 0,
  "An API call that throws does not create a false issued-request cooldown")

scenario = Scenario({ rows = 100, deferResponse = true, synchronousResponse = true })
Check(scenario.run().completeness == 1, "A synchronous auction-list event is processed correctly")

scenario = Scenario({ rows = 100, deferResponse = true, synchronousThrottle = true })
Check(scenario.addon.GetScannerSnapshot().failureCode == "throttled" and not scenario.addon.GetScannerSnapshot().canScan,
  "A synchronous throttle event retains the issued-request cooldown")

scenario = Scenario({ rows = 100, deferResponse = true })
scenario.tick(119)
scenario.event("REPLICATE_ITEM_LIST_UPDATE")
Check(scenario.run().completeness == 1, "A response immediately before the deadline remains usable")

scenario = Scenario({ rows = 100 })
local healthyScan = assert(scenario.run())
scenario.tick(901)
scenario.addon.StartScan()
scenario.tick(121)
Check(#WOW_TRADER_SAVED.scans == 1 and WOW_TRADER_SAVED.scans[1] == healthyScan,
  "A later request timeout never replaces or mutates the last complete market scan")
Check(scenario.addon.GetScannerSnapshot().quality.reportedRowCount == 0 and
  scenario.addon.GetScannerSnapshot().recentScans[1].reportedRowCount == 100,
  "Failure metrics describe the failed attempt while history retains the good scan")

scenario = Scenario({ rows = 2000, missing = 2000, unique = 2000, neverReady = true })
while scenario.addon.GetScannerSnapshot().status == "reading" do scenario.tick() end
scenario.tick()
local callsBeforeFinal = scenario.requestCalls()
scenario.setReady(true)
scenario.tick(181)
local lateReadyScan = assert(scenario.run())
Check(lateReadyScan.unresolvedRowCount == 0 and lateReadyScan.pricedRowCount == 2000,
  "Rows ready at the cache deadline must be read before being declared unresolved")
Check(scenario.requestCalls() == callsBeforeFinal, "The final read never loads more item data")
Check(lateReadyScan.cacheDiagnostics.finalCheckedRows == 2000 and lateReadyScan.cacheDiagnostics.finalRecoveredRows == 2000,
  "The final pass reports exactly how many queued rows were read and recovered")

scenario = Scenario({ rows = 300, missing = 300, neverReady = true, bidOnly = 3 })
while scenario.addon.GetScannerSnapshot().status == "reading" do scenario.tick() end
scenario.setReady(true)
scenario.tick(181)
local finalBidOnly = assert(scenario.run())
Check(finalBidOnly.pricedRowCount == 297 and finalBidOnly.noBuyoutRowCount == 3 and finalBidOnly.completeness == 1,
  "The final pass retains genuine bid-only rows without inventing buyout prices")

scenario = Scenario({ rows = 300, missing = 300, neverReady = true })
while scenario.addon.GetScannerSnapshot().status == "reading" do scenario.tick() end
scenario.setReady(function(index) return index % 2 == 0 end)
scenario.tick(181)
local mixedFinal = assert(scenario.run())
Check(mixedFinal.pricedRowCount == 150 and mixedFinal.unresolvedRowCount == 150 and mixedFinal.completeness == 0.5,
  "A final pass does not qualify rows that still lack readiness")
for _, sample in ipairs(mixedFinal.cacheDiagnostics.unresolvedSamples) do
  Check(sample.hasAllInfo == false, "An unresolved sample describes the same read that failed readiness")
end

scenario = Scenario({ rows = 2000, missing = 2000, neverReady = true })
while scenario.addon.GetScannerSnapshot().status == "reading" do scenario.tick() end
scenario.tick(181)
Check(scenario.addon.GetScannerSnapshot().status == "finalizing" and scenario.addon.GetScannerSnapshot().canCancel,
  "A final pass remains visible and cancellable")
scenario.tick()
local finalBeforeCap = scenario.requestCalls()
scenario.tick(11)
local cappedFinal = assert(WOW_TRADER_SAVED.scans[1])
Check(cappedFinal.unresolvedRowCount == 2000 and cappedFinal.cacheDiagnostics.finalCheckedRows == 250 and
  cappedFinal.cacheDiagnostics.finalUninspectedRows == 1750 and cappedFinal.cacheDiagnostics.finalPassTimedOut,
  "The final pass is bounded and counts uninspected rows as unknown")
Check(scenario.requestCalls() == finalBeforeCap, "Final timeout cannot issue more load requests")

scenario = Scenario({ rows = 100, missing = 100, neverReady = true })
while scenario.addon.GetScannerSnapshot().status == "reading" do scenario.tick() end
scenario.tick(181)
local originalReader, finalReads = C_AuctionHouse.GetReplicateItemInfo, {}
C_AuctionHouse.GetReplicateItemInfo = function(index)
  finalReads[index] = (finalReads[index] or 0) + 1
  local values = { originalReader(index) }
  values[18] = finalReads[index] > 1
  return unpack(values, 1, 18)
end
local singleReadFinal = assert(scenario.run())
local readCount = 0
for _, count in pairs(finalReads) do readCount = readCount + count end
Check(readCount == 100 and singleReadFinal.unresolvedRowCount == 100,
  "Diagnostics do not reread an unresolved row and report a different readiness value")

scenario = Scenario({ rows = 100, missing = 100, neverReady = true })
while scenario.addon.GetScannerSnapshot().status == "reading" do scenario.tick() end
scenario.tick(181)
scenario.event("AUCTION_HOUSE_CLOSED")
Check(#WOW_TRADER_SAVED.scans == 0 and WOW_TRADER_SAVED.nativeScanner.lastFailure.stage == "finalizing",
  "AH closure cancels finalization without saving a partial market")

scenario = Scenario({ rows = 10000, missing = 10000, unique = 500, cacheCapacity = 8, loadEvents = true })
local evictingScan = assert(scenario.run())
Check(evictingScan.completeness == 1 and evictingScan.pricedRowCount == 10000,
  "Rows must be consumed while metadata is ready even when the client cache evicts earlier items")
Check(evictingScan.cacheDiagnostics.readyRecoveredRows > 0 and evictingScan.visitedRowCount == 10000,
  "Grouped capture reports recoveries without inflating initial visit counts")
Check(scenario.replicateCalls() == 1, "Metadata scheduling still uses only one full-market request")

scenario = Scenario({ rows = 157168, missing = 8268, unique = 128, bidOnly = 12 })
local scan = assert(scenario.run())
Check(scan.pricedRowCount == 157156 and scan.noBuyoutRowCount == 12, "All requested listings are accounted for once")
Check(scan.unresolvedRowCount == 0 and scan.completeness == 1, "The reported8268 deferred rows recover only after active item requests")
Check(scan.cacheDiagnostics.requestedItems == 128, "Thousands of listings share deduplicated per-item loads")
for _, count in pairs(scenario.requests) do Check(count == 1, "A shared item is requested only once") end
Check(scenario.replicateCalls() == 1, "Cache loading must not issue another full-AH query")

scenario = Scenario({ rows = 154484, missing = 4415, unique = 2515, dropFirst = true, loadEvents = true, loadDelay = 0.1 })
scan = assert(scenario.run())
Check(scan.unresolvedRowCount == 0 and scan.completeness == 1,
  "Accepted requests that never populate the cache must be retried")
Check(scan.cacheDiagnostics.retryRequests == 2515, "Each silent first failure is retried once")
Check(scan.cacheDiagnostics.loadSuccessEvents == 2515, "Load confirmations are distinct from accepted API calls")
Check(scan.cacheDiagnostics.pendingItems == 0 and scan.cacheDiagnostics.inFlightItems == 0,
  "A recovered scan has no unconfirmed requests")
Check(scenario.replicateCalls() == 1, "Item retries never repeat a full AH query")
Check(scenario.registered.ITEM_DATA_LOAD_RESULT and scenario.registered.GET_ITEM_INFO_RECEIVED,
  "The real scanner registers both client item-load completion events")

scenario = Scenario({ rows = 100, missing = 100, failFirst = true, loadEvents = true, loadDelay = 0.1 })
scan = assert(scenario.run())
Check(scan.completeness == 1 and scan.cacheDiagnostics.retryRequests == 64,
  "Explicit asynchronous load failures recover after backoff")
Check(scan.cacheDiagnostics.loadFailureEvents == 64 and scan.cacheDiagnostics.loadSuccessEvents == 64,
  "Duplicate notifications do not double-count or release another item's in-flight slot")
Check(scan.cacheDiagnostics.timedOutRequests == 0, "Explicit failures need no timeout before scheduling retry")

scenario = Scenario({ rows = 100, missing = 100, neverReady = true, neverLoaded = true })
scan = assert(scenario.run())
Check(scan.unresolvedRowCount == 100 and scan.cacheDiagnostics.exhaustedItems == 64,
  "Unresponsive items are exhausted without being turned into prices")
Check(scan.cacheDiagnostics.requestAttempts == 192 and scan.cacheDiagnostics.retryRequests == 128,
  "A missing completion event cannot cause unlimited retries")
Check(scan.cacheDiagnostics.timedOutRequests == 192 and scan.cacheDiagnostics.pendingItems == 0,
  "Silent failures retain bounded timeout evidence")
Check(scan.cacheDiagnostics.unresolvedSamples[1].loadAttempts == 3,
  "Each failed row retains its actual item-load attempt count")

scenario = Scenario({ rows = 1000, missing = 1000, unique = 1000, loadDelay = 30, loadEvents = true })
scan = assert(scenario.run())
Check(scan.completeness == 1 and scan.cacheDiagnostics.requestAttempts <= 3000,
  "Late cache completion recovers without resetting the underlying load or exceeding the retry cap")

scenario = Scenario({ rows = 8000, missing = 8000, unique = 8000, loadDelay = 0.1 })
scan = assert(scenario.run())
Check(scan.completeness == 1 and scan.scanDurationMs > 60000 and scan.scanDurationMs < 185000,
  string.format("A large active load queue receives bounded grace: completeness=%f, duration=%dms", scan.completeness, scan.scanDurationMs))

scenario = Scenario({ rows = 9000, missing = 8268, unique = 128, neverReady = true })
scan = assert(scenario.run())
Check(scan.unresolvedRowCount == 8268 and scan.pricedRowCount == 732, "Readable money cannot bypass incomplete API row data")
Check(scan.completeness < 0.98 and #scan.cacheDiagnostics.unresolvedSamples == 20, "Unknown rows remain excluded with a bounded sample")
Check(scan.cacheDiagnostics.unresolvedSamples[1].itemDataCached == true,
  "Diagnostics distinguish cached items from incomplete replicated rows")
Check(scan.cacheDiagnostics.unresolvedSamples[1].countReadable and scan.cacheDiagnostics.unresolvedSamples[1].buyoutReadable,
  "Diagnostics retain readability, not personal auction-owner data or prices")

scenario = Scenario({ rows = 2000, missing = 2000, unique = 2000, neverReady = true })
while scenario.addon.GetScannerSnapshot().status == "reading" do scenario.tick() end
scenario.tick()
local beforeDeadline = scenario.requestCalls()
scenario.tick(181)
scan = assert(scenario.run())
Check(scan.unresolvedRowCount == 2000, "Hard timeout includes both retried and not-yet-retried rows")
Check(scenario.requestCalls() == beforeDeadline, "Hard timeout stops further item requests")

scenario = Scenario({ rows = 100, missing = 100, fallback = true })
Check(scenario.run().completeness == 1, "Legacy item-info loading remains supported")
scenario = Scenario({ rows = 100, missing = 100, requestFails = true })
scan = assert(scenario.run())
Check(scan.unresolvedRowCount == 100 and scan.cacheDiagnostics.requestErrors > 0, "Failed loads remain failures and are diagnosed")
scenario = Scenario({ rows = 10, missing = 10, missingId = true })
scan = assert(scenario.run())
Check(scan.unresolvedRowCount == 10 and scenario.requestCalls() == 0, "Unknown identities never become item-load requests")
scenario = Scenario({ rows = 10, secret = true })
scan = assert(scenario.run())
Check(scan.secretRowCount == 10 and scenario.requestCalls() == 0, "Protected fields never enter the cache queue")
scenario = Scenario({ rows = 1000, missing = 1000 })
scenario.tick()
scenario.addon.CancelScan()
local calls = scenario.requestCalls()
scenario.tick()
Check(scenario.requestCalls() == calls and #WOW_TRADER_SAVED.scans == 0, "Cancellation stops cache work without saving a scan")
scenario = Scenario({ rows = 1000, missing = 1000 })
scenario.tick()
scenario.event("AUCTION_HOUSE_CLOSED")
calls = scenario.requestCalls()
scenario.tick()
Check(scenario.requestCalls() == calls and #WOW_TRADER_SAVED.scans == 0, "AH close cancels cache work")

local Addon = {}
assert(loadfile(root .. "NativeItemCache.lua"))("WowTraderCollector", Addon)
local Cache = Addon.NativeItemCache
local now, issued, cost = 0, 0, 0
C_Item = { RequestLoadItemDataByID = function() issued = issued + 1; cost = cost + 3 end }
local state = Cache.New(now, function() return cost end)
for index = 1, 1000 do Cache.Queue(state, index) end
Cache.Process(state, now)
Check(issued == 1, "Slow item loads yield after their frame budget")
for _ = 1, 100 do now = now + 0.01; Cache.Process(state, now) end
Check(issued <= 108, "A token bucket bounds requests even under rapid frame callbacks")

local cached = { [1] = true }
now, issued, cost = 0, 0, 0
C_Item = { IsItemDataCachedByID = function(id) return cached[id] == true end,
  RequestLoadItemDataByID = function(id)
    issued = issued + 1
    cached[id] = true
    Cache.OnLoadResult(state, id, true, now)
    Cache.OnLoadResult(state, id, true, now)
  end }
state = Cache.New(now, function() return cost end)
Cache.Queue(state, 1)
Cache.Queue(state, 1)
Cache.Queue(state, 2)
Cache.Process(state, now)
Cache.Process(state, now)
local stats = Cache.Snapshot(state)
Check(issued == 1 and stats.cachedBeforeRequest == 1, "Cached metadata is skipped instead of being requested again")
Check(stats.requestAttempts == 1 and stats.loadedItems == 2 and stats.pendingItems == 0,
  "Deduplication and loaded-item counts include both preloaded and newly loaded items")
Check(stats.loadSuccessEvents == 1 and stats.inFlightItems == 0,
  "Synchronous duplicate events cannot make the in-flight count negative")
cached[2] = false
Cache.Queue(state, 2)
now = 10
Cache.Process(state, now)
Check(issued == 2, "A deferred item whose cached data was evicted can be requested again")

now, issued = 0, 0
C_Item = { IsItemDataCachedByID = function() return false end,
  RequestLoadItemDataByID = function(id)
    issued = issued + 1
    Cache.OnLoadResult(state, id, true, now)
  end }
state = Cache.New(now, function() return 0 end)
Cache.Queue(state, 1)
for _ = 1, 100 do Cache.Process(state, now); now = now + 1 end
stats = Cache.Snapshot(state)
Check(issued == 3 and stats.exhaustedItems == 1 and stats.loadedItems == 0,
  "Even success events cannot qualify an item the cache API still reports missing")
Cache.MarkReady(state, 1)
stats = Cache.Snapshot(state)
Check(stats.exhaustedItems == 0 and stats.loadedItems == 1 and stats.pendingItems == 0,
  "A later complete native row reconciles an exhausted item without another request")

now, issued = 0, 0
C_Item = { IsItemDataCachedByID = function() return false end,
  RequestLoadItemDataByID = function() issued = issued + 1 end }
state = Cache.New(now, function() return 0 end)
for index = 1, 1000 do Cache.Queue(state, index) end
for _ = 1, 1000 do
  Cache.Process(state, now)
  Check(state.inFlightItems <= 256, "Outstanding requests stay within the concurrency bound")
  now = now + 0.01
end
Check(issued <= 504, "First attempts and retries share the same 50-request/second token bucket")
Check(Cache.Snapshot(state).timedOutRequests > 0, "A missing event releases capacity after timeout")
for _, invalid in ipairs({ 0, -1, math.huge, 0/0, 1.5, 2147483648, { secret = true } }) do Cache.Queue(state, invalid) end
Check(Cache.Snapshot(state).queuedItems == 1000, "Malformed or protected identities cannot enter the queue")
print(string.format("%d native cache/scanner controls passed, including 157168 rows and 8268 recoverable failures", checks))
