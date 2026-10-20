local ADDON_NAME, Addon = ...

local MAX_SNAPSHOTS = 16
local CAPTURE_DELAY_SECONDS = 0.5
local REGION_NAMES = {
  [1] = "US",
  [2] = "KR",
  [3] = "EU",
  [4] = "TW",
  [5] = "CN",
}
local SPECIALIZATION_SPELLS_BY_PROFESSION = {
  [164] = { 9788, 17039, 17040, 17041 },
  [165] = { 10656, 10658, 10660 },
  [171] = { 28672, 28675, 28677 },
  [197] = { 26797, 26799, 26801 },
  [202] = { 20219, 20221 },
}

local sessionSnapshotID = nil
local sessionCapturedAt = nil
local captureScheduled = false
local tradeSkillOpen = false
local bankOpen = false
local bankInventoryObserved = false
local lastBankQuantities = {}

local function Print(message)
  DEFAULT_CHAT_FRAME:AddMessage("|cffc9a86aWoW Trader:|r " .. message)
end

local function NewUuid()
  local template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
  return string.gsub(template, "[xy]", function(character)
    local value = character == "x" and math.random(0, 15) or math.random(8, 11)
    return string.format("%x", value)
  end)
end

local function IsInaccessibleValue(value)
  if type(issecretvalue) == "function" and issecretvalue(value) then return true end
  if type(canaccessvalue) == "function" and not canaccessvalue(value) then return true end
  return false
end

local function SafePositiveInteger(value)
  if IsInaccessibleValue(value) or type(value) ~= "number" or value <= 0 or
     value ~= math.floor(value) then return nil end
  return value
end

local function SafeNonnegativeInteger(value)
  if IsInaccessibleValue(value) or type(value) ~= "number" or value < 0 or
     value ~= math.floor(value) then return nil end
  return value
end

local function GetClientProduct()
  local version = GetBuildInfo()
  if type(version) == "string" and string.match(version, "^1%.60%.") then
    return "wow_classic_beta"
  end
  if C_AddOns and C_AddOns.GetAddOnMetadata then
    return C_AddOns.GetAddOnMetadata(ADDON_NAME, "X-WowTrader-Product") or "wow_anniversary"
  end
  return GetAddOnMetadata(ADDON_NAME, "X-WowTrader-Product") or "wow_anniversary"
end

local function GetSourceCharacter()
  local name = UnitName("player")
  local realmID = (GetNormalizedRealmName and GetNormalizedRealmName()) or GetRealmName()
  if type(name) ~= "string" or type(realmID) ~= "string" then return nil end
  local factionName = UnitFactionGroup("player")
  local faction = "unknown"
  if factionName == "Alliance" then faction = "alliance"
  elseif factionName == "Horde" then faction = "horde"
  elseif factionName == "Neutral" then faction = "neutral" end
  return {
    name = name,
    realmId = realmID,
    faction = faction,
    guid = UnitGUID("player"),
  }
end

local function CharacterKey(character)
  if type(character) ~= "table" then return nil end
  if type(character.guid) == "string" and character.guid ~= "" then return character.guid end
  if type(character.realmId) ~= "string" or type(character.name) ~= "string" then return nil end
  return character.realmId .. ":" .. character.name
end

local function IsKnownSpell(spellID)
  local callback = IsPlayerSpell or IsSpellKnown
  if type(callback) ~= "function" then return false end
  local succeeded, known = pcall(callback, spellID)
  return succeeded and known == true
end

local function CollectSpecializationSpellIDs(rootSkillLineID)
  local result = {}
  for _, spellID in ipairs(SPECIALIZATION_SPELLS_BY_PROFESSION[rootSkillLineID] or {}) do
    if IsKnownSpell(spellID) then table.insert(result, spellID) end
  end
  table.sort(result)
  return result
end

local function ProfessionIndexes()
  if type(GetProfessions) ~= "function" then return {} end
  local profession1, profession2, archaeology, fishing, cooking, firstAid = GetProfessions()
  return { profession1, profession2, archaeology, fishing, cooking, firstAid }
end

local function CollectProfessionSummaries()
  local summaries = {}
  if type(GetProfessionInfo) ~= "function" then return summaries end
  for _, professionIndex in pairs(ProfessionIndexes()) do
    if type(professionIndex) == "number" then
      local values = { pcall(GetProfessionInfo, professionIndex) }
      if values[1] then
        local name = values[2]
        local skillLineID = SafePositiveInteger(values[8])
        if type(name) == "string" and name ~= "" and skillLineID then
          summaries[skillLineID] = {
            professionSkillLineID = skillLineID,
            parentProfessionSkillLineID = nil,
            name = name,
            skillLevel = SafeNonnegativeInteger(values[4]) or 0,
            maximumSkillLevel = SafeNonnegativeInteger(values[5]) or 0,
            skillModifier = type(values[9]) == "number" and math.floor(values[9]) or 0,
            apiFlavor = "profession_list_only",
            recipeListComplete = false,
            specializationSpellIDs = CollectSpecializationSpellIDs(skillLineID),
            knownRecipes = {},
          }
        end
      end
    end
  end
  return summaries
end

local function CurrentModernProfession()
  if type(C_TradeSkillUI) ~= "table" then return nil end
  local baseInfo
  if type(C_TradeSkillUI.GetBaseProfessionInfo) == "function" then
    local succeeded, value = pcall(C_TradeSkillUI.GetBaseProfessionInfo)
    if succeeded and type(value) == "table" then baseInfo = value end
  end
  local childInfo
  if type(C_TradeSkillUI.GetChildProfessionInfo) == "function" then
    local succeeded, value = pcall(C_TradeSkillUI.GetChildProfessionInfo)
    if succeeded and type(value) == "table" then childInfo = value end
  end
  local currentInfo = childInfo and SafePositiveInteger(childInfo.professionID) and childInfo or
    baseInfo
  if type(currentInfo) ~= "table" then return nil end

  local currentSkillLineID = SafePositiveInteger(currentInfo.professionID)
  local parentSkillLineID = baseInfo and SafePositiveInteger(baseInfo.professionID) or nil
  if not currentSkillLineID then return nil end
  if parentSkillLineID == currentSkillLineID then parentSkillLineID = nil end
  return {
    professionSkillLineID = currentSkillLineID,
    parentProfessionSkillLineID = parentSkillLineID,
    name = currentInfo.professionName or (baseInfo and baseInfo.professionName),
    skillLevel = SafeNonnegativeInteger(currentInfo.skillLevel) or 0,
    maximumSkillLevel = SafeNonnegativeInteger(currentInfo.maxSkillLevel) or 0,
    skillModifier = 0,
  }
end

local function ModernRecipeCooldown(recipeSpellID)
  if type(C_TradeSkillUI.GetRecipeCooldown) ~= "function" then
    return nil, nil, nil, nil
  end
  local values = { pcall(C_TradeSkillUI.GetRecipeCooldown, recipeSpellID) }
  if not values[1] then return nil, nil, nil, nil end
  return SafeNonnegativeInteger(values[2]), type(values[3]) == "boolean" and values[3] or nil,
    SafeNonnegativeInteger(values[4]), SafeNonnegativeInteger(values[5])
end

local function CollectModernRecipes(defaultSkillLineID)
  if type(C_TradeSkillUI) ~= "table" or type(C_TradeSkillUI.GetAllRecipeIDs) ~= "function" or
     type(C_TradeSkillUI.GetRecipeInfo) ~= "function" then
    return nil, false
  end
  local succeeded, recipeIDs = pcall(C_TradeSkillUI.GetAllRecipeIDs)
  if not succeeded or IsInaccessibleValue(recipeIDs) or type(recipeIDs) ~= "table" then
    return nil, false
  end

  local bySkillLine = {}
  local seenBySkillLine = {}
  local complete = true
  for _, candidateID in ipairs(recipeIDs) do
    local recipeSpellID = SafePositiveInteger(candidateID)
    if recipeSpellID then
      local infoSucceeded, info = pcall(C_TradeSkillUI.GetRecipeInfo, recipeSpellID)
      if infoSucceeded and type(info) == "table" then
        if not IsInaccessibleValue(info.learned) and info.learned == true then
          local skillLineID = defaultSkillLineID
          if type(C_TradeSkillUI.GetTradeSkillLineForRecipe) == "function" then
            local lineSucceeded, lineID = pcall(C_TradeSkillUI.GetTradeSkillLineForRecipe, recipeSpellID)
            if lineSucceeded then skillLineID = SafePositiveInteger(lineID) or skillLineID end
          end
          local cooldown, isDayCooldown, charges, maximumCharges = ModernRecipeCooldown(recipeSpellID)
          if not bySkillLine[skillLineID] then
            bySkillLine[skillLineID] = {}
            seenBySkillLine[skillLineID] = {}
          end
          if not seenBySkillLine[skillLineID][recipeSpellID] then
            seenBySkillLine[skillLineID][recipeSpellID] = true
            table.insert(bySkillLine[skillLineID], {
              recipeSpellID = recipeSpellID,
              name = not IsInaccessibleValue(info.name) and type(info.name) == "string" and
                info.name or nil,
              cooldownSecondsRemaining = cooldown,
              isDayCooldown = isDayCooldown,
              charges = charges,
              maximumCharges = maximumCharges,
            })
          end
        end
      else
        complete = false
      end
    else
      complete = false
    end
  end
  for _, recipes in pairs(bySkillLine) do
    table.sort(recipes, function(left, right) return left.recipeSpellID < right.recipeSpellID end)
  end
  return bySkillLine, complete
end

local function LegacyRecipeSpellID(index)
  if type(GetTradeSkillRecipeLink) ~= "function" then return nil end
  local succeeded, link = pcall(GetTradeSkillRecipeLink, index)
  if not succeeded or type(link) ~= "string" then return nil end
  return SafePositiveInteger(tonumber(string.match(link, "|Henchant:(%d+)"))) or
    SafePositiveInteger(tonumber(string.match(link, "|Hspell:(%d+)")))
end

local function CollectLegacyProfession(summaries)
  if type(GetTradeSkillLine) ~= "function" or type(GetNumTradeSkills) ~= "function" or
     type(GetTradeSkillInfo) ~= "function" then return false end
  local values = { pcall(GetTradeSkillLine) }
  if not values[1] or type(values[2]) ~= "string" or values[2] == "UNKNOWN" then return false end
  local name = values[2]
  local profession
  for _, candidate in pairs(summaries) do
    if candidate.name == name then profession = candidate break end
  end
  if not profession then return false end

  local countSucceeded, count = pcall(GetNumTradeSkills)
  if not countSucceeded or type(count) ~= "number" then return false end
  local recipes = {}
  local complete = true
  for index = 1, count do
    local info = { pcall(GetTradeSkillInfo, index) }
    if info[1] and info[3] ~= "header" then
      local recipeSpellID = LegacyRecipeSpellID(index)
      if recipeSpellID then
        local cooldown
        if type(GetTradeSkillCooldown) == "function" then
          local cooldownSucceeded, value = pcall(GetTradeSkillCooldown, index)
          if cooldownSucceeded then cooldown = SafeNonnegativeInteger(value) end
        end
        table.insert(recipes, {
          recipeSpellID = recipeSpellID,
          name = type(info[2]) == "string" and info[2] or nil,
          cooldownSecondsRemaining = cooldown,
          isDayCooldown = nil,
          charges = nil,
          maximumCharges = nil,
        })
      else
        complete = false
      end
    elseif not info[1] then
      complete = false
    end
  end
  table.sort(recipes, function(left, right) return left.recipeSpellID < right.recipeSpellID end)
  profession.skillLevel = SafeNonnegativeInteger(values[3]) or profession.skillLevel
  profession.maximumSkillLevel = SafeNonnegativeInteger(values[4]) or profession.maximumSkillLevel
  profession.apiFlavor = "legacy_trade_skill"
  profession.recipeListComplete = complete
  profession.knownRecipes = recipes
  return true
end

local function ContainerSlotCount(containerID)
  local callback = C_Container and C_Container.GetContainerNumSlots or GetContainerNumSlots
  if type(callback) ~= "function" then return 0 end
  local succeeded, count = pcall(callback, containerID)
  return succeeded and SafeNonnegativeInteger(count) or 0
end

local function ContainerItem(containerID, slotIndex)
  if C_Container and type(C_Container.GetContainerItemInfo) == "function" then
    local succeeded, info = pcall(C_Container.GetContainerItemInfo, containerID, slotIndex)
    if succeeded and type(info) == "table" then
      return SafePositiveInteger(info.itemID), SafePositiveInteger(info.stackCount)
    end
    return nil, nil
  end
  if type(GetContainerItemID) ~= "function" or type(GetContainerItemInfo) ~= "function" then
    return nil, nil
  end
  local idSucceeded, itemID = pcall(GetContainerItemID, containerID, slotIndex)
  local info = { pcall(GetContainerItemInfo, containerID, slotIndex) }
  if not idSucceeded or not info[1] then return nil, nil end
  return SafePositiveInteger(itemID), SafePositiveInteger(info[3])
end

local function CollectInventory()
  local quantities = {}
  local bagCount = type(NUM_BAG_SLOTS) == "number" and NUM_BAG_SLOTS or 4
  local function AddContainers(containers, destination)
    for _, containerID in ipairs(containers) do
      for slotIndex = 1, ContainerSlotCount(containerID) do
        local itemID, quantity = ContainerItem(containerID, slotIndex)
        if itemID and quantity then destination[itemID] = (destination[itemID] or 0) + quantity end
      end
    end
  end
  local bagContainers = {}
  for containerID = 0, bagCount do table.insert(bagContainers, containerID) end
  AddContainers(bagContainers, quantities)

  if bankOpen then
    local bankContainers = { -1 }
    local bankBagCount = type(NUM_BANKBAGSLOTS) == "number" and NUM_BANKBAGSLOTS or 7
    for containerID = bagCount + 1, bagCount + bankBagCount do
      table.insert(bankContainers, containerID)
    end
    lastBankQuantities = {}
    AddContainers(bankContainers, lastBankQuantities)
    bankInventoryObserved = true
  end
  if bankInventoryObserved then
    for itemID, quantity in pairs(lastBankQuantities) do
      quantities[itemID] = (quantities[itemID] or 0) + quantity
    end
  end
  local inventory = {}
  for itemID, quantity in pairs(quantities) do
    table.insert(inventory, { itemID = itemID, quantity = quantity })
  end
  table.sort(inventory, function(left, right) return left.itemID < right.itemID end)
  return inventory, bankInventoryObserved and "bags_and_bank" or "bags"
end

local function PreviousSnapshot(character, clientBuild)
  if type(WOW_TRADER_SAVED) ~= "table" or type(WOW_TRADER_SAVED.professionSnapshots) ~= "table" then
    return nil
  end
  local key = CharacterKey(character)
  for index = #WOW_TRADER_SAVED.professionSnapshots, 1, -1 do
    local snapshot = WOW_TRADER_SAVED.professionSnapshots[index]
    if type(snapshot) == "table" and snapshot.clientBuild == clientBuild and
       CharacterKey(snapshot.sourceCharacter) == key then return snapshot end
  end
  return nil
end

local function MergePreviousProfessions(summaries, previous)
  if type(previous) ~= "table" or type(previous.professions) ~= "table" then return summaries end
  for _, profession in ipairs(previous.professions) do
    local skillLineID = SafePositiveInteger(profession.professionSkillLineID)
    local parentID = SafePositiveInteger(profession.parentProfessionSkillLineID)
    if skillLineID and (summaries[skillLineID] or (parentID and summaries[parentID])) then
      local fresh = summaries[skillLineID]
      if fresh then
        fresh.apiFlavor = profession.apiFlavor or fresh.apiFlavor
        fresh.recipeListComplete = profession.recipeListComplete == true
        fresh.knownRecipes = type(profession.knownRecipes) == "table" and
          profession.knownRecipes or {}
      else
        summaries[skillLineID] = profession
      end
    end
  end
  return summaries
end

local function ApplyOpenProfession(summaries)
  local current = CurrentModernProfession()
  if current then
    local rootSkillLineID = current.parentProfessionSkillLineID or current.professionSkillLineID
    local inherited = summaries[current.professionSkillLineID] or summaries[rootSkillLineID]
    current.name = type(current.name) == "string" and current.name or
      (inherited and inherited.name) or ("Profession " .. current.professionSkillLineID)
    current.skillModifier = inherited and inherited.skillModifier or 0
    current.specializationSpellIDs = CollectSpecializationSpellIDs(rootSkillLineID)
    current.apiFlavor = "c_trade_skill_ui"
    current.recipeListComplete = false
    current.knownRecipes = {}
    local recipesBySkillLine, complete = CollectModernRecipes(current.professionSkillLineID)
    if recipesBySkillLine then
      local sawRecipes = false
      for skillLineID, recipes in pairs(recipesBySkillLine) do
        sawRecipes = true
        local profession = skillLineID == current.professionSkillLineID and current or {
          professionSkillLineID = skillLineID,
          parentProfessionSkillLineID = rootSkillLineID ~= skillLineID and rootSkillLineID or nil,
          name = current.name,
          skillLevel = current.skillLevel,
          maximumSkillLevel = current.maximumSkillLevel,
          skillModifier = current.skillModifier,
          apiFlavor = "c_trade_skill_ui",
          recipeListComplete = complete,
          specializationSpellIDs = current.specializationSpellIDs,
          knownRecipes = recipes,
        }
        profession.apiFlavor = "c_trade_skill_ui"
        profession.recipeListComplete = complete
        profession.knownRecipes = recipes
        summaries[skillLineID] = profession
      end
      if not sawRecipes then current.recipeListComplete = complete end
    end
    summaries[current.professionSkillLineID] = summaries[current.professionSkillLineID] or current
    return
  end
  CollectLegacyProfession(summaries)
end

local function NormalizeProfessions(summaries)
  local professions = {}
  for _, profession in pairs(summaries) do
    if profession.maximumSkillLevel < profession.skillLevel then
      profession.maximumSkillLevel = profession.skillLevel
    end
    table.insert(professions, profession)
  end
  table.sort(professions, function(left, right)
    return left.professionSkillLineID < right.professionSkillLineID
  end)
  return professions
end

local function StoreSnapshot(snapshot)
  if type(WOW_TRADER_SAVED.professionSnapshots) ~= "table" then
    WOW_TRADER_SAVED.professionSnapshots = {}
  end
  local key = CharacterKey(snapshot.sourceCharacter)
  for index = #WOW_TRADER_SAVED.professionSnapshots, 1, -1 do
    local existing = WOW_TRADER_SAVED.professionSnapshots[index]
    if CharacterKey(existing and existing.sourceCharacter) == key then
      table.remove(WOW_TRADER_SAVED.professionSnapshots, index)
    end
  end
  table.insert(WOW_TRADER_SAVED.professionSnapshots, snapshot)
  while #WOW_TRADER_SAVED.professionSnapshots > MAX_SNAPSHOTS do
    table.remove(WOW_TRADER_SAVED.professionSnapshots, 1)
  end
end

local function CaptureProfessionSnapshot(announce)
  captureScheduled = false
  if type(WOW_TRADER_SAVED) ~= "table" then return nil end
  local character = GetSourceCharacter()
  if not character then return nil end
  local _, clientBuild = GetBuildInfo()
  clientBuild = tonumber(clientBuild)
  if not clientBuild then return nil end

  if not sessionSnapshotID then
    sessionSnapshotID = NewUuid()
    sessionCapturedAt = time()
  end
  local previous = PreviousSnapshot(character, clientBuild)
  local summaries = MergePreviousProfessions(CollectProfessionSummaries(), previous)
  if tradeSkillOpen then ApplyOpenProfession(summaries) end
  local inventory, inventoryScope = CollectInventory()
  local snapshot = {
    snapshotID = sessionSnapshotID,
    addonVersion = Addon.version or "unknown",
    clientProduct = GetClientProduct(),
    clientBuild = clientBuild,
    locale = GetLocale(),
    region = REGION_NAMES[GetCurrentRegion and GetCurrentRegion() or 0] or "UNKNOWN",
    realmID = character.realmId,
    sourceCharacter = character,
    capturedAt = sessionCapturedAt,
    completedAt = time(),
    moneyCopper = SafeNonnegativeInteger(GetMoney and GetMoney()) or 0,
    inventoryScope = inventoryScope,
    inventory = inventory,
    professions = NormalizeProfessions(summaries),
  }
  StoreSnapshot(snapshot)
  if announce then
    local recipeCount = 0
    for _, profession in ipairs(snapshot.professions) do
      recipeCount = recipeCount + #profession.knownRecipes
    end
    Print(string.format(
      "saved %d profession(s), %d known recipe(s), and %d inventory item type(s). Use Save & Reload to upload.",
      #snapshot.professions, recipeCount, #snapshot.inventory
    ))
  end
  return snapshot
end

local function ScheduleCapture()
  if captureScheduled then return end
  captureScheduled = true
  if C_Timer and type(C_Timer.After) == "function" then
    C_Timer.After(CAPTURE_DELAY_SECONDS, function() CaptureProfessionSnapshot(false) end)
  else
    CaptureProfessionSnapshot(false)
  end
end

function Addon.CaptureProfessionSnapshot()
  return CaptureProfessionSnapshot(true)
end

local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_LOGIN")
frame:RegisterEvent("PLAYER_LOGOUT")
frame:RegisterEvent("SKILL_LINES_CHANGED")
frame:RegisterEvent("TRADE_SKILL_SHOW")
frame:RegisterEvent("TRADE_SKILL_LIST_UPDATE")
frame:RegisterEvent("TRADE_SKILL_CLOSE")
frame:RegisterEvent("BAG_UPDATE_DELAYED")
frame:RegisterEvent("PLAYER_MONEY")
frame:RegisterEvent("BANKFRAME_OPENED")
frame:RegisterEvent("BANKFRAME_CLOSED")
frame:SetScript("OnEvent", function(_, eventName)
  if eventName == "TRADE_SKILL_SHOW" or eventName == "TRADE_SKILL_LIST_UPDATE" then
    tradeSkillOpen = true
  elseif eventName == "TRADE_SKILL_CLOSE" then
    tradeSkillOpen = false
  elseif eventName == "BANKFRAME_OPENED" then
    bankOpen = true
  elseif eventName == "BANKFRAME_CLOSED" then
    bankOpen = false
  elseif eventName == "PLAYER_LOGOUT" then
    CaptureProfessionSnapshot(false)
    return
  end
  ScheduleCapture()
end)
