local _, namespace = ...
local collecting = false
local collectingCombat = false
local targetCandidate = nil
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

local function database()
    if type(KFCForeverGuideEvidence) ~= "table" then
        KFCForeverGuideEvidence = { schemaVersion = 1, curves = {}, rewards = {} }
    end
    if type(KFCForeverGuideEvidence.curves) ~= "table" then KFCForeverGuideEvidence.curves = {} end
    if type(KFCForeverGuideEvidence.rewards) ~= "table" then KFCForeverGuideEvidence.rewards = {} end
    if type(KFCForeverGuideEvidence.combat) ~= "table" then KFCForeverGuideEvidence.combat = {} end
    return KFCForeverGuideEvidence
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
    if type(GetInstanceInfo) == "function" then
        local _, _, _, _, _, _, _, instanceId = GetInstanceInfo()
        instance = publicNumber(instanceId)
    end
    local sample = {
        message = text, level = level, build = build, capturedAt = time(),
        partySize = size, partyLevels = levels, mapId = map, instanceId = instance,
        restedAtCapture = type(GetXPExhaustion) == "function" and publicNumber(GetXPExhaustion()) or nil,
        attribution = "unresolved",
    }
    if targetCandidate and sample.capturedAt - targetCandidate.seenAt <= 3
        and text:find(targetCandidate.name, 1, true) then
        sample.candidateNpcId = targetCandidate.npcId
        sample.candidateMobLevel = targetCandidate.level
        sample.attribution = "target-name-candidate"
    end
    local data = database()
    if #data.combat > 2000 then data.combat = {} end
    if #data.combat >= 2000 then table.remove(data.combat, 1) end
    table.insert(data.combat, sample)
end

local function stopCombat()
    collectingCombat = false
    targetCandidate = nil
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
    if not collecting or event ~= "QUEST_TURNED_IN" then return end
    local id = publicNumber(questID)
    local xp = publicNumber(xpReward)
    local level = publicNumber(UnitLevel("player"))
    local _, rawBuild = GetBuildInfo()
    local build = tonumber(rawBuild)
    if not id or not xp or not level or not build then return end
    local data = database()
    while #data.rewards >= 100 do table.remove(data.rewards, 1) end
    table.insert(data.rewards, { questId = id, xp = xp, level = level, build = build, capturedAt = time() })
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
        frame:UnregisterEvent("QUEST_TURNED_IN")
        print("KFC guide: reward observation stopped. Try again outside combat.")
    end
end)

SLASH_KFCFOREVERGUIDE1 = "/kfcguide"
SlashCmdList.KFCFOREVERGUIDE = function(command)
    if command == "xp" then
        local ok = pcall(recordCurve)
        if not ok then print("KFC guide: unable to observe XP. Try outside combat.") end
    elseif command == "observe" then
        collecting = true
        frame:RegisterEvent("QUEST_TURNED_IN")
        print("KFC guide: recording up to 100 turn-ins until reload. /kfcguide stop stops it.")
    elseif command == "combat" then
        local ok = pcall(function()
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
    elseif command == "stop" then
        collecting = false
        frame:UnregisterEvent("QUEST_TURNED_IN")
        stopCombat()
        print("KFC guide: recording stopped. /reload saves observations.")
    else
        print("KFC guide " .. namespace.release .. ": /kfcguide xp, observe, combat, stop")
    end
end
