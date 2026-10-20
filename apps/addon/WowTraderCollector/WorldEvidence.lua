local ADDON_NAME, Addon = ...

local EVIDENCE_SCHEMA_VERSION = 6
local MAX_LOOT_SESSIONS = 5000
local MAX_LOOT_OBSERVATIONS = 5000
local MAX_NPC_SIGHTINGS = 5000
local MAX_QUEST_OBSERVATIONS = 10000
local MAX_VENDOR_OBSERVATIONS = 10000
local MAX_TRAINER_OBSERVATIONS = 10000
local REGION_NAMES = {
  [1] = "US",
  [2] = "KR",
  [3] = "EU",
  [4] = "TW",
  [5] = "CN",
}

local npcObservationKeys = {}
local vendorObservationKeys = {}
local trainerObservationKeys = {}
local trainerTooltip = nil

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

local function ReadableValue(value)
  if IsInaccessibleValue(value) then return nil end
  if type(value) == "string" and value == "" then return nil end
  return value
end

local function SafeCallOne(callback, ...)
  if type(callback) ~= "function" then return nil end
  local succeeded, value = pcall(callback, ...)
  if not succeeded then return nil end
  return ReadableValue(value)
end

local function TrimArray(values, maximum)
  while #values > maximum do table.remove(values, 1) end
end

local function TrimLootEvidence(diagnostics)
  while #diagnostics.lootSessions > MAX_LOOT_SESSIONS do
    local removed = table.remove(diagnostics.lootSessions, 1)
    if removed and removed.sessionID then
      for index = #diagnostics.lootObservations, 1, -1 do
        if diagnostics.lootObservations[index].lootSessionID == removed.sessionID then
          table.remove(diagnostics.lootObservations, index)
        end
      end
    end
  end
  TrimArray(diagnostics.lootObservations, MAX_LOOT_OBSERVATIONS)
end

local function GetMetadata(field)
  if C_AddOns and C_AddOns.GetAddOnMetadata then
    return C_AddOns.GetAddOnMetadata(ADDON_NAME, field)
  end
  return GetAddOnMetadata(ADDON_NAME, field)
end

local function GetClientProduct()
  local version = GetBuildInfo()
  if type(version) == "string" and string.match(version, "^1%.60%.") then
    return "wow_classic_beta"
  end
  return GetMetadata("X-WowTrader-Product") or "wow_anniversary"
end

local function EnsureArray(tableValue, key)
  if type(tableValue[key]) ~= "table" then tableValue[key] = {} end
end

local function InitializeWorldEvidence()
  if type(WOW_TRADER_SAVED) ~= "table" then return nil end
  if type(WOW_TRADER_SAVED.worldDiagnostics) ~= "table" then
    WOW_TRADER_SAVED.worldDiagnostics = { enabled = false }
  end
  local diagnostics = WOW_TRADER_SAVED.worldDiagnostics
  diagnostics.schemaVersion = EVIDENCE_SCHEMA_VERSION
  diagnostics.addonVersion = Addon.version or GetMetadata("Version") or "unknown"
  local _, clientBuild = GetBuildInfo()
  diagnostics.clientProduct = GetClientProduct()
  diagnostics.clientBuild = tonumber(clientBuild)
  diagnostics.locale = GetLocale()
  diagnostics.region = REGION_NAMES[GetCurrentRegion and GetCurrentRegion() or 0] or "UNKNOWN"
  if type(diagnostics.enabled) ~= "boolean" then diagnostics.enabled = false end
  EnsureArray(diagnostics, "encounterAttempts")
  EnsureArray(diagnostics, "encounterLoot")
  EnsureArray(diagnostics, "lootSessions")
  EnsureArray(diagnostics, "lootObservations")
  EnsureArray(diagnostics, "npcSightings")
  EnsureArray(diagnostics, "healthObservations")
  EnsureArray(diagnostics, "modelResolutions")
  EnsureArray(diagnostics, "spellObservations")
  EnsureArray(diagnostics, "questQueries")
  EnsureArray(diagnostics, "questObservations")
  EnsureArray(diagnostics, "vendorObservations")
  EnsureArray(diagnostics, "trainerObservations")
  return diagnostics
end

local function TouchDiagnostics(diagnostics)
  diagnostics.updatedAt = time()
end

local function ReadVectorCoordinates(vector)
  if type(vector) ~= "table" then return nil, nil end
  if type(vector.GetXY) == "function" then
    local succeeded, x, y = pcall(vector.GetXY, vector)
    if succeeded then return ReadableValue(x), ReadableValue(y) end
    return nil, nil
  end
  return ReadableValue(vector.x), ReadableValue(vector.y)
end

local function CapturePlayerLocation()
  local uiMapID = C_Map and SafeCallOne(C_Map.GetBestMapForUnit, "player") or nil
  local uiX, uiY = nil, nil
  if type(uiMapID) == "number" and type(C_Map.GetPlayerMapPosition) == "function" then
    local vector = SafeCallOne(C_Map.GetPlayerMapPosition, uiMapID, "player")
    uiX, uiY = ReadVectorCoordinates(vector)
  end
  local positionX, positionY, positionZ, instanceID = nil, nil, nil, nil
  if type(UnitPosition) == "function" then
    local succeeded
    succeeded, positionX, positionY, positionZ, instanceID = pcall(UnitPosition, "player")
    if not succeeded then positionX, positionY, positionZ, instanceID = nil, nil, nil, nil end
    positionX = ReadableValue(positionX)
    positionY = ReadableValue(positionY)
    positionZ = ReadableValue(positionZ)
    instanceID = ReadableValue(instanceID)
  end
  local _, instanceType, difficultyID, difficultyName, _, _, _, mapID = GetInstanceInfo()
  return {
    capturedAt = time(),
    uiMapID = uiMapID,
    uiX = uiX,
    uiY = uiY,
    positionX = positionX,
    positionY = positionY,
    positionZ = positionZ,
    coordinateSystem = "unit_position_api",
    instanceID = instanceID,
    mapID = ReadableValue(mapID),
    instanceType = ReadableValue(instanceType),
    difficultyID = ReadableValue(difficultyID),
    difficultyName = ReadableValue(difficultyName),
  }
end

local function ParseObjectGuid(guid)
  guid = ReadableValue(guid)
  if type(guid) ~= "string" then return nil, nil end
  local objectType, _, _, _, _, objectID = strsplit("-", guid)
  return objectType, tonumber(objectID)
end

local function CaptureUnitWorldPosition(unitToken)
  if type(UnitPosition) ~= "function" then return nil end
  local succeeded, positionX, positionY, positionZ, instanceID = pcall(UnitPosition, unitToken)
  if not succeeded then return nil end
  positionX = ReadableValue(positionX)
  positionY = ReadableValue(positionY)
  if type(positionX) ~= "number" or type(positionY) ~= "number" then return nil end
  return {
    positionX = positionX,
    positionY = positionY,
    positionZ = ReadableValue(positionZ),
    instanceID = ReadableValue(instanceID),
    coordinateSystem = "unit_position_api",
  }
end

local function CaptureClosestUnitPosition(npcID)
  if type(ClosestUnitPosition) ~= "function" then return nil end
  local succeeded, xPos, yPos, distance = pcall(ClosestUnitPosition, npcID)
  if not succeeded then return nil end
  xPos = ReadableValue(xPos)
  yPos = ReadableValue(yPos)
  if type(xPos) ~= "number" or type(yPos) ~= "number" then return nil end
  return {
    xPos = xPos,
    yPos = yPos,
    distance = ReadableValue(distance),
    coordinateSystem = "closest_unit_position_api_unverified",
  }
end

local function CurrentNpcIdentity()
  local guid = SafeCallOne(UnitGUID, "npc")
  local objectType, sourceID = ParseObjectGuid(guid)
  return objectType, sourceID, SafeCallOne(UnitName, "npc"), guid
end

local function NpcObservationKey(npcID, location, subjectPosition)
  local mapID = location.uiMapID or location.mapID or 0
  local x = subjectPosition and subjectPosition.positionX or location.uiX
  local y = subjectPosition and subjectPosition.positionY or location.uiY
  if type(x) ~= "number" or type(y) ~= "number" then
    return string.format("%d:%d:unknown", npcID, mapID)
  end
  local scale = subjectPosition and 2 or 1000
  return string.format("%d:%d:%d:%d", npcID, mapID, math.floor(x * scale), math.floor(y * scale))
end

local function SaveNpcSighting(unitToken, trigger)
  local diagnostics = InitializeWorldEvidence()
  if not diagnostics or not diagnostics.enabled then return end
  if SafeCallOne(UnitExists, unitToken) ~= true or SafeCallOne(UnitIsPlayer, unitToken) == true then
    return
  end
  local guid = SafeCallOne(UnitGUID, unitToken)
  local objectType, npcID = ParseObjectGuid(guid)
  if (objectType ~= "Creature" and objectType ~= "Vehicle") or not npcID then return end
  local observerLocation = CapturePlayerLocation()
  local subjectPosition = CaptureUnitWorldPosition(unitToken)
  local observationKey = NpcObservationKey(npcID, observerLocation, subjectPosition)
  if npcObservationKeys[observationKey] then return end
  npcObservationKeys[observationKey] = true
  local closestPosition = CaptureClosestUnitPosition(npcID)
  table.insert(diagnostics.npcSightings, {
    observationID = NewUuid(),
    observationKey = observationKey,
    capturedAt = time(),
    npcID = npcID,
    npcName = SafeCallOne(UnitName, unitToken),
    objectType = objectType,
    trigger = trigger,
    level = SafeCallOne(UnitLevel, unitToken),
    classification = SafeCallOne(UnitClassification, unitToken),
    creatureType = SafeCallOne(UnitCreatureType, unitToken),
    creatureFamily = SafeCallOne(UnitCreatureFamily, unitToken),
    reaction = SafeCallOne(UnitReaction, unitToken, "player"),
    canAttack = SafeCallOne(UnitCanAttack, "player", unitToken) == true,
    isQuestBoss = SafeCallOne(UnitIsQuestBoss, unitToken) == true,
    isDead = SafeCallOne(UnitIsDeadOrGhost, unitToken) == true,
    distanceSquared = SafeCallOne(UnitDistanceSquared, unitToken),
    subjectPosition = subjectPosition,
    closestPosition = closestPosition,
    observerLocation = observerLocation,
    positionEvidence = subjectPosition and "unit_position" or
      (closestPosition and "closest_unit_position_unverified" or "observer_position"),
  })
  TrimArray(diagnostics.npcSightings, MAX_NPC_SIGHTINGS)
  TouchDiagnostics(diagnostics)
end

local function ItemIDFromLink(itemLink)
  itemLink = ReadableValue(itemLink)
  if type(itemLink) ~= "string" then return nil end
  if type(GetItemInfoInstant) == "function" then
    local itemID = SafeCallOne(GetItemInfoInstant, itemLink)
    if type(itemID) == "number" and itemID > 0 then return itemID end
  end
  return tonumber(string.match(itemLink, "item:(%d+)"))
end

local function LootSourceName(sourceGuid)
  if sourceGuid and sourceGuid == SafeCallOne(UnitGUID, "target") then
    return SafeCallOne(UnitName, "target")
  end
  if sourceGuid and sourceGuid == SafeCallOne(UnitGUID, "mouseover") then
    return SafeCallOne(UnitName, "mouseover")
  end
  return nil
end

local function CaptureLootWindow()
  local diagnostics = InitializeWorldEvidence()
  if not diagnostics or not diagnostics.enabled or type(GetNumLootItems) ~= "function" then return end
  local slotCount = SafeCallOne(GetNumLootItems) or 0
  if type(slotCount) ~= "number" or slotCount < 0 then return end
  local capturedAt = time()
  local observerLocation = CapturePlayerLocation()
  local sessions = {}

  local function GetSession(sourceGuid, sourceQuantity)
    sourceGuid = ReadableValue(sourceGuid)
    sourceQuantity = ReadableValue(sourceQuantity)
    local key = sourceGuid or "unknown"
    local session = sessions[key]
    if session then
      if type(sourceQuantity) == "number" and
         (type(session.sourceQuantity) ~= "number" or sourceQuantity > session.sourceQuantity) then
        session.sourceQuantity = sourceQuantity
      end
      return session
    end
    local sourceType, sourceID = ParseObjectGuid(sourceGuid)
    session = {
      sessionID = NewUuid(),
      capturedAt = capturedAt,
      sourceType = sourceType or "unknown",
      sourceID = sourceID,
      sourceName = LootSourceName(sourceGuid),
      sourceGuid = sourceGuid,
      sourceQuantity = sourceQuantity,
      slotCount = slotCount,
      money = 0,
      encounterID = nil,
      attemptID = nil,
      observerLocation = observerLocation,
    }
    sessions[key] = session
    return session
  end

  for slotIndex = 1, slotCount do
    local sourcePairs = {}
    if type(GetLootSourceInfo) == "function" then
      local values = { pcall(GetLootSourceInfo, slotIndex) }
      if values[1] then
        for index = 2, #values do table.insert(sourcePairs, ReadableValue(values[index])) end
      end
    end
    if #sourcePairs == 0 then
      local targetGuid = SafeCallOne(UnitGUID, "target")
      sourcePairs = { targetGuid, targetGuid and 1 or nil }
    end
    local itemLink = SafeCallOne(GetLootSlotLink, slotIndex)
    local itemID = ItemIDFromLink(itemLink)
    local itemName, quantity = nil, nil
    if type(GetLootSlotInfo) == "function" then
      local values = { pcall(GetLootSlotInfo, slotIndex) }
      if values[1] then
        itemName = ReadableValue(values[3])
        quantity = ReadableValue(values[4])
      end
    end
    for sourceIndex = 1, math.max(1, #sourcePairs), 2 do
      local session = GetSession(sourcePairs[sourceIndex], sourcePairs[sourceIndex + 1])
      if itemID then
        table.insert(diagnostics.lootObservations, {
          observationID = NewUuid(),
          lootSessionID = session.sessionID,
          capturedAt = capturedAt,
          slotIndex = slotIndex,
          itemID = itemID,
          itemLink = itemLink,
          itemName = itemName,
          quantity = type(quantity) == "number" and math.max(1, math.floor(quantity)) or 1,
          sourceType = session.sourceType,
          sourceID = session.sourceID,
          sourceGuid = session.sourceGuid,
          sourceQuantity = session.sourceQuantity,
          encounterID = nil,
          attemptID = nil,
          observerLocation = observerLocation,
        })
      elseif type(GetLootSlotType) == "function" and
             SafeCallOne(GetLootSlotType, slotIndex) == LOOT_SLOT_MONEY and
             type(quantity) == "number" then
        session.money = session.money + math.max(0, math.floor(quantity))
      end
    end
  end
  if next(sessions) == nil then GetSession(nil, nil) end
  for _, session in pairs(sessions) do
    if session.money == 0 then session.money = nil end
    table.insert(diagnostics.lootSessions, session)
  end
  TrimLootEvidence(diagnostics)
  TouchDiagnostics(diagnostics)
end

local function QuestRewardItem(rewardType, index)
  if type(GetQuestItemInfo) ~= "function" then return nil end
  local succeeded, name, texture, quantity, quality, isUsable, itemID =
    pcall(GetQuestItemInfo, rewardType, index)
  if not succeeded then return nil end
  local link = type(GetQuestItemLink) == "function" and SafeCallOne(GetQuestItemLink, rewardType, index)
    or nil
  itemID = ReadableValue(itemID) or ItemIDFromLink(link)
  if type(itemID) ~= "number" or itemID <= 0 then return nil end
  return {
    rewardType = "item",
    choice = rewardType == "choice",
    rewardID = itemID,
    name = ReadableValue(name),
    link = link,
    texture = ReadableValue(texture),
    quantity = type(quantity) == "number" and math.max(1, math.floor(quantity)) or 1,
    quality = ReadableValue(quality),
    isUsable = isUsable == true,
  }
end

local function CaptureQuestRewards()
  local rewards = {}
  local rewardCount = type(GetNumQuestRewards) == "function" and SafeCallOne(GetNumQuestRewards) or 0
  for index = 1, rewardCount or 0 do
    local reward = QuestRewardItem("reward", index)
    if reward then table.insert(rewards, reward) end
  end
  local choiceCount = type(GetNumQuestChoices) == "function" and SafeCallOne(GetNumQuestChoices) or 0
  for index = 1, choiceCount or 0 do
    local reward = QuestRewardItem("choice", index)
    if reward then table.insert(rewards, reward) end
  end
  return rewards
end

local function SaveQuestObservation(evidenceKind, questID, values)
  local diagnostics = InitializeWorldEvidence()
  questID = ReadableValue(questID)
  if not diagnostics or not diagnostics.enabled or type(questID) ~= "number" or questID <= 0 then
    return
  end
  local sourceType, sourceID, sourceName = CurrentNpcIdentity()
  values = values or {}
  table.insert(diagnostics.questObservations, {
    observationID = NewUuid(),
    capturedAt = time(),
    evidenceKind = evidenceKind,
    questID = questID,
    title = values.title,
    questLevel = values.questLevel,
    suggestedGroup = values.suggestedGroup,
    questText = values.questText,
    objectiveText = values.objectiveText,
    progressText = values.progressText,
    rewardText = values.rewardText,
    xpReward = values.xpReward,
    moneyReward = values.moneyReward,
    itemID = values.itemID,
    itemLink = values.itemLink,
    currencyID = values.currencyID,
    quantity = values.quantity,
    sourceType = sourceType,
    sourceID = sourceID,
    sourceName = sourceName,
    rewards = values.rewards or {},
    observerLocation = CapturePlayerLocation(),
  })
  TrimArray(diagnostics.questObservations, MAX_QUEST_OBSERVATIONS)
  TouchDiagnostics(diagnostics)
end

local function CaptureCurrentQuest(evidenceKind)
  local questID = SafeCallOne(GetQuestID)
  if type(questID) ~= "number" or questID <= 0 then return end
  SaveQuestObservation(evidenceKind, questID, {
    title = SafeCallOne(GetTitleText),
    questLevel = SafeCallOne(GetQuestLevel),
    suggestedGroup = SafeCallOne(GetSuggestedGroupNum),
    questText = SafeCallOne(GetQuestText),
    objectiveText = SafeCallOne(GetObjectiveText),
    progressText = SafeCallOne(GetProgressText),
    rewardText = SafeCallOne(GetRewardText),
    xpReward = SafeCallOne(GetRewardXP),
    moneyReward = SafeCallOne(GetRewardMoney),
    rewards = CaptureQuestRewards(),
  })
end

local function CaptureGossipQuests()
  local diagnostics = InitializeWorldEvidence()
  if not diagnostics or not diagnostics.enabled or type(C_GossipInfo) ~= "table" then return end
  local groups = {
    { kind = "gossip_available", reader = C_GossipInfo.GetAvailableQuests },
    { kind = "gossip_active", reader = C_GossipInfo.GetActiveQuests },
  }
  for _, group in ipairs(groups) do
    if type(group.reader) == "function" then
      local succeeded, quests = pcall(group.reader)
      if succeeded and type(quests) == "table" then
        for _, quest in ipairs(quests) do
          if type(quest) == "table" then
            SaveQuestObservation(group.kind, ReadableValue(quest.questID) or ReadableValue(quest.questId), {
              title = ReadableValue(quest.title),
              questLevel = ReadableValue(quest.questLevel) or ReadableValue(quest.level),
            })
          end
        end
      end
    end
  end
end

local function MerchantCost(index, costIndex)
  if type(GetMerchantItemCostItem) ~= "function" then return nil end
  local succeeded, texture, quantity, link, name = pcall(GetMerchantItemCostItem, index, costIndex)
  if not succeeded then return nil end
  link = ReadableValue(link)
  return {
    itemID = ItemIDFromLink(link),
    currencyID = type(link) == "string" and tonumber(string.match(link, "currency:(%d+)")) or nil,
    name = ReadableValue(name),
    link = link,
    texture = ReadableValue(texture),
    quantity = type(quantity) == "number" and math.max(0, math.floor(quantity)) or 0,
  }
end

local function CaptureMerchantInventory()
  local diagnostics = InitializeWorldEvidence()
  if not diagnostics or not diagnostics.enabled or type(GetMerchantNumItems) ~= "function" or
     type(GetMerchantItemInfo) ~= "function" then return end
  local sourceType, sourceID, sourceName = CurrentNpcIdentity()
  if type(sourceID) ~= "number" then return end
  SaveNpcSighting("npc", "merchant")
  local itemCount = SafeCallOne(GetMerchantNumItems) or 0
  for index = 1, itemCount do
    local values = { pcall(GetMerchantItemInfo, index) }
    if values[1] then
      local name, texture, price, stackCount, available, isPurchasable, isUsable, extendedCost =
        ReadableValue(values[2]), ReadableValue(values[3]), ReadableValue(values[4]),
        ReadableValue(values[5]), ReadableValue(values[6]), ReadableValue(values[7]),
        ReadableValue(values[8]), ReadableValue(values[9])
      local itemLink = type(GetMerchantItemLink) == "function" and
        SafeCallOne(GetMerchantItemLink, index) or nil
      local itemID = ItemIDFromLink(itemLink)
      if itemID then
        local costs = {}
        local costCount = type(GetMerchantItemCostInfo) == "function" and
          SafeCallOne(GetMerchantItemCostInfo, index) or 0
        for costIndex = 1, costCount or 0 do
          local cost = MerchantCost(index, costIndex)
          if cost then table.insert(costs, cost) end
        end
        local observationKey = string.format("%d:%d:%d:%d:%d:%d", math.floor(time() / 86400),
          sourceID, itemID, index, price or 0, available or -1)
        if not vendorObservationKeys[observationKey] then
          vendorObservationKeys[observationKey] = true
          table.insert(diagnostics.vendorObservations, {
            observationID = NewUuid(),
            observationKey = observationKey,
            capturedAt = time(),
            sourceType = sourceType,
            sourceID = sourceID,
            sourceName = sourceName,
            itemIndex = index,
            itemID = itemID,
            itemLink = itemLink,
            itemName = name,
            texture = texture,
            price = type(price) == "number" and math.max(0, math.floor(price)) or 0,
            stackCount = type(stackCount) == "number" and math.max(1, math.floor(stackCount)) or 1,
            available = type(available) == "number" and math.floor(available) or nil,
            isPurchasable = isPurchasable == true,
            isUsable = isUsable == true,
            extendedCost = extendedCost == true,
            costs = costs,
            observerLocation = CapturePlayerLocation(),
          })
        end
      end
    end
  end
  TrimArray(diagnostics.vendorObservations, MAX_VENDOR_OBSERVATIONS)
  TouchDiagnostics(diagnostics)
end

local function TrainerServiceInfo(index)
  if type(GetTrainerServiceInfo) ~= "function" then return nil end
  local values = { pcall(GetTrainerServiceInfo, index) }
  if not values[1] then return nil end
  local name = ReadableValue(values[2])
  local second = ReadableValue(values[3])
  local third = ReadableValue(values[4])
  local rank = ReadableValue(values[6])
  local serviceType, icon
  if type(third) == "number" then
    serviceType = second
    icon = third
  else
    rank = second
    serviceType = third
    icon = type(GetTrainerServiceIcon) == "function" and SafeCallOne(GetTrainerServiceIcon, index)
      or nil
  end
  if type(name) ~= "string" or type(serviceType) ~= "string" or serviceType == "header" then
    return nil
  end
  return name, rank, serviceType, icon
end

local function TrainerSpellID(index)
  if not trainerTooltip then
    trainerTooltip = CreateFrame("GameTooltip", "WowTraderTrainerEvidenceTooltip", UIParent,
      "GameTooltipTemplate")
    trainerTooltip:SetOwner(UIParent, "ANCHOR_NONE")
  end
  if type(trainerTooltip.SetTrainerService) ~= "function" then return nil end
  trainerTooltip:ClearLines()
  local succeeded = pcall(trainerTooltip.SetTrainerService, trainerTooltip, index)
  if not succeeded or type(trainerTooltip.GetSpell) ~= "function" then return nil end
  local spellSucceeded, _, spellID = pcall(trainerTooltip.GetSpell, trainerTooltip)
  if spellSucceeded and type(spellID) == "number" and spellID > 0 then return spellID end
  return nil
end

local function TrainerFiltersComplete()
  if type(GetTrainerServiceTypeFilter) ~= "function" then return false end
  return SafeCallOne(GetTrainerServiceTypeFilter, "available") == true and
    SafeCallOne(GetTrainerServiceTypeFilter, "unavailable") == true and
    SafeCallOne(GetTrainerServiceTypeFilter, "used") == true
end

local function TrainerSkillRequirement(index)
  if type(GetTrainerServiceSkillReq) ~= "function" then return nil end
  local values = { pcall(GetTrainerServiceSkillReq, index) }
  if not values[1] then return nil end
  for valueIndex = #values, 2, -1 do
    local value = ReadableValue(values[valueIndex])
    if type(value) == "number" and value >= 0 then return math.floor(value) end
  end
  return nil
end

local function CaptureTrainerInventory()
  local diagnostics = InitializeWorldEvidence()
  if not diagnostics or not diagnostics.enabled or type(GetNumTrainerServices) ~= "function" then
    return
  end
  local sourceType, sourceID, sourceName, sourceGuid = CurrentNpcIdentity()
  if type(sourceID) ~= "number" then return end
  SaveNpcSighting("npc", "trainer")
  local serviceCount = SafeCallOne(GetNumTrainerServices) or 0
  local allFiltersEnabled = TrainerFiltersComplete()
  for index = 1, serviceCount do
    local name, rank, serviceType, icon = TrainerServiceInfo(index)
    if name then
      local moneyCost = type(GetTrainerServiceCost) == "function" and
        SafeCallOne(GetTrainerServiceCost, index) or 0
      local spellID = TrainerSpellID(index)
      local requiredSkillLine = type(GetTrainerServiceSkillLine) == "function" and
        SafeCallOne(GetTrainerServiceSkillLine, index) or nil
      local observationKey = table.concat({
        tostring(math.floor(time() / 86400)), tostring(sourceID), tostring(spellID or 0),
        name, tostring(rank or ""), tostring(moneyCost or 0),
      }, ":")
      if not trainerObservationKeys[observationKey] then
        trainerObservationKeys[observationKey] = true
        table.insert(diagnostics.trainerObservations, {
          observationID = NewUuid(),
          observationKey = observationKey,
          capturedAt = time(),
          sourceType = sourceType or "Creature",
          sourceID = sourceID,
          sourceGuid = sourceGuid,
          sourceName = sourceName,
          serviceIndex = index,
          serviceName = name,
          serviceRank = type(rank) == "string" and rank or nil,
          serviceType = serviceType,
          spellID = spellID,
          icon = icon,
          moneyCost = type(moneyCost) == "number" and math.max(0, math.floor(moneyCost)) or 0,
          requiredLevel = type(GetTrainerServiceLevelReq) == "function" and
            SafeCallOne(GetTrainerServiceLevelReq, index) or nil,
          requiredSkillLine = type(requiredSkillLine) == "string" and requiredSkillLine or nil,
          requiredSkillRank = TrainerSkillRequirement(index),
          allFiltersEnabled = allFiltersEnabled,
          observerLocation = CapturePlayerLocation(),
        })
      end
    end
  end
  TrimArray(diagnostics.trainerObservations, MAX_TRAINER_OBSERVATIONS)
  TouchDiagnostics(diagnostics)
end

local function ClearEvidence(diagnostics)
  diagnostics.lootSessions = {}
  diagnostics.lootObservations = {}
  diagnostics.npcSightings = {}
  diagnostics.questQueries = {}
  diagnostics.questObservations = {}
  diagnostics.vendorObservations = {}
  diagnostics.trainerObservations = {}
  diagnostics.healthObservations = {}
  diagnostics.modelResolutions = {}
  diagnostics.spellObservations = {}
  diagnostics.encounterAttempts = {}
  diagnostics.encounterLoot = {}
  npcObservationKeys = {}
  vendorObservationKeys = {}
  trainerObservationKeys = {}
  TouchDiagnostics(diagnostics)
end

function Addon.HandleWorldEvidenceCommand(command)
  local normalized = string.lower(string.match(command or "", "^%s*(.-)%s*$"))
  local action
  if normalized == "evidence" or normalized == "diagnostics" then
    action = ""
  else
    action = string.match(normalized, "^evidence%s+(.+)$") or
      string.match(normalized, "^diagnostics%s+(.+)$")
  end
  if action == nil then return false end
  local diagnostics = InitializeWorldEvidence()
  if not diagnostics then
    Print("saved variables are not ready yet.")
    return true
  end
  if action == "on" then
    diagnostics.enabled = true
    TouchDiagnostics(diagnostics)
    Print("world evidence collection enabled. Observations stay bounded and upload through the companion.")
  elseif action == "off" then
    diagnostics.enabled = false
    TouchDiagnostics(diagnostics)
    Print("world evidence collection disabled.")
  elseif action == "clear" then
    ClearEvidence(diagnostics)
    Print("stored world evidence cleared.")
  elseif action == "status" or action == "" then
    Print(string.format(
      "world evidence %s: %d NPC, %d loot sessions, %d loot items, %d quests, %d vendors, %d trainer services.",
      diagnostics.enabled and "enabled" or "disabled", #diagnostics.npcSightings,
      #diagnostics.lootSessions, #diagnostics.lootObservations, #diagnostics.questObservations,
      #diagnostics.vendorObservations, #diagnostics.trainerObservations))
  else
    Print("usage: /wowtrader evidence on|off|status|clear")
  end
  return true
end

local evidenceFrame = CreateFrame("Frame")
evidenceFrame:RegisterEvent("ADDON_LOADED")
evidenceFrame:RegisterEvent("NAME_PLATE_UNIT_ADDED")
evidenceFrame:RegisterEvent("PLAYER_TARGET_CHANGED")
evidenceFrame:RegisterEvent("UPDATE_MOUSEOVER_UNIT")
evidenceFrame:RegisterEvent("LOOT_OPENED")
evidenceFrame:RegisterEvent("QUEST_ACCEPTED")
evidenceFrame:RegisterEvent("QUEST_TURNED_IN")
evidenceFrame:RegisterEvent("QUEST_LOOT_RECEIVED")
evidenceFrame:RegisterEvent("QUEST_CURRENCY_LOOT_RECEIVED")
evidenceFrame:RegisterEvent("QUEST_DETAIL")
evidenceFrame:RegisterEvent("QUEST_PROGRESS")
evidenceFrame:RegisterEvent("QUEST_COMPLETE")
evidenceFrame:RegisterEvent("GOSSIP_SHOW")
evidenceFrame:RegisterEvent("MERCHANT_SHOW")
evidenceFrame:RegisterEvent("TRAINER_SHOW")
evidenceFrame:RegisterEvent("TRAINER_UPDATE")
evidenceFrame:SetScript("OnEvent", function(_, eventName, ...)
  if eventName == "ADDON_LOADED" then
    if (...) == ADDON_NAME then InitializeWorldEvidence() end
    return
  end
  local diagnostics = InitializeWorldEvidence()
  if not diagnostics or not diagnostics.enabled then return end
  if eventName == "NAME_PLATE_UNIT_ADDED" then
    SaveNpcSighting((...), "nameplate")
  elseif eventName == "PLAYER_TARGET_CHANGED" then
    SaveNpcSighting("target", "target")
  elseif eventName == "UPDATE_MOUSEOVER_UNIT" then
    SaveNpcSighting("mouseover", "mouseover")
  elseif eventName == "LOOT_OPENED" then
    CaptureLootWindow()
  elseif eventName == "QUEST_ACCEPTED" then
    local questLogIndex, questID = ...
    SaveQuestObservation("accepted", questID or questLogIndex, {})
  elseif eventName == "QUEST_TURNED_IN" then
    local questID, xpReward, moneyReward = ...
    SaveQuestObservation("completed", questID, { xpReward = xpReward, moneyReward = moneyReward })
  elseif eventName == "QUEST_LOOT_RECEIVED" then
    local questID, itemLink, quantity = ...
    SaveQuestObservation("item_reward", questID, {
      itemID = ItemIDFromLink(itemLink), itemLink = itemLink, quantity = quantity,
    })
  elseif eventName == "QUEST_CURRENCY_LOOT_RECEIVED" then
    local questID, currencyID, quantity = ...
    SaveQuestObservation("currency_reward", questID, {
      currencyID = currencyID, quantity = quantity,
    })
  elseif eventName == "QUEST_DETAIL" then
    CaptureCurrentQuest("detail")
  elseif eventName == "QUEST_PROGRESS" then
    CaptureCurrentQuest("progress")
  elseif eventName == "QUEST_COMPLETE" then
    CaptureCurrentQuest("completion_dialog")
  elseif eventName == "GOSSIP_SHOW" then
    SaveNpcSighting("npc", "gossip")
    CaptureGossipQuests()
  elseif eventName == "MERCHANT_SHOW" then
    CaptureMerchantInventory()
  elseif eventName == "TRAINER_SHOW" or eventName == "TRAINER_UPDATE" then
    CaptureTrainerInventory()
  end
end)

