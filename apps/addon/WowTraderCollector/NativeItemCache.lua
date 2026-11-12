local _, Addon = ...
local Cache = {}
Addon.NativeItemCache = Cache

local BURST = 4
local REQUESTS_PER_SECOND = 50
local MAX_IN_FLIGHT = 256
local MAX_ATTEMPTS = 3
local REQUEST_TIMEOUT_SECONDS = 5
local RETRY_BACKOFF_SECONDS = 5
local FRAME_BUDGET_MS = 2
local CHECKS_PER_FRAME = 256

local function Readable(value)
  if type(issecretvalue) == "function" and issecretvalue(value) then return nil end
  if type(canaccessvalue) == "function" and not canaccessvalue(value) then return nil end
  return value
end

local function ItemID(value)
  value = Readable(value)
  if type(value) ~= "number" or value < 1 or value > 2147483647 or value ~= math.floor(value) then return nil end
  return value
end

local function IsCached(itemId)
  local reader = C_Item and C_Item.IsItemDataCachedByID
  if type(reader) ~= "function" then return nil end
  local ok, cached = pcall(reader, itemId)
  if ok then cached = Readable(cached); if type(cached) == "boolean" then return cached end end
  return nil
end

local function Release(state, item)
  if not item.inFlight then return end
  item.inFlight = false
  state.inFlightItems = state.inFlightItems - 1
end

local function Finish(state, item, exhausted, force)
  Release(state, item)
  item.active = false
  item.exhausted = exhausted
  state.pendingItems = state.pendingItems - 1
  if exhausted then state.exhaustedItems = state.exhaustedItems + 1
  elseif not item.everLoaded then
    item.everLoaded = true
    state.loadedItems = state.loadedItems + 1
    if item.attempts == 0 then state.cachedBeforeRequest = state.cachedBeforeRequest + 1 end
  end
  if not exhausted and state.onReady then state.onReady(item.itemId, force) end
end

function Cache.New(now, profile, onReady)
  return { items = {}, queue = {}, cursor = 1, tokens = BURST, updatedAt = now, profile = profile,
    pendingItems = 0, requestedItems = 0, requestAttempts = 0, retryRequests = 0, requestErrors = 0,
    cachedBeforeRequest = 0, loadedItems = 0, exhaustedItems = 0, inFlightItems = 0,
    loadSuccessEvents = 0, loadFailureEvents = 0, timedOutRequests = 0, onReady = onReady }
end

function Cache.Queue(state, itemId, link)
  itemId, link = ItemID(itemId), Readable(link)
  if not itemId then return end
  local item = state.items[itemId]
  if item then
    -- A later deferred row may refer to data evicted since the earlier cache check.
    if not item.active and not item.exhausted and IsCached(itemId) == false then
      item.active = true
      state.pendingItems = state.pendingItems + 1
    end
    return
  end
  item = { itemId = itemId, link = type(link) == "string" and link or nil,
    attempts = 0, nextAttemptAt = 0, active = true }
  state.items[itemId] = item
  table.insert(state.queue, item)
  state.pendingItems = state.pendingItems + 1
end

function Cache.OnLoadResult(state, itemId, success, now)
  itemId, success = ItemID(itemId), Readable(success)
  local item = itemId and state.items[itemId]
  if not item or not item.active or not item.inFlight or type(success) ~= "boolean" then return end
  Release(state, item)
  item.lastLoadSucceeded = success
  if success then state.loadSuccessEvents = state.loadSuccessEvents + 1
  else state.loadFailureEvents = state.loadFailureEvents + 1 end
  item.nextAttemptAt = now + RETRY_BACKOFF_SECONDS * item.attempts
end

function Cache.MarkReady(state, itemId)
  local id = ItemID(itemId)
  local item = id and state.items[id]
  if item and item.exhausted then
    state.exhaustedItems = state.exhaustedItems - 1
    item.active = true
    state.pendingItems = state.pendingItems + 1
  end
  if item and item.active then Finish(state, item, false) end
end

local function ProcessItem(state, item, now)
  if not item.active then return false end
  local cached = IsCached(item.itemId)
  if cached == true or (cached == nil and item.lastLoadSucceeded == true) then
    Finish(state, item, false, true)
    return false
  end
  if item.inFlight then
    if now < item.deadline then return false end
    Release(state, item)
    state.timedOutRequests = state.timedOutRequests + 1
    item.nextAttemptAt = now + RETRY_BACKOFF_SECONDS * item.attempts
  end
  if now < item.nextAttemptAt then return false end
  if item.attempts >= MAX_ATTEMPTS then Finish(state, item, true); return false end
  if state.tokens < 1 or state.inFlightItems >= MAX_IN_FLIGHT then return false end

  local request = C_Item and C_Item.RequestLoadItemDataByID
  local argument = item.itemId
  if type(request) ~= "function" then
    request = C_Item and C_Item.GetItemInfo or GetItemInfo
    argument = item.link or item.itemId
  end
  item.attempts = item.attempts + 1
  item.lastLoadSucceeded = nil
  item.deadline = now + REQUEST_TIMEOUT_SECONDS
  -- The load-result event can fire synchronously inside the request call.
  item.inFlight = true
  state.inFlightItems = state.inFlightItems + 1
  state.requestAttempts = state.requestAttempts + 1
  if item.attempts > 1 then state.retryRequests = state.retryRequests + 1 end
  state.tokens = state.tokens - 1
  if type(request) == "function" then
    if not item.requested then item.requested = true; state.requestedItems = state.requestedItems + 1 end
    if pcall(request, argument) then state.lastRequestAt = now; return true end
  end
  Release(state, item)
  state.requestErrors = state.requestErrors + 1
  item.nextAttemptAt = now + RETRY_BACKOFF_SECONDS * item.attempts
  return true
end

function Cache.Process(state, now)
  state.tokens = math.min(BURST, state.tokens + math.max(0, now - state.updatedAt) * REQUESTS_PER_SECOND)
  state.updatedAt = now
  if state.pendingItems == 0 then return end
  local started, checked, issued = state.profile(), 0, 0
  while checked < math.min(#state.queue, CHECKS_PER_FRAME) and issued < BURST do
    if state.cursor > #state.queue then state.cursor = 1 end
    local item = state.queue[state.cursor]
    state.cursor = state.cursor + 1
    checked = checked + 1
    if ProcessItem(state, item, now) then issued = issued + 1 end
    if state.profile() - started >= FRAME_BUDGET_MS then break end
  end
end

function Cache.Describe(state, itemId)
  local id = ItemID(itemId)
  local item = id and state.items[id]
  return item and { loadAttempts = item.attempts, lastLoadSucceeded = item.lastLoadSucceeded } or {}
end

function Cache.Snapshot(state)
  return { queuedItems = #state.queue, pendingItems = state.pendingItems,
    requestedItems = state.requestedItems, requestAttempts = state.requestAttempts,
    retryRequests = state.retryRequests, requestErrors = state.requestErrors,
    cachedBeforeRequest = state.cachedBeforeRequest, loadedItems = state.loadedItems,
    exhaustedItems = state.exhaustedItems, inFlightItems = state.inFlightItems,
    loadSuccessEvents = state.loadSuccessEvents, loadFailureEvents = state.loadFailureEvents,
    timedOutRequests = state.timedOutRequests }
end
