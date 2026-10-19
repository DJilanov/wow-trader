local callback, registered
local messages = {}
local secret = {}
CreateFrame = function()
    return {
        SetScript = function(_, _, value) callback = value end,
        RegisterEvent = function(_, event) registered = event end,
        UnregisterEvent = function() registered = nil end,
    }
end
SlashCmdList = {}
UnitLevel = function() return 14 end
UnitName = function(unit) return unit == "player" and "Evidence Tester" or nil end
UnitGUID = function(unit) return unit == "player" and "Player-1-00000001" or nil end
GetRealmName = function() return "Forever" end
UnitClass = function() return "Priest", "PRIEST" end
UnitRace = function() return "Human", "Human" end
UnitXPMax = function() return 12900 end
GetBuildInfo = function() return "1.60.1", "70205" end
time = function() return 1791100000 end
issecretvalue = function(value) return value == secret end
print = function(message) table.insert(messages, message) end
local grindCommand = nil
local grindStop = nil
local namespace = {
    release = "0.1.0",
    compiler = "original-addon-test",
    build = 70205,
    grindObserver = {
        command = function(value) grindCommand = value end,
        stop = function(value) grindStop = value end,
    },
}
assert(loadfile("apps/addon/KFCForeverGuides/Observer.lua"))("KFCForeverGuides", namespace)

local command = SlashCmdList.KFCFOREVERGUIDE
command("xp")
assert(KFCForeverGuideEvidence.curves["70205:14"].xp == 12900)
assert(KFCForeverGuideEvidence.schemaVersion == 3)
KFCForeverGuideEvidence.curves = "corrupt"
KFCForeverGuideEvidence.rewards = false
KFCForeverGuideEvidence.rewardSessions = "corrupt"
command("xp")
assert(type(KFCForeverGuideEvidence.curves) == "table")
assert(type(KFCForeverGuideEvidence.rewards) == "table")
command("observe")
assert(registered == "QUEST_TURNED_IN")
command("observe")
assert(registered == "QUEST_TURNED_IN")
assert(#KFCForeverGuideEvidence.rewardSessions == 1)
assert(string.find(messages[#messages], "already active", 1, true))
callback(nil, "QUEST_TURNED_IN", 96403, 1350)
assert(#KFCForeverGuideEvidence.rewards == 1)
assert(KFCForeverGuideEvidence.rewards[1].build == 70205)
assert(KFCForeverGuideEvidence.rewards[1].capturedAt == 1791100000)
assert(KFCForeverGuideEvidence.rewards[1].sessionId == "70205:1791100000:1")
assert(#KFCForeverGuideEvidence.rewardSessions == 1)
assert(KFCForeverGuideEvidence.rewardSessions[1].character.name == "Evidence Tester")
callback(nil, "QUEST_TURNED_IN", 96395, secret)
callback(nil, "QUEST_TURNED_IN", secret, 1050)
assert(#KFCForeverGuideEvidence.rewards == 1)
for index = 1, 105 do callback(nil, "QUEST_TURNED_IN", index, 1050) end
assert(#KFCForeverGuideEvidence.rewards == 100)
assert(KFCForeverGuideEvidence.rewards[100].questId == 105)
command("stop")
assert(registered == nil)
assert(grindStop == "all-stop")
callback(nil, "QUEST_TURNED_IN", 500, 1000)
assert(KFCForeverGuideEvidence.rewards[100].questId == 105)
GetBuildInfo = function() return "1.60.1", "70450" end
command("observe")
assert(registered == nil)
assert(#KFCForeverGuideEvidence.rewardSessions == 1)
assert(string.find(messages[#messages], "could not start", 1, true))
GetBuildInfo = function() return "1.60.1", "70205" end
command("observe")
UnitLevel = function() error("API unavailable") end
callback(nil, "QUEST_TURNED_IN", 500, 1000)
assert(registered == nil)
assert(string.find(messages[#messages], "reward observation stopped", 1, true))

UnitLevel = function(unit) return unit == "target" and 15 or 14 end
UnitGUID = function(unit)
    return unit == "target" and "Creature-0-1-2-3-114-0000000001" or "Player-1-00000001"
end
UnitName = function(unit) return unit == "target" and "Harvest Watcher" or "Evidence Tester" end
GetNumGroupMembers = function() return 5 end
GetXPExhaustion = function() return 0 end
C_Map = { GetBestMapForUnit = function() return 1436 end }
GetInstanceInfo = function() return "Test", "party", nil, nil, nil, nil, nil, 36 end
command("combat")
callback(nil,"CHAT_MSG_COMBAT_XP_GAIN","Harvest Watcher dies, you gain 29 experience.")
assert(#KFCForeverGuideEvidence.combat == 1)
local sample = KFCForeverGuideEvidence.combat[1]
assert(sample.candidateNpcId == 114)
assert(sample.candidateMobLevel == 15)
assert(sample.partySize == 5 and #sample.partyLevels == 5)
assert(sample.instanceId == 36 and sample.mapId == 1436)
assert(sample.instanceType == "party")
assert(sample.sessionId == "70205:1791100000:1")
assert(sample.attribution == "target-name-candidate")
assert(sample.xp == nil)
callback(nil,"CHAT_MSG_COMBAT_XP_GAIN",secret)
assert(#KFCForeverGuideEvidence.combat == 1)
UnitGUID = function() return secret end
callback(nil,"PLAYER_TARGET_CHANGED")
callback(nil,"CHAT_MSG_COMBAT_XP_GAIN","Different creature dies, you gain 20 experience.")
assert(KFCForeverGuideEvidence.combat[2].candidateNpcId == nil)
assert(KFCForeverGuideEvidence.combat[2].attribution == "unresolved")
for index=1,2005 do callback(nil,"CHAT_MSG_COMBAT_XP_GAIN","A creature dies, you gain 20 experience.") end
assert(#KFCForeverGuideEvidence.combat == 2000)
command("stop")
callback(nil,"CHAT_MSG_COMBAT_XP_GAIN","Ignored")
assert(#KFCForeverGuideEvidence.combat == 2000)
command("combat")
UnitLevel = function() error("secret API operation") end
callback(nil,"CHAT_MSG_COMBAT_XP_GAIN","A creature dies.")
assert(registered == nil)
assert(string.find(messages[#messages], "combat observation stopped", 1, true))
command("grind test-checkpoint")
assert(grindCommand == "test-checkpoint")
io.write("Leveling observer mock tests passed; live WoW API behavior remains unverified.\n")
