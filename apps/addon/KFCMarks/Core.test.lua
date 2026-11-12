local root = "apps/addon/KFCMarks/"
local tests = 0
local function check(name, run)
  local ok, err = pcall(run)
  assert(ok, name .. ": " .. (ok and "" or err))
  tests = tests + 1
end
local secret = {}
local clock, combat, raid, grouped, unitData, registry, sent, markCalls, Addon
local function reset()
  clock, combat, raid, grouped = 10, false, false, false
  unitData = {
    player = { guid = "Player-A", name = "Alpha", leader = true },
    party1 = { guid = "Player-B", name = "Bravo" },
    target = { guid = "Creature-1", name = "Enemy", enemy = true },
    mouseover = { guid = "Creature-2", name = "Hovered enemy", enemy = true },
  }
  registry, sent, markCalls = {}, {}, {}
  issecretvalue = function(value) return rawequal(value, secret) end
  GetTime = function() return clock end
  InCombatLockdown = function() return combat end
  IsInGroup = function() return grouped end
  IsInRaid = function() return raid end
  GetNumGroupMembers = function() return grouped and 2 or 1 end
  GetNormalizedRealmName = function() return "TestRealm" end
  UnitGUID = function(unit) return unitData[unit] and unitData[unit].guid end
  UnitFullName = function(unit) return unitData[unit] and unitData[unit].name, "TestRealm" end
  UnitName = function(unit) return unitData[unit] and unitData[unit].name end
  UnitExists = function(unit) return unitData[unit] ~= nil end
  UnitCanAttack = function(_, unit) return unitData[unit] and unitData[unit].enemy == true or false end
  CanBeRaidTarget = function(unit) return UnitCanAttack("player", unit) end
  UnitIsDeadOrGhost = function(unit) return unitData[unit] and unitData[unit].dead == true or false end
  UnitIsPlayer = function(unit) return unitData[unit] and not unitData[unit].enemy or false end
  UnitPlayerControlled = function() return false end
  UnitAffectingCombat = function(unit) return unit == "player" and combat or unitData[unit] and unitData[unit].combat == true or false end
  UnitIsGroupLeader = function(unit) return unitData[unit] and unitData[unit].leader == true or false end
  UnitIsGroupAssistant = function(unit) return unitData[unit] and unitData[unit].assistant == true or false end
  GetRaidTargetIndex = function(unit)
    local guid = UnitGUID(unit)
    for icon, owner in pairs(registry) do if owner.guid == guid then return icon end end
    return nil
  end
  GetNextAvailableRaidTargetMarkerIndex = function(start, reverse, wrap, reuseDead)
    assert(not reverse and not wrap and reuseDead)
    for icon = start, 8 do
      local owner = registry[icon]
      if not owner or owner.dead then return icon end
    end
    return 0
  end
  SetRaidTarget = function(unit, icon)
    assert(not combat and icon >= 1 and icon <= 8)
    markCalls[#markCalls + 1] = { unit = unit, icon = icon }
    registry[icon] = { guid = UnitGUID(unit), dead = false }
  end
  CreateFrame = function()
    local frame = { scripts = {}, events = {} }
    function frame:RegisterEvent(event) self.events[event] = true end
    function frame:SetScript(name, callback) self.scripts[name] = callback end
    return frame
  end
  C_ChatInfo = {
    RegisterAddonMessagePrefix = function() return true end,
    SendAddonMessage = function(prefix, message, channel)
      assert(not combat)
      sent[#sent + 1] = { prefix = prefix, message = message, channel = channel }
    end,
  }
  DEFAULT_CHAT_FRAME = { AddMessage = function() end }
  SlashCmdList, KFC_MARKS_DB = {}, nil
  Addon = {}
  assert(loadfile(root .. "Policy.lua"))("KFCMarks", Addon)
  assert(loadfile(root .. "Core.lua"))("KFCMarks", Addon)
  Addon.events.scripts.OnEvent(Addon.events, "ADDON_LOADED", "KFCMarks")
  Addon.events.scripts.OnEvent(Addon.events, "PLAYER_LOGIN")
  Addon.secureAvailable = true
end
local function event(name, ...) Addon.events.scripts.OnEvent(Addon.events, name, ...) end
local function tick(seconds)
  clock = clock + (seconds or 1)
  Addon.events.scripts.OnUpdate(Addon.events, 0.3)
end
local function control()
  local button = { attributes = {} }
  function button:SetAttribute(name, value)
    assert(not combat, "Insecure protected-attribute change during combat")
    self.attributes[name] = value
  end
  return button
end
local function secureClick(button)
  Addon.Prepare(button)
  if button.attributes.type == "raidtarget" then
    assert(button.attributes.action == "set-unmarked")
    if GetRaidTargetIndex(button.attributes.unit) == nil then SetRaidTarget(button.attributes.unit, button.attributes.marker) end
  end
end

check("Events and timers observe without applying marks", function()
  reset(); grouped = true; event("GROUP_ROSTER_UPDATE")
  unitData.target.combat = true
  for _, name in ipairs({"PLAYER_TARGET_CHANGED", "UNIT_FLAGS", "UNIT_TARGET", "RAID_TARGET_UPDATE", "NAME_PLATE_UNIT_ADDED"}) do event(name, "nameplate1") end
  tick(3); tick(15)
  assert(#markCalls == 0 and #sent > 0)
end)
check("A real pre-pull action selects the first native free icon", function()
  reset(); registry[8] = { guid = "Hidden-living-enemy" }
  local button = control(); secureClick(button)
  assert(#markCalls == 1 and markCalls[1].icon == 7 and markCalls[1].unit == "target")
  assert(registry[8].guid == "Hidden-living-enemy")
end)
check("A mark occupied between the displayed plan and click is rechecked", function()
  reset(); assert(Addon.Plan().icon == 8)
  registry[8] = { guid = "Someone-elses-living-target" }
  local button = control(); secureClick(button)
  assert(markCalls[1].icon == 7)
end)
check("Existing target marks are never toggled or replaced", function()
  reset(); registry[4] = { guid = unitData.target.guid }
  local button = control(); secureClick(button)
  assert(#markCalls == 0 and button.attributes.type == nil and registry[4].guid == unitData.target.guid)
end)
check("Opaque target marks are preserved by set-unmarked native action", function()
  reset(); GetRaidTargetIndex = function() return secret end
  local button = control(); Addon.Prepare(button)
  assert(button.attributes.action == "set-unmarked" and button.attributes.type == "raidtarget")
  secureClick(button); assert(#markCalls == 0)
end)
check("All eight living marks prevent every mutation", function()
  reset(); for icon = 1, 8 do registry[icon] = { guid = "Living-" .. icon } end
  local button = control(); secureClick(button)
  assert(Addon.Plan().status == "full" and #markCalls == 0 and button.attributes.type == nil)
end)
check("Combat does not change protected attributes or send addon messages", function()
  reset(); local button = control(); Addon.Prepare(button)
  button.attributes.type = nil -- Native secure state driver locks the action.
  combat = true; event("PLAYER_REGEN_DISABLED"); tick(20)
  Addon.Prepare(button)
  assert(button.attributes.type == nil and #markCalls == 0 and #sent == 0 and Addon.Plan().status == "combat")
end)
check("Unknown native availability blocks the entire action", function()
  reset(); GetNextAvailableRaidTargetMarkerIndex = function() return secret end
  local button = control(); secureClick(button)
  assert(Addon.Plan().status == "unknown" and #markCalls == 0)
end)
check("Ordinary party members can coordinate while raid members need permission", function()
  reset(); grouped = true; unitData.player.leader = false; event("GROUP_ROSTER_UPDATE"); tick(3)
  assert(Addon.Plan().status == "ready")
  raid = true; unitData.raid1 = unitData.player; unitData.raid2 = unitData.party1
  event("GROUP_ROSTER_UPDATE"); tick(3)
  assert(Addon.Plan().status == "permissions")
  unitData.player.assistant = true; event("GROUP_ROSTER_UPDATE"); tick(3)
  assert(Addon.Plan().status == "ready")
end)
check("Unknown and incomplete group identity cannot masquerade as solo", function()
  reset(); IsInGroup = function() return secret end; event("GROUP_ROSTER_UPDATE")
  assert(Addon.Plan().status == "group")
  reset(); grouped = true; unitData.party1 = nil; event("GROUP_ROSTER_UPDATE")
  assert(Addon.Plan().status == "group")
end)
check("Peer messages are accepted only from current members and valid protocol", function()
  reset(); grouped = true; unitData.player.leader = false; unitData.party1.leader = true
  event("GROUP_ROSTER_UPDATE"); tick(3)
  for _, args in ipairs({
    {"KFCMARKS1", "1|1|1", "WHISPER", "Bravo-TestRealm"},
    {"KFCMARKS1", "1|1|1", "PARTY", "Outsider-TestRealm"},
    {"KFCMARKS1", "1|1|1;extra", "PARTY", "Bravo-TestRealm"},
  }) do Addon.Receive(unpack(args)) end
  assert(Addon.peers["Player-B"] == nil)
  Addon.Receive(secret, "1|1|0", "PARTY", "Bravo-TestRealm")
  Addon.Receive("KFCMARKS1", secret, "PARTY", "Bravo-TestRealm")
  Addon.Receive("KFCMARKS1", "1|1|0", "PARTY", secret)
  assert(Addon.peers["Player-B"] == nil)
  Addon.Receive("KFCMARKS1", "1|1|0", "PARTY", "Bravo-TestRealm"); tick(2)
  assert(Addon.Plan().owner.guid == "Player-B" and Addon.Plan().status == "other")
  Addon.settings.claim = true; Addon.Changed(); tick(2)
  assert(Addon.Plan().owner.guid == "Player-A")
end)
check("Expired coordination peers never release native living marks", function()
  reset(); grouped = true; event("GROUP_ROSTER_UPDATE"); tick(3)
  Addon.Receive("KFCMARKS1", "1|1|1", "PARTY", "Bravo-TestRealm"); tick(2)
  for icon = 1, 8 do registry[icon] = { guid = "Living-" .. icon } end
  tick(50); tick(2)
  assert(Addon.Plan().owner.guid == "Player-A" and Addon.Plan().status == "full")
end)
check("Nearby combat queue deduplicates enemies and preserves existing markers", function()
  reset(); unitData.target.combat = true; unitData.mouseover.combat = true
  unitData.nameplate1 = unitData.target; event("NAME_PLATE_UNIT_ADDED", "nameplate1")
  assert(#Addon.Queue() == 2)
  registry[7] = { guid = unitData.target.guid }
  local queue = Addon.Queue(); assert(#queue == 1 and queue[1].guid == unitData.mouseover.guid)
  Addon.settings.mode = "queue"
  local button = control(); secureClick(button)
  assert(#markCalls == 1 and markCalls[1].unit == "mouseover")
end)
check("Blocked native actions latch off until explicit out-of-combat retry", function()
  reset(); event("ADDON_ACTION_FORBIDDEN", "KFCMarks")
  assert(Addon.Plan().status == "unsupported")
  combat = true; SlashCmdList.KFCMARKS("retry"); assert(Addon.runtimeBlocked)
  combat = false; SlashCmdList.KFCMARKS("retry"); assert(not Addon.runtimeBlocked and Addon.Plan().status == "ready")
end)
check("Private settings contain configuration rather than target tracking", function()
  reset(); Addon.settings.reserved[8] = true; Addon.Changed()
  assert(KFC_MARKS_DB.reserved[8] and KFC_MARKS_DB.peers == nil and KFC_MARKS_DB.roster == nil and KFC_MARKS_DB.nameplates == nil)
end)

check("Coordination failure falls back to leader-only rather than independent claimants", function()
  reset(); grouped = true; unitData.player.leader = false; unitData.party1.leader = true
  C_ChatInfo.SendAddonMessage = function() error("Transport unavailable") end
  event("GROUP_ROSTER_UPDATE"); tick(3)
  assert(Addon.Plan().status == "communication")
  unitData.player.leader = true; unitData.party1.leader = false
  event("PARTY_LEADER_CHANGED"); tick(3)
  assert(Addon.Plan().status == "ready")
end)

if arg and arg[1] then
  local sourceFile = assert(io.open(arg[1], "rb")); local source = sourceFile:read("*a"); sourceFile:close()
  local first = assert(source:find("function SecureActionButton_ShouldUseOnKeyDown", 1, true))
  local last = assert(source:find("function SecureUnitButton_OnLoad", first, true))
  local dispatcher = source:sub(first, last - 1)
  check("Actual Blizzard dispatcher accepts key-up with explicit useOnKeyDown=false", function()
    reset(); local actionCount = 0
    SecureButton_GetAttribute = function(self, key) return self.attributes[key] end
    GetCVarBool = function(key) return key == "ActionButtonUseKeyDown" end
    OnActionButtonClick = function() actionCount = actionCount + 1 end
    OnActionButtonPressAndHoldRelease = function() error("Unexpected hold action") end
    assert(loadstring(dispatcher))()
    local button = control(); button.attributes.useOnKeyDown = false
    assert(SecureActionButton_OnClick(button, "LeftButton", false) == true and actionCount == 1)
    button.attributes.useOnKeyDown = nil
    assert(SecureActionButton_OnClick(button, "LeftButton", false) == false and actionCount == 1)
  end)
  check("Actual Blizzard raidtarget action preserves existing marks", function()
    reset()
    local firstAction = assert(source:find("SECURE_ACTIONS.raidtarget =", 1, true))
    local nextAction = assert(source:find("SECURE_ACTIONS.worldmarker =", firstAction, true))
    SECURE_ACTIONS = {}
    SecureButton_GetModifiedAttribute = function(self, key) return self.attributes[key] end
    assert(loadstring(source:sub(firstAction, nextAction - 1)))()
    local button = control()
    button.attributes.action, button.attributes.marker = "set-unmarked", 8
    registry[4] = { guid = unitData.target.guid }
    SECURE_ACTIONS.raidtarget(button, "target", "LeftButton")
    assert(#markCalls == 0 and registry[4].guid == unitData.target.guid)
    registry = {}
    SECURE_ACTIONS.raidtarget(button, "target", "LeftButton")
    assert(#markCalls == 1 and markCalls[1].icon == 8)
  end)
end
print(tests .. " KFC Marks core/coordination controls passed")
