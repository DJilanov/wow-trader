local _, Addon = ...
local Pending = {}
Addon.NativePendingRows = Pending

local function ItemID(value)
  if type(value) ~= "number" or value < 1 or value > 2147483647 or value ~= math.floor(value) then return nil end
  return value
end

function Pending.New()
  return { rows = {}, groups = {}, groupCounts = {}, versions = {}, prioritized = {},
    ready = {}, queued = {}, head = 1, count = 0 }
end

function Pending.Track(state, index, itemId)
  if type(index) ~= "number" or index < 0 or index > 999999 or index ~= math.floor(index) then return end
  local row = state.rows[index]
  if row and not row.pending then return end
  if not row then row = { pending = true }; state.rows[index] = row; state.count = state.count + 1 end
  itemId = ItemID(itemId)
  if not itemId or row.itemId == itemId then return end
  if row.itemId then state.groupCounts[row.itemId] = state.groupCounts[row.itemId] - 1 end
  row.itemId = itemId
  state.groups[itemId] = state.groups[itemId] or {}
  table.insert(state.groups[itemId], index)
  state.groupCounts[itemId] = (state.groupCounts[itemId] or 0) + 1
  state.versions[itemId] = (state.versions[itemId] or 0) + 1
end

function Pending.Complete(state, index)
  local row = state.rows[index]
  if not row or not row.pending then return false end
  row.pending = false
  state.count = state.count - 1
  if row.itemId then state.groupCounts[row.itemId] = state.groupCounts[row.itemId] - 1 end
  return true
end

function Pending.IsComplete(state, index)
  local row = state.rows[index]
  return row ~= nil and not row.pending
end

function Pending.Prioritize(state, itemId, force)
  itemId = ItemID(itemId)
  if not itemId or (state.groupCounts[itemId] or 0) == 0 or state.queued[itemId] then return end
  -- Repeated observations are deduplicated; a new load result can retry the same group.
  if not force and state.prioritized[itemId] == state.versions[itemId] then return end
  state.prioritized[itemId] = state.versions[itemId]
  state.queued[itemId] = true
  table.insert(state.ready, { itemId = itemId, cursor = 1 })
end

function Pending.HasReady(state)
  return state.head <= #state.ready
end

function Pending.TakeReady(state, limit)
  -- Skipping consumed members must share the caller's frame budget too.
  local checked = 0
  limit = math.min(limit or 256, 256)
  while checked < limit and state.head <= #state.ready do
    checked = checked + 1
    local entry = state.ready[state.head]
    local group = state.groups[entry.itemId]
    local index = group[entry.cursor]
    if index == nil then
      state.queued[entry.itemId] = nil
      state.head = state.head + 1
    else
      entry.cursor = entry.cursor + 1
      local row = state.rows[index]
      if row and row.pending and row.itemId == entry.itemId then return index, checked end
    end
  end
  if state.head > #state.ready then state.ready = {}; state.head = 1 end
  return nil, checked
end
