import assert from "node:assert/strict";

/** Validate declared auxiliary resource demand without importing another class's rotation.
 * @param {unknown} value @param {number} durationSeconds @returns {void}
 */
export function assertShamanRecipientManaPolicy(value, durationSeconds) {
  assert(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(
    Object.keys(value).sort(),
    ["schema", "id", "regeneration", "payment", "timing", "recipients"].sort(),
  );
  assert.equal(value.schema, "kfc-shaman-recipient-mana.v1");
  assert(typeof value.id === "string" && value.id.length > 0 && value.id.length <= 100);
  assert.equal(value.regeneration, "none-reference");
  assert.equal(value.payment, "all-or-nothing-no-retry-reference");
  assert(["spend-before-pulses-reference", "spend-after-pulses-reference"].includes(value.timing));
  assert(Number.isFinite(durationSeconds) && durationSeconds >= 1 && durationSeconds <= 1800);
  assert(
    Array.isArray(value.recipients) && value.recipients.length > 0 && value.recipients.length <= 39,
  );
  const seen = new Set();
  let count = 0;
  for (const row of value.recipients) {
    assert(row && typeof row === "object" && !Array.isArray(row));
    assert.deepEqual(
      Object.keys(row).sort(),
      ["raidIndex", "maximumMana", "startingMana", "costs"].sort(),
    );
    assert(
      Number.isInteger(row.raidIndex) &&
        row.raidIndex >= 0 &&
        row.raidIndex < 40 &&
        !seen.has(row.raidIndex),
    );
    seen.add(row.raidIndex);
    assert(Number.isFinite(row.maximumMana) && row.maximumMana > 0 && row.maximumMana <= 1000000);
    assert(
      Number.isFinite(row.startingMana) &&
        row.startingMana >= 0 &&
        row.startingMana <= row.maximumMana,
    );
    assert(row.costs === null || Array.isArray(row.costs));
    for (const cost of row.costs ?? []) {
      assert(cost && typeof cost === "object" && !Array.isArray(cost));
      assert.deepEqual(Object.keys(cost).sort(), ["atMs", "amount"].sort());
      assert(
        Number.isSafeInteger(cost.atMs) && cost.atMs >= 0 && cost.atMs < durationSeconds * 1000,
      );
      assert(Number.isFinite(cost.amount) && cost.amount > 0 && cost.amount <= 1000000);
      count++;
      assert(count <= 20000);
    }
  }
}

/** Extend only the equipped contract and owned setup; preserve the spell-only API.
 * @param {{equipped:string,definitions:string,runner:string,utility:string}} sources
 * @returns {{equipped:string,definitions:string,runner:string,utility:string}}
 */
export function renderShamanManaRecipients(sources) {
  assert(
    !sources.equipped.includes("KFCShamanRecipientManaPolicy"),
    "Recipient mana integration already present",
  );
  function replace(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  let equipped = replace(
    sources.equipped,
    "type KFCShamanEquippedHealingWorkload struct {\n",
    'type KFCShamanEquippedHealingWorkload struct {\n\tRecipientMana *KFCShamanRecipientManaPolicy `json:"recipientMana,omitempty"`\n',
  );
  equipped = replace(
    equipped,
    "type KFCShamanEquippedWorkloadReceipt struct {\n",
    'type KFCShamanEquippedWorkloadReceipt struct {\n\tRecipientMana *KFCShamanRecipientManaPolicy `json:"recipientMana,omitempty"`\n',
  );
  equipped = replace(
    equipped,
    'return &KFCShamanEquippedWorkloadReceipt{Schema: "kfc-shaman-equipped-receipt.v1",',
    'return &KFCShamanEquippedWorkloadReceipt{RecipientMana:frame.RecipientMana, Schema: "kfc-shaman-equipped-receipt.v1",',
  );
  const definitions = replace(
    sources.definitions,
    "type KFCShamanHealingAssignmentMetrics struct {\n",
    'type KFCShamanHealingAssignmentMetrics struct {\n\tRecipientManaDemandMean float64 `json:"recipientManaDemandMean,omitempty"`\n\tRecipientManaSpentMean float64 `json:"recipientManaSpentMean,omitempty"`\n\tRecipientUnpaidManaMean float64 `json:"recipientUnpaidManaMean,omitempty"`\n\tRecipientManaCostsCompletedMean float64 `json:"recipientManaCostsCompletedMean,omitempty"`\n\tRecipientManaCostsMissedMean float64 `json:"recipientManaCostsMissedMean,omitempty"`\n\tFinalLivingRecipientManaMean float64 `json:"finalLivingRecipientManaMean,omitempty"`\n',
  );
  let runner = replace(
    sources.runner,
    "sim := core.NewSim(request, simsignals.CreateSignals())",
    "var manaPolicy *KFCShamanRecipientManaPolicy\n\tif equipped != nil { manaPolicy=equipped.RecipientMana }\n\tmanaPools, poolErr := kfcShamanRecipientManaPools(manaPolicy,request.Encounter.Duration)\n\tif poolErr != nil { return nil,poolErr }\n\tsim, setupErr := core.NewKFCManaRecipientSimulation(request,simsignals.CreateSignals(),manaPools)\n\tif setupErr != nil { return nil,setupErr }",
  );
  runner = replace(
    runner,
    "\tactive := false\n\tdefer func()",
    "\tvar healer *RestorationShaman\n\tactive := false\n\tdefer func()",
  );
  runner = replace(runner, "\tvar healer *RestorationShaman\n\tunits :=", "\tunits :=");
  runner = replace(
    runner,
    "\t\tif active {\n\t\t\tsim.Cleanup()",
    "\t\tif active {\n\t\t\tif healer!=nil { healer.setKFCShamanManaCapacityAccounting(false) }\n\t\t\tsim.Cleanup()",
  );
  runner = replace(
    runner,
    "\t\tactive = true",
    "\t\tactive = true\n\t\thealer.setKFCShamanManaCapacityAccounting(true)",
  );
  runner = replace(
    runner,
    "\t\tsim.Cleanup()\n\t\tactive = false",
    "\t\thealer.setKFCShamanManaCapacityAccounting(false)\n\t\tsim.Cleanup()\n\t\tactive = false",
  );
  const profiles = "profiles := map[int32]KFCShamanHealingTarget{}";
  runner = replace(
    runner,
    profiles,
    "recipientMana, manaErr := healer.prepareKFCShamanRecipientMana(manaPolicy,units)\n\tif manaErr != nil { return nil,manaErr }\n\t" +
      profiles,
  );
  const uses = "\t\tvar equippedUses []int";
  runner = replace(
    runner,
    uses,
    "\t\tif err = recipientMana.reset(sim,manaPolicy); err != nil { return nil,err }\n" + uses,
  );
  runner = replace(
    runner,
    "\t\tsim.PrePull()",
    "\t\tsim.PrePull()\n\t\trecipientMana.schedule(sim,manaPolicy)",
  );
  runner = replace(
    runner,
    "\t\toutput.ManaRemainingMean += healer.CurrentMana()",
    "\t\tif err = recipientMana.finish(assignment); err != nil { return nil,err }\n\t\toutput.ManaRemainingMean += healer.CurrentMana()",
  );
  runner = replace(
    runner,
    "\tassignment.UsefulOtherManaTideManaMean /= countFloat",
    "\tassignment.UsefulOtherManaTideManaMean /= countFloat\n\tassignment.RecipientManaDemandMean /= countFloat\n\tassignment.RecipientManaSpentMean /= countFloat\n\tassignment.RecipientUnpaidManaMean /= countFloat\n\tassignment.RecipientManaCostsCompletedMean /= countFloat\n\tassignment.RecipientManaCostsMissedMean /= countFloat\n\tassignment.FinalLivingRecipientManaMean /= countFloat",
  );
  const before = "character.AddStatDynamic(sim, stats.Intellect, -amount)\n\t\t\t\tamount = 0";
  let utility = replace(
    sources.utility,
    "type kfcShamanUtilityItems struct {\n",
    "type kfcShamanUtilityItems struct {\n\tmanaCapacityAccounting bool\n",
  );
  utility = replace(
    utility,
    before,
    "character.AddStatDynamic(sim, stats.Intellect, -amount); if state.manaCapacityAccounting && character.HasManaBar() { if loss:=character.CurrentMana()-character.MaxMana();loss>0 { metrics:=character.NewManaMetrics(core.ActionID{SpellID:18264,Tag:1}); metrics.NoThreat=true; character.SpendMana(sim,loss,metrics) } }\n\t\t\t\tamount = 0",
  );
  return { equipped, definitions, runner, utility };
}
