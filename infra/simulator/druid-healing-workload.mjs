import assert from "node:assert/strict";

function replaceOnce(source, before, after) {
  assert.equal(
    source.split(before).length,
    2,
    "Missing or ambiguous Druid workload anchor: " + before,
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

/** Install the benchmark health receiver before the first simulation iteration.
 * @param {string} source @returns {string}
 */
export function renderDruidHealingDamageTracking(source) {
  const marker = "\tresto.familySpells = make(map[string][]*core.Spell)";
  return replaceOnce(source, marker, "\tresto.registerKFCDruidDamageTracking()\n" + marker);
}

/** Derive the Druid controller from the authenticated common healing loop.
 * @param {{workload:string,job:string,cooldowns:string}} source
 * @returns {{workload:string,job:string,cooldowns:string}}
 */
export function renderDruidHealingWorkload(source) {
  const rename = (text) =>
    text
      .replace("package healing", "package restoration")
      .replaceAll("KFCHealing", "KFCDruidHealing")
      .replaceAll("HealingPriest", "RestorationDruid")
      .replaceAll("kfc-healing-", "kfc-druid-healing-")
      .replaceAll("KeepRenew", "KeepHot")
      .replaceAll("keepRenew", "keepHot");
  let workload = rename(source.workload);
  workload = workload.replaceAll(
    "ConfigureKFCDruidHealingBenchmarkHealth",
    "ConfigureKFCHealingBenchmarkHealth",
  );
  workload = replaceOnce(workload, '\n\t"github.com/wowsims/classic/sim/priest"', "");
  const scaling =
    '\tRankScaling *priest.KFCDruidHealingRankScalingPolicy `json:"rankScaling,omitempty"`\n';
  assert.equal(workload.split(scaling).length, 3);
  workload = workload.replaceAll(scaling, "");
  workload = replaceSection(
    workload,
    "\tUseInnerFocus ",
    "\n}\ntype KFCDruidHealingWorkloadResult",
    `\tHealingPolicy KFCDruidHealingPolicy \`json:"healingPolicy"\`
  InnervateMinimumMissingMana *float64 \`json:"innervateMinimumMissingMana,omitempty"\`
  InnervateRequireHealingDemand bool \`json:"innervateRequireHealingDemand"\`
  UseNaturesSwiftness bool \`json:"useNaturesSwiftness"\`
  NaturesSwiftnessMinimumMissingHealth float64 \`json:"naturesSwiftnessMinimumMissingHealth"\``,
  );
  workload = replaceOnce(
    workload,
    " || !kfcFinite(frame.InnerFocusMinimumCost) || frame.InnerFocusMinimumCost < 0",
    "",
  );
  workload = workload.replaceAll("proto.Class_ClassPriest", "proto.Class_ClassDruid");
  workload = replaceOnce(workload, "player.GetRestorationDruid()", "player.GetRestorationDruid()");
  workload = workload.replace("requires one Priest", "requires one Druid");
  workload = replaceSection(
    workload,
    "\tif frame.RankScaling != nil {\n\t\tif err",
    "\tpositions := map[int32]priest.KFCFriendlyPosition{}",
    "",
  );
  workload = workload.replaceAll("priest.KFCFriendlyPosition", "KFCDruidFriendlyPosition");
  workload = replaceOnce(
    workload,
    "healer.ConfigureKFCFriendlyPositions(positions)",
    "healer.ConfigureKFCDruidHealing(positions, frame.HealingPolicy)",
  );
  workload = replaceSection(
    workload,
    "\t\t_, spellError := healer.KFCDruidHealingSpellReady",
    "\n\tif frame.UseInnerFocus",
    `    spell, spellError := healer.kfcDruidWorkloadSpell(priority.SpellID)
    if spellError != nil { return nil, spellError }
    family := kfcDruidFamilies[spell.ActionID.SpellID]
    if priority.KeepHot && family != "rejuvenation" && family != "regrowth" && family != "wild-growth" {
      return nil, fmt.Errorf("keepHot requires a registered per-target HoT")
    }
  }`,
  );
  workload = replaceSection(
    workload,
    "\n\tif frame.UseInnerFocus",
    "\n\tif err = healer.validateKFCDruidHealingCooldowns",
    `
  if err = healer.validateKFCDruidWorkloadPolicies(player, frame, request.Raid); err != nil { return nil, err }`,
  );
  workload = replaceOnce(
    workload,
    "\tif frame.RankScaling != nil { policy := *frame.RankScaling; output.RankScaling = &policy }\n",
    "",
  );
  workload = replaceSection(
    workload,
    "\t\t\t\t\tif healer.CurrentHealth() > 0 && frame.UsePowerInfusion",
    "\n\t\t\t\t\tfor _, priority := range frame.Priorities",
    `          if healer.useKFCDruidInnervate(sim, frame) { next = max(next, healer.GCD.ReadyAt()) }`,
  );
  workload = replaceOnce(
    workload,
    "if healer.CurrentHealth() <= 0 {\n\t\t\t\t\t\t\tbreak",
    "if healer.CurrentHealth() <= 0 || !healer.GCD.IsReady(sim) {\n\t\t\t\t\t\t\tbreak",
  );
  workload = replaceSection(
    workload,
    "\t\t\t\t\t\tvar target *core.Unit",
    "\n\t\t\t\t\t\tif spell.Cost != nil && spell.Cost.GetCurrentCost() > healer.CurrentMana()",
    `            spell := healer.GetSpell(core.ActionID{SpellID: priority.SpellID})
            target := healer.kfcDruidPriorityTarget(sim, priority)
            if target == nil { continue }
            readyWithoutMana := spell.IsReady(sim) && !healer.PseudoStats.Stunned && (spell.DefaultCast.CastTime == 0 || !healer.IsMoving())
            if readyWithoutMana && (spell.Cost == nil || spell.Cost.GetCurrentCost() <= healer.CurrentMana()) {
              healer.useKFCDruidSwiftness(sim, frame, spell, target)
            }`,
  );
  workload = replaceOnce(
    workload,
    "if spell.Cost != nil && spell.Cost.GetCurrentCost() > healer.CurrentMana()",
    "if readyWithoutMana && spell.Cost != nil && spell.Cost.GetCurrentCost() > healer.CurrentMana()",
  );
  let cooldowns = rename(source.cooldowns);
  cooldowns = replaceSection(
    cooldowns,
    "func (healer *RestorationDruid) hasKFCDruidHealingDemand",
    "func (healer *RestorationDruid) useKFCDruidHealingCooldowns",
    `func (healer *RestorationDruid) hasKFCDruidHealingDemand(sim *core.Simulation, frame KFCDruidHealingWorkload) bool {
    for _, priority := range frame.Priorities { if healer.kfcDruidPriorityTarget(sim, priority) != nil { return true } }
    return false
  }

`,
  );
  cooldowns = replaceOnce(cooldowns, "&healer.Character", "healer.GetCharacter()");
  return { workload, job: rename(source.job), cooldowns };
}
