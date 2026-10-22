-- Test-only WoW API facade. Transport, compression, guide parsing and caching use pinned upstream code.
local addonRoot, importPath, documentsPath, accountPath, expectedResult, commandsPath, playerRace, playerClass = unpack(arg)
local function read(path)
    local file = assert(io.open(path, "rb"))
    local value = file:read("*a")
    file:close()
    return value
end
local battleTag = read(accountPath):gsub("%s+$", "")
local expected, expectedCount = {}, 0
for document in read(documentsPath):gmatch("[^%z]+") do
    expected[document] = (expected[document] or 0) + 1
    expectedCount = expectedCount + 1
end

local function binary(left, right, xor)
    local result, bitValue = 0, 1
    left, right = left % 4294967296, right % 4294967296
    while left > 0 or right > 0 do
        local a, b = left % 2, right % 2
        if (xor and a ~= b) or (not xor and a == 1 and b == 1) then
            result = result + bitValue
        end
        left, right = math.floor(left / 2), math.floor(right / 2)
        bitValue = bitValue * 2
    end
    return result
end
bit = {
    band = function(a, b)
        if b == 255 then return a % 256 end
        if b == 15 then return a % 16 end
        if b == 4294967295 then return a % 4294967296 end
        return binary(a, b, false)
    end,
    bxor = function(a, b) return binary(a, b, true) end,
    bor = function(a, b) return (a + b - binary(a, b, false)) % 4294967296 end,
    lshift = function(a, b) return (a * 2 ^ b) % 4294967296 end,
    rshift = function(a, b) return math.floor((a % 4294967296) / 2 ^ b) end,
}
strlower, strupper = string.lower, string.upper
tremove, tinsert = table.remove, table.insert
GetLocale = function() return "enUS" end
UnitLevel = function() return 60 end
UnitSex = function() return 2 end
BNGetInfo = function() return nil, battleTag end
GetCVar = function() return "1" end
SetCVar = function() end
CreateFrame = function()
    return {
        SetScript = function(self, key, value) self[key] = value end,
        Hide = function() end,
        Show = function() end,
    }
end
RXPData = {}
RXPCData = {}
local libdeflate = assert(loadfile(addonRoot .. "/libs/LibDeflate/LibDeflate.lua"))()
LibStub = function(name) assert(name == "LibDeflate"); return libdeflate end
local addon = {
    player = { class = playerClass or "WARRIOR", race = playerRace or "Human", faction = "Alliance", season = 0 },
    game = "FOREVER",
    version = 40000,
    settings = { profile = {}, ReplaceColors = function(value) return value end },
    locale = { Get = function(value, ...) if select("#", ...) > 0 then return string.format(value, ...) end; return value end },
    functions = {},
    separators = {},
    db = { profile = { guides = {} } },
    RXPFrame = { GenerateMenuTable = function() end },
    comms = { PrettyDebug = function() end },
    error = function() error("Native guide instruction was rejected") end,
    safeCall = function(callback, ...) return pcall(callback, ...) end,
    NewModule = function() return {} end,
    ScheduleTask = function() end,
    base = {},
}
for byte in string.gmatch("BNGetInfo", ".") do table.insert(addon.base, string.byte(byte)) end
-- Command constructors are isolated from the game. This checks stock structural parsing,
-- not quest availability, map projection, movement or protected gameplay APIs.
-- The driver checks every command against the pinned upstream implementation first.
for tag in read(commandsPath):gmatch("[^\r\n]+") do
    local command = tag
    addon.functions[command] = function(_, text, ...)
        local args = {...}
        if command == "accept" or command == "complete" or command == "turnin" then
            assert(tonumber(args[1]) and tonumber(args[1]) > 0, "Invalid quest identifier")
        end
        return { text = text, arguments = args }
    end
end
local captured, parsedSteps = 0, 0
RXPGuides = {
    ImportGuide = function(document)
        assert(expected[document] and expected[document] > 0, "Decoded document bytes differ")
        expected[document] = expected[document] - 1
        captured = captured + 1
        local guide = addon.ImportGuide(document)
        assert(guide and guide.name and #guide.steps > 0, "Stock parser rejected a guide")
        parsedSteps = parsedSteps + #guide.steps
        return guide
    end,
}
addon.RXPGuides = RXPGuides
assert(loadfile(addonRoot .. "/libs/plc/base64.lua"))("RXPGuides", addon)
assert(loadfile(addonRoot .. "/GuideLoader.lua"))("RXPGuides", addon)
addon.guideImporter.UpdateImportStatusHistory = function() end
addon.guideImporter.UpdateImportUI = function() end
local accepted = addon.guideImporter:ImportString(read(importPath), true)
if expectedResult == "invalid" then
    assert(not accepted, "Stock loader accepted wrong-account or corrupt input")
    assert(captured == 0)
    io.write('{"status":"passed","rejected":true}\n')
    return
end
assert(accepted, "Stock loader rejected encoded import")
assert(addon.guideImporter.importBufferSize == expectedCount, "Stock decoded count differs")
for index = 1, expectedCount + 1 do
    addon.guideImporter.ProcessInputBuffer(addon.workerFrame)
end
assert(captured == expectedCount, "Not all decoded documents reached the parser")
for _, count in pairs(expected) do assert(count == 0, "Decoded document missing") end
local registered = 0
for _, guide in pairs(addon.guides) do
    registered = registered + 1
    if guide.next then assert(addon.guides[guide.group .. "||" .. guide.next], "Broken next chapter") end
end
assert(registered == expectedCount, "Duplicate or missing registered guide identity")
io.write(string.format('{"status":"passed","documents":%d,"steps":%d,"exactDecodedBytes":true,"stockCache":true,"commandRuntimeMocked":true}\n', registered, parsedSteps))
