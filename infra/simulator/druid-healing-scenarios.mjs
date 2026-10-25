import assert from "node:assert/strict";
import { createDruidHealingCandidateWorkload } from "./druid-healing-candidate.mjs";

/** Build the fixed 400-DPS comparison with the reviewed Priest target geometry.
 * @param {object} input @param {{layout:'stacked'|'spread',durationSeconds:180|300,kind:'tank'|'group'|'burst'}} variant
 * @returns {object}
 */
export function createDruidHealingScenarioWorkload(input, variant) {
  assert(["stacked", "spread"].includes(variant.layout));
  assert([180, 300].includes(variant.durationSeconds));
  const frame = createDruidHealingCandidateWorkload({
    ...input,
    kind: variant.kind,
    pressure: 400,
    durationSeconds: variant.durationSeconds,
    spread: false,
  });
  if (variant.layout === "spread") {
    frame.name += "-spread";
    for (const target of frame.targets) target.x = [0, 12, 18, 24, 30][target.raidIndex];
  }
  return frame;
}
