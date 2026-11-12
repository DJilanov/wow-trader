local _, Addon = ...
local Policy = {}
Addon.Policy = Policy
Addon.Version = "0.1.0"
Addon.IconNames = { "Star", "Circle", "Diamond", "Triangle", "Moon", "Square", "Cross", "Skull" }

function Policy.Readable(value)
  return type(issecretvalue) ~= "function" or not issecretvalue(value)
end

function Policy.Call(fn, ...)
  if type(fn) ~= "function" then return nil, false end
  local ok, value = pcall(fn, ...)
  if not ok or not Policy.Readable(value) then return nil, false end
  return value, true
end

function Policy.Icon(value)
  return Policy.Readable(value) and type(value) == "number" and
    value >= 1 and value <= 8 and value == math.floor(value)
end

function Policy.Order(order)
  if not Policy.Readable(order) or type(order) ~= "table" or #order ~= 8 then return nil end
  local result, seen = {}, {}
  for i = 1, 8 do
    local icon = order[i]
    if not Policy.Icon(icon) or seen[icon] then return nil end
    result[i], seen[icon] = icon, true
  end
  return result
end

function Policy.ParseOrder(text)
  if not Policy.Readable(text) or type(text) ~= "string" or #text > 40 or text:find("[^1-8,%s]") then
    return nil, "Use each number 1-8 once, separated by spaces or commas."
  end
  local order = {}
  for token in text:gmatch("%d+") do order[#order + 1] = tonumber(token) end
  local valid = Policy.Order(order)
  if not valid then return nil, "Use each number 1-8 once, without duplicates." end
  return valid
end

function Policy.Settings(raw)
  if not Policy.Readable(raw) or type(raw) ~= "table" then raw = {} end
  local settings = {
    version = 1, enabled = true, claim = false, mode = "target", minimap = true,
    order = Policy.Order(raw.order) or { 8, 7, 4, 3, 2, 1, 6, 5 }, reserved = {},
    position = { x = 0, y = 120 },
  }
  for _, key in ipairs({ "enabled", "claim", "minimap" }) do
    if Policy.Readable(raw[key]) and type(raw[key]) == "boolean" then settings[key] = raw[key] end
  end
  if Policy.Readable(raw.mode) and (raw.mode == "target" or raw.mode == "mouseover" or raw.mode == "queue") then
    settings.mode = raw.mode
  end
  if Policy.Readable(raw.reserved) and type(raw.reserved) == "table" then
    for icon = 1, 8 do settings.reserved[icon] = Policy.Readable(raw.reserved[icon]) and raw.reserved[icon] == true end
  end
  if Policy.Readable(raw.position) and type(raw.position) == "table" then
    for _, key in ipairs({ "x", "y" }) do
      local value = raw.position[key]
      if Policy.Readable(value) and type(value) == "number" and value == value and math.abs(value) < 100000 then
        settings.position[key] = value
      end
    end
  end
  return settings
end

function Policy.Combat()
  local combat, readable = Policy.Call(InCombatLockdown)
  if not readable or type(combat) ~= "boolean" then return true end
  if combat then return true end
  if type(UnitAffectingCombat) == "function" then
    local affecting, known = Policy.Call(UnitAffectingCombat, "player")
    if not known or type(affecting) ~= "boolean" or affecting then return true end
  end
  return false
end

function Policy.Availability(reserved)
  local states = {}
  for icon = 1, 8 do
    if reserved[icon] then
      states[icon] = "reserved"
    else
      -- Query the native marker registry, including mobs beyond nameplate range.
      local candidate, known = Policy.Call(GetNextAvailableRaidTargetMarkerIndex, icon, false, false, true)
      if not known or type(candidate) ~= "number" or candidate ~= math.floor(candidate) or candidate < 0 or candidate > 8 then
        states[icon] = "unknown"
      elseif candidate == icon then
        states[icon] = "free"
      else
        states[icon] = "occupied"
      end
    end
  end
  return states
end

function Policy.ChooseIcon(settings, states)
  local unknown, allowed = false, 0
  for _, icon in ipairs(settings.order) do
    if not settings.reserved[icon] then
      allowed = allowed + 1
      if states[icon] == "free" then return icon, "ready" end
      if states[icon] == "unknown" then unknown = true end
    end
  end
  if allowed == 0 then return nil, "reserved" end
  return nil, unknown and "unknown" or "full"
end

function Policy.Enemy(unit)
  if type(unit) ~= "string" then return nil end
  local exists, existsKnown = Policy.Call(UnitExists, unit)
  local attackable, attackKnown = Policy.Call(UnitCanAttack, "player", unit)
  local dead, deadKnown = Policy.Call(UnitIsDeadOrGhost, unit)
  local player, playerKnown = Policy.Call(UnitIsPlayer, unit)
  if not existsKnown or not attackKnown or not deadKnown or not playerKnown or
      exists ~= true or attackable ~= true or dead ~= false or player ~= false then return nil end
  local markable, markKnown = Policy.Call(CanBeRaidTarget, unit)
  if not markKnown or markable ~= true then return nil end
  if type(UnitPlayerControlled) == "function" then
    local controlled, controlledKnown = Policy.Call(UnitPlayerControlled, unit)
    if not controlledKnown or controlled ~= false then return nil end
  end
  local guid, guidKnown = Policy.Call(UnitGUID, unit)
  if not guidKnown or type(guid) ~= "string" or #guid > 150 then return nil end
  local name, nameKnown = Policy.Call(UnitName, unit)
  return { unit = unit, guid = guid, name = nameKnown and type(name) == "string" and name or "Enemy" }
end

function Policy.MarkerOwner(roster, peers, now)
  local best, bestScore
  for guid, member in pairs(roster) do
    local peer = peers[guid]
    if peer and peer.enabled and member.allowed and now - peer.seen <= 45 then
      local score = (peer.claim and 10 or 0) + (member.leader and 2 or member.assistant and 1 or 0)
      if not best or score > bestScore or (score == bestScore and guid < best.guid) then
        best, bestScore = member, score
      end
    end
  end
  return best
end
