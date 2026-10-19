local _, namespace = ...
local collecting = false
local collectingCombat = false
local targetCandidate = nil
local combatSessionId = nil
local rewardSession = nil
local frame = CreateFrame("Frame")

local function publicNumber(value)
    if type(issecretvalue) == "function" and issecretvalue(value) then return nil end
    if type(value) ~= "number" then return nil end
    if value ~= value or value < 0 or value > 1000000000 then return nil end
    return value
end

local function publicString(value)
    if type(issecretvalue) == "function" and issecretvalue(value) then return nil end
    if type(value) ~= "string" or #value > 500 then return nil end
    return value
end

local function publicTimestamp(value)
    if type(issecretvalue) == "function" and issecretvalue(value) then return nil end
    if type(value) ~= "number" or value ~= value or value < 1 or value > 10000000000 then return nil end
    return math.floor(value)
end

local function database()
    if type(KFCForeverGuideEvidence) ~= "table" then
        KFCForeverGuideEvidence = { schemaVersion = 3, curves = {}, rewards = {} }
    end
    KFCForeverGuideEvidence.schemaVersion = 3
    if type(KFCForeverGuideEvidence.curves) ~= "table" then KFCForeverGuideEvidence.curves = {} end
    if type(KFCForeverGuideEvidence.rewards) ~= "table" then KFCForeverGuideEvidence.rewards = {} end
    if type(KFCForeverGuideEvidence.rewardSessions) ~= "table" then KFCForeverGuideEvidence.rewardSessions = {} end
    if type(KFCForeverGuideEvidence.combat) ~= "table" then KFCForeverGuideEvidence.combat = {} end
    if type(KFCForeverGuideEvidence.grinds) ~= "table" then KFCForeverGuideEvidence.grinds = {} end
    return KFCForeverGuideEvidence
end

local function characterContext()
    local name = publicString(UnitName("player"))
    local guid = type(UnitGUID) == "function" and publicString(UnitGUID("player")) or nil
    local realm = type(GetRealmName) == "function" and publicString(GetRealmName()) or nil
    local class = type(UnitClass) == "function" and publicString(select(2, UnitClass("player"))) or nil
    local race = type(UnitRace) == "function" and publicString(select(2, UnitRace("player"))) or nil
    if not name or not guid or not realm or not class or not race then error("Character identity unavailable") end
    return { name = name, guid = guid, realm = realm, class = class, race = race }
end

local function startRewards()
    local data = database()
    local sequence = publicNumber(data.rewardSessionSequence) or 0
    sequence = math.floor(sequence) + 1
    data.rewardSessionSequence = sequence
    local _, rawBuild = GetBuildInfo()
    local build = tonumber(publicString(rawBuild))
    if not build then error("Build unavailable") end
    local expectedBuild = publicNumber(namespace.runtimeBuild or namespace.build)
    if expectedBuild and build ~= expectedBuild then error("Package build mismatch") end
    local capturedAt = publicTimestamp(time())
    if not capturedAt then error("Clock unavailable") end
    local release = publicString(namespace.release)
    local compiler = publicString(namespace.compiler)
    if not release or not compiler then error("Package provenance unavailable") end
    rewardSession = {
        sessionId = tostring(build) .. ":" .. tostring(capturedAt) .. ":" .. tostring(sequence),
        build = build,
        startedAt = capturedAt,
        release = release,
        compiler = compiler,
        character = characterContext(),
    }
    while #data.rewardSessions >= 20 do
        local removed = table.remove(data.rewardSessions, 1)
        if type(removed) == "table" and type(removed.sessionId) == "string" then
            for index = #data.rewards, 1, -1 do
                local reward = data.rewards[index]
                if type(reward) == "table" and reward.sessionId == removed.sessionId then
                    table.remove(data.rewards, index)
                end
            end
        end
    end
    table.insert(data.rewardSessions, rewardSession)
    collecting = true
    frame:RegisterEvent("QUEST_TURNED_IN")
end

local function rememberTarget()
    targetCandidate = nil
    if not collectingCombat or type(UnitGUID) ~= "function" or type(UnitName) ~= "function" then return end
    local guid = publicString(UnitGUID("target"))
    local name = publicString(UnitName("target"))
    local level = publicNumber(UnitLevel("target"))
    if not guid or not name or not level then return end
    local id = guid:match("^Creature%-%d+%-%d+%-%d+%-%d+%-(%d+)%-")
        or guid:match("^Vehicle%-%d+%-%d+%-%d+%-%d+%-(%d+)%-")
    if not id then return end
    targetCandidate = { npcId = tonumber(id), name = name, level = level, seenAt = time() }
end

local function recordCombat(message)
    if not collectingCombat then return end
    local text = publicString(message)
    local level = publicNumber(UnitLevel("player"))
    local _, rawBuild = GetBuildInfo()
    local build = tonumber(publicString(rawBuild))
    if not text or not level or not build then return end
    local count = type(GetNumGroupMembers) == "function" and publicNumber(GetNumGroupMembers()) or nil
    if not count or count > 5 then return end
    local size = math.max(1, count)
    local levels = { level }
    for index = 1, size - 1 do
        local memberLevel = publicNumber(UnitLevel("party" .. index))
        if not memberLevel then return end
        levels[#levels + 1] = memberLevel
    end
    local map = nil
    if type(C_Map) == "table" and type(C_Map.GetBestMapForUnit) == "function" then
        map = publicNumber(C_Map.GetBestMapForUnit("player"))
    end
    local instance = nil
    local instanceType = nil
    if type(GetInstanceInfo) == "function" then
        local _, rawInstanceType, _, _, _, _, _, instanceId = GetInstanceInfo()
        instance = publicNumber(instanceId)
        instanceType = publicString(rawInstanceType)
    end
    local sample = {
        message = text, level = level, build = build, capturedAt = time(),
        partySize = size, partyLevels = levels, mapId = map, instanceId = instance,
        restedAtCapture = type(GetXPExhaustion) == "function" and publicNumber(GetXPExhaustion()) or nil,
        instanceType = instanceType, sessionId = combatSessionId,
        attribution = "unresolved",
    }
    if targetCandidate and sample.capturedAt - targetCandidate.seenAt <= 3
        and text:find(targetCandidate.name, 1, true) then
        sample.candidateNpcId = targetCandidate.npcId
        sample.candidateMobLevel = targetCandidate.level
        sample.attribution = "target-name-candidate"
    end
    local capturedAt = publicTimestamp(time())
    if not capturedAt then error("Clock unavailable") end
    local data = database()
    if #data.combat > 2000 then data.combat = {} end
    if #data.combat >= 2000 then table.remove(data.combat, 1) end
    table.insert(data.combat, sample)
end

local function stopCombat()
    collectingCombat = false
    targetCandidate = nil
    combatSessionId = nil
    frame:UnregisterEvent("CHAT_MSG_COMBAT_XP_GAIN")
    frame:UnregisterEvent("PLAYER_TARGET_CHANGED")
end

local function recordCurve()
    local level = publicNumber(UnitLevel("player"))
    local maximum = publicNumber(UnitXPMax("player"))
    local _, rawBuild = GetBuildInfo()
    local build = tonumber(rawBuild)
    if not level or not maximum or not build then
        print("KFC guide: XP is unavailable here. Try outside combat.")
        return
    end
    local data = database()
    data.curves[tostring(build) .. ":" .. tostring(level)] = { level = level, xp = maximum, build = build, capturedAt = time() }
    print("KFC guide: level " .. level .. " requires " .. maximum .. " XP. /reload saves this observation.")
end

local function recordReward(event, questID, xpReward)
    if not collecting or not rewardSession or event ~= "QUEST_TURNED_IN" then return end
    local id = publicNumber(questID)
    local xp = publicNumber(xpReward)
    local level = publicNumber(UnitLevel("player"))
    local build = rewardSession.build
    if not id or not xp or not level or not build then return end
    local capturedAt = publicTimestamp(time())
    if not capturedAt then error("Clock unavailable") end
    local data = database()
    while #data.rewards >= 100 do table.remove(data.rewards, 1) end
    table.insert(data.rewards, {
        questId = id, xp = xp, level = level, build = build, capturedAt = capturedAt,
        sessionId = rewardSession.sessionId,
    })
end

frame:SetScript("OnEvent", function(_, event, questID, xpReward)
    if event == "CHAT_MSG_COMBAT_XP_GAIN" or event == "PLAYER_TARGET_CHANGED" then
        local ok
        if event == "PLAYER_TARGET_CHANGED" then ok = pcall(rememberTarget)
        else ok = pcall(recordCombat, questID) end
        if not ok then
            stopCombat()
            print("KFC guide: combat observation stopped; an API value was unavailable. No NPC or quest scans were enabled.")
        end
        return
    end
    local ok = pcall(recordReward, event, questID, xpReward)
    if not ok then
        collecting = false
        rewardSession = nil
        frame:UnregisterEvent("QUEST_TURNED_IN")
        print("KFC guide: reward observation stopped. Try again outside combat.")
    end
end)

SLASH_KFCFOREVERGUIDE1 = "/kfcguide"
SlashCmdList.KFCFOREVERGUIDE = function(command)
    local verb, argument = tostring(command or ""):match("^(%S+)%s*(.-)%s*$")
    if verb == "grind" then
        if type(namespace.grindObserver) ~= "table" or type(namespace.grindObserver.command) ~= "function" then
            print("KFC guide: grind observer is unavailable in this package.")
            return
        end
        namespace.grindObserver.command(argument)
    elseif verb == "validate" then
        if type(namespace.questObserver) ~= "table" or type(namespace.questObserver.command) ~= "function" then
            print("KFC guide: quest validation observer is unavailable in this package.")
            return
        end
        namespace.questObserver.command(argument)
    elseif verb == "xp" and argument == "" then
        local ok = pcall(recordCurve)
        if not ok then print("KFC guide: unable to observe XP. Try outside combat.") end
    elseif verb == "observe" and argument == "" then
        if collecting then
            print("KFC guide: reward observation is already active. Use /kfcguide stop first.")
            return
        end
        local ok = pcall(startRewards)
        if not ok then
            collecting = false
            rewardSession = nil
            frame:UnregisterEvent("QUEST_TURNED_IN")
            print("KFC guide: reward observation could not start; public character context or build is unavailable.")
        else
            print("KFC guide: recording up to 100 turn-ins until reload. /kfcguide stop stops it.")
        end
    elseif verb == "combat" and argument == "" then
        local ok = pcall(function()
            local data = database()
            local sequence = publicNumber(data.combatSessionSequence) or 0
            sequence = math.floor(sequence) + 1
            data.combatSessionSequence = sequence
            local _, rawBuild = GetBuildInfo()
            local build = publicString(rawBuild)
            if not build then error("Build unavailable") end
            combatSessionId = build .. ":" .. tostring(time()) .. ":" .. tostring(sequence)
            collectingCombat = true
            frame:RegisterEvent("CHAT_MSG_COMBAT_XP_GAIN")
            frame:RegisterEvent("PLAYER_TARGET_CHANGED")
            rememberTarget()
        end)
        if not ok then
            stopCombat()
            print("KFC guide: combat events are unavailable on this client; collection remains off.")
        else
            print("KFC guide: recording up to 2000 passive kill-XP messages until reload. Target matches are candidates, not verified NPC attribution. /kfcguide stop stops it.")
        end
    elseif verb == "stop" and argument == "" then
        collecting = false
        rewardSession = nil
        frame:UnregisterEvent("QUEST_TURNED_IN")
        stopCombat()
        if type(namespace.grindObserver) == "table" and type(namespace.grindObserver.stop) == "function" then
            namespace.grindObserver.stop("all-stop")
        end
        if type(namespace.questObserver) == "table" and type(namespace.questObserver.stop) == "function" then
            namespace.questObserver.stop("all-stop")
        end
        print("KFC guide: recording stopped. /reload saves observations.")
    else
        print("KFC guide " .. namespace.release .. ": xp, observe, combat, grind <checkpoint>, validate <quest-id> <kind>, stop")
    end
end
