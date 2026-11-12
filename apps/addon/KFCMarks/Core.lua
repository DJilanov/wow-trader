local addonName, Addon = ...
local P = Addon.Policy
_G.KFCMarks = Addon
Addon.peers, Addon.roster, Addon.aliases, Addon.nameplates = {}, {}, {}, {}
Addon.settings = P.Settings()
Addon.secureAvailable = false
local prefix = "KFCMARKS1"
local nextHeartbeat, groupReadyAt, ownerReadyAt = 0, 0, 0
local previousGroup, previousOwner
local dirty, elapsedSinceUpdate = true, 0

function Addon.Now()
  local value, known = P.Call(GetTime)
  return known and type(value) == "number" and value == value and value or 0
end

function Addon.Print(message)
  if DEFAULT_CHAT_FRAME and type(DEFAULT_CHAT_FRAME.AddMessage) == "function" then
    DEFAULT_CHAT_FRAME:AddMessage("|cffe7b65bKFC Marks:|r " .. message)
  end
end

local function fullName(unit)
  local fn = UnitFullName or UnitName
  if type(fn) ~= "function" then return nil end
  local ok, name, realm = pcall(fn, unit)
  if not ok or not P.Readable(name) or type(name) ~= "string" or #name > 100 then return nil end
  if not P.Readable(realm) then return nil end
  if type(realm) ~= "string" or realm == "" then realm = P.Call(GetNormalizedRealmName) end
  if type(realm) ~= "string" or #realm > 100 then return nil end
  return name .. "-" .. realm:gsub("%s", ""), name
end

function Addon.RefreshRoster()
  local groupValue, groupKnown = P.Call(IsInGroup)
  local raidValue, raidKnown = P.Call(IsInRaid)
  local grouped, raid = groupValue == true, raidValue == true
  local units = { "player" }
  local count = P.Call(GetNumGroupMembers)
  if grouped and type(count) == "number" and count >= 1 and count <= 40 then
    for index = 1, (raid and count or math.min(count - 1, 4)) do
      units[#units + 1] = (raid and "raid" or "party") .. index
    end
  end
  local roster, aliases, shorts, keys = {}, {}, {}, {}
  for _, unit in ipairs(units) do
    local guid = P.Call(UnitGUID, unit)
    local name, short = fullName(unit)
    if type(guid) == "string" and #guid <= 150 and name then
      local leader = P.Call(UnitIsGroupLeader, unit) == true
      local assistant = P.Call(UnitIsGroupAssistant, unit) == true
      roster[guid] = {
        guid = guid, unit = unit, name = name, leader = leader, assistant = assistant,
        allowed = not raid or leader or assistant,
      }
      aliases[name:lower()] = guid
      local shortKey = short:lower()
      if shorts[shortKey] and shorts[shortKey] ~= guid then shorts[shortKey] = false
      elseif shorts[shortKey] == nil then shorts[shortKey] = guid end
    end
  end
  for short, guid in pairs(shorts) do if guid then aliases[short] = guid end end
  for guid in pairs(roster) do keys[#keys + 1] = guid end
  table.sort(keys)
  Addon.groupReadable = groupKnown and raidKnown and type(groupValue) == "boolean" and type(raidValue) == "boolean" and
    (not grouped or (type(count) == "number" and count >= 1 and count <= 40 and count == math.floor(count) and #keys == count))
  local key = (grouped and (raid and "raid:" or "party:") or "solo:") .. table.concat(keys, ";")
  if previousGroup ~= key then
    previousGroup, previousOwner = key, nil
    groupReadyAt = Addon.Now() + (grouped and 2 or 0)
    Addon.peers, Addon.nameplates = {}, {}
    nextHeartbeat = 0
  end
  Addon.roster, Addon.aliases, Addon.grouped, Addon.raid = roster, aliases, grouped, raid
  Addon.playerGUID = P.Call(UnitGUID, "player")
  if type(Addon.playerGUID) ~= "string" then Addon.playerGUID = nil end
  for guid in pairs(Addon.peers) do if not roster[guid] then Addon.peers[guid] = nil end end
  Addon.Owner()
end

function Addon.Broadcast()
  if not Addon.grouped or P.Combat() then return end
  if not C_ChatInfo or type(C_ChatInfo.SendAddonMessage) ~= "function" then Addon.communicationWarning = true; return end
  local message = "1|" .. (Addon.settings.enabled and "1" or "0") .. "|" .. (Addon.settings.claim and "1" or "0")
  local ok, result = pcall(C_ChatInfo.SendAddonMessage, prefix, message, Addon.raid and "RAID" or "PARTY")
  local success = Enum and Enum.SendAddonMessageResult and Enum.SendAddonMessageResult.Success
  Addon.communicationWarning = not ok or not P.Readable(result) or result == false or
    (type(success) == "number" and type(result) == "number" and result ~= success)
end

function Addon.Receive(messagePrefix, message, channel, sender)
  if not P.Readable(messagePrefix) or messagePrefix ~= prefix or not P.Readable(message) or type(message) ~= "string" or
      #message > 10 or not P.Readable(channel) or (channel ~= "PARTY" and channel ~= "RAID") or
      not P.Readable(sender) or type(sender) ~= "string" or #sender > 210 then return end
  local enabled, claim = message:match("^1|([01])|([01])$")
  local guid = Addon.aliases[sender:lower()]
  if not enabled or not guid or guid == Addon.playerGUID then return end
  local newPeer = Addon.peers[guid] == nil
  Addon.peers[guid] = { enabled = enabled == "1", claim = claim == "1", seen = Addon.Now() }
  Addon.Owner()
  if newPeer then nextHeartbeat = 0 end
  dirty = true
end

function Addon.Owner()
  local now = Addon.Now()
  if Addon.playerGUID and Addon.roster[Addon.playerGUID] then
    Addon.peers[Addon.playerGUID] = {
      enabled = Addon.settings.enabled, claim = Addon.settings.claim, seen = now,
    }
  end
  local owner = P.MarkerOwner(Addon.roster, Addon.peers, now)
  local guid = owner and owner.guid
  if previousOwner ~= guid then
    previousOwner = guid
    ownerReadyAt = now + (Addon.grouped and 1 or 0)
  end
  return owner, now >= groupReadyAt and now >= ownerReadyAt
end

function Addon.Queue()
  local units, seen, queue = { "target", "mouseover" }, {}, {}
  for _, member in pairs(Addon.roster) do units[#units + 1] = member.unit .. "target" end
  for unit in pairs(Addon.nameplates) do units[#units + 1] = unit end
  for _, unit in ipairs(units) do
    local enemy = P.Enemy(unit)
    if enemy and not seen[enemy.guid] and P.Call(UnitAffectingCombat, unit) == true then
      local marker, markerKnown = P.Call(GetRaidTargetIndex, unit)
      if markerKnown and marker == nil then
        seen[enemy.guid] = true
        queue[#queue + 1] = enemy
      end
    end
  end
  table.sort(queue, function(left, right) return left.guid < right.guid end)
  while #queue > 5 do table.remove(queue) end
  return queue
end

local reasons = {
  paused = "Paused. Enable KFC Marks to use it.",
  combat = "Combat lock: the queue is observational. Apply marks before pulling.",
  waiting = "Discovering the group marker. Ready in a moment.",
  group = "Waiting for a complete, readable party or raid roster.",
  communication = "Addon coordination is unavailable. Only the group leader may mark until it recovers.",
  other = "Another player is coordinating marks.",
  permissions = "Raid marking requires raid leader or assistant permission.",
  unsupported = "Safe marking controls or the native availability API are unavailable.",
  reserved = "Every icon is reserved. Allow at least one below.",
  full = "Every permitted icon is occupied. No mark will be moved.",
  unknown = "The client is hiding icon availability. No mark will be moved.",
  target = "Choose a living enemy target. Players and pets are excluded.",
  mouseover = "Hover a living enemy in the world or on a nameplate, then use the keybind.",
  queue = "No readable, unmarked enemies in nearby combat.",
  marked = "This enemy is already marked. Its mark will be kept.",
}

function Addon.Plan()
  local settings = Addon.settings
  local owner, settled = Addon.Owner()
  if Addon.grouped and Addon.communicationWarning then
    owner = nil
    for _, member in pairs(Addon.roster) do if member.leader then owner = member; break end end
  end
  local combat = P.Combat()
  local plan = { owner = owner, combat = combat, queue = Addon.Queue(), states = {} }
  for icon = 1, 8 do plan.states[icon] = settings.reserved[icon] and "reserved" or "unknown" end
  local status
  if not settings.enabled then status = "paused"
  elseif combat then status = "combat"
  elseif not Addon.secureAvailable or Addon.runtimeBlocked or type(GetNextAvailableRaidTargetMarkerIndex) ~= "function" or
      type(GetRaidTargetIndex) ~= "function" or type(SetRaidTarget) ~= "function" or type(CanBeRaidTarget) ~= "function" then status = "unsupported"
  elseif not Addon.groupReadable then status = "group"
  elseif not Addon.playerGUID or not Addon.roster[Addon.playerGUID] or not Addon.roster[Addon.playerGUID].allowed then status = "permissions"
  elseif Addon.grouped and Addon.communicationWarning and not Addon.roster[Addon.playerGUID].leader then status = "communication"
  elseif not settled then status = "waiting"
  elseif not owner or owner.guid ~= Addon.playerGUID then status = "other"
  else
    plan.states = P.Availability(settings.reserved)
    plan.icon, status = P.ChooseIcon(settings, plan.states)
    if plan.icon then
      if settings.mode == "queue" then plan.enemy = plan.queue[1]
      else plan.enemy = P.Enemy(settings.mode) end
      if not plan.enemy then status = settings.mode
      else
        local marker, markerKnown = P.Call(GetRaidTargetIndex, plan.enemy.unit)
        if markerKnown and marker ~= nil then status = "marked"
        else status = "ready" end
      end
    end
  end
  plan.status = status
  plan.message = status == "ready" and ("Ready: " .. Addon.IconNames[plan.icon] .. " on " .. plan.enemy.name) or reasons[status]
  return plan
end

function Addon.Prepare(button)
  if P.Combat() then return end
  button:SetAttribute("type", nil)
  button:SetAttribute("marker", nil)
  button:SetAttribute("unit", nil)
  local plan = Addon.Plan()
  if plan.status == "ready" then
    button:SetAttribute("action", "set-unmarked")
    button:SetAttribute("unit", plan.enemy.unit)
    button:SetAttribute("marker", plan.icon)
    button:SetAttribute("type", "raidtarget")
  else Addon.Print(plan.message or "Marking is unavailable.") end
  Addon.lastPlan = plan
end

function Addon.Changed()
  KFC_MARKS_DB = P.Settings(Addon.settings)
  Addon.settings = KFC_MARKS_DB
  Addon.Owner()
  nextHeartbeat, dirty = 0, true
end

function Addon.Probe()
  local version, build = "unknown", "unknown"
  if type(GetBuildInfo) == "function" then
    local ok, clientVersion, clientBuild = pcall(GetBuildInfo)
    if ok and P.Readable(clientVersion) and type(clientVersion) == "string" then version = clientVersion end
    if ok and P.Readable(clientBuild) and type(clientBuild) == "string" then build = clientBuild end
  end
  local states = P.Availability(Addon.settings.reserved)
  local details = {}
  for icon = 1, 8 do details[#details + 1] = Addon.IconNames[icon] .. "=" .. states[icon] end
  Addon.Print("Version " .. Addon.Version .. "; client " .. version .. " build " .. build ..
    "; " .. (P.Combat() and "combat locked" or "out of combat") .. "; secure controls " ..
    (Addon.secureAvailable and "loaded" or "unavailable") .. ".")
  Addon.Print(table.concat(details, ", ") .. ". Probe does not apply or clear marks.")
end

local frame = CreateFrame("Frame")
Addon.events = frame
for _, event in ipairs({ "ADDON_LOADED", "PLAYER_LOGIN", "PLAYER_ENTERING_WORLD", "GROUP_ROSTER_UPDATE",
    "PARTY_LEADER_CHANGED", "PLAYER_REGEN_DISABLED", "PLAYER_REGEN_ENABLED", "PLAYER_TARGET_CHANGED",
    "UPDATE_MOUSEOVER_UNIT", "NAME_PLATE_UNIT_ADDED", "NAME_PLATE_UNIT_REMOVED", "UNIT_FLAGS", "UNIT_TARGET",
    "RAID_TARGET_UPDATE", "CHAT_MSG_ADDON", "ADDON_ACTION_BLOCKED", "ADDON_ACTION_FORBIDDEN" }) do frame:RegisterEvent(event) end
frame:SetScript("OnEvent", function(_, event, ...)
  if event == "ADDON_LOADED" then
    local name = ...
    if name ~= addonName then return end
    Addon.settings = P.Settings(KFC_MARKS_DB)
    KFC_MARKS_DB = Addon.settings
    if C_ChatInfo and type(C_ChatInfo.RegisterAddonMessagePrefix) == "function" and type(C_ChatInfo.SendAddonMessage) == "function" then
      local ok, registered = pcall(C_ChatInfo.RegisterAddonMessagePrefix, prefix)
      Addon.communicationWarning = not ok or registered == false
    else Addon.communicationWarning = true end
  elseif event == "CHAT_MSG_ADDON" then Addon.Receive(...); return
  elseif event == "ADDON_ACTION_BLOCKED" or event == "ADDON_ACTION_FORBIDDEN" then
    local source = ...
    if P.Readable(source) and source == addonName and not Addon.runtimeBlocked then
      Addon.runtimeBlocked = true
      Addon.Print("The client blocked marking. Actions are paused. Run /kfcmarks probe; /kfcmarks retry allows one new attempt outside combat.")
    end
  elseif event == "NAME_PLATE_UNIT_ADDED" or event == "NAME_PLATE_UNIT_REMOVED" then
    local unit = ...
    if P.Readable(unit) and type(unit) == "string" and unit:match("^nameplate%d+$") then
      local count = 0
      for _ in pairs(Addon.nameplates) do count = count + 1 end
      if event == "NAME_PLATE_UNIT_REMOVED" then Addon.nameplates[unit] = nil
      elseif count < 100 then Addon.nameplates[unit] = true end
    end
  elseif event == "PLAYER_LOGIN" or event == "PLAYER_ENTERING_WORLD" or event == "GROUP_ROSTER_UPDATE" or
      event == "PARTY_LEADER_CHANGED" or event == "PLAYER_REGEN_ENABLED" then
    Addon.RefreshRoster()
    if event == "PLAYER_REGEN_ENABLED" then groupReadyAt = Addon.Now() + (Addon.grouped and 2 or 0) end
    nextHeartbeat = 0
  end
  dirty = true
end)
frame:SetScript("OnUpdate", function(_, elapsed)
  elapsedSinceUpdate = elapsedSinceUpdate + elapsed
  if elapsedSinceUpdate < 0.25 then return end
  elapsedSinceUpdate = 0
  if not P.Combat() and Addon.Now() >= nextHeartbeat then
    Addon.RefreshRoster()
    Addon.Broadcast()
    nextHeartbeat = Addon.Now() + 15
    dirty = true
  end
  if dirty or (Addon.IsVisible and Addon.IsVisible()) then
    dirty = false
    Addon.lastPlan = Addon.Plan()
    if Addon.Render then Addon.Render(Addon.lastPlan) end
  end
end)

BINDING_HEADER_KFCMARKS = "KFC Marks"
_G["BINDING_NAME_CLICK KFCMarksMarkButton:LeftButton"] = "Mark next eligible enemy (before combat)"
BINDING_NAME_KFCMARKS_TOGGLE = "Show or hide KFC Marks"
SLASH_KFCMARKS1 = "/kfcmarks"
SlashCmdList.KFCMARKS = function(message)
  local command = type(message) == "string" and message:match("^%s*(%S*)") or ""
  command = command:lower()
  if command == "probe" then Addon.Probe()
  elseif command == "retry" then
    if P.Combat() then Addon.Print("Wait until combat ends before retrying.")
    else Addon.runtimeBlocked = nil; dirty = true; Addon.Print("Compatibility block cleared. The next mark still requires a player click.") end
  elseif command == "on" or command == "off" then
    Addon.settings.enabled = command == "on"; Addon.Changed()
    Addon.Print(command == "on" and "Enabled. Marking needs a player click before combat." or "Paused.")
  elseif command == "claim" or command == "release" then
    Addon.settings.claim = command == "claim"; Addon.Changed()
    Addon.Print(command == "claim" and "Volunteering as group marker; raid permissions still apply." or "Automatic group-marker selection restored.")
  elseif command == "status" then Addon.Print(Addon.Plan().message)
  elseif command == "minimap" then Addon.settings.minimap = true; Addon.Changed()
  else Addon.Toggle() end
end
