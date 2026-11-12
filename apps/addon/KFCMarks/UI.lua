local _, Addon = ...
local P = Addon.Policy
local window, markButton, minimap, requestedVisibility, pendingMove
local gold = { 0.91, 0.71, 0.36 }
local colors = {
  free = { 0.43, 0.82, 0.55 }, occupied = { 0.87, 0.48, 0.42 },
  reserved = { 0.66, 0.65, 0.63 }, unknown = { 0.76, 0.65, 0.43 },
}

local function label(parent, text, size)
  local font = parent:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
  font:SetText(text)
  font:SetJustifyH("LEFT")
  if size then font:SetFont("Fonts\\FRIZQT__.TTF", size, "") end
  return font
end

local function button(parent, text, width, click)
  local control = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
  control:SetSize(width, 25)
  control:SetText(text)
  control:SetScript("OnClick", click)
  return control
end

local function tooltip(control, title, text)
  control:SetScript("OnEnter", function(self)
    if not GameTooltip then return end
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:SetText(title, gold[1], gold[2], gold[3])
    GameTooltip:AddLine(text, 0.9, 0.9, 0.85, true)
    GameTooltip:Show()
  end)
  control:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
end

local function check(parent, text, click)
  local control = CreateFrame("CheckButton", nil, parent, "UICheckButtonTemplate")
  control:SetSize(26, 26)
  local textLabel = label(control, text)
  textLabel:SetPoint("LEFT", control, "RIGHT", 3, 0)
  control:SetScript("OnClick", click)
  return control
end

local function savePosition()
  if P.Combat() then pendingMove = true; return end
  window:StopMovingOrSizing()
  pendingMove = nil
  local x, y = window:GetCenter()
  local centerX, centerY = UIParent:GetCenter()
  if P.Readable(x) and P.Readable(y) and P.Readable(centerX) and P.Readable(centerY) and
      type(x) == "number" and type(y) == "number" and type(centerX) == "number" and type(centerY) == "number" then
    Addon.settings.position = { x = x - centerX, y = y - centerY }
    Addon.Changed()
  end
end

local function wireMarkButton(control)
  control:RegisterForClicks("AnyUp")
  control:SetAttribute("useOnKeyDown", false)
  control:SetAttribute("action", "set-unmarked")
  -- The secure driver disables actions; it never chooses units or icons in combat.
  control:SetAttribute("_onstate-combat", "self:SetAttribute('type', nil)")
  control:SetScript("PreClick", function(self) Addon.Prepare(self) end)
  control:SetScript("PostClick", function() Addon.Render(Addon.Plan()) end)
  if type(SecureHandlerWrapScript) ~= "function" then return false end
  local before = pcall(SecureHandlerWrapScript, control, "PreClick", control, "self:SetAttribute('type', nil)")
  local after = pcall(SecureHandlerWrapScript, control, "PostClick", control, "self:SetAttribute('type', nil)")
  local state = pcall(RegisterStateDriver, control, "combat", "[combat] locked; ready")
  return before and after and state
end

local function build()
  if window or P.Combat() then return end
  window = CreateFrame("Frame", "KFCMarksWindow", UIParent, "BackdropTemplate")
  window:SetSize(580, 560)
  window:SetPoint("CENTER", UIParent, "CENTER", Addon.settings.position.x, Addon.settings.position.y)
  window:SetFrameStrata("DIALOG")
  window:SetClampedToScreen(true)
  window:SetMovable(true)
  window:EnableMouse(true)
  window:SetBackdrop({ bgFile = "Interface\\Tooltips\\UI-Tooltip-Background", edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border", tile = true, tileSize = 16, edgeSize = 16, insets = { left = 4, right = 4, top = 4, bottom = 4 } })
  window:SetBackdropColor(0.055, 0.055, 0.047, 0.98)
  window:SetBackdropBorderColor(gold[1], gold[2], gold[3], 0.9)
  local title = label(window, "KFC MARKS", 21)
  title:SetPoint("TOPLEFT", 22, -20)
  title:SetTextColor(gold[1], gold[2], gold[3])
  local subtitle = label(window, "Party & raid target markers  |  " .. Addon.Version)
  subtitle:SetPoint("TOPLEFT", 23, -49)
  local drag = CreateFrame("Frame", nil, window)
  drag:SetPoint("TOPLEFT", 0, 0); drag:SetPoint("TOPRIGHT", -42, 0); drag:SetHeight(65)
  drag:EnableMouse(true); drag:RegisterForDrag("LeftButton")
  drag:SetScript("OnDragStart", function() if not P.Combat() then window:StartMoving() end end)
  drag:SetScript("OnDragStop", savePosition)
  local close = button(window, "X", 27, function() Addon.Toggle() end)
  close:SetPoint("TOPRIGHT", -12, -13)

  window.status = label(window, "Checking marker availability...")
  window.status:SetPoint("TOPLEFT", 23, -80); window.status:SetWidth(530)
  window.status:SetWordWrap(true)
  window.owner = label(window, "")
  window.owner:SetPoint("TOPLEFT", 23, -119); window.owner:SetWidth(530)

  local ok, control = pcall(CreateFrame, "Button", "KFCMarksPanelMarkButton", window,
    "UIPanelButtonTemplate,SecureActionButtonTemplate,SecureHandlerStateTemplate")
  if ok and control and type(RegisterStateDriver) == "function" then
    markButton = control
    markButton:SetSize(255, 33); markButton:SetPoint("TOPLEFT", 23, -145)
    markButton:SetText("Mark target")
    Addon.secureAvailable = wireMarkButton(markButton)
    -- Keep the binding target shown independently of the settings window.
    local keyOK, key = pcall(CreateFrame, "Button", "KFCMarksMarkButton", UIParent,
      "SecureActionButtonTemplate,SecureHandlerStateTemplate")
    if keyOK and key then
      key:SetSize(1, 1); key:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 0, 0)
      key:SetAlpha(0); key:EnableMouse(false)
      Addon.bindingButton = key
      Addon.secureAvailable = wireMarkButton(key) and Addon.secureAvailable
    else Addon.secureAvailable = false end
    tooltip(markButton, "Safe marking", "A real click or key press applies one mark before combat. The native client preserves existing target marks. All icons are checked again when you press.")
  else Addon.secureAvailable = false end
  local binding = label(window, "Bind in Options > Keybindings > KFC Marks")
  binding:SetPoint("TOPLEFT", 295, -151); binding:SetWidth(250); binding:SetWordWrap(true)
  local explanation = label(window, "Forever restricts automatic combat marking. This addon never triggers protected actions from timers or combat events.")
  explanation:SetPoint("TOPLEFT", 23, -190); explanation:SetWidth(530); explanation:SetWordWrap(true)
  explanation:SetTextColor(0.75, 0.74, 0.69)

  window.enabled = check(window, "Enable marking", function(self)
    Addon.settings.enabled = self:GetChecked() == true; Addon.Changed()
  end)
  window.enabled:SetPoint("TOPLEFT", 20, -231)
  window.claim = check(window, "Volunteer as group marker", function(self)
    Addon.settings.claim = self:GetChecked() == true; Addon.Changed()
  end)
  window.claim:SetPoint("TOPLEFT", 285, -231)
  tooltip(window.claim, "One coordinator", "Automatic selection prefers the group leader, then raid assistants. A volunteer takes priority; ties are deterministic. Other installed copies observe without applying marks. Raid leader/assistant permissions still apply.")

  window.mode = button(window, "Target: current target", 255, function()
    local modes = { target = "mouseover", mouseover = "queue", queue = "target" }
    Addon.settings.mode = modes[Addon.settings.mode]; Addon.Changed()
  end)
  window.mode:SetPoint("TOPLEFT", 23, -268)
  tooltip(window.mode, "Choose an enemy source", "Current target works before pulling. Mouseover is intended for the keybind. The queue contains readable, unmarked nearby enemies already in combat.")
  local probe = button(window, "Check compatibility", 245, function() Addon.Probe() end)
  probe:SetPoint("TOPLEFT", 300, -268)

  local reserveTitle = label(window, "Reserve icons for crowd control or players")
  reserveTitle:SetPoint("TOPLEFT", 23, -309)
  window.icons = {}
  for icon = 1, 8 do
    local index = icon
    local reserve = check(window, "", function(self)
      Addon.settings.reserved[index] = self:GetChecked() == true; Addon.Changed()
    end)
    reserve:SetPoint("TOPLEFT", 20 + ((icon - 1) % 4) * 137, -330 - math.floor((icon - 1) / 4) * 43)
    local texture = reserve:CreateTexture(nil, "ARTWORK")
    texture:SetSize(20, 20); texture:SetPoint("LEFT", reserve, "RIGHT", 0, 0)
    texture:SetTexture("Interface\\TargetingFrame\\UI-RaidTargetingIcon_" .. icon)
    reserve.caption = label(reserve, Addon.IconNames[icon])
    reserve.caption:SetPoint("LEFT", texture, "RIGHT", 3, 0)
    reserve.state = label(reserve, "Unknown")
    reserve.state:SetPoint("TOPLEFT", 29, -24)
    tooltip(reserve, Addon.IconNames[icon] .. " (" .. icon .. ")", "Check to reserve this icon. Occupied living marks are protected by the native availability check, including enemies outside nameplate range. Dead enemies' icons may be reused.")
    window.icons[icon] = reserve
  end
  local orderLabel = label(window, "Priority (8=skull, 7=cross)")
  orderLabel:SetPoint("TOPLEFT", 23, -429)
  window.order = CreateFrame("EditBox", nil, window, "InputBoxTemplate")
  window.order:SetSize(184, 24); window.order:SetPoint("TOPLEFT", 215, -424)
  window.order:SetAutoFocus(false); window.order:SetMaxLetters(40)
  window.order:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
  local function applyOrder()
    local order, err = P.ParseOrder(window.order:GetText())
    if order then Addon.settings.order = order; Addon.Changed(); window.order:ClearFocus()
    else Addon.Print(err) end
  end
  window.order:SetScript("OnEnterPressed", applyOrder)
  local save = button(window, "Apply", 115, applyOrder)
  save:SetPoint("TOPLEFT", 430, -425)
  window.queue = label(window, "No nearby combat enemies.")
  window.queue:SetPoint("TOPLEFT", 23, -468); window.queue:SetWidth(530); window.queue:SetWordWrap(true)
  local footer = label(window, "/kfcmarks  |  /kfcmarks probe  |  Settings save automatically")
  footer:SetPoint("BOTTOMLEFT", 23, 17); footer:SetTextColor(0.6, 0.6, 0.55)
  Addon.window, Addon.markButton = window, markButton
  window:Hide()
end

local function ensureMinimap()
  if minimap or not Minimap then return end
  minimap = CreateFrame("Button", "KFCMarksMinimapButton", Minimap)
  minimap:SetSize(30, 30); minimap:SetPoint("TOPRIGHT", Minimap, "TOPRIGHT", 3, -4)
  minimap:SetFrameStrata("MEDIUM")
  local background = minimap:CreateTexture(nil, "BACKGROUND")
  background:SetAllPoints(); background:SetColorTexture(0.08, 0.07, 0.05, 0.95)
  local icon = minimap:CreateTexture(nil, "ARTWORK")
  icon:SetSize(24, 24); icon:SetPoint("CENTER"); icon:SetTexture("Interface\\TargetingFrame\\UI-RaidTargetingIcon_8")
  minimap:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  minimap:SetScript("OnClick", function(_, mouseButton)
    if mouseButton == "RightButton" then Addon.settings.minimap = false; Addon.Changed()
    else Addon.Toggle() end
  end)
  tooltip(minimap, "KFC Marks", "Party & raid target marking. Left-click to open; right-click to hide this icon. Restore it with /kfcmarks minimap. Marks are applied by player action before combat.")
end

function Addon.IsVisible()
  return window and window:IsShown() or false
end

function Addon.Toggle()
  if P.Combat() then
    if requestedVisibility == nil then requestedVisibility = not Addon.IsVisible()
    else requestedVisibility = not requestedVisibility end
    Addon.Print(requestedVisibility and "The window will open after combat. Mark application is locked." or "The window will close after combat.")
    return
  end
  build()
  if not window then return end
  if window:IsShown() then window:Hide() else window:Show(); Addon.Render(Addon.Plan()) end
end

function Addon.Render(plan)
  ensureMinimap()
  if minimap then minimap:SetShown(Addon.settings.minimap) end
  if not P.Combat() then
    build()
    if pendingMove and window then savePosition() end
    if requestedVisibility ~= nil and window then
      window:SetShown(requestedVisibility); requestedVisibility = nil
    end
  end
  if not window or not window:IsShown() then return end
  window.status:SetText(plan.message or "Marking unavailable.")
  local color = plan.status == "ready" and colors.free or plan.status == "combat" and colors.reserved or colors.unknown
  window.status:SetTextColor(color[1], color[2], color[3])
  window.owner:SetText("Group marker: " .. (plan.owner and plan.owner.name or "none eligible") .. (Addon.communicationWarning and " (addon communication unavailable)" or ""))
  window.enabled:SetChecked(Addon.settings.enabled); window.claim:SetChecked(Addon.settings.claim)
  local modeNames = { target = "Current target", mouseover = "Mouseover (keybind)", queue = "Nearby combat queue" }
  window.mode:SetText("Target: " .. modeNames[Addon.settings.mode])
  if not window.order:HasFocus() then window.order:SetText(table.concat(Addon.settings.order, " ")) end
  if markButton then markButton:SetText(plan.combat and "Locked in combat" or plan.status == "ready" and ("Mark " .. Addon.IconNames[plan.icon]) or "Mark next eligible enemy") end
  for icon = 1, 8 do
    local row = window.icons[icon]
    local state = plan.states[icon] or "unknown"
    row:SetChecked(Addon.settings.reserved[icon] == true)
    row.state:SetText(state:sub(1, 1):upper() .. state:sub(2))
    local shade = colors[state]
    row.state:SetTextColor(shade[1], shade[2], shade[3])
  end
  local names = {}
  for index, enemy in ipairs(plan.queue) do
    if index <= 3 then names[#names + 1] = enemy.name:sub(1, 30) end
  end
  local extra = #plan.queue > 3 and (" + " .. (#plan.queue - 3) .. " more") or ""
  window.queue:SetText(#names > 0 and ("Nearby combat: " .. table.concat(names, ", ") .. extra) or "Nearby combat: no readable, unmarked enemies.")
end
