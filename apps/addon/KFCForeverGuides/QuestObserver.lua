local _, namespace = ...

local active = nil
local frame = CreateFrame("Frame")
local aliases = {
    ["named-target"] = "named-target-unverified",
    ["personal-eligibility"] = "personal-eligibility-unverified",
    ["lifecycle"] = "quest-lifecycle-unverified",
    ["pickup-level"] = "pickup-level-conflict",
    ["source-gate"] = "source-gate-conflict",
}

local function publicNumber(value, maximum)
    if type(issecretvalue) == "function" and issecretvalue(value) then return nil end
    if type(value) ~= "number" or value ~= value or value < 0 or value > maximum then return nil end
    return value
end

local function publicString(value, maximum)
    if type(issecretvalue) == "function" and issecretvalue(value) then return nil end
    if type(value) ~= "string" or value == "" or #value > maximum then return nil end
    return value
end

local function publicBoolean(value)
    if type(issecretvalue) == "function" and issecretvalue(value) then return nil end
    if type(value) ~= "boolean" then return nil end
    return value
end

local function timestamp()
    local value = type(time) == "function" and time() or nil
    value = publicNumber(value, 10000000000)
    if not value or value < 1 then error("Clock unavailable") end
    return math.floor(value)
end

local function database()
    if type(KFCForeverGuideEvidence) ~= "table" then
        KFCForeverGuideEvidence = { schemaVersion = 3, curves = {}, rewards = {} }
    end
    KFCForeverGuideEvidence.schemaVersion = 3
    if type(KFCForeverGuideEvidence.questValidations) ~= "table" then
        KFCForeverGuideEvidence.questValidations = {}
    end
    return KFCForeverGuideEvidence
end

local function characterContext()
    local name = publicString(UnitName("player"), 200)
    local guid = publicString(UnitGUID("player"), 200)
    local realm = type(GetRealmName) == "function" and publicString(GetRealmName(), 200) or nil
    local class = type(UnitClass) == "function" and publicString(select(2, UnitClass("player")), 60) or nil
    local race = type(UnitRace) == "function" and publicString(select(2, UnitRace("player")), 60) or nil
    if not name or not guid or not realm or not class or not race then
        error("Character identity unavailable")
    end
    return { name = name, guid = guid, realm = realm, class = class, race = race }
end

local function partyContext()
    local count = type(GetNumGroupMembers) == "function" and publicNumber(GetNumGroupMembers(), 40) or 0
    if not count then error("Party size unavailable") end
    local size = math.max(1, math.floor(count))
    if size > 5 then error("Quest validation requires a solo or five-player party context") end
    local members = {}
    for index = 1, size do
        local unit = index == 1 and "player" or "party" .. tostring(index - 1)
        local guid = publicString(UnitGUID(unit), 200)
        local level = publicNumber(UnitLevel(unit), 100)
        local class = type(UnitClass) == "function" and publicString(select(2, UnitClass(unit)), 60) or nil
        local race = type(UnitRace) == "function" and publicString(select(2, UnitRace(unit)), 60) or nil
        if not guid or not level or level < 1 or not class or not race then
            error("Party context unavailable")
        end
        members[#members + 1] = {
            guid = guid, level = math.floor(level), class = class, race = race,
        }
    end
    return { size = size, members = members }
end

local function questIndex(questId)
    if type(C_QuestLog) == "table" and type(C_QuestLog.GetLogIndexForQuestID) == "function" then
        return publicNumber(C_QuestLog.GetLogIndexForQuestID(questId), 10000)
    end
    if type(GetQuestLogIndexByID) == "function" then
        return publicNumber(GetQuestLogIndexByID(questId), 10000)
    end
    return nil
end

local function questObjectives(questId, index)
    local objectives = {}
    if type(C_QuestLog) == "table" and type(C_QuestLog.GetQuestObjectives) == "function" then
        local rows = C_QuestLog.GetQuestObjectives(questId)
        if type(rows) == "table" then
            for objectiveIndex, row in ipairs(rows) do
                if objectiveIndex > 20 then break end
                if type(row) == "table" then
                    local text = publicString(row.text, 500)
                    local fulfilled = publicNumber(row.numFulfilled, 1000000)
                    local required = publicNumber(row.numRequired, 1000000)
                    local finished = publicBoolean(row.finished)
                    if text or fulfilled or required or finished ~= nil then
                        objectives[#objectives + 1] = {
                            index = objectiveIndex, text = text,
                            fulfilled = fulfilled and math.floor(fulfilled) or nil,
                            required = required and math.floor(required) or nil,
                            finished = finished,
                        }
                    end
                end
            end
            return objectives
        end
    end
    if index and index > 0 and type(GetNumQuestLeaderBoards) == "function"
        and type(GetQuestLogLeaderBoard) == "function" then
        local count = publicNumber(GetNumQuestLeaderBoards(index), 20)
        for objectiveIndex = 1, math.floor(count or 0) do
            local text, _, finished = GetQuestLogLeaderBoard(objectiveIndex, index)
            text = publicString(text, 500)
            finished = publicBoolean(finished)
            if text or finished ~= nil then
                objectives[#objectives + 1] = {
                    index = objectiveIndex, text = text, fulfilled = nil,
                    required = nil, finished = finished,
                }
            end
        end
    end
    return objectives
end

local function targetContext()
    local guid = publicString(UnitGUID("target"), 200)
    local name = publicString(UnitName("target"), 200)
    local level = publicNumber(UnitLevel("target"), 100)
    if not guid or not name then return nil end
    local id = guid:match("^Creature%-%d+%-%d+%-%d+%-%d+%-(%d+)-")
        or guid:match("^Vehicle%-%d+%-%d+%-%d+%-%d+%-(%d+)-")
    return {
        npcId = id and tonumber(id) or nil, guid = id and guid or nil, name = name,
        level = level and math.floor(level) or nil,
    }
end

local function gossipAvailability(questId)
    if type(C_GossipInfo) ~= "table" or type(C_GossipInfo.GetAvailableQuests) ~= "function" then
        return nil
    end
    local rows = C_GossipInfo.GetAvailableQuests()
    if type(rows) ~= "table" then return nil end
    for _, row in ipairs(rows) do
        if type(row) == "table" and publicNumber(row.questID, 10000000) == questId then return true end
    end
    return false
end

local function locationContext()
    local mapId = nil
    if type(C_Map) == "table" and type(C_Map.GetBestMapForUnit) == "function" then
        mapId = publicNumber(C_Map.GetBestMapForUnit("player"), 10000000)
    end
    local zone = type(GetRealZoneText) == "function" and publicString(GetRealZoneText(), 200) or nil
    local subzone = type(GetSubZoneText) == "function" and publicString(GetSubZoneText(), 200) or nil
    return { mapId = mapId, zone = zone, subzone = subzone }
end

local function snapshot()
    if not active then return end
    local index = questIndex(active.questId)
    local onQuest = nil
    if type(C_QuestLog) == "table" and type(C_QuestLog.IsOnQuest) == "function" then
        onQuest = publicBoolean(C_QuestLog.IsOnQuest(active.questId))
    elseif index then
        onQuest = index > 0
    end
    local ready = nil
    if type(C_QuestLog) == "table" and type(C_QuestLog.ReadyForTurnIn) == "function" then
        ready = publicBoolean(C_QuestLog.ReadyForTurnIn(active.questId))
    end
    local rewarded = nil
    if type(C_QuestLog) == "table" and type(C_QuestLog.IsQuestFlaggedCompleted) == "function" then
        rewarded = publicBoolean(C_QuestLog.IsQuestFlaggedCompleted(active.questId))
    end
    local value = {
        capturedAt = timestamp(), onQuest = onQuest, readyForTurnIn = ready,
        rewarded = rewarded, availableAtGossip = gossipAvailability(active.questId),
        objectives = questObjectives(active.questId, index), target = targetContext(),
        location = locationContext(),
    }
    local prerequisites = namespace.questValidationPrerequisites
        and namespace.questValidationPrerequisites[active.questId]
    if type(prerequisites) == "table" then
        value.prerequisites = {}
        for _, questId in ipairs(prerequisites) do
            if #value.prerequisites >= 50 then break end
            local held, completed = nil, nil
            if type(C_QuestLog) == "table" then
                if type(C_QuestLog.IsOnQuest) == "function" then
                    held = publicBoolean(C_QuestLog.IsOnQuest(questId))
                end
                if type(C_QuestLog.IsQuestFlaggedCompleted) == "function" then
                    completed = publicBoolean(C_QuestLog.IsQuestFlaggedCompleted(questId))
                end
            end
            table.insert(value.prerequisites, { questId = questId, onQuest = held, rewarded = completed })
        end
    end
    local signature = tostring(value.onQuest) .. ":" .. tostring(value.readyForTurnIn)
        .. ":" .. tostring(value.rewarded) .. ":" .. tostring(value.availableAtGossip)
    for _, objective in ipairs(value.objectives) do
        signature = signature .. ":" .. tostring(objective.fulfilled) .. ":"
            .. tostring(objective.required) .. ":" .. tostring(objective.finished)
    end
    if value.target then signature = signature .. ":" .. tostring(value.target.guid or value.target.npcId) end
    for _, prerequisite in ipairs(value.prerequisites or {}) do
        signature = signature .. ":" .. tostring(prerequisite.questId) .. ":"
            .. tostring(prerequisite.onQuest) .. ":" .. tostring(prerequisite.rewarded)
    end
    if active.lastSnapshotSignature == signature then return end
    active.lastSnapshotSignature = signature
    while #active.snapshots >= 30 do table.remove(active.snapshots, 1) end
    table.insert(active.snapshots, value)
end

local function sameParty(left, right)
    if not left or not right or left.size ~= right.size then return false end
    for index = 1, left.size do
        if left.members[index].guid ~= right.members[index].guid then return false end
    end
    return true
end

local function unregister()
    for _, event in ipairs({
        "QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED", "QUEST_LOG_UPDATE",
        "UNIT_QUEST_LOG_CHANGED", "PLAYER_TARGET_CHANGED", "GOSSIP_SHOW",
        "GROUP_ROSTER_UPDATE", "CHAT_MSG_LOOT", "PLAYER_LOGOUT",
    }) do frame:UnregisterEvent(event) end
end

local function abortSession(reason)
    if active then
        local ok, endedAt = pcall(timestamp)
        active.endedAt = ok and endedAt or active.startedAt
        active.completionReason = reason
        active.lastSnapshotSignature = nil
    end
    active = nil
    unregister()
end

local function stopSession(reason)
    if not active then return false end
    snapshot()
    active.endedAt = timestamp()
    active.endParty = partyContext()
    if not sameParty(active.startParty, active.endParty) then active.partyChanged = true end
    active.completionReason = reason
    active.lastSnapshotSignature = nil
    active = nil
    unregister()
    return true
end

local function addEvent(name, questId)
    if not active then return end
    while #active.events >= 50 do table.remove(active.events, 1) end
    table.insert(active.events, { name = name, questId = questId, capturedAt = timestamp() })
end

local function startSession(questId, evidenceCode)
    if active then error("A quest validation is already active") end
    local data = database()
    local sequence = publicNumber(data.questValidationSequence, 1000000000) or 0
    sequence = math.floor(sequence) + 1
    data.questValidationSequence = sequence
    local _, rawBuild = GetBuildInfo()
    local build = tonumber(publicString(rawBuild, 30))
    local expectedBuild = publicNumber(namespace.runtimeBuild or namespace.build, 10000000)
    if not build or (expectedBuild and build ~= expectedBuild) then error("Package build mismatch") end
    local release = publicString(namespace.release, 100)
    local compiler = publicString(namespace.compiler, 100)
    if not release or not compiler then error("Package provenance unavailable") end
    local startedAt = timestamp()
    local session = {
        sessionId = tostring(build) .. ":" .. tostring(startedAt) .. ":" .. tostring(sequence),
        questId = questId, evidenceCode = evidenceCode, build = build,
        release = release, compiler = compiler, startedAt = startedAt,
        character = characterContext(), startParty = partyContext(), partyChanged = false,
        snapshots = {}, events = {}, lootMessages = {},
    }
    while #data.questValidations >= 200 do table.remove(data.questValidations, 1) end
    table.insert(data.questValidations, session)
    active = session
    for _, event in ipairs({
        "QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED", "QUEST_LOG_UPDATE",
        "UNIT_QUEST_LOG_CHANGED", "PLAYER_TARGET_CHANGED", "GOSSIP_SHOW",
        "GROUP_ROSTER_UPDATE", "CHAT_MSG_LOOT", "PLAYER_LOGOUT",
    }) do frame:RegisterEvent(event) end
    local ok, message = pcall(snapshot)
    if not ok then
        if data.questValidations[#data.questValidations] == session then
            table.remove(data.questValidations, #data.questValidations)
        end
        abortSession("api-error")
        error(message)
    end
end

frame:SetScript("OnEvent", function(_, event, first, second)
    if not active then return end
    local ok = pcall(function()
        if event == "PLAYER_LOGOUT" then
            stopSession("logout")
            return
        end
        if event == "GROUP_ROSTER_UPDATE" then
            if not sameParty(active.startParty, partyContext()) then active.partyChanged = true end
        elseif event == "CHAT_MSG_LOOT" then
            local message = publicString(first, 500)
            if message then
                while #active.lootMessages >= 20 do table.remove(active.lootMessages, 1) end
                table.insert(active.lootMessages, { message = message, capturedAt = timestamp() })
            end
        elseif event == "QUEST_ACCEPTED" then
            local questId = publicNumber(second, 10000000) or publicNumber(first, 10000000)
            if questId == active.questId then addEvent(event, questId) end
        elseif event == "QUEST_TURNED_IN" or event == "QUEST_REMOVED" then
            local questId = publicNumber(first, 10000000)
            if questId == active.questId then addEvent(event, questId) end
        end
        snapshot()
    end)
    if not ok then
        abortSession("api-error")
        print("KFC guide: quest validation stopped because a public API value was unavailable.")
    end
end)

local function command(argument)
    if argument == "capture" then
        local ok = pcall(snapshot)
        if ok and active then print("KFC guide: quest validation snapshot captured.")
        else print("KFC guide: no quest validation is active.") end
        return
    end
    if argument == "stop" then
        local ok, stopped = pcall(stopSession, "manual-stop")
        if ok and stopped then print("KFC guide: quest validation saved. /reload writes evidence.")
        elseif not ok then
            abortSession("api-error")
            print("KFC guide: quest validation stopped because a public API value was unavailable.")
        else print("KFC guide: no quest validation is active.") end
        return
    end
    if argument == "discard" then
        if not active then
            print("KFC guide: no quest validation is active.")
            return
        end
        local data = database()
        if data.questValidations[#data.questValidations] == active then
            table.remove(data.questValidations, #data.questValidations)
        end
        active = nil
        unregister()
        print("KFC guide: active quest validation discarded.")
        return
    end
    if argument == "status" then
        if active then
            print("KFC guide: validating " .. active.evidenceCode .. " for quest " .. active.questId .. ".")
        else
            print("KFC guide: no quest validation is active.")
        end
        return
    end
    local rawQuestId, alias = tostring(argument or ""):match("^(%d+)%s+([a-z%-]+)$")
    local questId = tonumber(rawQuestId)
    local evidenceCode = aliases[alias]
    if not questId or questId < 1 or questId > 10000000 or not evidenceCode then
        print("KFC guide: use validate <quest-id> <named-target|personal-eligibility|lifecycle|pickup-level|source-gate>.")
        return
    end
    local ok = pcall(startSession, questId, evidenceCode)
    if ok then
        print("KFC guide: quest validation started. Use validate capture, stop, or discard.")
    else
        print("KFC guide: quest validation could not start; verify build, character, and party context.")
    end
end

local function safeStop(reason)
    local ok, stopped = pcall(stopSession, reason)
    if not ok then abortSession("api-error") end
    return ok and stopped
end

namespace.questObserver = { command = command, stop = safeStop }
