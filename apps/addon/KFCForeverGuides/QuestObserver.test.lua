local callback
local registered = {}
local messages = {}
CreateFrame = function()
    return {
        SetScript = function(_, _, value) callback = value end,
        RegisterEvent = function(_, event) registered[event] = true end,
        UnregisterEvent = function(_, event) registered[event] = nil end,
    }
end
local now = 1792500000
local onQuest = false
local ready = false
local rewarded = false
local fulfilled = 0
time = function() return now end
issecretvalue = function() return false end
print = function(message) table.insert(messages, message) end
GetBuildInfo = function() return "1.60.1", "70450" end
GetRealmName = function() return "Forever" end
GetNumGroupMembers = function() return 5 end
UnitName = function(unit) return unit == "target" and "Hogger" or "Evidence Tester" end
UnitGUID = function(unit)
    if unit == "target" then return "Creature-0-1-2-3-448-0000000001" end
    if unit == "player" then return "Player-1-00000001" end
    local index = tonumber(string.match(unit, "party(%d+)"))
    return index and "Player-1-0000000" .. tostring(index + 1) or nil
end
UnitLevel = function(unit) return unit == "target" and 11 or 10 end
UnitClass = function() return "Priest", "PRIEST" end
UnitRace = function() return "Human", "Human" end
GetRealZoneText = function() return "Elwynn Forest" end
GetSubZoneText = function() return "Forest's Edge" end
C_Map = { GetBestMapForUnit = function() return 1429 end }
C_GossipInfo = { GetAvailableQuests = function() return { { questID = 19 } } end }
C_QuestLog = {
    GetLogIndexForQuestID = function() return onQuest and 4 or 0 end,
    IsOnQuest = function() return onQuest end,
    ReadyForTurnIn = function() return ready end,
    IsQuestFlaggedCompleted = function() return rewarded end,
    GetQuestObjectives = function()
        return { { text = "Kill Hogger", numFulfilled = fulfilled, numRequired = 1, finished = fulfilled == 1 } }
    end,
}
local namespace = {
    release = "campaign-20261019",
    compiler = "campaign-addon-20261019-v7",
    runtimeBuild = 70450,
}
assert(loadfile("apps/addon/KFCForeverGuides/QuestObserver.lua"))("KFCForeverGuides", namespace)

namespace.questObserver.command("19 named-target")
assert(registered.QUEST_ACCEPTED and registered.QUEST_LOG_UPDATE)
assert(#KFCForeverGuideEvidence.questValidations == 1)
local session = KFCForeverGuideEvidence.questValidations[1]
assert(session.questId == 19 and session.evidenceCode == "named-target-unverified")
assert(session.startParty.size == 5 and #session.startParty.members == 5)
assert(session.snapshots[1].availableAtGossip == true)
assert(session.snapshots[1].target.npcId == 448)

now = now + 1
onQuest = true
callback(nil, "QUEST_ACCEPTED", 4, 19)
now = now + 1
fulfilled = 1
ready = true
callback(nil, "QUEST_LOG_UPDATE")
namespace.questObserver.command("stop")
assert(session.completionReason == "manual-stop")
assert(session.endedAt == now)
assert(session.events[1].name == "QUEST_ACCEPTED")
assert(session.snapshots[#session.snapshots].objectives[1].finished == true)
assert(next(registered) == nil)

namespace.questObserver.command("19 named-target")
namespace.questObserver.command("discard")
assert(#KFCForeverGuideEvidence.questValidations == 1)

GetBuildInfo = function() return "1.60.1", "70451" end
namespace.questObserver.command("19 lifecycle")
assert(#KFCForeverGuideEvidence.questValidations == 1)
assert(string.find(messages[#messages], "could not start", 1, true))
GetBuildInfo = function() return "1.60.1", "70450" end
C_QuestLog.GetQuestObjectives = function() error("API unavailable") end
namespace.questObserver.command("19 lifecycle")
assert(#KFCForeverGuideEvidence.questValidations == 1)
assert(next(registered) == nil)
io.write("Leveling quest observer mock tests passed; live WoW API behavior remains unverified.\n")
