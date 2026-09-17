local ADDON_NAME = ...

local ADDON_VERSION = "0.4.0"
local SAVED_SCHEMA_VERSION = 1
local MAX_QUEUED_SCANS = 8
local MAX_ENCOUNTER_ATTEMPTS = 100
local MAX_ENCOUNTER_LOOT = 1000
local MAX_NPC_SIGHTINGS = 5000
local MAX_LOOT_OBSERVATIONS = 5000
local QUEST_QUERY_TIMEOUT_SECONDS = 8
local QUEST_QUERY_DELAY_SECONDS = 1.5
local MODEL_QUERY_TIMEOUT_SECONDS = 6
local MODEL_QUERY_DELAY_SECONDS = 0.35
local MODEL_BATCH_ATTEMPTS = 3
local MAX_MODEL_RESOLUTIONS = 250
local REGION_NAMES = {
  [1] = "US",
  [2] = "KR",
  [3] = "EU",
  [4] = "TW",
  [5] = "CN",
}

local scanStartedAt = nil
local scanAuctionHouseType = nil
local listener = {}
local activeEncounter = nil
local diagnosticsInitializedThisSession = false
local npcObservationKeys = {}
local bossModelFrame = nil
local bossModelTicker = nil
local bossModelQueue = nil

local function Print(message)
  DEFAULT_CHAT_FRAME:AddMessage("|cffc9a86aWoW Trader:|r " .. message)
end

local function NewUuid()
  local template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
  return string.gsub(template, "[xy]", function(character)
    local value
    if character == "x" then
      value = math.random(0, 15)
    else
      value = math.random(8, 11)
    end
    return string.format("%x", value)
  end)
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

local function GetAuctionHouseType()
  if GetAuctionHouseFaction then
    local auctionHouseFaction = GetAuctionHouseFaction()
    if auctionHouseFaction == "Neutral" then
      return "neutral"
    elseif auctionHouseFaction == "Alliance" then
      return "alliance"
    elseif auctionHouseFaction == "Horde" then
      return "horde"
    end
  end

  local playerFaction = UnitFactionGroup("player")
  if playerFaction == "Alliance" then
    return "alliance"
  elseif playerFaction == "Horde" then
    return "horde"
  end
  return "unknown"
end

local function GetSourceCharacter()
  local name = UnitName("player")
  local realmId = GetNormalizedRealmName and GetNormalizedRealmName() or GetRealmName()
  local factionName = UnitFactionGroup("player")
  local faction = "unknown"
  if factionName == "Alliance" then
    faction = "alliance"
  elseif factionName == "Horde" then
    faction = "horde"
  elseif factionName == "Neutral" then
    faction = "neutral"
  end

  if type(name) ~= "string" or name == "" or type(realmId) ~= "string" or realmId == "" then
    return nil
  end
  return {
    name = name,
    realmId = realmId,
    faction = faction,
    guid = UnitGUID("player"),
  }
end

local function InitializeSavedVariables()
  if type(WOW_TRADER_SAVED) ~= "table" or WOW_TRADER_SAVED.schemaVersion ~= SAVED_SCHEMA_VERSION then
    WOW_TRADER_SAVED = {
      schemaVersion = SAVED_SCHEMA_VERSION,
      installationId = NewUuid(),
      scans = {},
    }
  end

  if type(WOW_TRADER_SAVED.installationId) ~= "string" then
    WOW_TRADER_SAVED.installationId = NewUuid()
  end
  if type(WOW_TRADER_SAVED.scans) ~= "table" then
    WOW_TRADER_SAVED.scans = {}
  end
  if type(WOW_TRADER_SAVED.worldDiagnostics) ~= "table" then
    WOW_TRADER_SAVED.worldDiagnostics = {
      schemaVersion = 3,
      enabled = false,
      encounterAttempts = {},
      encounterLoot = {},
      npcSightings = {},
      lootObservations = {},
      questQueries = {},
      modelResolutions = {},
      modelResolver = {
        sampleBuild = WOW_TRADER_FOREVER_BOSS_SAMPLE_BUILD,
        cursor = 0,
        running = false,
        mode = nil,
      },
      questScanner = {
        sampleBuild = WOW_TRADER_FOREVER_QUEST_SAMPLE_BUILD,
        cursor = 0,
        running = false,
        waitingQuestID = nil,
      },
    }
  end
  local diagnostics = WOW_TRADER_SAVED.worldDiagnostics
  diagnostics.schemaVersion = 3
  if type(diagnostics.encounterAttempts) ~= "table" then diagnostics.encounterAttempts = {} end
  if type(diagnostics.encounterLoot) ~= "table" then diagnostics.encounterLoot = {} end
  if type(diagnostics.npcSightings) ~= "table" then diagnostics.npcSightings = {} end
  if type(diagnostics.lootObservations) ~= "table" then diagnostics.lootObservations = {} end
  if type(diagnostics.questQueries) ~= "table" then diagnostics.questQueries = {} end
  if type(diagnostics.modelResolutions) ~= "table" then diagnostics.modelResolutions = {} end
  if type(diagnostics.modelResolver) ~= "table" then diagnostics.modelResolver = {} end
  if type(diagnostics.modelResolver.cursor) ~= "number" then diagnostics.modelResolver.cursor = 0 end
  diagnostics.modelResolver.sampleBuild = WOW_TRADER_FOREVER_BOSS_SAMPLE_BUILD
  if type(diagnostics.questScanner) ~= "table" then diagnostics.questScanner = {} end
  if type(diagnostics.questScanner.cursor) ~= "number" then diagnostics.questScanner.cursor = 0 end
  diagnostics.questScanner.sampleBuild = WOW_TRADER_FOREVER_QUEST_SAMPLE_BUILD
  if not diagnosticsInitializedThisSession then
    diagnostics.questScanner.running = false
    diagnostics.questScanner.waitingQuestID = nil
    diagnostics.modelResolver.running = false
    diagnosticsInitializedThisSession = true
  end
end

local function TrimArray(values, maximum)
  while #values > maximum do table.remove(values, 1) end
end

local function ReadVectorCoordinates(vector)
  if vector == nil then return nil, nil end
  if type(vector.GetXY) == "function" then return vector:GetXY() end
  return vector.x, vector.y
end

local function CapturePlayerLocation()
  local uiMapID = C_Map and C_Map.GetBestMapForUnit and C_Map.GetBestMapForUnit("player") or nil
  local uiX, uiY = nil, nil
  if uiMapID and C_Map.GetPlayerMapPosition then
    uiX, uiY = ReadVectorCoordinates(C_Map.GetPlayerMapPosition(uiMapID, "player"))
  end
  local positionX, positionY, positionZ, instanceID = nil, nil, nil, nil
  if UnitPosition then positionX, positionY, positionZ, instanceID = UnitPosition("player") end
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
    mapID = mapID,
    instanceType = instanceType,
    difficultyID = difficultyID,
    difficultyName = difficultyName,
  }
end

local function ParseObjectGuid(guid)
  if type(guid) ~= "string" or guid == "" then return nil, nil end
  local objectType, _, _, _, _, objectID = strsplit("-", guid)
  return objectType, tonumber(objectID)
end

local function CaptureUnitWorldPosition(unitToken)
  if not UnitPosition then return nil end
  local positionX, positionY, positionZ, instanceID = UnitPosition(unitToken)
  if type(positionX) ~= "number" or type(positionY) ~= "number" then return nil end
  return {
    positionX = positionX,
    positionY = positionY,
    positionZ = positionZ,
    instanceID = instanceID,
    coordinateSystem = "unit_position_api",
  }
end

local function CaptureClosestUnitPosition(npcID)
  if not ClosestUnitPosition then return nil end
  local succeeded, xPos, yPos, distance = pcall(ClosestUnitPosition, npcID)
  if not succeeded or type(xPos) ~= "number" or type(yPos) ~= "number" then return nil end
  return {
    xPos = xPos,
    yPos = yPos,
    distance = distance,
    coordinateSystem = "closest_unit_position_api_unverified",
  }
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
  InitializeSavedVariables()
  if not WOW_TRADER_SAVED.worldDiagnostics.enabled then return end
  if not UnitExists(unitToken) or UnitIsPlayer(unitToken) then return end
  local guid = UnitGUID(unitToken)
  local objectType, npcID = ParseObjectGuid(guid)
  if (objectType ~= "Creature" and objectType ~= "Vehicle") or npcID == nil then return end

  local observerLocation = CapturePlayerLocation()
  local subjectPosition = CaptureUnitWorldPosition(unitToken)
  local closestPosition = CaptureClosestUnitPosition(npcID)
  local observationKey = NpcObservationKey(npcID, observerLocation, subjectPosition)
  if npcObservationKeys[observationKey] then return end
  npcObservationKeys[observationKey] = true

  local distanceSquared = nil
  if UnitDistanceSquared then distanceSquared = UnitDistanceSquared(unitToken) end
  table.insert(WOW_TRADER_SAVED.worldDiagnostics.npcSightings, {
    observationID = NewUuid(),
    capturedAt = time(),
    npcID = npcID,
    npcName = UnitName(unitToken),
    objectType = objectType,
    trigger = trigger,
    level = UnitLevel(unitToken),
    classification = UnitClassification(unitToken),
    creatureType = UnitCreatureType(unitToken),
    creatureFamily = UnitCreatureFamily(unitToken),
    reaction = UnitReaction(unitToken, "player"),
    canAttack = UnitCanAttack("player", unitToken) and true or false,
    isQuestBoss = UnitIsQuestBoss and UnitIsQuestBoss(unitToken) and true or false,
    isDead = UnitIsDeadOrGhost(unitToken) and true or false,
    distanceSquared = distanceSquared,
    subjectPosition = subjectPosition,
    closestPosition = closestPosition,
    observerLocation = observerLocation,
    positionEvidence = subjectPosition and "unit_position" or
      (closestPosition and "closest_unit_position_unverified" or "observer_position"),
  })
  TrimArray(WOW_TRADER_SAVED.worldDiagnostics.npcSightings, MAX_NPC_SIGHTINGS)
end

local function ItemIDFromLink(itemLink)
  if type(itemLink) ~= "string" then return nil end
  if GetItemInfoInstant then
    local itemID = GetItemInfoInstant(itemLink)
    if type(itemID) == "number" then return itemID end
  end
  return tonumber(string.match(itemLink, "item:(%d+)"))
end

local function SaveLootObservation(slotIndex, itemLink, itemName, quantity, sourceGuid, sourceQuantity)
  local itemID = ItemIDFromLink(itemLink)
  if itemID == nil then return end
  local sourceType, sourceID = ParseObjectGuid(sourceGuid)
  table.insert(WOW_TRADER_SAVED.worldDiagnostics.lootObservations, {
    observationID = NewUuid(),
    capturedAt = time(),
    slotIndex = slotIndex,
    itemID = itemID,
    itemLink = itemLink,
    itemName = itemName,
    quantity = quantity,
    sourceType = sourceType or "unknown",
    sourceID = sourceID,
    sourceGuid = sourceGuid,
    sourceQuantity = sourceQuantity,
    encounterID = activeEncounter and activeEncounter.encounterID or nil,
    attemptID = activeEncounter and activeEncounter.attemptID or nil,
    observerLocation = CapturePlayerLocation(),
  })
end

local function CaptureLootWindow()
  InitializeSavedVariables()
  if not WOW_TRADER_SAVED.worldDiagnostics.enabled or not GetNumLootItems then return end
  for slotIndex = 1, GetNumLootItems() do
    local itemLink = GetLootSlotLink and GetLootSlotLink(slotIndex) or nil
    if itemLink then
      local _, itemName, quantity = GetLootSlotInfo(slotIndex)
      local sources = GetLootSourceInfo and { GetLootSourceInfo(slotIndex) } or {}
      if #sources == 0 then
        SaveLootObservation(slotIndex, itemLink, itemName, quantity, nil, nil)
      else
        for sourceIndex = 1, #sources, 2 do
          SaveLootObservation(
            slotIndex,
            itemLink,
            itemName,
            quantity,
            sources[sourceIndex],
            sources[sourceIndex + 1]
          )
        end
      end
    end
  end
  TrimArray(WOW_TRADER_SAVED.worldDiagnostics.lootObservations, MAX_LOOT_OBSERVATIONS)
end

local function DiagnosticsStatus()
  InitializeSavedVariables()
  local diagnostics = WOW_TRADER_SAVED.worldDiagnostics
  Print(string.format(
    "diagnostics %s: %d encounter(s), %d NPC sighting(s), %d loot observation(s).",
    diagnostics.enabled and "enabled" or "disabled",
    #diagnostics.encounterAttempts,
    #diagnostics.npcSightings,
    #diagnostics.lootObservations
  ))
end

local function RebuildNpcObservationIndex()
  npcObservationKeys = {}
  for _, sighting in ipairs(WOW_TRADER_SAVED.worldDiagnostics.npcSightings) do
    if type(sighting) == "table" and type(sighting.npcID) == "number" then
      local observerLocation = type(sighting.observerLocation) == "table" and sighting.observerLocation or {}
      local subjectPosition = type(sighting.subjectPosition) == "table" and sighting.subjectPosition or nil
      npcObservationKeys[NpcObservationKey(sighting.npcID, observerLocation, subjectPosition)] = true
    end
  end
end

local function CopyScalarTable(value, depth)
  if type(value) ~= "table" or depth <= 0 then return nil end
  local copy = {}
  for key, entry in pairs(value) do
    local keyType = type(key)
    local entryType = type(entry)
    if (keyType == "string" or keyType == "number") and
       (entryType == "string" or entryType == "number" or entryType == "boolean") then
      copy[key] = entry
    elseif (keyType == "string" or keyType == "number") and entryType == "table" then
      copy[key] = CopyScalarTable(entry, depth - 1)
    end
  end
  return copy
end

local function SaveEncounterStart(encounterID, encounterName, difficultyID, groupSize)
  InitializeSavedVariables()
  if not WOW_TRADER_SAVED.worldDiagnostics.enabled then return end
  activeEncounter = {
    attemptID = NewUuid(),
    encounterID = encounterID,
    encounterName = encounterName,
    difficultyID = difficultyID,
    groupSize = groupSize,
    startedAt = time(),
    startLocation = CapturePlayerLocation(),
  }
end

local function SaveEncounterEnd(
  encounterID,
  encounterName,
  difficultyID,
  groupSize,
  success,
  encounterUnitStatus
)
  InitializeSavedVariables()
  if not WOW_TRADER_SAVED.worldDiagnostics.enabled then return end
  local attempt = activeEncounter or {
    attemptID = NewUuid(),
    encounterID = encounterID,
    encounterName = encounterName,
    difficultyID = difficultyID,
    groupSize = groupSize,
    startedAt = time(),
    startLocation = CapturePlayerLocation(),
  }
  attempt.endedAt = time()
  attempt.success = success == 1
  attempt.endLocation = CapturePlayerLocation()
  attempt.actors = {}
  if type(encounterUnitStatus) == "table" then
    for _, actor in ipairs(encounterUnitStatus) do
      if type(actor) == "table" and type(actor.creatureID) == "number" then
        table.insert(attempt.actors, {
          creatureID = actor.creatureID,
          creatureName = actor.creatureName,
          remainingHealthPercent = actor.remainingHealthPercent,
        })
      end
    end
  end
  table.insert(WOW_TRADER_SAVED.worldDiagnostics.encounterAttempts, attempt)
  TrimArray(WOW_TRADER_SAVED.worldDiagnostics.encounterAttempts, MAX_ENCOUNTER_ATTEMPTS)
  activeEncounter = nil
  Print(string.format("saved encounter %s with %d actor record(s).", encounterName, #attempt.actors))
end

local function SaveEncounterLoot(encounterID, itemID, itemLink, quantity, itemName, fileName)
  InitializeSavedVariables()
  if not WOW_TRADER_SAVED.worldDiagnostics.enabled then return end
  table.insert(WOW_TRADER_SAVED.worldDiagnostics.encounterLoot, {
    observationID = NewUuid(),
    capturedAt = time(),
    encounterID = encounterID,
    itemID = itemID,
    itemLink = itemLink,
    quantity = quantity,
    itemName = itemName,
    iconFileName = fileName,
    attemptID = activeEncounter and activeEncounter.attemptID or nil,
    location = CapturePlayerLocation(),
  })
  TrimArray(WOW_TRADER_SAVED.worldDiagnostics.encounterLoot, MAX_ENCOUNTER_LOOT)
end

local function QuestScannerStatus()
  InitializeSavedVariables()
  local scanner = WOW_TRADER_SAVED.worldDiagnostics.questScanner
  local resultCount = 0
  for _ in pairs(WOW_TRADER_SAVED.worldDiagnostics.questQueries) do resultCount = resultCount + 1 end
  Print(string.format(
    "quest sample: %d/%d requested, %d result(s), %s.",
    scanner.cursor,
    #WOW_TRADER_FOREVER_QUEST_SAMPLE,
    resultCount,
    scanner.running and "running" or "paused"
  ))
end

local ContinueQuestSample

local function SaveQuestQueryResult(questID, status)
  local diagnostics = WOW_TRADER_SAVED.worldDiagnostics
  local title = nil
  local objectives = nil
  local tag = nil
  if status == "success" and C_QuestLog then
    if C_QuestLog.GetTitleForQuestID then title = C_QuestLog.GetTitleForQuestID(questID) end
    if C_QuestLog.GetQuestObjectives then
      objectives = CopyScalarTable(C_QuestLog.GetQuestObjectives(questID), 2)
    end
    if C_QuestLog.GetQuestTagInfo then tag = CopyScalarTable(C_QuestLog.GetQuestTagInfo(questID), 2) end
  end
  diagnostics.questQueries[tostring(questID)] = {
    questID = questID,
    status = status,
    capturedAt = time(),
    title = title,
    objectives = objectives,
    tag = tag,
    location = CapturePlayerLocation(),
  }
  diagnostics.questScanner.waitingQuestID = nil
  if diagnostics.questScanner.running then C_Timer.After(QUEST_QUERY_DELAY_SECONDS, ContinueQuestSample) end
end

ContinueQuestSample = function()
  InitializeSavedVariables()
  local scanner = WOW_TRADER_SAVED.worldDiagnostics.questScanner
  if not scanner.running or scanner.waitingQuestID ~= nil then return end
  if InCombatLockdown and InCombatLockdown() then
    C_Timer.After(5, ContinueQuestSample)
    return
  end
  local nextCursor = scanner.cursor + 1
  local questID = WOW_TRADER_FOREVER_QUEST_SAMPLE[nextCursor]
  if questID == nil then
    scanner.running = false
    Print("quest capability sample completed. Use /reload or log out to save it.")
    return
  end
  if not C_QuestLog or not C_QuestLog.RequestLoadQuestByID then
    scanner.running = false
    Print("this client does not expose C_QuestLog.RequestLoadQuestByID.")
    return
  end
  scanner.cursor = nextCursor
  scanner.waitingQuestID = questID
  C_QuestLog.RequestLoadQuestByID(questID)
  C_Timer.After(QUEST_QUERY_TIMEOUT_SECONDS, function()
    if scanner.running and scanner.waitingQuestID == questID then
      SaveQuestQueryResult(questID, "timeout")
    end
  end)
end

local function StartQuestSample(reset)
  InitializeSavedVariables()
  local _, clientBuild = GetBuildInfo()
  if tonumber(clientBuild) ~= WOW_TRADER_FOREVER_QUEST_SAMPLE_BUILD then
    Print(string.format(
      "quest sample targets build %d; current build is %s. Regenerate the sample before running it.",
      WOW_TRADER_FOREVER_QUEST_SAMPLE_BUILD,
      tostring(clientBuild)
    ))
    return
  end
  local diagnostics = WOW_TRADER_SAVED.worldDiagnostics
  if reset then
    diagnostics.questQueries = {}
    diagnostics.questScanner.cursor = 0
  end
  diagnostics.questScanner.running = true
  diagnostics.questScanner.waitingQuestID = nil
  Print("started the explicit 100-ID quest capability sample; it pauses automatically in combat.")
  ContinueQuestSample()
end

local function CancelBossModelTicker()
  if bossModelTicker and bossModelTicker.Cancel then bossModelTicker:Cancel() end
  bossModelTicker = nil
end

local function EnsureBossModelFrame()
  if bossModelFrame then return true end
  local succeeded, frame = pcall(CreateFrame, "PlayerModel", nil, UIParent)
  if not succeeded or not frame then return false end
  frame:SetSize(2, 2)
  frame:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", -20, -20)
  frame:SetAlpha(0.01)
  frame:Show()
  bossModelFrame = frame
  return type(frame.SetCreature) == "function" and
      type(frame.GetDisplayInfo) == "function" and
      type(frame.GetModelFileID) == "function"
end

local function BuildBossModelQueue(mode)
  local queue = {}
  if mode == "controls" then
    table.insert(queue, { creatureID = 2671, name = "Mechanical Squirrel control", attempt = 1 })
    table.insert(queue, { creatureID = 10184, name = "Onyxia control", attempt = 1 })
    table.insert(queue, { creatureID = 250079, name = "The Wild King control", attempt = 1 })
    table.insert(queue, { creatureID = 99999999, name = "Invalid creature control", attempt = 1 })
    return queue
  end
  for attempt = 1, MODEL_BATCH_ATTEMPTS do
    for _, boss in ipairs(WOW_TRADER_FOREVER_BOSS_SAMPLE) do
      table.insert(queue, {
        creatureID = boss.creatureID,
        name = boss.name,
        attempt = attempt,
      })
    end
  end
  return queue
end

local function ReadBossModelResult()
  local displayID = nil
  local modelFileID = nil
  local displaySucceeded, displayValue = pcall(bossModelFrame.GetDisplayInfo, bossModelFrame)
  if displaySucceeded and type(displayValue) == "number" and displayValue > 0 then
    displayID = displayValue
  end
  local modelSucceeded, modelValue = pcall(bossModelFrame.GetModelFileID, bossModelFrame)
  if modelSucceeded and type(modelValue) == "number" and modelValue > 0 then
    modelFileID = modelValue
  end
  return displayID, modelFileID
end

local ResolveNextBossModel

local function SaveBossModelResult(entry, status, displayID, modelFileID, errorMessage)
  local diagnostics = WOW_TRADER_SAVED.worldDiagnostics
  local _, clientBuild = GetBuildInfo()
  table.insert(diagnostics.modelResolutions, {
    resolutionID = NewUuid(),
    capturedAt = time(),
    clientBuild = tonumber(clientBuild),
    creatureID = entry.creatureID,
    creatureName = entry.name,
    attempt = entry.attempt,
    status = status,
    displayID = displayID,
    modelFileID = modelFileID,
    errorMessage = errorMessage,
    evidence = "player_model_set_creature",
  })
  TrimArray(diagnostics.modelResolutions, MAX_MODEL_RESOLUTIONS)
end

local function FinishBossModelEntry(entry, status, displayID, modelFileID, errorMessage)
  CancelBossModelTicker()
  SaveBossModelResult(entry, status, displayID, modelFileID, errorMessage)
  C_Timer.After(MODEL_QUERY_DELAY_SECONDS, ResolveNextBossModel)
end

local function ResolveBossModel(entry)
  if bossModelFrame.ClearModel then pcall(bossModelFrame.ClearModel, bossModelFrame) end
  local succeeded, errorMessage = pcall(bossModelFrame.SetCreature, bossModelFrame, entry.creatureID, 0)
  if not succeeded then
    FinishBossModelEntry(entry, "api_error", nil, nil, tostring(errorMessage))
    return
  end

  local elapsed = 0
  bossModelTicker = C_Timer.NewTicker(0.2, function()
    local diagnostics = WOW_TRADER_SAVED.worldDiagnostics
    if not diagnostics.modelResolver.running then
      CancelBossModelTicker()
      return
    end
    elapsed = elapsed + 0.2
    local displayID, modelFileID = ReadBossModelResult()
    if displayID or modelFileID then
      FinishBossModelEntry(entry, "resolved", displayID, modelFileID, nil)
    elseif elapsed >= MODEL_QUERY_TIMEOUT_SECONDS then
      FinishBossModelEntry(entry, "timeout", nil, nil, nil)
    end
  end)
end

ResolveNextBossModel = function()
  InitializeSavedVariables()
  local resolver = WOW_TRADER_SAVED.worldDiagnostics.modelResolver
  if not resolver.running then return end
  local nextCursor = resolver.cursor + 1
  local entry = bossModelQueue and bossModelQueue[nextCursor] or nil
  if entry == nil then
    resolver.running = false
    resolver.completedAt = time()
    Print("boss model resolution completed. Use /reload or log out to save it.")
    return
  end
  resolver.cursor = nextCursor
  ResolveBossModel(entry)
end

local function BossModelResolverStatus()
  InitializeSavedVariables()
  local diagnostics = WOW_TRADER_SAVED.worldDiagnostics
  local mode = diagnostics.modelResolver.mode or "batch"
  local queueSize = #(bossModelQueue or BuildBossModelQueue(mode))
  local resolved = 0
  local timedOut = 0
  for _, result in ipairs(diagnostics.modelResolutions) do
    if result.status == "resolved" then resolved = resolved + 1 end
    if result.status == "timeout" then timedOut = timedOut + 1 end
  end
  Print(string.format(
    "boss models: %d result(s), %d resolved, %d timed out; resolver %s at %d/%d.",
    #diagnostics.modelResolutions,
    resolved,
    timedOut,
    diagnostics.modelResolver.running and "running" or "stopped",
    diagnostics.modelResolver.cursor,
    queueSize
  ))
end

local function StartBossModelResolver(mode, reset)
  InitializeSavedVariables()
  local _, clientBuild = GetBuildInfo()
  if tonumber(clientBuild) ~= WOW_TRADER_FOREVER_BOSS_SAMPLE_BUILD then
    Print(string.format(
      "boss model sample targets build %d; current build is %s. Regenerate it before running.",
      WOW_TRADER_FOREVER_BOSS_SAMPLE_BUILD,
      tostring(clientBuild)
    ))
    return
  end
  if InCombatLockdown and InCombatLockdown() then
    Print("leave combat before starting the boss model resolver.")
    return
  end
  if not EnsureBossModelFrame() then
    Print("this client does not expose the required PlayerModel methods.")
    return
  end

  local resolver = WOW_TRADER_SAVED.worldDiagnostics.modelResolver
  if reset or resolver.mode ~= mode then
    resolver.cursor = 0
    resolver.startedAt = time()
    resolver.completedAt = nil
  end
  if reset then WOW_TRADER_SAVED.worldDiagnostics.modelResolutions = {} end
  resolver.mode = mode
  resolver.running = true
  bossModelQueue = BuildBossModelQueue(mode)
  Print(string.format("started %s boss model resolution (%d request(s)).", mode, #bossModelQueue))
  ResolveNextBossModel()
end

local function PauseBossModelResolver()
  InitializeSavedVariables()
  WOW_TRADER_SAVED.worldDiagnostics.modelResolver.running = false
  CancelBossModelTicker()
  Print("boss model resolution paused.")
end

local function AddListing(markets, marketKey, itemId, itemLink, stackSize, buyoutPrice)
  if type(marketKey) ~= "string" or marketKey == "" then
    return
  end
  if type(itemId) ~= "number" or itemId <= 0 then
    return
  end
  if type(stackSize) ~= "number" or stackSize <= 0 then
    return
  end
  if type(buyoutPrice) ~= "number" or buyoutPrice <= 0 then
    return
  end

  local unitPrice = math.ceil(buyoutPrice / stackSize)
  local market = markets[marketKey]
  if market == nil then
    market = {
      itemId = itemId,
      marketKey = marketKey,
      itemLink = itemLink,
      levels = {},
    }
    markets[marketKey] = market
  end

  local level = market.levels[unitPrice]
  if level == nil then
    market.levels[unitPrice] = {
      unitPriceCopper = unitPrice,
      quantity = stackSize,
      listingCount = 1,
    }
  else
    level.quantity = level.quantity + stackSize
    level.listingCount = level.listingCount + 1
  end
end

local function NormalizeMarkets(markets)
  local snapshots = {}
  for _, market in pairs(markets) do
    local priceLevels = {}
    for _, level in pairs(market.levels) do
      table.insert(priceLevels, level)
    end
    table.sort(priceLevels, function(left, right)
      return left.unitPriceCopper < right.unitPriceCopper
    end)

    table.insert(snapshots, {
      itemId = market.itemId,
      marketKey = market.marketKey,
      itemLink = market.itemLink,
      priceLevels = priceLevels,
    })
  end
  table.sort(snapshots, function(left, right)
    return left.marketKey < right.marketKey
  end)
  return snapshots
end

local function SaveScan(markets, capturedAt, completedAt)
  InitializeSavedVariables()

  local _, clientBuild = GetBuildInfo()
  local scan = {
    scanId = NewUuid(),
    addonVersion = ADDON_VERSION,
    clientProduct = GetClientProduct(),
    clientBuild = tonumber(clientBuild),
    locale = GetLocale(),
    region = REGION_NAMES[GetCurrentRegion and GetCurrentRegion() or 0] or "UNKNOWN",
    realmId = GetNormalizedRealmName and GetNormalizedRealmName() or GetRealmName(),
    auctionHouseType = scanAuctionHouseType or GetAuctionHouseType(),
    sourceCharacter = GetSourceCharacter(),
    capturedAt = capturedAt,
    completedAt = completedAt,
    completeness = 1,
    itemSnapshots = NormalizeMarkets(markets),
  }

  table.insert(WOW_TRADER_SAVED.scans, scan)
  while #WOW_TRADER_SAVED.scans > MAX_QUEUED_SCANS do
    table.remove(WOW_TRADER_SAVED.scans, 1)
  end

  Print(string.format("captured %d markets. Log out or /reload; the companion will upload it automatically.", #scan.itemSnapshots))
end

local function CaptureFullScan(rawScan)
  if type(rawScan) ~= "table" then
    Print("Auctionator returned an invalid full scan; nothing was saved.")
    return
  end

  local capturedAt = scanStartedAt or time()
  local markets = {}
  local pending = #rawScan
  local finalized = false

  local function CompleteOne()
    pending = pending - 1
    if pending <= 0 and not finalized then
      finalized = true
      SaveScan(markets, capturedAt, time())
    end
  end

  if pending == 0 then
    SaveScan(markets, capturedAt, time())
    return
  end

  for _, entry in ipairs(rawScan) do
    local auctionInfo = entry.auctionInfo
    local itemLink = entry.itemLink
    local itemId = type(auctionInfo) == "table" and auctionInfo[17] or nil
    local stackSize = type(auctionInfo) == "table" and auctionInfo[3] or nil
    local buyoutPrice = type(auctionInfo) == "table" and auctionInfo[10] or nil

    if type(itemLink) ~= "string" then
      CompleteOne()
    else
      Auctionator.Utilities.DBKeyFromLink(itemLink, function(databaseKeys)
        local marketKey = type(databaseKeys) == "table" and databaseKeys[1] or tostring(itemId or "")
        AddListing(markets, marketKey, itemId, itemLink, stackSize, buyoutPrice)
        CompleteOne()
      end)
    end
  end
end

function listener:ReceiveEvent(eventName, eventData)
  if eventName == Auctionator.FullScan.Events.ScanStart then
    scanStartedAt = time()
    scanAuctionHouseType = GetAuctionHouseType()
  elseif eventName == Auctionator.FullScan.Events.ScanComplete then
    CaptureFullScan(eventData)
    scanStartedAt = nil
    scanAuctionHouseType = nil
  elseif eventName == Auctionator.FullScan.Events.ScanFailed then
    scanStartedAt = nil
    scanAuctionHouseType = nil
  end
end

local function RegisterAuctionatorEvents()
  if not Auctionator or not Auctionator.EventBus or not Auctionator.FullScan then
    Print("Auctionator is not installed; market scans are unavailable, but diagnostics still work.")
    return
  end

  Auctionator.EventBus:Register(listener, {
    Auctionator.FullScan.Events.ScanStart,
    Auctionator.FullScan.Events.ScanComplete,
    Auctionator.FullScan.Events.ScanFailed,
  })
end

SLASH_WOWTRADER1 = "/wowtrader"
SlashCmdList.WOWTRADER = function(command)
  command = string.lower(string.match(command or "", "^%s*(.-)%s*$"))
  if command == "scan" then
    local fullScanFrame = Auctionator and Auctionator.State and Auctionator.State.FullScanFrameRef
    if fullScanFrame and fullScanFrame.CanInitiate and fullScanFrame:CanInitiate() then
      fullScanFrame:InitiateScan()
    else
      Print("open the Auction House and wait until Blizzard permits a full scan.")
    end
    return
  end

  if command == "diagnostics on" then
    InitializeSavedVariables()
    WOW_TRADER_SAVED.worldDiagnostics.enabled = true
    Print("Forever world diagnostics enabled. NPC and loot observations remain local until the companion supports them.")
    return
  elseif command == "diagnostics off" then
    InitializeSavedVariables()
    WOW_TRADER_SAVED.worldDiagnostics.enabled = false
    Print("Forever world diagnostics disabled.")
    return
  elseif command == "diagnostics status" then
    DiagnosticsStatus()
    return
  elseif command == "questsample start" or command == "questsample reset" then
    StartQuestSample(command == "questsample reset")
    return
  elseif command == "questsample pause" then
    InitializeSavedVariables()
    WOW_TRADER_SAVED.worldDiagnostics.questScanner.running = false
    Print("quest capability sample paused.")
    return
  elseif command == "questsample resume" then
    StartQuestSample(false)
    return
  elseif command == "questsample status" then
    QuestScannerStatus()
    return
  elseif command == "bossmodels controls" then
    StartBossModelResolver("controls", true)
    return
  elseif command == "bossmodels start" then
    StartBossModelResolver("batch", false)
    return
  elseif command == "bossmodels reset" then
    StartBossModelResolver("batch", true)
    return
  elseif command == "bossmodels resume" then
    InitializeSavedVariables()
    StartBossModelResolver(WOW_TRADER_SAVED.worldDiagnostics.modelResolver.mode or "batch", false)
    return
  elseif command == "bossmodels pause" then
    PauseBossModelResolver()
    return
  elseif command == "bossmodels status" then
    BossModelResolverStatus()
    return
  end

  InitializeSavedVariables()
  Print(string.format(
    "%d scan(s) queued. Commands: scan, diagnostics on|off|status, questsample start|pause|resume|status|reset, bossmodels controls|start|pause|resume|status|reset",
    #WOW_TRADER_SAVED.scans
  ))
end

local worldDiagnosticsFrame = CreateFrame("Frame")
worldDiagnosticsFrame:RegisterEvent("ENCOUNTER_START")
worldDiagnosticsFrame:RegisterEvent("ENCOUNTER_END")
worldDiagnosticsFrame:RegisterEvent("ENCOUNTER_LOOT_RECEIVED")
worldDiagnosticsFrame:RegisterEvent("QUEST_DATA_LOAD_RESULT")
worldDiagnosticsFrame:RegisterEvent("NAME_PLATE_UNIT_ADDED")
worldDiagnosticsFrame:RegisterEvent("PLAYER_TARGET_CHANGED")
worldDiagnosticsFrame:RegisterEvent("UPDATE_MOUSEOVER_UNIT")
worldDiagnosticsFrame:RegisterEvent("LOOT_OPENED")
worldDiagnosticsFrame:SetScript("OnEvent", function(_, eventName, ...)
  if eventName == "ENCOUNTER_START" then
    SaveEncounterStart(...)
  elseif eventName == "ENCOUNTER_END" then
    SaveEncounterEnd(...)
  elseif eventName == "ENCOUNTER_LOOT_RECEIVED" then
    SaveEncounterLoot(...)
  elseif eventName == "QUEST_DATA_LOAD_RESULT" then
    InitializeSavedVariables()
    local questID, success = ...
    local scanner = WOW_TRADER_SAVED.worldDiagnostics.questScanner
    if scanner.running and scanner.waitingQuestID == questID then
      SaveQuestQueryResult(questID, success and "success" or "failed")
    end
  elseif eventName == "NAME_PLATE_UNIT_ADDED" then
    SaveNpcSighting((...), "nameplate")
  elseif eventName == "PLAYER_TARGET_CHANGED" then
    SaveNpcSighting("target", "target")
  elseif eventName == "UPDATE_MOUSEOVER_UNIT" then
    SaveNpcSighting("mouseover", "mouseover")
  elseif eventName == "LOOT_OPENED" then
    CaptureLootWindow()
  end
end)

local initializationFrame = CreateFrame("Frame")
initializationFrame:RegisterEvent("PLAYER_LOGIN")
initializationFrame:SetScript("OnEvent", function()
  InitializeSavedVariables()
  RebuildNpcObservationIndex()
  RegisterAuctionatorEvents()
end)
