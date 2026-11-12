local startsInCombat = arg and arg[1] == "combat"
local root, combat, native = "apps/addon/KFCMarks/", startsInCombat or false, false
local widgets, drivers, marks = {}, {}, {}
local methods = {}
methods.__index = methods
local function protected(self)
  assert(not self.protected or not combat or native, "Protected UI changed by addon code in combat")
end
local function widget(name, parent, template)
  local self = setmetatable({ name = name, parent = parent, text = "", shown = true, scripts = {}, attributes = {},
    protected = template and template:find("SecureActionButtonTemplate", 1, true) ~= nil }, methods)
  if self.protected then
    local owner = parent
    while owner do owner.protected = true; owner = owner.parent end
  end
  widgets[#widgets + 1] = self
  if name then _G[name] = self end
  return self
end
function methods:SetScript(name, callback)
  assert(not self.protected or name ~= "OnClick", "Native secure OnClick must remain intact")
  self.scripts[name] = callback
end
function methods:SetAttribute(name, value) protected(self); self.attributes[name] = value end
function methods:SetText(value) self.text = value end
function methods:GetText() return self.text end
function methods:SetSize(w, h) protected(self); self.width, self.height = w, h end
function methods:SetWidth(w) self.width = w end
function methods:SetHeight(h) self.height = h end
function methods:SetPoint(...) protected(self); self.point = {...} end
function methods:GetCenter() return 960, 540 end
function methods:Show() protected(self); self.shown = true end
function methods:Hide() protected(self); self.shown = false end
function methods:SetShown(value) if value then self:Show() else self:Hide() end end
function methods:IsShown() return self.shown end
function methods:SetChecked(value) self.checked = value end
function methods:GetChecked() return self.checked end
function methods:HasFocus() return self.focused == true end
function methods:ClearFocus() self.focused = false end
function methods:CreateFontString() return widget(nil, self) end
function methods:CreateTexture() return widget(nil, self) end
for _, method in ipairs({"SetJustifyH", "SetFont", "SetTextColor", "SetFrameStrata", "SetClampedToScreen", "SetMovable",
    "EnableMouse", "SetBackdrop", "SetBackdropColor", "SetBackdropBorderColor", "RegisterForDrag", "RegisterForClicks",
    "SetAutoFocus", "SetMaxLetters", "SetTexture", "SetColorTexture", "SetAllPoints", "SetWordWrap", "RegisterEvent",
    "SetOwner", "AddLine", "StartMoving", "StopMovingOrSizing", "SetAlpha"}) do methods[method] = function() end end
CreateFrame = function(_, name, parent, template)
  if template and template:find("SecureActionButtonTemplate", 1, true) then assert(not combat, "Secure control created in combat") end
  return widget(name, parent, template)
end
UIParent = widget("UIParent"); Minimap = widget("Minimap"); GameTooltip = widget("GameTooltip")
SlashCmdList = {}; DEFAULT_CHAT_FRAME = { AddMessage = function() end }
GetTime = function() return 100 end
InCombatLockdown = function() return combat end
IsInGroup = function() return false end; IsInRaid = function() return false end
GetNumGroupMembers = function() return 1 end
GetNormalizedRealmName = function() return "TestRealm" end
UnitFullName = function(unit) return unit == "player" and "Player" or "Enemy", "TestRealm" end
UnitName = function(unit) return unit == "player" and "Player" or "Enemy" end
UnitGUID = function(unit) return unit == "player" and "Player-A" or "Creature-1" end
UnitExists = function() return true end
UnitCanAttack = function(_, unit) return unit ~= "player" end
CanBeRaidTarget = function(unit) return unit ~= "player" end
SetRaidTarget = function() error("Addon UI must not call the protected assignment API") end
UnitIsDeadOrGhost = function() return false end
UnitIsPlayer = function(unit) return unit == "player" end
UnitPlayerControlled = function(unit) return unit == "player" end
UnitAffectingCombat = function() return combat end
UnitIsGroupLeader = function(unit) return unit == "player" end
UnitIsGroupAssistant = function() return false end
GetRaidTargetIndex = function(unit)
  local guid = UnitGUID(unit)
  for icon, owner in pairs(marks) do if owner == guid then return icon end end
end
GetNextAvailableRaidTargetMarkerIndex = function(start)
  for icon = start, 8 do if not marks[icon] then return icon end end
  return 0
end
RegisterStateDriver = function(control)
  assert(not combat)
  drivers[#drivers + 1] = control
  native = true; control:SetAttribute("type", nil); native = false
end
SecureHandlerWrapScript = function(control, script, header, body)
  assert(not combat and control == header)
  control.wrappers = control.wrappers or {}
  control.wrappers[script] = assert(loadstring("return function(self) " .. body .. " end"))()
end
local Addon = {}
for _, file in ipairs({"Policy.lua", "Core.lua", "UI.lua"}) do assert(loadfile(root .. file))("KFCMarks", Addon) end
local function event(name, ...) Addon.events.scripts.OnEvent(Addon.events, name, ...) end
local function render() Addon.Render(Addon.Plan()) end
local function changeCombat(value)
  combat = value
  for _, control in ipairs(drivers) do
    native = true
    assert(loadstring("return function(self, newstate) " .. control.attributes["_onstate-combat"] .. " end"))()(control, value and "locked" or "ready")
    native = false
  end
  event(value and "PLAYER_REGEN_DISABLED" or "PLAYER_REGEN_ENABLED")
  render()
end
local function click()
  local control = Addon.markButton
  native = true; control.wrappers.PreClick(control); native = false
  control.scripts.PreClick(control)
  if control.attributes.type then
    assert(not combat and control.attributes.type == "raidtarget" and control.attributes.action == "set-unmarked")
    assert(control.attributes.useOnKeyDown == false, "Key-up must work even with ActionButtonUseKeyDown=1")
    if GetRaidTargetIndex(control.attributes.unit) == nil then marks[control.attributes.marker] = UnitGUID(control.attributes.unit) end
  end
  native = true; control.wrappers.PostClick(control); native = false
  control.scripts.PostClick(control)
end
event("ADDON_LOADED", "KFCMarks"); event("PLAYER_LOGIN"); render()
if startsInCombat then
  assert(Addon.window == nil and Addon.markButton == nil, "Reloading in combat must not create protected controls")
  Addon.Toggle()
  changeCombat(false)
  assert(Addon.window and Addon.window:IsShown(), "Deferred controls initialize safely after combat")
  Addon.Toggle()
end
assert(Addon.window and Addon.markButton and not Addon.window:IsShown())
assert(Addon.bindingButton and Addon.bindingButton:IsShown() and Addon.bindingButton.parent == UIParent,
  "The native keybinding target remains shown when the settings window is closed")
assert(KFCMarksMinimapButton and KFCMarksMinimapButton:IsShown())
Addon.Toggle(); render()
assert(Addon.window:IsShown() and Addon.markButton.text == "Mark Skull")
assert(Addon.window.owner.text:find("Player%-TestRealm"))
click(); assert(marks[8] == "Creature-1")
assert(Addon.markButton.attributes.type == nil, "The control disarms after every player press")
assert(Addon.window.status.text:find("already marked", 1, true))
click(); assert(marks[7] == nil, "Repeated clicks cannot move an existing target mark")
marks = {}
local row = Addon.window.icons[8]; row:SetChecked(true); row.scripts.OnClick(row); render()
assert(Addon.settings.reserved[8] and row.state.text == "Reserved" and Addon.markButton.text == "Mark Cross")
Addon.window.order:SetText("1 2"); Addon.window.order.scripts.OnEnterPressed()
assert(Addon.settings.order[1] == 8, "Invalid priority edits preserve the current order")
Addon.window.order:SetText("1 2 3 4 5 6 7 8"); Addon.window.order.scripts.OnEnterPressed(); render()
assert(Addon.settings.order[1] == 1 and Addon.markButton.text == "Mark Star")
changeCombat(true)
assert(Addon.markButton.attributes.type == nil and Addon.markButton.text == "Locked in combat")
click(); assert(next(marks) == nil, "Combat bindings cannot apply a stale prepared mark")
Addon.Toggle(); assert(Addon.window:IsShown(), "Combat close is deferred without changing protected UI")
changeCombat(false); assert(not Addon.window:IsShown(), "The deferred close completes after combat")
changeCombat(true); Addon.Toggle(); assert(not Addon.window:IsShown())
changeCombat(false); assert(Addon.window:IsShown(), "The minimap/keybinding can queue opening until after combat")
for icon = 1, 8 do marks[icon] = "Other-" .. icon end
render(); click(); assert(marks[1] == "Other-1" and Addon.window.status.text:find("occupied", 1, true))
marks = {}; GetNextAvailableRaidTargetMarkerIndex = nil
render(); click(); assert(next(marks) == nil and Addon.Plan().status == "unsupported")
local secret = {}
issecretvalue = function(value) return rawequal(value, secret) end
InCombatLockdown = function() return secret end
Addon.markButton.attributes.type, Addon.markButton.attributes.marker = "raidtarget", 8
click()
assert(Addon.markButton.attributes.type == nil and next(marks) == nil,
  "The native pre-click disarm prevents stale actions even when combat state is unreadable")
print("KFC Marks UI (" .. (startsInCombat and "in-combat load" or "normal load") .. "), secure bindings, native click preservation, reservations, priorities, combat locks and deferred window controls passed")
