import assert from "node:assert/strict";
import { extractPaladinHealingBaseline } from "./paladin-healing-model.mjs";
import { extractPaladinHealingActives } from "./paladin-healing-actives.mjs";
import {
  createPaladinHealingSpellPolicy,
  eligiblePaladinHealingRanks,
} from "./paladin-healing-eligibility.mjs";

function replaceOnce(source, before, after) {
  assert.equal(
    source.split(before).length,
    2,
    "Missing or ambiguous Paladin workload anchor: " + before,
  );
  return source.replace(before, after);
}
function replaceSection(source, begin, end, replacement) {
  assert.equal(source.split(begin).length, 2, begin);
  assert.equal(source.split(end).length, 2, end);
  const start = source.indexOf(begin),
    finish = source.indexOf(end, start);
  assert(finish > start);
  return source.slice(0, start) + replacement + source.slice(finish);
}

/** Derive the common authenticated controller without importing Priest spells or policies.
 * @param {{workload:string,job:string,cooldowns:string}} source
 * @returns {{workload:string,job:string,cooldowns:string}}
 */
export function renderPaladinHealingWorkload(source) {
  const rename = (text) =>
    text
      .replace("package healing", "package holy")
      .replaceAll("KFCHealing", "KFCPaladinHealing")
      .replaceAll("HealingPriest", "HolyPaladin")
      .replaceAll("kfc-healing-", "kfc-paladin-healing-");
  let workload = rename(source.workload);
  workload = replaceOnce(workload, '\n\t"github.com/wowsims/classic/sim/priest"', "");
  workload = workload.replaceAll(
    "*priest.KFCPaladinHealingRankScalingPolicy",
    "*KFCPaladinHealingRankPolicy",
  );
  assert(!workload.includes("priest.KFCPaladinHealingRankScalingPolicy"));
  workload = workload.replaceAll("priest.KFCFriendlyPosition", "KFCPaladinFriendlyPosition");
  workload = workload.replaceAll(
    "ConfigureKFCPaladinHealingBenchmarkHealth",
    "ConfigureKFCHealingBenchmarkHealth",
  );
  workload = replaceOnce(
    workload,
    '\tKeepRenew            bool    `json:"keepRenew"`',
    '\tMaintainVigil bool `json:"maintainVigil"`\n\tRequireVigil bool `json:"requireVigil"`\n\tMinimumPartyTargets int `json:"minimumPartyTargets"`\n\tMinimumPartyMissingHealth float64 `json:"minimumPartyMissingHealth"`',
  );
  workload = replaceSection(
    workload,
    "\tUseInnerFocus ",
    "\n}\ntype KFCPaladinHealingWorkloadResult",
    '\tAllowConditionalSpellCandidates bool `json:"allowConditionalSpellCandidates"`\n\tVigilRefundMode KFCPaladinVigilRefundMode `json:"vigilRefundMode"`\n\tUseDivineFavor bool `json:"useDivineFavor"`\n\tDivineFavorMinimumBaseCost float64 `json:"divineFavorMinimumBaseCost"`',
  );
  workload = replaceOnce(
    workload,
    "type KFCPaladinHealingWorkloadResult struct {",
    'type KFCPaladinHealingWorkloadResult struct {\n\tVigilRefundMode KFCPaladinVigilRefundMode `json:"vigilRefundMode"`',
  );
  workload = replaceOnce(
    workload,
    " || !kfcFinite(frame.InnerFocusMinimumCost) || frame.InnerFocusMinimumCost < 0",
    " || !frame.AllowConditionalSpellCandidates || frame.RankScaling == nil || !kfcFinite(frame.DivineFavorMinimumBaseCost) || frame.DivineFavorMinimumBaseCost < 0 || frame.DivineFavorMinimumBaseCost > 1000000",
  );
  workload = workload.replaceAll("proto.Class_ClassPriest", "proto.Class_ClassPaladin");
  workload = replaceOnce(workload, "requires one Priest", "requires one Paladin");
  workload = replaceOnce(
    workload,
    "\tplayer.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}",
    "\tif err = validateKFCPaladinWorkloadRequest(player); err != nil { return nil, err }\n\tplayer.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}",
  );
  workload = replaceOnce(
    workload,
    "healer.ConfigureKFCFriendlyPositions(positions)",
    "healer.ConfigureKFCPaladinActiveHealing(positions, frame.VigilRefundMode)",
  );
  workload = replaceSection(
    workload,
    "\t\t_, spellError := healer.KFCPaladinHealingSpellReady",
    "\n\tif frame.UseInnerFocus",
    "\t\tif err = healer.validateKFCPaladinPriority(priority); err != nil { return nil, err }\n\t}",
  );
  workload = replaceSection(
    workload,
    "\n\tif frame.UseInnerFocus",
    "\n\tif err = healer.validateKFCPaladinHealingCooldowns",
    "\n\tif err = healer.validateKFCPaladinFavor(frame); err != nil { return nil, err }",
  );
  workload = replaceOnce(
    workload,
    "PlannedIncomingPostMitigationDamage: totalDamage}",
    "PlannedIncomingPostMitigationDamage: totalDamage, VigilRefundMode: frame.VigilRefundMode}",
  );
  workload = replaceSection(
    workload,
    "\t\t\t\t\tif healer.CurrentHealth() > 0 && frame.UsePowerInfusion",
    "\n\t\t\t\t\tfor _, priority := range frame.Priorities",
    "\t\t\t\t\tnext = max(next, healer.GCD.ReadyAt())",
  );
  workload = replaceOnce(
    workload,
    "if healer.CurrentHealth() <= 0 {\n\t\t\t\t\t\t\tbreak",
    "if healer.CurrentHealth() <= 0 || !healer.GCD.IsReady(sim) {\n\t\t\t\t\t\t\tbreak",
  );
  workload = replaceSection(
    workload,
    "\t\t\t\t\t\tvar target *core.Unit",
    "\n\t\t\t\t\t\treadyWithoutMana :=",
    "\t\t\t\t\t\tspell := healer.GetSpell(core.ActionID{SpellID: priority.SpellID})\n\t\t\t\t\t\ttarget := healer.kfcPaladinPriorityTarget(sim, priority)\n\t\t\t\t\t\tif target == nil { continue }",
  );
  workload = replaceSection(
    workload,
    "\t\t\t\t\t\tif frame.UseInnerFocus && readyWithoutMana",
    "\n\t\t\t\t\t\tif spell.Cost != nil",
    "\t\t\t\t\t\tif readyWithoutMana { healer.useKFCPaladinFavor(sim, frame, spell) }",
  );
  workload = replaceOnce(
    workload,
    "if spell.Cost != nil && spell.Cost.GetCurrentCost() > healer.CurrentMana()",
    "if readyWithoutMana && spell.Cost != nil && spell.Cost.GetCurrentCost() > healer.CurrentMana()",
  );
  let cooldowns = rename(source.cooldowns);
  cooldowns = replaceOnce(cooldowns, "&healer.Character", "healer.GetCharacter()");
  cooldowns = replaceSection(
    cooldowns,
    "func (healer *HolyPaladin) hasKFCPaladinHealingDemand",
    "\nfunc (healer *HolyPaladin) useKFCPaladinHealingCooldowns",
    `func (healer *HolyPaladin) hasKFCPaladinHealingDemand(sim *core.Simulation, frame KFCPaladinHealingWorkload) bool {
  for _, priority := range frame.Priorities {
    spell := healer.GetSpell(core.ActionID{SpellID: priority.SpellID})
    if spell.IsReady(sim) && healer.kfcPaladinPriorityTarget(sim, priority) != nil { return true }
  }
  return false
}
`,
  );
  for (const text of [workload, cooldowns]) {
    for (const forbidden of [
      "priest.",
      "HealingPriest",
      "InnerFocus",
      "PowerInfusion",
      "KeepRenew",
    ])
      assert(
        !text.includes(forbidden),
        "Unexpected Priest behavior in Paladin controller: " + forbidden,
      );
  }
  return { workload, cooldowns, job: rename(source.job) };
}

/** Render rank identities and the actual pre-raid allowed cast roots from authenticated evidence.
 * @param {{implementation:string,baseline:object,actives:object,books:object}} input @returns {string}
 */
export function renderPaladinHealingWorkloadRules({ implementation, baseline, actives, books }) {
  assert.equal(implementation.split("// KFC_PALADIN_WORKLOAD_RANKS").length, 2);
  const basic = extractPaladinHealingBaseline(baseline),
    active = extractPaladinHealingActives(actives),
    policy = createPaladinHealingSpellPolicy({ baseline, actives, books }),
    eligible = eligiblePaladinHealingRanks(policy, {
      level: 60,
      talents: { holyShock: true, lightsVigil: true },
      allowConditionalCandidates: true,
    }),
    rows = [
      ...basic.ranks.map((rank) => ({
        id: rank.id,
        root: rank.id,
        family: rank.family,
        level: rank.requiredLevel,
      })),
      ...active.shock.map((rank) => ({
        id: rank.id,
        root: rank.id,
        family: "holy-shock",
        level: rank.heal.requiredLevel,
      })),
      ...active.vigil.flatMap((rank) =>
        [rank.id, rank.heal.id].map((id) => ({
          id,
          root: rank.id,
          family: "lights-vigil",
          level: rank.heal.requiredLevel,
        })),
      ),
    ];
  assert.equal(rows.length, 25);
  assert.equal(new Set(rows.map((row) => row.id)).size, 25);
  assert.equal(eligible.length, 21);
  return implementation.replace(
    "// KFC_PALADIN_WORKLOAD_RANKS",
    `var kfcPaladinWorkloadRanks = map[int32]kfcPaladinWorkloadRank{\n${rows.map((row) => `${row.id}:{Root:${row.root},Family:${JSON.stringify(row.family)},RequiredLevel:${row.level}},`).join("\n")}\n}\nvar kfcPaladinPreRaidRoots = map[int32]bool{${eligible.map((rank) => `${rank.spellId}:true`).join(",")}}`,
  );
}
