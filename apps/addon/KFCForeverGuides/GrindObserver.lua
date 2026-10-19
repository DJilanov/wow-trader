local _, namespace = ...

local MAX_SESSIONS = 250
local MAX_MIX_ENTRIES = 100
local MAX_AREA_SAMPLES = 25
local TARGET_CANDIDATE_SECONDS = 120
local session = nil
local frame = CreateFrame("Frame")

local function publicNumber(value, maximum)
    if type(issecretvalue) == "function" and issecretvalue(value) then return nil end
    if type(value) ~= "number" or value ~= value or value < 0 then return nil end
    if value > (maximum or 1000000000) then return nil end
    return value
end

local function publicString(value, maximum)
    if type(issecretvalue) == "function" and issecretvalue(value) then return nil end
    if type(value) ~= "string" or #value > (maximum or 500) then return nil end
    return value
end

local function publicBoolean(value)
    if type(issecretvalue) == "function" and issecretvalue(value) then return nil end
    if value == nil then return false end
    if type(value) ~= "boolean" then return nil end
    return value
end

local function database()
    if type(KFCForeverGuideEvidence) ~= "table" then
        KFCForeverGuideEvidence = { curves = {}, rewards = {}, combat = {}, grinds = {} }
    end
    KFCForeverGuideEvidence.schemaVersion = 3
    if type(KFCForeverGuideEvidence.curves) ~= "table" then KFCForeverGuideEvidence.curves = {} end
    if type(KFCForeverGuideEvidence.rewards) ~= "table" then KFCForeverGuideEvidence.rewards = {} end
    if type(KFCForeverGuideEvidence.combat) ~= "table" then KFCForeverGuideEvidence.combat = {} end
    if type(KFCForeverGuideEvidence.grinds) ~= "table" then KFCForeverGuideEvidence.grinds = {} end
    return KFCForeverGuideEvidence
end

local function epoch()
    local value = publicNumber(time(), 10000000000)
    if not value then error("Clock unavailable") end
    return math.floor(value)
end

local function clock()
    if type(GetTime) ~= "function" then error("Session clock unavailable") end
    local value = publicNumber(GetTime(), 10000000000)
    if not value then error("Session clock unavailable") end
    return value
end

local function restedXp()
    if type(GetXPExhaustion) ~= "function" then return nil end
    local value = GetXPExhaustion()
    if value == nil then return 0 end
    return publicNumber(value)
end

local function xpPosition()
    local level = publicNumber(UnitLevel("player"), 100)
    local xp = publicNumber(UnitXP("player"))
    local maximum = publicNumber(UnitXPMax("player"))
    if not level or not xp or not maximum or xp > maximum then error("XP bar unavailable") end
    return { level = math.floor(level), xp = math.floor(xp), xpMax = math.floor(maximum) }
end

local function partyContext()
    local count = 0
    if type(GetNumGroupMembers) == "function" then
        count = publicNumber(GetNumGroupMembers(), 40)
        if not count then error("Party size unavailable") end
    end
    count = math.floor(count)
    if count > 5 then error("Grind evidence supports solo players and five-player parties only") end
    local size = math.max(1, count)
    local levels = { publicNumber(UnitLevel("player"), 100) }
    local playerGuid = type(UnitGUID) == "function" and publicString(UnitGUID("player"), 200) or nil
    local guids = { playerGuid }
    if not levels[1] then error("Player level unavailable") end
    if not playerGuid then error("Player identity unavailable") end
    for index = 1, size - 1 do
        local unit = "party" .. index
        local level = publicNumber(UnitLevel(unit), 100)
        local guid = type(UnitGUID) == "function" and publicString(UnitGUID(unit), 200) or nil
        if not level then error("Party level unavailable") end
        if not guid then error("Party identity unavailable") end
        levels[#levels + 1] = math.floor(level)
        guids[#guids + 1] = guid
    end
    return { size = size, levels = levels, guids = guids }
end

local function areaContext()
    local mapId = nil
    if type(C_Map) == "table" and type(C_Map.GetBestMapForUnit) == "function" then
        mapId = publicNumber(C_Map.GetBestMapForUnit("player"), 10000000)
    end
    local zone = type(GetZoneText) == "function" and publicString(GetZoneText(), 200) or nil
    local subzone = type(GetSubZoneText) == "function" and publicString(GetSubZoneText(), 200) or nil
    local instanceId = nil
    local instanceType = nil
    if type(GetInstanceInfo) == "function" then
        local _, rawType, _, _, _, _, _, rawId = GetInstanceInfo()
        instanceId = publicNumber(rawId, 10000000)
        instanceType = publicString(rawType, 60)
    end
    return {
        mapId = mapId and math.floor(mapId) or nil,
        zone = zone,
        subzone = subzone,
        instanceId = instanceId and math.floor(instanceId) or nil,
        instanceType = instanceType,
    }
end

local function playerContext()
    local name = publicString(UnitName("player"), 200)
    local guid = type(UnitGUID) == "function" and publicString(UnitGUID("player"), 200) or nil
    local realm = type(GetRealmName) == "function" and publicString(GetRealmName(), 200) or nil
    local class = nil
    local race = nil
    if type(UnitClass) == "function" then class = publicString(select(2, UnitClass("player")), 60) end
    if type(UnitRace) == "function" then race = publicString(select(2, UnitRace("player")), 60) end
    if not name then error("Character identity unavailable") end
    return { name = name, guid = guid, realm = realm, class = class, race = race }
end

local function areaKey(area)
    return table.concat({
        tostring(area.mapId or ""), area.zone or "", area.subzone or "",
        tostring(area.instanceId or ""), area.instanceType or "",
    }, ":")
end

local function appendArea(area)
    if not session then return end
    local samples = session.record.areas
    if #samples > 0 and areaKey(samples[#samples]) == areaKey(area) then return end
    if #samples >= MAX_AREA_SAMPLES then
        session.record.areaSamplesTruncated = true
        return
    end
    area.capturedAt = epoch()
    table.insert(samples, area)
end

local function sameParty(left, right)
    if left.size ~= right.size or #left.guids ~= #right.guids then return false end
    for index = 1, #left.guids do
        if left.guids[index] ~= right.guids[index] then return false end
    end
    return true
end

local function rememberTarget()
    if not session or type(UnitGUID) ~= "function" or type(UnitName) ~= "function" then return end
    local guid = publicString(UnitGUID("target"), 200)
    local name = publicString(UnitName("target"), 200)
    local level = publicNumber(UnitLevel("target"), 100)
    if not guid or not name or not level then
        session.target = nil
        return
    end
    local id = guid:match("^Creature%-%d+%-%d+%-%d+%-%d+%-(%d+)-")
        or guid:match("^Vehicle%-%d+%-%d+%-%d+%-%d+%-(%d+)-")
    if not id then
        session.target = nil
        return
    end
    session.target = {
        npcId = tonumber(id), name = name, level = math.floor(level), seenAt = clock(),
    }
end

local function reportedXp(message)
    local digits = message:match("[gG]ain%s+([%d,%.%' ]+)%s+[eE]xperience")
        or message:match("[gG]ained%s+([%d,%.%' ]+)%s+[eE]xperience")
    if not digits then return nil end
    local value = tonumber((digits:gsub("%D", "")))
    return publicNumber(value, 1000000)
end

local function recordKill(message)
    if not session then return end
    local text = publicString(message)
    if not text then error("Combat XP message unavailable") end
    local record = session.record
    record.killCount = record.killCount + 1
    local payout = reportedXp(text)
    if payout then record.reportedKillXp = record.reportedKillXp + payout
    else record.unparsedKillMessageCount = record.unparsedKillMessageCount + 1 end
    local candidate = session.target
    if not candidate or clock() - candidate.seenAt > TARGET_CANDIDATE_SECONDS
        or not text:find(candidate.name, 1, true) then
        record.unattributedKillCount = record.unattributedKillCount + 1
        return
    end
    local key = tostring(candidate.npcId) .. ":" .. tostring(candidate.level)
    local entry = session.mix[key]
    if not entry then
        if session.mixCount >= MAX_MIX_ENTRIES then
            record.killMixTruncated = true
            record.unattributedKillCount = record.unattributedKillCount + 1
            return
        end
        entry = {
            npcId = candidate.npcId, name = candidate.name, level = candidate.level,
            count = 0, reportedXp = 0, unparsedMessages = 0,
        }
        session.mix[key] = entry
        session.mixCount = session.mixCount + 1
    end
    entry.count = entry.count + 1
    if payout then entry.reportedXp = entry.reportedXp + payout
    else entry.unparsedMessages = entry.unparsedMessages + 1 end
end

local function updateXp()
    if not session then return end
    local current = xpPosition()
    local previous = session.lastXp
    if current.level == previous.level and current.xp >= previous.xp then
        session.record.xpGained = session.record.xpGained + current.xp - previous.xp
        session.lastXp = current
        session.pendingLevelReset = false
        return
    end
    if current.level == previous.level and current.xp < previous.xp then
        session.pendingLevelReset = true
        return
    end
    if current.level == previous.level + 1 then
        local gain = previous.xpMax - previous.xp + current.xp
        if gain < 0 then error("XP level transition is invalid") end
        session.record.xpGained = session.record.xpGained + gain
        session.lastXp = current
        session.pendingLevelReset = false
        return
    end
    session.record.xpTrackingComplete = false
    session.record.xpDiscontinuities = session.record.xpDiscontinuities + 1
    session.lastXp = current
    session.pendingLevelReset = false
end

local function updateTimers(elapsed)
    if not session then return end
    local delta = publicNumber(elapsed, 60)
    if not delta then error("Frame timer unavailable") end
    local afk = false
    if type(UnitIsAFK) == "function" then
        afk = publicBoolean(UnitIsAFK("player"))
        if afk == nil then error("AFK state unavailable") end
    end
    if not afk then
        session.activeSeconds = session.activeSeconds + delta
        if session.inCombat then session.combatSeconds = session.combatSeconds + delta end
    end
end

local EVENTS = {
    "PLAYER_XP_UPDATE", "UNIT_LEVEL", "CHAT_MSG_COMBAT_XP_GAIN", "PLAYER_TARGET_CHANGED",
    "PLAYER_REGEN_DISABLED", "PLAYER_REGEN_ENABLED", "PLAYER_DEAD", "QUEST_TURNED_IN",
    "GROUP_ROSTER_UPDATE", "ZONE_CHANGED", "ZONE_CHANGED_INDOORS", "ZONE_CHANGED_NEW_AREA",
    "PLAYER_LOGOUT",
}

local function unregister()
    for _, event in ipairs(EVENTS) do frame:UnregisterEvent(event) end
    frame:SetScript("OnUpdate", nil)
end

local function finish(reason, skipLiveCapture)
    if not session then return false end
    unregister()
    local current = session
    session = nil
    local record = current.record
    if not skipLiveCapture then
        local ok = pcall(function()
            session = current
            updateXp()
            appendArea(areaContext())
            session = nil
            record.finish = xpPosition()
            record.endParty = partyContext()
            if not sameParty(record.startParty, record.endParty) then record.partyChanged = true end
            record.restedAtEnd = restedXp()
        end)
        session = nil
        if not ok then
            record.xpTrackingComplete = false
            record.liveCaptureFailed = true
        end
    end
    if current.pendingLevelReset then
        record.xpTrackingComplete = false
        record.xpDiscontinuities = record.xpDiscontinuities + 1
    end
    local endedOk, endedAt = pcall(epoch)
    local clockOk, endedClock = pcall(clock)
    if not endedOk or not clockOk then
        record.xpTrackingComplete = false
        record.liveCaptureFailed = true
    end
    record.endedAt = endedOk and endedAt or record.startedAt
    local elapsed = clockOk and (endedClock - current.startedClock) or current.activeSeconds
    record.elapsedSeconds = math.max(0, math.floor(elapsed + 0.5))
    record.activeSeconds = math.max(0, math.floor(current.activeSeconds + 0.5))
    record.combatSeconds = math.max(0, math.floor(current.combatSeconds + 0.5))
    record.completionReason = reason
    record.killMix = {}
    for _, entry in pairs(current.mix) do table.insert(record.killMix, entry) end
    table.sort(record.killMix, function(left, right)
        if left.count == right.count then return left.npcId < right.npcId end
        return left.count > right.count
    end)
    local data = database()
    while #data.grinds >= MAX_SESSIONS do table.remove(data.grinds, 1) end
    table.insert(data.grinds, record)
    print("KFC guide: saved grind " .. record.checkpointId .. " with " .. record.xpGained
        .. " XP, " .. record.killCount .. " kills, and " .. record.activeSeconds .. " active seconds. /reload writes it to disk.")
    return true
end

local function discard()
    if not session then return false end
    unregister()
    local checkpoint = session.record.checkpointId
    session = nil
    print("KFC guide: discarded unfinished grind " .. checkpoint .. ".")
    return true
end

local function start(checkpointId)
    if session then
        print("KFC guide: finish or discard " .. session.record.checkpointId .. " before starting another grind.")
        return
    end
    if #checkpointId < 1 or #checkpointId > 180 or not checkpointId:match("^[a-z0-9][a-z0-9_:%-]*$") then
        print("KFC guide: checkpoint ID must be the lowercase action ID shown by the review guide.")
        return
    end
    if type(namespace.grindCheckpoints) == "table" and not namespace.grindCheckpoints[checkpointId] then
        print("KFC guide: that checkpoint is not part of this exact guide package.")
        return
    end
    local ok, result = pcall(function()
        local data = database()
        local sequence = publicNumber(data.grindSessionSequence, 1000000) or 0
        sequence = math.floor(sequence) + 1
        data.grindSessionSequence = sequence
        local _, rawBuild = GetBuildInfo()
        local build = tonumber(publicString(rawBuild, 40))
        if not build then error("Build unavailable") end
        local expectedBuild = publicNumber(namespace.runtimeBuild or namespace.build, 10000000)
        if expectedBuild and build ~= expectedBuild then error("Package build mismatch") end
        local startedAt = epoch()
        local initialXp = xpPosition()
        local initialParty = partyContext()
        local initialArea = areaContext()
        local current = {
            startedClock = clock(), activeSeconds = 0, combatSeconds = 0,
            inCombat = false, lastXp = initialXp, pendingLevelReset = false,
            mix = {}, mixCount = 0, target = nil,
            record = {
                sessionId = tostring(build) .. ":" .. tostring(startedAt) .. ":" .. tostring(sequence),
                checkpointId = checkpointId, checkpointKnown = type(namespace.grindCheckpoints) == "table",
                release = publicString(namespace.release, 100), compiler = publicString(namespace.compiler, 100),
                build = build, startedAt = startedAt, character = playerContext(),
                start = initialXp, startParty = initialParty, areas = {}, xpGained = 0,
                xpTrackingComplete = true, xpDiscontinuities = 0, killCount = 0,
                unattributedKillCount = 0, reportedKillXp = 0, unparsedKillMessageCount = 0,
                questTurnIns = 0, deaths = 0, partyChanged = false,
                restedAtStart = restedXp(),
            },
        }
        if type(UnitAffectingCombat) == "function" then
            local combat = publicBoolean(UnitAffectingCombat("player"))
            if combat == nil then error("Combat state unavailable") end
            current.inCombat = combat
        end
        session = current
        appendArea(initialArea)
        rememberTarget()
        for _, event in ipairs(EVENTS) do frame:RegisterEvent(event) end
        frame:SetScript("OnUpdate", function(_, elapsed)
            local timerOk = pcall(updateTimers, elapsed)
            if not timerOk and session then
                session.record.xpTrackingComplete = false
                finish("api-error", true)
            end
        end)
        return current
    end)
    if not ok then
        session = nil
        unregister()
        print("KFC guide: grind observation could not start; public character context is unavailable.")
        return
    end
    print("KFC guide: recording grind " .. result.record.checkpointId
        .. ". Play normally, then use /kfcguide grind stop at the checkpoint.")
end

local function handleEvent(event, first)
    if not session then return end
    if event == "PLAYER_XP_UPDATE" or (event == "UNIT_LEVEL" and first == "player") then
        updateXp()
    elseif event == "CHAT_MSG_COMBAT_XP_GAIN" then
        recordKill(first)
    elseif event == "PLAYER_TARGET_CHANGED" then
        rememberTarget()
    elseif event == "PLAYER_REGEN_DISABLED" then
        session.inCombat = true
    elseif event == "PLAYER_REGEN_ENABLED" then
        session.inCombat = false
    elseif event == "PLAYER_DEAD" then
        session.record.deaths = session.record.deaths + 1
    elseif event == "QUEST_TURNED_IN" then
        session.record.questTurnIns = session.record.questTurnIns + 1
    elseif event == "GROUP_ROSTER_UPDATE" then
        if not sameParty(session.record.startParty, partyContext()) then session.record.partyChanged = true end
    elseif event == "ZONE_CHANGED" or event == "ZONE_CHANGED_INDOORS" or event == "ZONE_CHANGED_NEW_AREA" then
        appendArea(areaContext())
    elseif event == "PLAYER_LOGOUT" then
        finish("logout")
    end
end

frame:SetScript("OnEvent", function(_, event, first)
    local ok = pcall(handleEvent, event, first)
    if not ok and session then
        session.record.xpTrackingComplete = false
        finish("api-error", true)
    end
end)

namespace.grindObserver = {
    command = function(argument)
        if argument == "stop" then
            if not finish("manual-stop") then print("KFC guide: no grind observation is active.") end
        elseif argument == "discard" then
            if not discard() then print("KFC guide: no grind observation is active.") end
        elseif argument == "status" then
            if session then
                print("KFC guide: recording " .. session.record.checkpointId .. " ("
                    .. session.record.xpGained .. " XP and " .. session.record.killCount .. " kills so far).")
            else
                print("KFC guide: no grind observation is active; " .. #database().grinds .. " session(s) are saved.")
            end
        elseif argument == "" then
            print("KFC guide: /kfcguide grind <checkpoint-id>, grind status, grind stop, or grind discard")
        else
            start(argument)
        end
    end,
    stop = function(reason)
        return finish(reason or "manual-stop")
    end,
}
