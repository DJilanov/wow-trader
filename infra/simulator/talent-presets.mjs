import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeTalents, talentProblem, summarizeTalents } from "./talent-search.mjs";
import { statisticallyBetter } from "./prebis-pool.mjs";

export function patchFuryTalentPreset(source, review) {
  const marker = `export const TalentsP1DPS = PresetUtils.makePresetTalents('Fury 18/33/0', SavedTalents.create({ talentsString: '${review.original.talents}' }));`;
  if (source.split(marker).length !== 2) throw new Error("Upstream Fury default talent contract changed");
  const allocation = review.winner.allocation.map((tree) => tree.points).join("/");
  const replacement = `export const TalentsP1DPS = PresetUtils.makePresetTalents('Fury ${allocation} · single-target tested', SavedTalents.create({ talentsString: '${review.winner.talents}' }));\nexport const TalentsFuryIncomingDamage = PresetUtils.makePresetTalents('Fury 18/33/0 · incoming-damage alternative', SavedTalents.create({ talentsString: '${review.original.talents}' }));`;
  let result = source.replace(marker, replacement);
  const list = "[TalentsP1DPS, TalentsFurySpearing, TalentsArms, TalentsFuryTwoHand]";
  if (result.split(list).length !== 2) throw new Error("Upstream Fury talent list changed");
  result = result.replace(list, "[TalentsP1DPS, TalentsFuryIncomingDamage, TalentsFurySpearing, TalentsArms, TalentsFuryTwoHand]");
  const aoe = "gear: GearFury, talents: TalentsP1DPS, rotation: APLFuryAoE";
  if (result.split(aoe).length !== 2) throw new Error("Upstream Fury AoE build changed");
  return result.replace(aoe, "gear: GearFury, talents: TalentsFuryIncomingDamage, rotation: APLFuryAoE");
}

export async function prepareTalentPresets(repo, upstream) {
  const review = JSON.parse(await readFile(join(repo, "infra/simulator/fury-talent-review.json"), "utf8"));
  const trees = JSON.parse(await readFile(join(upstream, "ui/core/talents/trees/warrior.json"), "utf8"));
  const checksum = createHash("sha256").update(JSON.stringify(trees)).digest("hex");
  if (review.profile !== "warrior/fury" || review.treeSha256 !== checksum || !review.validated || review.validation.length !== 2 || new Set(review.validation.map((entry) => entry.seed)).size !== 2 || !review.validation.every((entry) => entry.baseline.iterations >= 20000 && entry.candidate.iterations >= 20000 && statisticallyBetter(entry.candidate, entry.baseline))) throw new Error("Unvalidated or stale Fury talent evidence");
  const problem = talentProblem(trees, decodeTalents(trees, review.winner.talents));
  if (problem) throw new Error(problem);
  if (JSON.stringify(summarizeTalents(trees, review.winner.talents)) !== JSON.stringify(review.winner.allocation)) throw new Error("Fury talent evidence allocation mismatch");
  const path = join(upstream, "ui/warrior/presets.ts");
  await writeFile(path, patchFuryTalentPreset(await readFile(path, "utf8"), review));
  await writeFile(join(upstream, "ui/warrior/apls/forever_fury.apl.json"), JSON.stringify(review.winner.rotation.value, null, 2) + "\n");
  await writeFile(join(upstream, "ui/core/kfc_talent_review.json"), JSON.stringify({ profile: review.profile, allocation: review.winner.allocation, talents: review.winner.talents, rotation: review.winner.rotation.name, notice: review.notice, validation: review.validation.map((entry) => ({ seed: entry.seed, baselineDps: entry.baseline.dps, optimizedDps: entry.candidate.dps, iterations: entry.candidate.iterations })) }));
}
