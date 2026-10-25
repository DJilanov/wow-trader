import assert from "node:assert/strict";

/** Build an optional, actor-owned optimistic contender probe without modifying the parent engine.
 * @param {{baseline:string,workload:string}} source @returns {{baseline:string,workload:string}}
 */
export function renderDruidUtilityProbes(source) {
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  let baseline = once(
    source.baseline,
    "\tlegacyItems *kfcDruidLegacyItems",
    "\tlegacyItems *kfcDruidLegacyItems\n\tutilityProbes *kfcDruidUtilityProbes",
  );
  baseline = once(
    baseline,
    "\tresto.registerKFCLegacyItems()",
    "\tresto.registerKFCLegacyItems()\n\tresto.registerKFCUtilityProbes()",
  );
  const field =
    '\tLegacyItemsPolicy *KFCDruidLegacyItemPolicy `json:"legacyItemsPolicy,omitempty"`';
  assert.equal(source.workload.split(field).length, 3);
  let workload = source.workload.replaceAll(
    field,
    field + '\n\tUtilityProbe *KFCDruidUtilityProbePolicy `json:"utilityProbe,omitempty"`',
  );
  const configure =
    "\tif frame.LegacyItemsPolicy != nil { if err = healer.ConfigureKFCDruidLegacyItems(sim, *frame.LegacyItemsPolicy); err != nil { return nil,err } }";
  workload = once(
    workload,
    configure,
    configure +
      '\n\tif frame.UtilityProbe != nil { if request.Encounter.Duration > 300 { return nil,fmt.Errorf("utility envelope is limited to five-minute assignments") }; if err = healer.ConfigureKFCUtilityProbe(sim,*frame.UtilityProbe); err != nil { return nil,err } }',
  );
  const echo =
    "\tif frame.LegacyItemsPolicy != nil { policy := healer.kfcResolvedLegacyItemPolicy(); output.LegacyItemsPolicy = &policy }";
  workload = once(
    workload,
    echo,
    echo +
      "\n\tif frame.UtilityProbe != nil { policy := healer.kfcResolvedUtilityProbe(); output.UtilityProbe = &policy }",
  );
  workload = once(
    workload,
    "\t\t\tif healer.CurrentHealth() > 0 {",
    "\t\t\tif healer.CurrentHealth() > 0 {\n\t\t\t\thealer.useKFCUtilityProbes(sim)",
  );
  return { baseline, workload };
}
