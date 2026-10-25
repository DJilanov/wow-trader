import assert from "node:assert/strict";

function replaceOnce(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, "Missing or ambiguous metric accumulator anchor");
  return source.replace(anchor, replacement);
}

/** Replace only variance accumulation/merging in an isolated derived model.
 * No validation gate or raw historical result is changed by this transformation.
 * @param {{utils:string,concurrent:string}} source @returns {{utils:string,concurrent:string}}
 */
export function applyStableMetricAggregation(source) {
  assert(!source.utils.includes("kfcMetricMoments"));
  assert(!source.concurrent.includes("kfcMetricMoments"));
  let utils = replaceOnce(
    source.utils,
    "type aggregator struct {\n\tn     int\n\tsum   float64\n\tsumSq float64\n}",
    "type aggregator struct {\n\tn     int\n\tsum   float64\n\tsumSq float64\n\tmoments kfcMetricMoments\n}",
  );
  utils = replaceOnce(utils, "\tx.sumSq += v * v\n}", "\tx.sumSq += v * v\n\tx.moments.add(v)\n}");
  utils = replaceOnce(
    utils,
    "\tx.sumSq *= f * f\n}",
    "\tx.sumSq *= f * f\n\tx.moments.scale(f)\n}",
  );
  utils = replaceOnce(
    utils,
    "return &aggregator{n: x.n + y.n, sum: x.sum + y.sum, sumSq: x.sumSq + y.sumSq}",
    "return &aggregator{n: x.n + y.n, sum: x.sum + y.sum, sumSq: x.sumSq + y.sumSq, moments: x.moments.merge(y.moments)}",
  );
  utils = replaceOnce(
    utils,
    "\tmean := x.sum / float64(x.n)\n\tstdDev := math.Sqrt(x.sumSq/float64(x.n) - mean*mean)\n\treturn mean, stdDev",
    '\tif x.n != x.moments.n { panic("Inconsistent metric sample counts") }\n\tif x.n == 0 { return math.NaN(), math.NaN() }\n\treturn x.moments.mean, x.moments.stdev()',
  );
  let concurrent = replaceOnce(
    source.concurrent,
    "type raidSimResultCombiner struct {\n\tDebug    bool\n\tCombined *proto.RaidSimResult\n}",
    "type raidSimResultCombiner struct {\n\tDebug    bool\n\tCombined *proto.RaidSimResult\n\tdistributionMoments map[*proto.DistributionMetrics]kfcMetricMoments\n\tauraMoments map[*proto.AuraMetrics]kfcMetricMoments\n}",
  );
  concurrent = replaceOnce(
    concurrent,
    "func (rsrc *raidSimResultCombiner) combineDistMetrics(base *proto.DistributionMetrics, add *proto.DistributionMetrics, isLast bool, weight float64) {",
    "func (rsrc *raidSimResultCombiner) combineDistMetrics(base *proto.DistributionMetrics, add *proto.DistributionMetrics, isLast bool, weight float64) {\n\tif rsrc.distributionMoments == nil { rsrc.distributionMoments = make(map[*proto.DistributionMetrics]kfcMetricMoments) }\n\tmoments := rsrc.distributionMoments[base].merge(kfcMetricMomentsFromSummary(add.AggregatorData.N, add.Avg, add.Stdev))\n\trsrc.distributionMoments[base] = moments",
  );
  concurrent = replaceOnce(
    concurrent,
    "\t\tbase.Stdev = math.Sqrt(base.AggregatorData.SumSq/float64(base.AggregatorData.N) - base.Avg*base.Avg)",
    '\t\tif moments.n != int(base.AggregatorData.N) { panic("Inconsistent combined metric sample counts") }\n\t\tbase.Avg = moments.meanOrNaN()\n\t\tbase.Stdev = moments.stdev()\n\t\tdelete(rsrc.distributionMoments, base)',
  );
  concurrent = replaceOnce(
    concurrent,
    "func (rsrc *raidSimResultCombiner) combineAuraMetrics(base *proto.AuraMetrics, add *proto.AuraMetrics, weight float64, isLast bool) {",
    "func (rsrc *raidSimResultCombiner) combineAuraMetrics(base *proto.AuraMetrics, add *proto.AuraMetrics, weight float64, isLast bool) {\n\tif rsrc.auraMoments == nil { rsrc.auraMoments = make(map[*proto.AuraMetrics]kfcMetricMoments) }\n\tmoments := rsrc.auraMoments[base].merge(kfcMetricMomentsFromSummary(add.AggregatorData.N, add.UptimeSecondsAvg, add.UptimeSecondsStdev))\n\trsrc.auraMoments[base] = moments",
  );
  concurrent = replaceOnce(
    concurrent,
    "\t\tbase.UptimeSecondsStdev = math.Sqrt(base.AggregatorData.SumSq/float64(base.AggregatorData.N) - base.UptimeSecondsAvg*base.UptimeSecondsAvg)",
    '\t\tif moments.n != int(base.AggregatorData.N) { panic("Inconsistent combined aura sample counts") }\n\t\tbase.UptimeSecondsAvg = moments.meanOrNaN()\n\t\tbase.UptimeSecondsStdev = moments.stdev()\n\t\tdelete(rsrc.auraMoments, base)',
  );
  concurrent = replaceOnce(
    concurrent,
    "func (rsrc *raidSimResultCombiner) SetBaseResult(baseRsr *proto.RaidSimResult) {",
    "func (rsrc *raidSimResultCombiner) SetBaseResult(baseRsr *proto.RaidSimResult) {\n\trsrc.distributionMoments = nil\n\trsrc.auraMoments = nil",
  );
  return { utils, concurrent };
}
