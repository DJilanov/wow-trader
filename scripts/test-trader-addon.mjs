import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { analyzePriceHistory, quoteBuyOpportunity } from "../packages/market/dist/index.js";

const lua =
  process.argv.find((value) => value.startsWith("--lua="))?.slice(6) ?? process.env.LUA ?? "lua";
const root = path.resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(path.join(tmpdir(), "wow-trader-lua-"));
const now = new Date("2026-10-31T12:00:00Z");
const cases = [];
let randomState = 73013;
function random(maximum) {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState % maximum;
}
for (let index = 0; index < 120; index++) {
  const count = index === 119 ? 400 : 6 + random(50);
  const base = 100 + random(100000);
  const price = Math.max(1, Math.floor((base * (40 + random(120))) / 100));
  const quantity = 10 + random(200);
  const observations = Array.from({ length: count }, (_, offset) => ({
    observedAt: new Date(now.getTime() - (count - offset - 1) * 1800000),
    priceCopper: BigInt(offset < count - 3 ? base + random(5) : price),
    availableQuantity: quantity,
    listingCount: 3 + random(8),
    completeness: 1,
  }));
  if (index % 11 === 0) observations.push({ ...observations.at(-1), completeness: 0.98 });
  const intelligence = analyzePriceHistory(observations);
  const levels = [
    { unitPriceCopper: BigInt(Math.max(1, price - 3)), quantity: 3, listingCount: 1 },
    { unitPriceCopper: BigInt(price), quantity, listingCount: 5 },
  ];
  const observedAt = new Date(now.getTime() - (index % 13 === 0 ? 3601000 : 0));
  const auctionHouseType = index % 3 === 0 ? "neutral" : "alliance";
  const budget = index % 7 === 0 ? BigInt(price * 2) : undefined;
  const quote = quoteBuyOpportunity({
    intelligence,
    levels,
    observedAt,
    now,
    auctionHouseType,
    ...(budget !== undefined ? { maximumSpendCopper: budget } : {}),
  });
  const analysisExpected =
    intelligence.status === "available"
      ? {
          status: intelligence.status,
          observations: intelligence.observationCount,
          signal: intelligence.signal,
          current: intelligence.currentPriceCopper,
          normal: intelligence.normalPriceCopper,
          low: intelligence.lowerPriceCopper,
          high: intelligence.upperPriceCopper,
          normalQuantity: intelligence.normalQuantity,
          quantity: intelligence.currentQuantity,
          listings: intelligence.currentListingCount,
          supplyBP: intelligence.supplyRatioBasisPoints,
          differenceBP: intelligence.differenceBasisPoints,
          confidenceBP: intelligence.confidenceBasisPoints,
          direction: intelligence.direction,
        }
      : { status: "collecting", observations: intelligence.observationCount };
  const quoteExpected = {
    state: quote.state,
    quantity: quote.quantity,
    maximumBuy: quote.maximumBuyPriceCopper,
    targetResale: quote.targetResalePriceCopper,
    buyCost: quote.buyCostCopper,
    grossResale: quote.grossResaleCopper,
    auctionFee: quote.auctionFeeCopper,
    netResale: quote.netResaleCopper,
    profit: quote.profitCopper,
    returnBP: quote.returnBasisPoints,
    feeBP: quote.auctionFeeBasisPoints,
  };
  cases.push({
    observations: observations.map((row) => [
      row.observedAt.getTime() / 1000,
      row.priceCopper,
      row.availableQuantity,
      row.listingCount,
      row.completeness,
    ]),
    levels,
    observedAt: observedAt.getTime() / 1000,
    now: now.getTime() / 1000,
    auctionHouseType,
    budget,
    analysisExpected,
    quoteExpected,
  });
}
function literal(value) {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "bigint" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `{${value.map(literal).join(",")}}`;
  return `{${Object.entries(value)
    .map(([key, entry]) => `[${literal(key)}]=${literal(entry)}`)
    .join(",")}}`;
}
const runner = `local Addon = {}\nassert(loadfile(${literal(root + "/apps/addon/WowTraderCollector/MarketPolicy.lua")}))("WowTraderCollector", Addon)
local cases = ${literal(cases)}
for index, case in ipairs(cases) do
 local analysis = Addon.MarketPolicy.Analyze(case.observations)
 for key, expected in pairs(case.analysisExpected) do
  assert(analysis[key] == expected, "Analysis case " .. index .. " " .. key .. ": " .. tostring(analysis[key]) .. " ~= " .. tostring(expected))
 end
 local quote = Addon.MarketPolicy.Quote(analysis, case.levels, case.observedAt, case.now, case.auctionHouseType, case.budget)
 for key, expected in pairs(case.quoteExpected) do
  assert(quote[key] == expected, "Quote case " .. index .. " " .. key .. ": " .. tostring(quote[key]) .. " ~= " .. tostring(expected))
 end
end
assert(Addon.MarketPolicy.Analyze({{1000,"9007199254740993",1,3,1}}).status == "collecting")
print("120 exact JavaScript/Lua comparison cases passed")
`;
try {
  const file = path.join(temporary, "parity.lua");
  writeFileSync(file, runner);
  const output = execFileSync(lua, [file], { encoding: "utf8" });
  assert(output.includes("120 exact"));
  process.stdout.write(output);
  const integration = root + "/apps/addon/WowTraderCollector/MarketIntegration.test.lua";
  assert(readFileSync(integration, "utf8").length > 0);
  process.stdout.write(execFileSync(lua, [integration], { cwd: root, encoding: "utf8" }));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
