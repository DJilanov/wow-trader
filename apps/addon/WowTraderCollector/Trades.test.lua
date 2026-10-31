local frame, hooks, reads, now, sequence = {}, {}, 0, 100000, 0
function CreateFrame() return frame end
function frame:RegisterEvent() end
function frame:SetScript(_, callback) self.callback = callback end
function time() return now end
function issecretvalue(value) return value == "SECRET" end
function canaccessvalue(value) return value ~= "SECRET" end
function GetInboxNumItems() return 2 end
local invoiceKind, quantity, money, fee = "seller", 3, 290, 15
function GetInboxInvoiceInfo() reads = reads + 1;return invoiceKind, "Copper Ore", "Buyer", 300, 300, 5, fee, 0, 0, "AH", quantity end
function GetInboxHeaderInfo() return nil, nil, "AH", "Sale", money end
function GetInboxItem() return "Copper Ore", 2770, nil, quantity end
function TakeInboxMoney() end
function TakeInboxItem() end
function AutoLootMailItem() end
function hooksecurefunc(name, callback) hooks[name] = callback end
WOW_TRADER_SAVED = { scans = { { itemSnapshots = { { itemName = "Copper Ore", itemId = 2770 } } } } }
local addon = {
  GetCollectorContext = function() return { clientProduct="wow_classic_beta", clientBuild=70707, region="EU", realmId="TestRealm", characterName="Crafter" } end,
  NewObservationId = function() sequence=sequence+1;return "id-"..sequence end,
}
assert(loadfile("apps/addon/WowTraderCollector/Trades.lua"))("WowTraderCollector", addon)
local function emit(event, id) frame.callback(frame, event, id) end
emit("MAIL_SHOW")
assert(reads == 0, "Invoices must remain unread before opt-in")
addon.SetTradeLedgerEnabled(true)
addon.SetTradeLedgerMarket("alliance")
hooks.TakeInboxMoney(1)
emit("MAIL_SUCCESS")
local first = WOW_TRADER_SAVED.tradeEvents[1]
assert(first.kind == "sale" and first.quantity == 3 and first.amountCopper == "300" and first.auctionFeeCopper == "15")
assert(first.market == "EU|TestRealm|alliance" and first.evidence == "mail_receipt")
hooks.TakeInboxMoney(1);emit("MAIL_FAILED");emit("MAIL_SUCCESS")
assert(#WOW_TRADER_SAVED.tradeEvents == 1, "Failed actions must not create receipts")
invoiceKind = "seller_temp_invoice";emit("MAIL_INBOX_UPDATE");hooks.TakeInboxMoney(1);emit("MAIL_SUCCESS")
assert(#WOW_TRADER_SAVED.tradeEvents == 1, "Pending sale invoices must not count as collected sales")
invoiceKind = "seller";quantity = nil;emit("MAIL_INBOX_UPDATE");hooks.TakeInboxMoney(1);emit("MAIL_SUCCESS")
assert(#WOW_TRADER_SAVED.tradeEvents == 1, "Unknown stack sizes must not be invented")
quantity = 3;fee = "SECRET";emit("MAIL_INBOX_UPDATE");hooks.TakeInboxMoney(1);emit("MAIL_SUCCESS")
assert(#WOW_TRADER_SAVED.tradeEvents == 1, "Secret values must not be used in arithmetic")
fee = 15;money = 291;emit("MAIL_INBOX_UPDATE");hooks.TakeInboxMoney(1);emit("MAIL_SUCCESS")
assert(#WOW_TRADER_SAVED.tradeEvents == 1, "Sale amount must match actual received money")
invoiceKind = "buyer";emit("MAIL_INBOX_UPDATE");hooks.TakeInboxItem(1);emit("MAIL_SUCCESS", 2770)
assert(#WOW_TRADER_SAVED.tradeEvents == 2 and WOW_TRADER_SAVED.tradeEvents[2].kind == "purchase")
hooks.TakeInboxItem(1);emit("MAIL_SUCCESS", 1234)
assert(#WOW_TRADER_SAVED.tradeEvents == 2, "A different collected item must not confirm a receipt")
emit("MAIL_INBOX_UPDATE");hooks.TakeInboxItem(1);hooks.TakeInboxItem(2);emit("MAIL_SUCCESS", 2770)
assert(#WOW_TRADER_SAVED.tradeEvents == 2, "Overlapping collections must not misattribute a receipt")
emit("MAIL_CLOSED");emit("MAIL_SHOW");hooks.TakeInboxItem(1);now = now + 31;emit("MAIL_SUCCESS", 2770)
assert(#WOW_TRADER_SAVED.tradeEvents == 2, "Expired observations must not count")
WOW_TRADER_ACCOUNT_DATA = { acknowledgedTrades = { first.eventId }, acknowledgedChanges = {} }
assert(addon.GetTradeLedgerStatus().events == 1, "Companion acknowledgements must prune saved receipts")
addon.SetTradeLedgerEnabled(false);hooks.TakeInboxItem(1);emit("MAIL_SUCCESS", 2770)
assert(#WOW_TRADER_SAVED.tradeEvents == 1, "Opt-out must stop recording")
print("Trade receipt controls passed: opt-in, exact totals, failure, pending invoice, secrets, identity, overlap, timeout, acknowledgements")
