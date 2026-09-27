local _, Addon = ...

local COLORS = {
  background = { 0.035, 0.035, 0.045, 0.98 },
  panel = { 0.075, 0.07, 0.065, 0.96 },
  panelRaised = { 0.11, 0.095, 0.075, 0.98 },
  border = { 0.42, 0.32, 0.16, 1 },
  borderBright = { 0.78, 0.58, 0.23, 1 },
  gold = { 0.95, 0.72, 0.28, 1 },
  parchment = { 0.86, 0.80, 0.68, 1 },
  muted = { 0.58, 0.55, 0.50, 1 },
  green = { 0.34, 0.82, 0.48, 1 },
  red = { 0.95, 0.30, 0.25, 1 },
  blue = { 0.30, 0.66, 0.95, 1 },
}

local panel = nil
local marketPanel = nil
local launcher = nil
local minimapButton = nil
local refreshElapsed = 0
local DEFAULT_MINIMAP_ANGLE = 310
local FitPanelToScreen

local function ApplyColor(texture, color)
  texture:SetColorTexture(color[1], color[2], color[3], color[4])
end

local function CreateSolidTexture(parent, layer, color)
  local texture = parent:CreateTexture(nil, layer or "BACKGROUND")
  ApplyColor(texture, color)
  return texture
end

local function AddBorder(frame, color, thickness)
  local size = thickness or 1
  local top = CreateSolidTexture(frame, "BORDER", color)
  top:SetPoint("TOPLEFT")
  top:SetPoint("TOPRIGHT")
  top:SetHeight(size)
  local bottom = CreateSolidTexture(frame, "BORDER", color)
  bottom:SetPoint("BOTTOMLEFT")
  bottom:SetPoint("BOTTOMRIGHT")
  bottom:SetHeight(size)
  local left = CreateSolidTexture(frame, "BORDER", color)
  left:SetPoint("TOPLEFT")
  left:SetPoint("BOTTOMLEFT")
  left:SetWidth(size)
  local right = CreateSolidTexture(frame, "BORDER", color)
  right:SetPoint("TOPRIGHT")
  right:SetPoint("BOTTOMRIGHT")
  right:SetWidth(size)
end

local function CreatePanel(parent, name, color, borderColor)
  local frame = CreateFrame("Frame", name, parent)
  local background = CreateSolidTexture(frame, "BACKGROUND", color or COLORS.panel)
  background:SetAllPoints()
  AddBorder(frame, borderColor or COLORS.border, 1)
  return frame
end

local function CreateText(parent, fontObject, text, color)
  local label = parent:CreateFontString(nil, "OVERLAY", fontObject or "GameFontNormal")
  label:SetText(text or "")
  if color then label:SetTextColor(color[1], color[2], color[3], color[4]) end
  return label
end

local function SetButtonTooltip(button, title, description)
  button:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_TOP")
    GameTooltip:SetText(title, COLORS.gold[1], COLORS.gold[2], COLORS.gold[3])
    GameTooltip:AddLine(description, COLORS.parchment[1], COLORS.parchment[2], COLORS.parchment[3], true)
    GameTooltip:Show()
  end)
  button:SetScript("OnLeave", function() GameTooltip:Hide() end)
end

local function CreateActionButton(parent, text, width, tooltipTitle, tooltipDescription)
  local button = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
  button:SetSize(width, 30)
  button:SetText(text)
  SetButtonTooltip(button, tooltipTitle, tooltipDescription)
  return button
end

local function FormatInteger(value)
  value = tonumber(value) or 0
  local text = tostring(math.floor(value))
  while true do
    local updated, replacements = string.gsub(text, "^(-?%d+)(%d%d%d)", "%1,%2")
    text = updated
    if replacements == 0 then return text end
  end
end

local function FormatDuration(milliseconds)
  milliseconds = tonumber(milliseconds) or 0
  if milliseconds < 1000 then return string.format("%d ms", milliseconds) end
  return string.format("%.1f sec", milliseconds / 1000)
end

local function FormatCompleteness(value)
  return string.format("%.1f%%", math.max(0, math.min(1, tonumber(value) or 0)) * 100)
end

local function FormatProvider(provider)
  if provider == "blizzard_replicate" then return "Native Forever" end
  if provider == "auctionator" then return "Auctionator" end
  return "Legacy / unknown"
end

local function FormatTime(timestamp)
  if type(timestamp) ~= "number" or timestamp <= 0 then return "Unknown" end
  return date("%d %b  %H:%M", timestamp)
end

local function FormatCooldown(seconds)
  seconds = math.max(0, math.ceil(tonumber(seconds) or 0))
  if seconds < 60 then return string.format("%ds", seconds) end
  return string.format("%dm %02ds", math.floor(seconds / 60), seconds % 60)
end

local function FormatCopper(value)
  value = math.max(0, math.floor(tonumber(value) or 0))
  local gold = math.floor(value / 10000)
  local silver = math.floor((value % 10000) / 100)
  local copper = value % 100
  if gold > 0 then return string.format("%dg %02ds %02dc", gold, silver, copper) end
  if silver > 0 then return string.format("%ds %02dc", silver, copper) end
  return string.format("%dc", copper)
end

local function FormatSignedBasisPoints(value)
  value = tonumber(value)
  if not value then return "—" end
  return string.format("%+.1f%%", value / 100)
end

local function SignalPresentation(signal)
  if signal == "bargain" then return "BARGAIN", COLORS.green end
  if signal == "rising" then return "RISING", COLORS.blue end
  if signal == "spike_risk" then return "SPIKE RISK", COLORS.gold end
  if signal == "oversupplied" then return "OVERSUPPLIED", COLORS.red end
  if signal == "falling" then return "FALLING", COLORS.red end
  if signal == "too_thin" then return "TOO THIN", COLORS.muted end
  if signal == "normal" then return "NORMAL", COLORS.parchment end
  return "COLLECTING", COLORS.muted
end

local function SetStatusDot(texture, good, warning)
  if good then
    ApplyColor(texture, COLORS.green)
  elseif warning then
    ApplyColor(texture, COLORS.gold)
  else
    ApplyColor(texture, COLORS.red)
  end
end

local function CreateHealthRow(parent, y, label)
  local dot = CreateSolidTexture(parent, "ARTWORK", COLORS.muted)
  dot:SetSize(8, 8)
  dot:SetPoint("TOPLEFT", 16, y)
  local title = CreateText(parent, "GameFontHighlightSmall", label, COLORS.muted)
  title:SetPoint("LEFT", dot, "RIGHT", 8, 0)
  local value = CreateText(parent, "GameFontNormalSmall", "—", COLORS.parchment)
  value:SetPoint("TOPRIGHT", -14, y + 3)
  value:SetJustifyH("RIGHT")
  return { dot = dot, value = value }
end

local function CreateMetric(parent, x, label)
  local metric = CreatePanel(parent, nil, COLORS.panel, COLORS.border)
  metric:SetSize(116, 76)
  metric:SetPoint("TOPLEFT", x, -204)
  local caption = CreateText(metric, "GameFontNormalSmall", string.upper(label), COLORS.muted)
  caption:SetPoint("TOPLEFT", 10, -11)
  local value = CreateText(metric, "GameFontNormalLarge", "0", COLORS.parchment)
  value:SetPoint("BOTTOMLEFT", 10, 13)
  return { frame = metric, value = value }
end

local function CreateHistoryRow(parent, index)
  local row = CreateFrame("Frame", nil, parent)
  row:SetSize(596, 27)
  row:SetPoint("TOPLEFT", 14, -55 - ((index - 1) * 28))
  if index % 2 == 0 then
    local background = CreateSolidTexture(row, "BACKGROUND", { 0.12, 0.105, 0.085, 0.36 })
    background:SetAllPoints()
  end

  local timeText = CreateText(row, "GameFontHighlightSmall", "", COLORS.parchment)
  timeText:SetPoint("LEFT", 4, 0)
  timeText:SetWidth(128)
  timeText:SetJustifyH("LEFT")
  local providerText = CreateText(row, "GameFontHighlightSmall", "", COLORS.parchment)
  providerText:SetPoint("LEFT", 142, 0)
  providerText:SetWidth(126)
  providerText:SetJustifyH("LEFT")
  local marketsText = CreateText(row, "GameFontHighlightSmall", "", COLORS.parchment)
  marketsText:SetPoint("LEFT", 284, 0)
  marketsText:SetWidth(74)
  marketsText:SetJustifyH("RIGHT")
  local rowsText = CreateText(row, "GameFontHighlightSmall", "", COLORS.parchment)
  rowsText:SetPoint("LEFT", 382, 0)
  rowsText:SetWidth(74)
  rowsText:SetJustifyH("RIGHT")
  local healthText = CreateText(row, "GameFontHighlightSmall", "", COLORS.green)
  healthText:SetPoint("RIGHT", -4, 0)
  healthText:SetWidth(104)
  healthText:SetJustifyH("RIGHT")
  return {
    frame = row,
    time = timeText,
    provider = providerText,
    markets = marketsText,
    rows = rowsText,
    health = healthText,
  }
end

local function CreateScannerPanel()
  local frame = CreateFrame("Frame", "WoWTraderScannerFrame", UIParent)
  frame:SetSize(860, 620)
  frame:SetPoint("CENTER", 0, 18)
  frame:SetFrameStrata("DIALOG")
  frame:SetToplevel(true)
  frame:SetClampedToScreen(true)
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:Hide()

  local background = CreateSolidTexture(frame, "BACKGROUND", COLORS.background)
  background:SetAllPoints()
  AddBorder(frame, COLORS.borderBright, 2)

  local header = CreateFrame("Frame", nil, frame)
  header:SetPoint("TOPLEFT", 2, -2)
  header:SetPoint("TOPRIGHT", -2, -2)
  header:SetHeight(54)
  header:EnableMouse(true)
  header:RegisterForDrag("LeftButton")
  header:SetScript("OnDragStart", function() frame:StartMoving() end)
  header:SetScript("OnDragStop", function() frame:StopMovingOrSizing() end)
  local headerBackground = CreateSolidTexture(header, "BACKGROUND", COLORS.panelRaised)
  headerBackground:SetAllPoints()
  local headerLine = CreateSolidTexture(header, "BORDER", COLORS.borderBright)
  headerLine:SetPoint("BOTTOMLEFT")
  headerLine:SetPoint("BOTTOMRIGHT")
  headerLine:SetHeight(1)

  local icon = header:CreateTexture(nil, "ARTWORK")
  icon:SetTexture("Interface\\Icons\\INV_Misc_Coin_02")
  icon:SetSize(36, 36)
  icon:SetPoint("LEFT", 14, 0)
  local title = CreateText(header, "GameFontNormalLarge", "WoW Trader", COLORS.gold)
  title:SetPoint("LEFT", icon, "RIGHT", 11, 7)
  local subtitle = CreateText(header, "GameFontHighlightSmall", "AUCTION HOUSE INTELLIGENCE", COLORS.muted)
  subtitle:SetPoint("LEFT", icon, "RIGHT", 11, -10)

  local closeButton = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
  closeButton:SetPoint("TOPRIGHT", -5, -5)
  closeButton:SetScript("OnClick", function() frame:Hide() end)

  local sidebar = CreatePanel(frame, nil, COLORS.panel, COLORS.border)
  sidebar:SetPoint("TOPLEFT", 16, -70)
  sidebar:SetPoint("BOTTOMLEFT", 16, 18)
  sidebar:SetWidth(184)

  local crest = sidebar:CreateTexture(nil, "ARTWORK")
  crest:SetTexture("Interface\\Icons\\INV_Misc_Coin_05")
  crest:SetSize(54, 54)
  crest:SetPoint("TOP", 0, -18)
  local providerEyebrow = CreateText(sidebar, "GameFontNormalSmall", "ACTIVE PROVIDER", COLORS.muted)
  providerEyebrow:SetPoint("TOP", crest, "BOTTOM", 0, -11)
  local providerName = CreateText(sidebar, "GameFontNormal", "—", COLORS.gold)
  providerName:SetPoint("TOP", providerEyebrow, "BOTTOM", 0, -5)
  providerName:SetWidth(156)
  providerName:SetJustifyH("CENTER")
  local buildLabel = CreateText(sidebar, "GameFontHighlightSmall", "", COLORS.muted)
  buildLabel:SetPoint("TOP", providerName, "BOTTOM", 0, -4)
  buildLabel:SetWidth(158)
  buildLabel:SetJustifyH("CENTER")

  local separator = CreateSolidTexture(sidebar, "ARTWORK", COLORS.border)
  separator:SetPoint("TOPLEFT", 14, -153)
  separator:SetPoint("TOPRIGHT", -14, -153)
  separator:SetHeight(1)

  local providerHealth = CreateHealthRow(sidebar, -176, "Provider")
  local auctionHealth = CreateHealthRow(sidebar, -207, "Auction House")
  local throttleHealth = CreateHealthRow(sidebar, -238, "Query status")
  local queueHealth = CreateHealthRow(sidebar, -269, "Local history")

  local scopeCaption = CreateText(sidebar, "GameFontNormalSmall", "MARKET SCOPE", COLORS.muted)
  scopeCaption:SetPoint("TOPLEFT", 16, -310)
  local scopeValue = CreateText(sidebar, "GameFontHighlight", "—", COLORS.parchment)
  scopeValue:SetPoint("TOPLEFT", 16, -329)
  scopeValue:SetWidth(150)
  scopeValue:SetJustifyH("LEFT")

  local helpPanel = CreatePanel(sidebar, nil, { 0.10, 0.085, 0.06, 0.72 }, COLORS.border)
  helpPanel:SetPoint("BOTTOMLEFT", 12, 12)
  helpPanel:SetPoint("BOTTOMRIGHT", -12, 12)
  helpPanel:SetHeight(118)
  local helpTitle = CreateText(helpPanel, "GameFontNormalSmall", "HOW IT WORKS", COLORS.gold)
  helpTitle:SetPoint("TOPLEFT", 10, -10)
  local helpText = CreateText(
    helpPanel,
    "GameFontHighlightSmall",
    "1. Open the Auction House\n2. Start a full scan\n3. Save & Reload\n4. Companion uploads it",
    COLORS.parchment
  )
  helpText:SetPoint("TOPLEFT", 10, -29)
  helpText:SetPoint("BOTTOMRIGHT", -8, 8)
  helpText:SetJustifyH("LEFT")
  helpText:SetJustifyV("TOP")

  local hero = CreatePanel(frame, nil, COLORS.panelRaised, COLORS.borderBright)
  hero:SetSize(626, 120)
  hero:SetPoint("TOPLEFT", 218, -70)
  local statePill = CreatePanel(hero, nil, COLORS.panel, COLORS.border)
  statePill:SetSize(142, 24)
  statePill:SetPoint("TOPLEFT", 14, -13)
  local stateDot = CreateSolidTexture(statePill, "ARTWORK", COLORS.muted)
  stateDot:SetSize(7, 7)
  stateDot:SetPoint("LEFT", 9, 0)
  local statePillText = CreateText(statePill, "GameFontNormalSmall", "READY", COLORS.parchment)
  statePillText:SetPoint("LEFT", stateDot, "RIGHT", 7, 0)

  local statusTitle = CreateText(hero, "GameFontNormalLarge", "Scanner ready", COLORS.parchment)
  statusTitle:SetPoint("TOPLEFT", 15, -44)
  local statusDetail = CreateText(hero, "GameFontHighlightSmall", "", COLORS.muted)
  statusDetail:SetPoint("TOPLEFT", 15, -68)
  statusDetail:SetPoint("TOPRIGHT", -15, -68)
  statusDetail:SetJustifyH("LEFT")

  local progress = CreateFrame("StatusBar", nil, hero)
  progress:SetStatusBarTexture("Interface\\TargetingFrame\\UI-StatusBar")
  progress:SetStatusBarColor(COLORS.gold[1], COLORS.gold[2], COLORS.gold[3], 0.95)
  progress:SetPoint("BOTTOMLEFT", 15, 14)
  progress:SetPoint("BOTTOMRIGHT", -15, 14)
  progress:SetHeight(11)
  local progressBackground = CreateSolidTexture(progress, "BACKGROUND", { 0.015, 0.015, 0.02, 1 })
  progressBackground:SetAllPoints()
  AddBorder(progress, COLORS.border, 1)
  local progressText = CreateText(progress, "GameFontHighlightSmall", "", COLORS.parchment)
  progressText:SetPoint("CENTER", 0, 0)

  local metrics = {
    markets = CreateMetric(frame, 218, "Markets"),
    rows = CreateMetric(frame, 345, "Rows"),
    priced = CreateMetric(frame, 472, "Priced"),
    bidOnly = CreateMetric(frame, 599, "Bid only"),
    issues = CreateMetric(frame, 726, "Issues"),
  }

  local history = CreatePanel(frame, nil, COLORS.panel, COLORS.border)
  history:SetSize(626, 226)
  history:SetPoint("TOPLEFT", 218, -294)
  local historyTitle = CreateText(history, "GameFontNormal", "Recent saved scans", COLORS.gold)
  historyTitle:SetPoint("TOPLEFT", 14, -12)
  local historyHint = CreateText(history, "GameFontHighlightSmall", "Newest first · up to 6 shown", COLORS.muted)
  historyHint:SetPoint("TOPRIGHT", -14, -14)
  local historyDivider = CreateSolidTexture(history, "ARTWORK", COLORS.border)
  historyDivider:SetPoint("TOPLEFT", 14, -41)
  historyDivider:SetPoint("TOPRIGHT", -14, -41)
  historyDivider:SetHeight(1)

  local headers = {
    { text = "SAVED", x = 18 },
    { text = "PROVIDER", x = 156 },
    { text = "MARKETS", x = 300 },
    { text = "ROWS", x = 414 },
    { text = "QUALITY", x = 526 },
  }
  for _, headerInfo in ipairs(headers) do
    local headerText = CreateText(history, "GameFontNormalSmall", headerInfo.text, COLORS.muted)
    headerText:SetPoint("TOPLEFT", headerInfo.x, -33)
  end

  local historyRows = {}
  for index = 1, 6 do historyRows[index] = CreateHistoryRow(history, index) end
  local emptyHistory = CreateText(
    history,
    "GameFontHighlight",
    "No completed scans are saved yet. Open the Auction House and start your first scan.",
    COLORS.muted
  )
  emptyHistory:SetPoint("CENTER", 0, -16)
  emptyHistory:SetWidth(470)
  emptyHistory:SetJustifyH("CENTER")

  local scanButton = CreateActionButton(
    frame,
    "Start scan",
    122,
    "Start market scan",
    "Requests the full visible Auction House snapshot using the active provider."
  )
  scanButton:SetPoint("BOTTOMLEFT", 218, 20)
  scanButton:SetScript("OnClick", function() Addon.StartScan() end)
  local cancelButton = CreateActionButton(
    frame,
    "Cancel",
    94,
    "Cancel scan",
    "Stops the current native scan without saving a partial snapshot."
  )
  cancelButton:SetPoint("LEFT", scanButton, "RIGHT", 8, 0)
  cancelButton:SetScript("OnClick", function() Addon.CancelScan() end)
  local probeButton = CreateActionButton(
    frame,
    "Run probe",
    108,
    "Capability probe",
    "Prints the client build, provider availability, throttle readiness, and market scope."
  )
  probeButton:SetPoint("LEFT", cancelButton, "RIGHT", 8, 0)
  probeButton:SetScript("OnClick", function() Addon.RunProbe() end)
  local reloadButton = CreateActionButton(
    frame,
    "Save & Reload",
    138,
    "Flush saved scans",
    "Reloads the interface so WoW writes SavedVariables for the desktop companion."
  )
  reloadButton:SetPoint("BOTTOMRIGHT", -16, 20)
  reloadButton:SetScript("OnClick", function() Addon.SaveAndReload() end)
  local marketButton = CreateActionButton(
    frame,
    "Market intel",
    126,
    "Market intelligence",
    "Search synchronized price history and inspect bargains, trends, spikes, and supply risk."
  )
  marketButton:SetPoint("RIGHT", reloadButton, "LEFT", -8, 0)
  marketButton:SetScript("OnClick", function() Addon.ShowMarketIntelligence("") end)

  frame.widgets = {
    providerName = providerName,
    buildLabel = buildLabel,
    providerHealth = providerHealth,
    auctionHealth = auctionHealth,
    throttleHealth = throttleHealth,
    queueHealth = queueHealth,
    scopeValue = scopeValue,
    statePill = statePill,
    stateDot = stateDot,
    statePillText = statePillText,
    statusTitle = statusTitle,
    statusDetail = statusDetail,
    progress = progress,
    progressText = progressText,
    metrics = metrics,
    historyRows = historyRows,
    emptyHistory = emptyHistory,
    scanButton = scanButton,
    cancelButton = cancelButton,
    probeButton = probeButton,
    reloadButton = reloadButton,
    marketButton = marketButton,
  }
  return frame
end

local function CreateMarketRow(parent, index)
  local row = CreateFrame("Frame", nil, parent)
  row:SetSize(790, 34)
  row:SetPoint("TOPLEFT", 18, -151 - ((index - 1) * 35))
  row:EnableMouse(true)
  if index % 2 == 0 then
    local background = CreateSolidTexture(row, "BACKGROUND", { 0.12, 0.105, 0.085, 0.36 })
    background:SetAllPoints()
  end
  local name = CreateText(row, "GameFontHighlightSmall", "", COLORS.parchment)
  name:SetPoint("LEFT", 6, 0)
  name:SetWidth(220)
  name:SetJustifyH("LEFT")
  local signal = CreateText(row, "GameFontNormalSmall", "", COLORS.muted)
  signal:SetPoint("LEFT", 236, 0)
  signal:SetWidth(100)
  signal:SetJustifyH("LEFT")
  local current = CreateText(row, "GameFontHighlightSmall", "", COLORS.parchment)
  current:SetPoint("LEFT", 345, 0)
  current:SetWidth(105)
  current:SetJustifyH("RIGHT")
  local normal = CreateText(row, "GameFontHighlightSmall", "", COLORS.muted)
  normal:SetPoint("LEFT", 461, 0)
  normal:SetWidth(105)
  normal:SetJustifyH("RIGHT")
  local change = CreateText(row, "GameFontNormalSmall", "", COLORS.parchment)
  change:SetPoint("LEFT", 578, 0)
  change:SetWidth(72)
  change:SetJustifyH("RIGHT")
  local evidence = CreateText(row, "GameFontHighlightSmall", "", COLORS.muted)
  evidence:SetPoint("RIGHT", -6, 0)
  evidence:SetWidth(122)
  evidence:SetJustifyH("RIGHT")
  return {
    frame = row,
    name = name,
    signal = signal,
    current = current,
    normal = normal,
    change = change,
    evidence = evidence,
  }
end

local function UpdateMarketPanel()
  if not marketPanel or not marketPanel:IsShown() then return end
  local widgets = marketPanel.widgets
  local snapshot = Addon.GetMarketIntelligenceSnapshot(widgets.search:GetText())
  if not snapshot.available then
    widgets.status:SetText(snapshot.reason or "Market history is unavailable.")
    widgets.status:SetTextColor(COLORS.gold[1], COLORS.gold[2], COLORS.gold[3], COLORS.gold[4])
    widgets.scope:SetText("Run a scan, Save & Reload, and keep the companion running.")
    widgets.empty:SetText("No compatible synchronized history is loaded.")
    widgets.empty:Show()
  else
    widgets.status:SetText(string.format("%s matching item(s)", FormatInteger(snapshot.totalItems)))
    widgets.status:SetTextColor(COLORS.green[1], COLORS.green[2], COLORS.green[3], COLORS.green[4])
    widgets.scope:SetText(string.format(
      "%s · %s · source %s",
      snapshot.realmId or "Unknown realm",
      string.upper(snapshot.auctionHouseType or "unknown"),
      snapshot.sourceScanAt or "unknown"
    ))
    widgets.empty:SetText("No item name or ID matches this search.")
    widgets.empty:SetShown(#snapshot.items == 0)
  end
  for index, row in ipairs(widgets.rows) do
    local item = snapshot.items[index]
    row.frame:SetShown(item ~= nil)
    if item then
      local watchedItemId = item.itemId
      local signalText, signalColor = SignalPresentation(item.signal)
      row.name:SetText((item.watched and "|cffffd45c★|r " or "") .. item.name ..
        "  |cff777777#" .. item.itemId .. "|r")
      row.signal:SetText(signalText)
      row.signal:SetTextColor(signalColor[1], signalColor[2], signalColor[3], signalColor[4])
      row.current:SetText(item.current and FormatCopper(item.current) or "—")
      row.normal:SetText(item.normal and FormatCopper(item.normal) or "—")
      row.change:SetText(FormatSignedBasisPoints(item.differenceBP))
      local changeColor = (tonumber(item.differenceBP) or 0) < 0 and COLORS.green or COLORS.gold
      row.change:SetTextColor(changeColor[1], changeColor[2], changeColor[3], changeColor[4])
      if item.signal == "collecting" then
        row.evidence:SetText(string.format("%d / %d scans", item.observations, item.minimum))
      else
        row.evidence:SetText(string.format(
          "%d qty · %.0f%% conf",
          tonumber(item.quantity) or 0,
          (tonumber(item.confidenceBP) or 0) / 100
        ))
      end
      row.frame:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
        GameTooltip:AddLine(item.name, COLORS.gold[1], COLORS.gold[2], COLORS.gold[3])
        GameTooltip:AddLine(signalText, signalColor[1], signalColor[2], signalColor[3])
        GameTooltip:AddLine("Current and normal values are asking-price evidence, not confirmed sales.", 1, 1, 1, true)
        GameTooltip:AddLine(string.format("%d independent half-hour observation(s)", item.observations), COLORS.muted[1], COLORS.muted[2], COLORS.muted[3])
        GameTooltip:AddLine("Click to add or remove this item from your watchlist.", COLORS.parchment[1], COLORS.parchment[2], COLORS.parchment[3], true)
        GameTooltip:Show()
      end)
      row.frame:SetScript("OnLeave", function() GameTooltip:Hide() end)
      row.frame:SetScript("OnMouseUp", function()
        Addon.ToggleMarketWatch(watchedItemId)
        UpdateMarketPanel()
      end)
    end
  end
end

local function CreateMarketPanel()
  local frame = CreateFrame("Frame", "WoWTraderMarketIntelligenceFrame", UIParent)
  frame:SetSize(860, 620)
  frame:SetPoint("CENTER", 0, 18)
  frame:SetFrameStrata("DIALOG")
  frame:SetToplevel(true)
  frame:SetClampedToScreen(true)
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:Hide()
  local background = CreateSolidTexture(frame, "BACKGROUND", COLORS.background)
  background:SetAllPoints()
  AddBorder(frame, COLORS.borderBright, 2)

  local header = CreateFrame("Frame", nil, frame)
  header:SetPoint("TOPLEFT", 2, -2)
  header:SetPoint("TOPRIGHT", -2, -2)
  header:SetHeight(54)
  header:EnableMouse(true)
  header:RegisterForDrag("LeftButton")
  header:SetScript("OnDragStart", function() frame:StartMoving() end)
  header:SetScript("OnDragStop", function() frame:StopMovingOrSizing() end)
  local headerBackground = CreateSolidTexture(header, "BACKGROUND", COLORS.panelRaised)
  headerBackground:SetAllPoints()
  local title = CreateText(header, "GameFontNormalLarge", "Market intelligence", COLORS.gold)
  title:SetPoint("LEFT", 18, 7)
  local subtitle = CreateText(header, "GameFontHighlightSmall", "PRICE HISTORY · SUPPLY · CONFIDENCE", COLORS.muted)
  subtitle:SetPoint("LEFT", 18, -11)
  local closeButton = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
  closeButton:SetPoint("TOPRIGHT", -5, -5)
  closeButton:SetScript("OnClick", function() frame:Hide() end)

  local searchLabel = CreateText(frame, "GameFontNormalSmall", "SEARCH ITEM NAME OR ID", COLORS.muted)
  searchLabel:SetPoint("TOPLEFT", 20, -76)
  local search = CreateFrame("EditBox", nil, frame, "InputBoxTemplate")
  search:SetSize(360, 28)
  search:SetPoint("TOPLEFT", 20, -92)
  search:SetAutoFocus(false)
  search:SetMaxLetters(96)
  search:SetScript("OnTextChanged", function() UpdateMarketPanel() end)
  search:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
  local backButton = CreateActionButton(
    frame,
    "Back to scanner",
    132,
    "Market scanner",
    "Return to scan controls and saved-scan quality."
  )
  backButton:SetPoint("TOPRIGHT", -20, -88)
  backButton:SetScript("OnClick", function()
    frame:Hide()
    Addon.ShowScannerPanel()
  end)
  local status = CreateText(frame, "GameFontNormal", "", COLORS.parchment)
  status:SetPoint("TOPLEFT", 398, -77)
  local scope = CreateText(frame, "GameFontHighlightSmall", "", COLORS.muted)
  scope:SetPoint("TOPLEFT", 398, -100)
  scope:SetWidth(300)

  local headers = {
    { text = "ITEM", x = 24 }, { text = "SIGNAL", x = 254 },
    { text = "CURRENT", x = 399 }, { text = "NORMAL", x = 515 },
    { text = "CHANGE", x = 624 }, { text = "EVIDENCE", x = 712 },
  }
  for _, headerInfo in ipairs(headers) do
    local text = CreateText(frame, "GameFontNormalSmall", headerInfo.text, COLORS.muted)
    text:SetPoint("TOPLEFT", headerInfo.x, -134)
  end
  local divider = CreateSolidTexture(frame, "ARTWORK", COLORS.border)
  divider:SetPoint("TOPLEFT", 20, -147)
  divider:SetPoint("TOPRIGHT", -20, -147)
  divider:SetHeight(1)
  local rows = {}
  for index = 1, 12 do rows[index] = CreateMarketRow(frame, index) end
  local empty = CreateText(frame, "GameFontHighlight", "", COLORS.muted)
  empty:SetPoint("CENTER", 0, -20)
  empty:SetWidth(560)
  empty:SetJustifyH("CENTER")
  local disclaimer = CreateText(
    frame,
    "GameFontHighlightSmall",
    "Signals use accepted half-hour snapshots. Asking prices do not prove demand or completed sales.",
    COLORS.muted
  )
  disclaimer:SetPoint("BOTTOMLEFT", 20, 18)
  frame.widgets = { search = search, status = status, scope = scope, rows = rows, empty = empty }
  frame:SetScript("OnShow", function()
    FitPanelToScreen(frame)
    UpdateMarketPanel()
  end)
  return frame
end

local function EnsureMarketPanel()
  if not marketPanel then
    marketPanel = CreateMarketPanel()
    if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, marketPanel:GetName()) end
  end
  return marketPanel
end

function Addon.ShowMarketIntelligence(query)
  if panel then panel:Hide() end
  local frame = EnsureMarketPanel()
  frame.widgets.search:SetText(query or "")
  frame:Show()
  frame.widgets.search:SetFocus()
  UpdateMarketPanel()
end

FitPanelToScreen = function(frame)
  local availableWidth = math.max(1, UIParent:GetWidth() - 40)
  local availableHeight = math.max(1, UIParent:GetHeight() - 40)
  local scale = math.min(1, availableWidth / 860, availableHeight / 620)
  frame:SetScale(math.max(0.65, scale))
end

local function StatusPresentation(snapshot)
  if not snapshot.providerAvailable then
    return "UNAVAILABLE", "Scanner provider unavailable", "The required provider is not available on this client.", "error"
  elseif snapshot.status == "awaiting_response" then
    return "REQUESTED", "Waiting for Blizzard", "The full-market request was sent. Keep the Auction House open.", "active"
  elseif snapshot.status == "reading" then
    return "SCANNING", "Reading Auction House listings", "Rows are processed in small frame-safe batches.", "active"
  elseif snapshot.status == "resolving_cache" then
    return "RESOLVING", "Resolving item information", string.format(
      "%s item rows are still waiting for client cache data.",
      FormatInteger(snapshot.resolvingCount)
    ), "warning"
  elseif snapshot.status == "saved" then
    return "SAVED", "Scan saved locally", "Use Save & Reload so the companion can upload this snapshot.", "success"
  elseif snapshot.status == "failed" then
    return "FAILED", "Scan was not saved", snapshot.failureReason or "The scan failed without replacing the latest good snapshot.", "error"
  elseif snapshot.inCombat then
    return "IN COMBAT", "Scanner temporarily unavailable", "Leave combat before starting a scan.", "warning"
  elseif not snapshot.auctionHouseOpen then
    return "AH CLOSED", "Open the Auction House", "The scanner becomes available while an Auction House window is open.", "warning"
  elseif snapshot.cooldownRemaining > 0 then
    return "COOLDOWN", "Full scan cooling down", "Ready again in approximately " .. FormatCooldown(snapshot.cooldownRemaining) .. ".", "warning"
  elseif snapshot.throttleReady == false then
    return "THROTTLED", "Blizzard query queue is busy", "Wait until the Auction House query system becomes ready.", "warning"
  end
  return "READY", "Scanner ready", "Start a full market snapshot when you are ready.", "success"
end

local function ApplyTone(widgets, tone)
  local color = COLORS.gold
  if tone == "success" then color = COLORS.green
  elseif tone == "error" then color = COLORS.red
  elseif tone == "active" then color = COLORS.blue end
  SetStatusDot(widgets.stateDot, tone == "success", tone == "warning")
  if tone == "active" then ApplyColor(widgets.stateDot, COLORS.blue) end
  widgets.statePillText:SetTextColor(color[1], color[2], color[3], color[4])
  widgets.statusTitle:SetTextColor(color[1], color[2], color[3], color[4])
end

local function UpdatePanel()
  if not panel or not panel:IsShown() then return end
  local snapshot = Addon.GetScannerSnapshot()
  local widgets = panel.widgets
  widgets.providerName:SetText(FormatProvider(snapshot.provider))
  widgets.buildLabel:SetText("v" .. snapshot.clientVersion .. " · build " .. snapshot.clientBuild)
  widgets.scopeValue:SetText(string.upper(snapshot.auctionHouseType or "unknown"))

  SetStatusDot(widgets.providerHealth.dot, snapshot.providerAvailable, false)
  widgets.providerHealth.value:SetText(snapshot.providerAvailable and "Available" or "Missing")
  SetStatusDot(widgets.auctionHealth.dot, snapshot.auctionHouseOpen, not snapshot.auctionHouseOpen)
  widgets.auctionHealth.value:SetText(snapshot.auctionHouseOpen and "Open" or "Closed")
  if snapshot.provider ~= "blizzard_replicate" then
    SetStatusDot(widgets.throttleHealth.dot, true, false)
    widgets.throttleHealth.value:SetText("Provider managed")
  elseif snapshot.cooldownRemaining > 0 then
    SetStatusDot(widgets.throttleHealth.dot, false, true)
    widgets.throttleHealth.value:SetText(FormatCooldown(snapshot.cooldownRemaining))
  elseif snapshot.throttleReady == false then
    SetStatusDot(widgets.throttleHealth.dot, false, true)
    widgets.throttleHealth.value:SetText("Busy")
  else
    SetStatusDot(widgets.throttleHealth.dot, true, false)
    widgets.throttleHealth.value:SetText(snapshot.throttleReady == nil and "Unknown" or "Ready")
  end
  SetStatusDot(widgets.queueHealth.dot, snapshot.queuedScanCount > 0, snapshot.queuedScanCount == 0)
  widgets.queueHealth.value:SetText(FormatInteger(snapshot.queuedScanCount) .. " / 8")

  local stateText, title, detail, tone = StatusPresentation(snapshot)
  widgets.statePillText:SetText(stateText)
  widgets.statusTitle:SetText(title)
  widgets.statusDetail:SetText(detail)
  ApplyTone(widgets, tone)

  local maximum = math.max(1, snapshot.progressMaximum or 0)
  local value = math.max(0, math.min(maximum, snapshot.progressValue or 0))
  widgets.progress:SetMinMaxValues(0, maximum)
  widgets.progress:SetValue(value)
  if snapshot.active and snapshot.progressMaximum > 0 then
    widgets.progressText:SetText(string.format(
      "%s / %s rows",
      FormatInteger(snapshot.progressValue),
      FormatInteger(snapshot.progressMaximum)
    ))
  elseif snapshot.status == "saved" then
    widgets.progressText:SetText(FormatCompleteness(snapshot.quality.completeness) .. " complete · " ..
      FormatDuration(snapshot.quality.scanDurationMs))
  else
    widgets.progressText:SetText("")
  end

  local issues = snapshot.quality.unresolvedRowCount + snapshot.quality.invalidRowCount +
    snapshot.quality.secretRowCount
  widgets.metrics.markets.value:SetText(FormatInteger(snapshot.quality.marketCount))
  widgets.metrics.rows.value:SetText(FormatInteger(snapshot.quality.reportedRowCount))
  widgets.metrics.priced.value:SetText(FormatInteger(snapshot.quality.pricedRowCount))
  widgets.metrics.bidOnly.value:SetText(FormatInteger(snapshot.quality.noBuyoutRowCount))
  widgets.metrics.issues.value:SetText(FormatInteger(issues))
  widgets.metrics.issues.value:SetTextColor(
    issues == 0 and COLORS.green[1] or COLORS.red[1],
    issues == 0 and COLORS.green[2] or COLORS.red[2],
    issues == 0 and COLORS.green[3] or COLORS.red[3]
  )

  widgets.emptyHistory:SetShown(#snapshot.recentScans == 0)
  for index, row in ipairs(widgets.historyRows) do
    local scan = snapshot.recentScans[index]
    row.frame:SetShown(scan ~= nil)
    if scan then
      row.time:SetText(FormatTime(scan.completedAt))
      row.provider:SetText(FormatProvider(scan.provider))
      row.markets:SetText(FormatInteger(scan.marketCount))
      row.rows:SetText(FormatInteger(scan.reportedRowCount))
      row.health:SetText(FormatCompleteness(scan.completeness))
      local healthy = (scan.unresolvedRowCount or 0) == 0 and (scan.completeness or 0) >= 0.98
      local healthColor = healthy and COLORS.green or COLORS.gold
      row.health:SetTextColor(healthColor[1], healthColor[2], healthColor[3], healthColor[4])
    end
  end

  widgets.scanButton:SetEnabled(snapshot.canScan)
  widgets.cancelButton:SetEnabled(snapshot.canCancel)
  widgets.probeButton:SetEnabled(not snapshot.active)
  widgets.reloadButton:SetEnabled(snapshot.canReload)
end

local function EnsurePanel()
  if panel == nil then
    panel = CreateScannerPanel()
    if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, panel:GetName()) end
    panel:SetScript("OnShow", function()
      FitPanelToScreen(panel)
      refreshElapsed = 1
      UpdatePanel()
    end)
    panel:SetScript("OnUpdate", function(_, elapsed)
      refreshElapsed = refreshElapsed + elapsed
      if refreshElapsed >= 0.2 then
        refreshElapsed = 0
        UpdatePanel()
      end
    end)
  end
  return panel
end

function Addon.ToggleScannerPanel()
  local scannerPanel = EnsurePanel()
  if scannerPanel:IsShown() then scannerPanel:Hide() else
    if marketPanel then marketPanel:Hide() end
    scannerPanel:Show()
  end
end

function Addon.ShowScannerPanel()
  if marketPanel then marketPanel:Hide() end
  EnsurePanel():Show()
end

local function GetUiSettings()
  if type(WOW_TRADER_SAVED) ~= "table" then WOW_TRADER_SAVED = {} end
  if type(WOW_TRADER_SAVED.ui) ~= "table" then WOW_TRADER_SAVED.ui = {} end
  return WOW_TRADER_SAVED.ui
end

local function PositionMinimapButton()
  if not minimapButton or not Minimap then return end
  local settings = GetUiSettings()
  local angle = math.rad(tonumber(settings.minimapAngle) or DEFAULT_MINIMAP_ANGLE)
  local radius = (math.max(Minimap:GetWidth() or 140, Minimap:GetHeight() or 140) * 0.5) + 8
  minimapButton:ClearAllPoints()
  minimapButton:SetPoint(
    "CENTER",
    Minimap,
    "CENTER",
    math.cos(angle) * radius,
    math.sin(angle) * radius
  )
end

local function HideMinimapButton()
  GetUiSettings().minimapHidden = true
  if minimapButton then minimapButton:Hide() end
  DEFAULT_CHAT_FRAME:AddMessage(
    "|cffc9a86aWoW Trader:|r minimap button hidden. Use |cffffffff/wowtrader minimap|r to restore it."
  )
end

local function EnsureMinimapButton()
  if minimapButton then return minimapButton end
  if not Minimap then return nil end

  minimapButton = _G.LibDBIcon10_WowTraderCollector or
    CreateFrame("Button", "LibDBIcon10_WowTraderCollector", Minimap)
  minimapButton:SetParent(Minimap)
  minimapButton:SetSize(31, 31)
  minimapButton:SetFrameStrata("MEDIUM")
  minimapButton:SetFrameLevel((Minimap:GetFrameLevel() or 0) + 8)
  minimapButton:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  minimapButton:RegisterForDrag("LeftButton")

  local background = minimapButton:CreateTexture(nil, "BACKGROUND")
  background:SetTexture("Interface\\Minimap\\UI-Minimap-Background")
  background:SetSize(20, 20)
  background:SetPoint("CENTER")

  local icon = minimapButton:CreateTexture(nil, "ARTWORK")
  icon:SetTexture("Interface\\Icons\\INV_Misc_Coin_02")
  icon:SetSize(20, 20)
  icon:SetPoint("CENTER")
  icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)

  local border = minimapButton:CreateTexture(nil, "OVERLAY")
  border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
  border:SetSize(54, 54)
  border:SetPoint("TOPLEFT", -1, 1)

  minimapButton:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")
  minimapButton:SetScript("OnClick", function(_, mouseButton)
    if mouseButton == "LeftButton" then
      Addon.ToggleScannerPanel()
    elseif mouseButton == "RightButton" then
      HideMinimapButton()
    end
  end)
  minimapButton:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:AddLine("WoW Trader", COLORS.gold[1], COLORS.gold[2], COLORS.gold[3])
    GameTooltip:AddLine("Left-click: Open / close", 1, 1, 1)
    GameTooltip:AddLine("Drag: Move", COLORS.parchment[1], COLORS.parchment[2], COLORS.parchment[3])
    GameTooltip:AddLine("Right-click: Hide", COLORS.parchment[1], COLORS.parchment[2], COLORS.parchment[3])
    GameTooltip:Show()
  end)
  minimapButton:SetScript("OnLeave", function() GameTooltip:Hide() end)
  minimapButton:SetScript("OnDragStart", function(self)
    self:SetScript("OnUpdate", function()
      local centerX, centerY = Minimap:GetCenter()
      if not centerX or not centerY then return end
      local cursorX, cursorY = GetCursorPosition()
      local scale = UIParent:GetEffectiveScale()
      cursorX, cursorY = cursorX / scale, cursorY / scale
      GetUiSettings().minimapAngle = math.deg(math.atan2(cursorY - centerY, cursorX - centerX))
      PositionMinimapButton()
    end)
  end)
  minimapButton:SetScript("OnDragStop", function(self) self:SetScript("OnUpdate", nil) end)
  PositionMinimapButton()
  return minimapButton
end

function Addon.ShowMinimapButton()
  local button = EnsureMinimapButton()
  if not button then return end
  GetUiSettings().minimapHidden = false
  PositionMinimapButton()
  button:Show()
end

local function EnsureLauncher()
  if launcher then return launcher end
  launcher = CreateFrame("Button", "WoWTraderAuctionHouseButton", UIParent, "UIPanelButtonTemplate")
  launcher:SetSize(112, 24)
  launcher:SetText("WoW Trader")
  launcher:SetFrameStrata("DIALOG")
  launcher:SetScript("OnClick", function() Addon.ShowScannerPanel() end)
  SetButtonTooltip(
    launcher,
    "WoW Trader",
    "Open the market scanner, inspect captured data, and control full Auction House scans."
  )
  launcher:Hide()
  return launcher
end

local function ShowAuctionHouseLauncher()
  local button = EnsureLauncher()
  local auctionFrame = _G.AuctionHouseFrame
  button:ClearAllPoints()
  button:SetParent(UIParent)
  if auctionFrame then
    button:SetPoint("TOPRIGHT", auctionFrame, "TOPRIGHT", -44, -54)
  else
    button:SetPoint("TOP", UIParent, "TOP", 0, -80)
  end
  button:Show()
end

local function AddMarketTooltip(tooltip, tooltipData)
  local itemId = type(tooltipData) == "table" and tonumber(tooltipData.id) or nil
  if not itemId and tooltip and type(tooltip.GetItem) == "function" then
    local _, itemLink = tooltip:GetItem()
    itemId = type(itemLink) == "string" and tonumber(string.match(itemLink, "item:(%d+)")) or nil
  end
  if not itemId then return end
  local item = Addon.GetItemMarketIntelligence(itemId)
  if not item then return end
  local signalText, signalColor = SignalPresentation(item.signal)
  tooltip:AddLine(" ")
  tooltip:AddLine("WoW Trader", COLORS.gold[1], COLORS.gold[2], COLORS.gold[3])
  tooltip:AddDoubleLine(
    "Market signal",
    signalText,
    COLORS.parchment[1], COLORS.parchment[2], COLORS.parchment[3],
    signalColor[1], signalColor[2], signalColor[3]
  )
  if item.current then
    tooltip:AddDoubleLine("Current ask", FormatCopper(item.current), 0.8, 0.8, 0.8, 1, 1, 1)
  end
  if item.normal then
    tooltip:AddDoubleLine("Normal ask", FormatCopper(item.normal), 0.8, 0.8, 0.8, 1, 1, 1)
  end
  tooltip:AddDoubleLine(
    "History evidence",
    string.format("%d / %d+ scans", item.observations, item.minimum),
    0.8, 0.8, 0.8, 0.8, 0.8, 0.8
  )
end

if type(TooltipDataProcessor) == "table" and type(TooltipDataProcessor.AddTooltipPostCall) == "function" and
   type(Enum) == "table" and type(Enum.TooltipDataType) == "table" and Enum.TooltipDataType.Item then
  pcall(TooltipDataProcessor.AddTooltipPostCall, Enum.TooltipDataType.Item, AddMarketTooltip)
end

local eventFrame = CreateFrame("Frame")
eventFrame:RegisterEvent("PLAYER_LOGIN")
eventFrame:RegisterEvent("AUCTION_HOUSE_SHOW")
eventFrame:RegisterEvent("AUCTION_HOUSE_CLOSED")
eventFrame:SetScript("OnEvent", function(_, eventName)
  if eventName == "PLAYER_LOGIN" then
    local button = EnsureMinimapButton()
    if button and GetUiSettings().minimapHidden then button:Hide() end
  elseif eventName == "AUCTION_HOUSE_SHOW" then
    ShowAuctionHouseLauncher()
  elseif launcher then
    launcher:Hide()
  end
end)
