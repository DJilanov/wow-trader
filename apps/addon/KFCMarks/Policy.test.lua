local Addon = {}
local secret = setmetatable({}, {
  __lt = function() error("Secret comparison") end,
  __le = function() error("Secret comparison") end,
  __concat = function() error("Secret concatenation") end,
  __tostring = function() error("Secret formatting") end,
})
issecretvalue = function(value) return rawequal(value, secret) end
assert(loadfile("apps/addon/KFCMarks/Policy.lua"))("KFCMarks", Addon)
local P = Addon.Policy
local tests = 0
local function check(name, run)
  local ok, err = pcall(run)
  assert(ok, name .. ": " .. (ok and "" or err))
  tests = tests + 1
end
local registry = {}
GetNextAvailableRaidTargetMarkerIndex = function(start, reverse, wrap, reuseDead)
  assert(reverse == false and wrap == false and reuseDead == true)
  for index = start, 8 do
    local owner = registry[index]
    if not owner or (owner.dead and not owner.friendly) then return index end
  end
  return 0
end

check("Default priorities start skull/cross and preserve raw settings", function()
  local raw = { mode = "mouseover", order = { 7, 8, 1, 2, 3, 4, 5, 6 }, reserved = { [8] = true } }
  local settings = P.Settings(raw)
  assert(settings.order[1] == 7 and settings.mode == "mouseover" and settings.reserved[8])
  settings.order[1] = 1
  assert(raw.order[1] == 7)
  assert(P.Settings().order[1] == 8 and P.Settings().order[2] == 7)
end)
check("Malformed and future saved values cannot become live policy", function()
  local settings = P.Settings({ order = { 8, 8 }, mode = "arbitrary unit", enabled = secret, position = { x = 0/0, y = math.huge } })
  assert(settings.order[2] == 7 and settings.mode == "target" and settings.enabled and settings.position.y == 120)
  assert(P.Settings(secret).enabled and P.Order(secret) == nil)
end)
check("Order editing validates all eight distinct icons", function()
  assert(P.ParseOrder("8, 7, 6, 5, 4, 3, 2, 1")[1] == 8)
  for _, value in ipairs({ "8 8 7 6 5 4 3 2", "8 7", "0 1 2 3 4 5 6 7", "8; /run bad", "88 7 6 5 4 3 2 1" }) do
    assert(P.ParseOrder(value) == nil)
  end
  assert(P.ParseOrder(secret) == nil)
end)
check("The next free icon respects a living mob outside nameplate range", function()
  registry = { [8] = { guid = "unseen", dead = false } }
  local icon = P.ChooseIcon(P.Settings(), P.Availability({}))
  assert(icon == 7 and registry[8].guid == "unseen")
end)
check("Dead hostile marks are reusable while friendly marks remain occupied", function()
  registry = { [8] = { dead = true, friendly = false } }
  assert(P.ChooseIcon(P.Settings(), P.Availability({})) == 8)
  registry[8].friendly = true
  assert(P.ChooseIcon(P.Settings(), P.Availability({})) == 7)
end)
check("Eight occupied marks stop rather than cycling back to skull", function()
  registry = {}
  for icon = 1, 8 do registry[icon] = { dead = false } end
  local icon, state = P.ChooseIcon(P.Settings(), P.Availability({}))
  assert(icon == nil and state == "full")
end)
check("Reserved icons cannot be reused even when no mob owns them", function()
  registry = {}
  local settings = P.Settings({ reserved = { [8] = true, [7] = true } })
  assert(P.ChooseIcon(settings, P.Availability(settings.reserved)) == 4)
  for icon = 1, 8 do settings.reserved[icon] = true end
  local icon, state = P.ChooseIcon(settings, P.Availability(settings.reserved))
  assert(icon == nil and state == "reserved")
end)
check("Unknown, secret and missing native availability never fabricate free icons", function()
  local fn = GetNextAvailableRaidTargetMarkerIndex
  for _, result in ipairs({ secret, "8", -1, 9, 0/0, math.huge }) do
    GetNextAvailableRaidTargetMarkerIndex = function() return result end
    local icon, state = P.ChooseIcon(P.Settings(), P.Availability({}))
    assert(icon == nil and state == "unknown")
  end
  GetNextAvailableRaidTargetMarkerIndex = nil
  assert(P.ChooseIcon(P.Settings(), P.Availability({})) == nil)
  GetNextAvailableRaidTargetMarkerIndex = fn
end)
check("One confirmed free icon is safe even if other slots are unreadable", function()
  local fn = GetNextAvailableRaidTargetMarkerIndex
  GetNextAvailableRaidTargetMarkerIndex = function(icon) return icon == 7 and 7 or secret end
  assert(P.ChooseIcon(P.Settings(), P.Availability({})) == 7)
  GetNextAvailableRaidTargetMarkerIndex = fn
end)
check("Secret combat state disables application", function()
  InCombatLockdown = function() return false end
  UnitAffectingCombat = function() return false end
  assert(not P.Combat())
  InCombatLockdown = function() return secret end
  assert(P.Combat())
  InCombatLockdown = function() return false end
  UnitAffectingCombat = function() return secret end
  assert(P.Combat())
end)
check("Eligibility excludes dead enemies, players, pets and unreadable identity", function()
  local dead, player, controlled, guid = false, false, false, "Creature-1"
  UnitExists = function() return true end; UnitCanAttack = function() return true end
  CanBeRaidTarget = function() return true end
  UnitIsDeadOrGhost = function() return dead end; UnitIsPlayer = function() return player end
  UnitPlayerControlled = function() return controlled end; UnitGUID = function() return guid end
  UnitName = function() return "Enemy" end
  assert(P.Enemy("target").guid == guid)
  dead = true; assert(P.Enemy("target") == nil); dead = false
  player = true; assert(P.Enemy("target") == nil); player = false
  controlled = true; assert(P.Enemy("target") == nil); controlled = false
  guid = secret; assert(P.Enemy("target") == nil)
  guid = "Creature-1"; dead = secret; assert(P.Enemy("target") == nil)
end)
check("Cooperative election prefers leader, then volunteer, then deterministic GUID", function()
  local roster = {
    A = { guid = "A", allowed = true }, B = { guid = "B", allowed = true, leader = true },
    C = { guid = "C", allowed = true, assistant = true },
  }
  local peers = { A = { enabled = true, seen = 100 }, B = { enabled = true, seen = 100 }, C = { enabled = true, seen = 100 } }
  assert(P.MarkerOwner(roster, peers, 110).guid == "B")
  peers.A.claim = true; assert(P.MarkerOwner(roster, peers, 110).guid == "A")
  peers.C.claim = true; assert(P.MarkerOwner(roster, peers, 110).guid == "C")
  roster.C.allowed = false; assert(P.MarkerOwner(roster, peers, 110).guid == "A")
  peers.A.seen = 0; assert(P.MarkerOwner(roster, peers, 110).guid == "B")
  peers.B.enabled = false; assert(P.MarkerOwner(roster, peers, 110) == nil)
end)
print(tests .. " KFC Marks policy controls passed")
