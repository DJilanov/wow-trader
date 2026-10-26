import assert from "node:assert/strict";

function once(source, before, after) {
  assert.equal(source.split(before).length, 2, "Shaman equipped integration anchor: " + before);
  return source.replace(before, after);
}

/** Derive a separate equipped entry point while preserving the original spell-only API.
 * @param {{definitions:string,runner:string,job:string,nativeDriver:string,wasmDriver:string}} input
 * @returns {{definitions:string,runner:string,job:string,nativeDriver:string,wasmDriver:string}}
 */
export function renderShamanEquippedWorkload(input) {
  assert(!input.runner.includes("runKFCShamanHealingWorkload("));
  const definitions = once(
    input.definitions,
    "type KFCShamanHealingWorkloadResult struct {",
    'type KFCShamanHealingWorkloadResult struct {\n\tEquipped *KFCShamanEquippedWorkloadReceipt `json:"equipped,omitempty"`',
  );
  const signature =
    "func RunKFCShamanHealingWorkload(ctx context.Context, input *proto.RaidSimRequest, frame KFCShamanHealingWorkload) (output *KFCShamanHealingWorkloadResult, err error) {";
  let runner = once(
    input.runner,
    signature,
    signature +
      "\n\treturn runKFCShamanHealingWorkload(ctx,input,frame,nil)\n}\n\n" +
      "func runKFCShamanHealingWorkload(ctx context.Context, input *proto.RaidSimRequest, frame KFCShamanHealingWorkload, equipped *KFCShamanEquippedHealingWorkload) (output *KFCShamanHealingWorkloadResult, err error) {",
  );
  runner = once(
    runner,
    "\tif err = validateKFCShamanWorkloadRequest(player, request.Raid); err != nil {\n\t\treturn nil, err\n\t}",
    "\tvar equippedReceipt *KFCShamanEquippedWorkloadReceipt\n\tif equipped==nil {\n\t\tif err=validateKFCShamanWorkloadRequest(player,request.Raid);err!=nil{return nil,err}\n\t} else {\n\t\tequippedReceipt,err=validateKFCShamanEquippedRequest(request,player,equipped)\n\t\tif err!=nil{return nil,err}\n\t}",
  );
  runner = once(
    runner,
    "healer == nil || len(units) != len(frame.Targets) || len(units) != len(sim.Raid.AllUnits)",
    "healer == nil || len(units) != len(frame.Targets) || equipped == nil && len(units) != len(sim.Raid.AllUnits)",
  );
  runner = once(
    runner,
    "\t\tprofiles[target.RaidIndex] = target",
    '\t\tif equipped!=nil && unit==&healer.Unit && target.MaximumHealth!=0 {return nil,fmt.Errorf("equipped Shaman maximum health must come from actual equipment and buffs")}\n\t\tprofiles[target.RaidIndex] = target',
  );
  runner = once(
    runner,
    "PlannedIncomingPostMitigationDamage: totalDamage, Assignment: assignment}",
    "PlannedIncomingPostMitigationDamage: totalDamage, Assignment: assignment, Equipped: equippedReceipt}",
  );
  runner = once(
    runner,
    "\t\tsim.PrePull()",
    "\t\tvar equippedUses []int\n\t\tif equipped!=nil {\n\t\t\tif iteration==0 {\n\t\t\t\tif err=healer.configureKFCShamanEquippedEffects(sim,equipped.Effects);err!=nil{return nil,err}\n\t\t\t\tif err=healer.validateKFCShamanEquippedCooldowns(sim,equipped,units);err!=nil{return nil,err}\n\t\t\t}\n\t\t\tequippedUses=make([]int,len(equipped.Cooldowns))\n\t\t\tif err=kfcShamanEquippedInactiveExtras(sim,units);err!=nil{return nil,err}\n\t\t}\n\t\tsim.PrePull()",
  );
  runner = once(
    runner,
    "\t\t\tif healer.CurrentHealth() > 0 && healer.IsEnabled() {",
    "\t\t\tif equipped!=nil {healer.useKFCShamanEquippedCooldowns(sim,equipped,equippedUses)}\n\t\t\tif healer.CurrentHealth() > 0 && healer.IsEnabled() {",
  );
  runner = once(
    runner,
    "\t\t\tfinished := sim.Step()",
    "\t\t\tfinished := sim.Step()\n\t\t\tif equipped!=nil {if err=kfcShamanEquippedInactiveExtras(sim,units);err!=nil{return nil,err}}",
  );
  runner = once(
    runner,
    "\t\toutput.ManaRemainingMean += healer.CurrentMana()",
    "\t\tif equippedReceipt!=nil {for index,value:=range equippedUses {equippedReceipt.CooldownUsesMean[index]+=float64(value)}}\n\t\toutput.ManaRemainingMean += healer.CurrentMana()",
  );
  runner = once(
    runner,
    "\tcountFloat := float64(request.SimOptions.Iterations)",
    "\tcountFloat := float64(request.SimOptions.Iterations)\n\tif equippedReceipt!=nil {for index:=range equippedReceipt.CooldownUsesMean {equippedReceipt.CooldownUsesMean[index]/=countFloat}}",
  );

  assert(input.job.startsWith("package restoration\n"));
  const unknownStart = input.job.indexOf("func kfcShamanHealingUnknownFields(");
  const unknownEnd = input.job.indexOf("// RunKFCShamanHealingJob", unknownStart);
  assert(unknownStart > 0 && unknownEnd > unknownStart);
  let job = input.job.slice(0, unknownStart) + input.job.slice(unknownEnd);
  job = job.replace('\n\t"google.golang.org/protobuf/reflect/protoreflect"', "");
  job = job
    .replaceAll("KFCShamanHealing", "KFCShamanEquippedHealing")
    .replaceAll("kfcShamanHealingJobID", "kfcShamanEquippedHealingJobID")
    .replaceAll("kfc-shaman-healing-job", "kfc-shaman-equipped-job")
    .replaceAll("KFCShamanEquippedHealingWorkloadResult", "KFCShamanHealingWorkloadResult");
  job = once(
    job,
    "\tmetrics := result.Metrics",
    '\tif result.Equipped==nil || result.Assignment==nil {return fail("invalid_metrics","Missing equipped Shaman receipt or assignment")}\n\tfor name,value:=range map[string]float64{"supportHps":result.Assignment.SupportHpsMean,"supportStdev":result.Assignment.SupportHpsStdev,"externalMissing":result.Assignment.ExternalMissingHealthSecondsMean,"finalExternalMissing":result.Assignment.FinalExternalMissingHealthMean,"damageDemand":result.Assignment.DamageDemandMean,"overkillExcluded":result.Assignment.OverkillExcludedMean} {if !kfcFinite(value)||value<0{return fail("invalid_metrics",fmt.Sprintf("Invalid equipped Shaman %s",name))}}\n\tmetrics := result.Metrics',
  );
  function driver(source) {
    assert(source.includes("holy.RegisterHolyPaladin()"));
    return source
      .replaceAll(
        "github.com/wowsims/classic/sim/paladin/holy",
        "github.com/wowsims/classic/sim/shaman/restoration",
      )
      .replaceAll("holy.RegisterHolyPaladin()", "")
      .replaceAll("holy.RunKFCPaladinHealingJob", "restoration.RunKFCShamanEquippedHealingJob")
      .replaceAll("kfcHealingSimulate", "kfcShamanEquippedSimulate")
      .replaceAll("kfcHealingWasmReady", "kfcShamanEquippedWasmReady");
  }
  return {
    definitions,
    runner,
    job,
    nativeDriver: driver(input.nativeDriver),
    wasmDriver: driver(input.wasmDriver),
  };
}
