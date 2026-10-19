local scripts = {}
local registered = {}
local messages = {}
local monotonic = 1000
local wallClock = 1792400000
local playerLevel = 20
local playerXp = 23000
local playerXpMax = 23200
local subzone = "Moonbrook"
local secret = {}

CreateFrame = function()
    return {
        SetScript = function(_, name, callback) scripts[name] = callback end,
        RegisterEvent = function(_, event) registered[event] = true end,
        UnregisterEvent = function(_, event) registered[event] = nil end,
    }
end
issecretvalue = function(value) return value == secret end
time = function() return wallClock end
GetTime = function() return monotonic end
GetBuildInfo = function() return "1.60.1", "70450" end
UnitXP = function() return playerXp end
UnitXPMax = function() return playerXpMax end
UnitLevel = function(unit) return unit == "target" and 19 or playerLevel end
UnitName = function(unit) return unit == "target" and "Defias Trapper" or "Evidence Tester" end
UnitGUID = function(unit)
    if unit == "target" then return "Creature-0-1-2-3-127-0000000001" end
    return "Player-1-00000001"
end
UnitClass = function() return "Priest", "PRIEST" end
UnitRace = function() return "Human", "Human" end
GetRealmName = function() return "Forever" end
GetNumGroupMembers = function() return 0 end
GetXPExhaustion = function() return 0 end
UnitIsAFK = function() return false end
UnitAffectingCombat = function() return false end
GetZoneText = function() return "Westfall" end
GetSubZoneText = function() return subzone end
C_Map = { GetBestMapForUnit = function() return 1436 end }
GetInstanceInfo = function() return "Westfall", "none", nil, nil, nil, nil, nil, 0 end
print = function(message) table.insert(messages, message) end

local namespace = {
    release = "campaign-20261019",
    compiler = "campaign-addon-test",
    runtimeBuild = 70450,
    grindCheckpoints = { ["westfall-level-21"] = true },
}
assert(loadfile("apps/addon/KFCForeverGuides/GrindObserver.lua"))("KFCForeverGuides", namespace)

namespace.grindObserver.command("unknown-checkpoint")
assert(string.find(messages[#messages], "not part", 1, true))
assert(KFCForeverGuideEvidence == nil)

namespace.grindObserver.command("westfall-level-21")
assert(KFCForeverGuideEvidence.schemaVersion == 3)
assert(registered.PLAYER_XP_UPDATE and registered.CHAT_MSG_COMBAT_XP_GAIN)
assert(type(scripts.OnUpdate) == "function")

monotonic = monotonic + 10
scripts.OnUpdate(nil, 10)
playerXp = 23100
scripts.OnEvent(nil, "PLAYER_XP_UPDATE", "player")
scripts.OnEvent(nil, "CHAT_MSG_COMBAT_XP_GAIN", "Defias Trapper dies, you gain 100 experience.")
scripts.OnEvent(nil, "PLAYER_REGEN_DISABLED")
monotonic = monotonic + 5
scripts.OnUpdate(nil, 5)
playerLevel = 21
playerXp = 50
playerXpMax = 25200
scripts.OnEvent(nil, "UNIT_LEVEL", "player")
scripts.OnEvent(nil, "CHAT_MSG_COMBAT_XP_GAIN", "Defias Trapper dies, you gained 150 experience.")
scripts.OnEvent(nil, "PLAYER_REGEN_ENABLED")
subzone = "The Dagger Hills"
scripts.OnEvent(nil, "ZONE_CHANGED")
wallClock = wallClock + 15
namespace.grindObserver.command("stop")

assert(#KFCForeverGuideEvidence.grinds == 1)
local sample = KFCForeverGuideEvidence.grinds[1]
assert(sample.checkpointId == "westfall-level-21" and sample.checkpointKnown == true)
assert(sample.sessionId == "70450:1792400000:1")
assert(sample.build == 70450 and sample.release == "campaign-20261019")
assert(sample.character.name == "Evidence Tester" and sample.character.class == "PRIEST")
assert(sample.start.level == 20 and sample.finish.level == 21)
assert(sample.xpGained == 250 and sample.xpTrackingComplete == true)
assert(sample.killCount == 2 and sample.unattributedKillCount == 0)
assert(sample.reportedKillXp == 250 and sample.unparsedKillMessageCount == 0)
assert(#sample.killMix == 1 and sample.killMix[1].npcId == 127 and sample.killMix[1].count == 2)
assert(sample.activeSeconds == 15 and sample.combatSeconds == 5 and sample.elapsedSeconds == 15)
assert(#sample.areas == 2 and sample.areas[2].subzone == "The Dagger Hills")
assert(sample.startParty.size == 1 and sample.endParty.size == 1 and sample.partyChanged == false)
assert(sample.questTurnIns == 0 and sample.deaths == 0 and sample.completionReason == "manual-stop")
assert(scripts.OnUpdate == nil and next(registered) == nil)

namespace.grindObserver.command("westfall-level-21")
namespace.grindObserver.command("discard")
assert(#KFCForeverGuideEvidence.grinds == 1)

GetBuildInfo = function() return "1.60.1", "70451" end
namespace.grindObserver.command("westfall-level-21")
assert(#KFCForeverGuideEvidence.grinds == 1)
assert(string.find(messages[#messages], "could not start", 1, true))
GetBuildInfo = function() return "1.60.1", "70450" end
UnitXP = function() return secret end
namespace.grindObserver.command("westfall-level-21")
assert(#KFCForeverGuideEvidence.grinds == 1)
assert(string.find(messages[#messages], "could not start", 1, true))

io.write("Leveling grind observer mock tests passed; live WoW API behavior remains unverified.\n")
