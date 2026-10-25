package holy

import (
	"fmt"
	"math"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
)

type kfcPaladinWorkloadRank struct {
	Root          int32
	Family        string
	RequiredLevel int
}

// KFC_PALADIN_WORKLOAD_RANKS

func validateKFCPaladinWorkloadRequest(player *proto.Player) error {
	if player.Buffs != nil && (player.Buffs.Innervates != 0 || player.Buffs.PowerInfusions != 0) {
		return fmt.Errorf("external healing resource cooldowns need a separately reviewed policy")
	}
	options := player.GetHolyPaladin().GetOptions()
	if options != nil && (options.PrimarySeal != proto.PaladinSeal_NoSeal || options.IsUsingJudgementStopAttack || options.RighteousFury || options.SealOfFuryShieldDurationSeconds != nil) {
		return fmt.Errorf("offensive or tank Paladin options are outside the healing workload")
	}
	return nil
}

// KFCPaladinHealingRankPolicy declares a sensitivity, not a measured server formula.
type KFCPaladinHealingRankPolicy struct {
	Schema                  string  `json:"schema"`
	ID                      string  `json:"id"`
	Kind                    string  `json:"kind"`
	FullScalingGap          int     `json:"fullScalingGap"`
	CoefficientLossPerLevel float64 `json:"coefficientLossPerLevel"`
	ClassProcMode           string  `json:"classProcMode"`
}

type kfcPaladinRankPolicyState struct {
	policy  KFCPaladinHealingRankPolicy
	factors map[int32]float64
}

func (policy KFCPaladinHealingRankPolicy) Validate() error {
	if policy.Schema != "kfc-paladin-rank-sensitivity.v1" || len(policy.ID) == 0 || len(policy.ID) > 100 ||
		policy.FullScalingGap < 0 || policy.FullScalingGap > 60 ||
		math.IsNaN(policy.CoefficientLossPerLevel) || math.IsInf(policy.CoefficientLossPerLevel, 0) ||
		policy.CoefficientLossPerLevel < 0 || policy.CoefficientLossPerLevel > 1 ||
		(policy.ClassProcMode != "unchanged" && policy.ClassProcMode != "coefficient-factor") {
		return fmt.Errorf("invalid Paladin rank-sensitivity policy")
	}
	switch policy.Kind {
	case "unscaled-reference":
		if policy.FullScalingGap != 0 || policy.CoefficientLossPerLevel != 0 || policy.ClassProcMode != "unchanged" {
			return fmt.Errorf("unscaled Paladin reference must preserve coefficients and class procs")
		}
	case "level-distance-sensitivity":
		if policy.CoefficientLossPerLevel <= 0 {
			return fmt.Errorf("Paladin rank sensitivity needs positive coefficient loss")
		}
	default:
		return fmt.Errorf("unknown Paladin rank-sensitivity kind")
	}
	return nil
}

func (holy *HolyPaladin) ConfigureKFCPaladinHealingRankScaling(policy KFCPaladinHealingRankPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	if holy.KFCRankPolicy != nil || holy.Hardcast.Expires > 0 || holy.GCD.ReadyAt() > 0 {
		return fmt.Errorf("Paladin rank sensitivity requires a fresh actor")
	}
	for _, spell := range holy.Spellbook {
		for _, metrics := range spell.SpellMetrics {
			if metrics.Casts > 0 || metrics.Ticks > 0 || metrics.CritTicks > 0 {
				return fmt.Errorf("Paladin rank sensitivity cannot change after a cast")
			}
		}
	}
	factors := make(map[int32]float64)
	for _, rank := range kfcPaladinWorkloadRanks {
		gap := max(0, int(holy.Level)-rank.RequiredLevel-policy.FullScalingGap)
		factors[rank.Root] = min(1, max(0, 1-float64(gap)*policy.CoefficientLossPerLevel))
	}
	for _, spell := range holy.Spellbook {
		if rank, exists := kfcPaladinWorkloadRanks[spell.ActionID.SpellID]; exists {
			spell.BonusCoefficient *= factors[rank.Root]
		}
	}
	holy.KFCRankPolicy = &kfcPaladinRankPolicyState{policy: policy, factors: factors}
	return nil
}

func (holy *HolyPaladin) kfcRankProcFactor(id int32) float64 {
	if holy.KFCRankPolicy == nil || holy.KFCRankPolicy.policy.ClassProcMode == "unchanged" {
		return 1
	}
	rank, known := kfcPaladinWorkloadRanks[id]
	if !known {
		panic(fmt.Sprintf("unknown Paladin healing proc rank %d", id))
	}
	return holy.KFCRankPolicy.factors[rank.Root]
}

func (holy *HolyPaladin) kfcRankProc(sim *core.Simulation, id int32) bool {
	factor := holy.kfcRankProcFactor(id)
	return factor >= 1 || (factor > 0 && sim.Proc(factor, "Paladin rank-sensitive class proc"))
}

func (holy *HolyPaladin) kfcPaladinWorkloadSpell(id int32) (*core.Spell, error) {
	if !kfcPaladinPreRaidRoots[id] {
		return nil, fmt.Errorf("Paladin priority %d is outside the declared pre-raid domain", id)
	}
	spell := holy.GetSpell(core.ActionID{SpellID: id})
	if spell == nil || kfcPaladinWorkloadRanks[id].RequiredLevel > int(holy.Level) {
		return nil, fmt.Errorf("Paladin healing rank %d is not owned", id)
	}
	return spell, nil
}

func (holy *HolyPaladin) validateKFCPaladinPriority(priority KFCPaladinHealingPriority) error {
	if _, err := holy.kfcPaladinWorkloadSpell(priority.SpellID); err != nil {
		return err
	}
	family := kfcPaladinWorkloadRanks[priority.SpellID].Family
	if priority.MinimumPartyTargets < 0 || priority.MinimumPartyTargets > 5 || !kfcFinite(priority.MinimumPartyMissingHealth) || priority.MinimumPartyMissingHealth < 0 || priority.MinimumPartyMissingHealth > 5000000 {
		return fmt.Errorf("invalid Paladin party-demand threshold")
	}
	if (priority.MaintainVigil || priority.MinimumPartyTargets > 0 || priority.MinimumPartyMissingHealth > 0) && family != "lights-vigil" {
		return fmt.Errorf("Vigil maintenance and party demand require a Vigil cast root")
	}
	if priority.RequireVigil && family != "holy-shock" {
		return fmt.Errorf("a marked-target requirement needs Holy Shock")
	}
	return nil
}

func (holy *HolyPaladin) kfcPaladinPriorityTarget(sim *core.Simulation, priority KFCPaladinHealingPriority) *core.Unit {
	var selected *core.Unit
	for _, unit := range holy.Env.Raid.AllPlayerUnits {
		missing := unit.MaxHealth() - unit.CurrentHealth()
		if !holy.kfcValidHealingTarget(unit, 40) || missing < priority.MinimumMissingHealth || (priority.RaidIndex >= 0 && unit.Index != priority.RaidIndex) {
			continue
		}
		party := holy.Env.Raid.GetPlayerParty(unit)
		mark := holy.KFCHealing.marks[party.Index]
		active := mark != nil && mark.aura.IsActive()
		if priority.MaintainVigil && active {
			continue
		}
		if priority.RequireVigil && (!active || mark.aura.Unit != unit) {
			continue
		}
		if priority.MinimumPartyTargets > 0 || priority.MinimumPartyMissingHealth > 0 {
			injured, deficit := 0, 0.0
			for _, agent := range party.Players {
				recipient := &agent.GetCharacter().Unit
				if !holy.kfcLiveFriendly(recipient) || !holy.kfcFriendlyInRange(unit, recipient, 40) {
					continue
				}
				amount := recipient.MaxHealth() - recipient.CurrentHealth()
				if amount > 0 {
					injured++
					deficit += amount
				}
			}
			if injured < priority.MinimumPartyTargets || deficit < priority.MinimumPartyMissingHealth {
				continue
			}
		}
		if selected == nil || unit.CurrentHealthPercent() < selected.CurrentHealthPercent() ||
			(unit.CurrentHealthPercent() == selected.CurrentHealthPercent() && unit.Index < selected.Index) {
			selected = unit
		}
	}
	return selected
}

func (holy *HolyPaladin) validateKFCPaladinFavor(frame KFCPaladinHealingWorkload) error {
	if frame.UseDivineFavor && holy.GetSpell(core.ActionID{SpellID: 20216}) == nil {
		return fmt.Errorf("requested Divine Favor is not owned")
	}
	if !frame.UseDivineFavor && frame.DivineFavorMinimumBaseCost != 0 {
		return fmt.Errorf("inactive Divine Favor cannot declare a minimum cost")
	}
	return nil
}

func (holy *HolyPaladin) useKFCPaladinFavor(sim *core.Simulation, frame KFCPaladinHealingWorkload, spell *core.Spell) {
	if !frame.UseDivineFavor || kfcPaladinWorkloadRanks[spell.ActionID.SpellID].Family == "lights-vigil" || spell.Cost == nil || spell.Cost.BaseCost < frame.DivineFavorMinimumBaseCost {
		return
	}
	favor := holy.GetSpell(core.ActionID{SpellID: 20216})
	if favor != nil && favor.Cost != nil && spell.Cost.GetCurrentCost()+favor.Cost.GetCurrentCost() <= holy.CurrentMana() && favor.CanCast(sim, &holy.Unit) {
		favor.Cast(sim, &holy.Unit)
	}
}

func (healer *HolyPaladin) registerKFCPaladinDamageTracking() {
	for _, unit := range healer.Env.Raid.AllUnits {
		if unit.GetAura(core.ChanceOfDeathAuraLabel) != nil || unit.GetAura("Healing workload health receiver") != nil {
			continue
		}
		receive := func(_ *core.Aura, sim *core.Simulation, _ *core.Spell, result *core.SpellResult) {
			if result.Damage <= 0 || unit.CurrentHealth() <= 0 || !unit.IsEnabled() {
				return
			}
			unit.RemoveHealth(sim, result.Damage)
			if unit.CurrentHealth() <= 0 {
				unit.Metrics.Died = true
				unit.InterruptCast(sim)
			}
		}
		core.MakePermanent(unit.RegisterAura(core.Aura{Label: "Healing workload health receiver", OnSpellHitTaken: receive, OnPeriodicDamageTaken: receive}))
	}
}

func (holy *HolyPaladin) kfcPaladinIlluminationMetrics() *core.ResourceMetrics {
	if holy.KFCIlluminationMetrics == nil {
		holy.KFCIlluminationMetrics = holy.NewManaMetrics(core.ActionID{SpellID: 20210})
	}
	return holy.KFCIlluminationMetrics
}
