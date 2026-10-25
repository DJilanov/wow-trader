package holy

import (
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/paladin"
	gproto "google.golang.org/protobuf/proto"
)

type kfcPaladinActiveRank struct {
	Data                   kfcPaladinHealingRank
	HealID, MarkID         int32
	Range, Radius          float64
	CooldownMs, DurationMs int
}

// KFC_PALADIN_ACTIVE_VALUES

type KFCPaladinFriendlyPosition struct{ X, Y float64 }
type KFCPaladinVigilRefundMode string

const (
	KFCPaladinVigilNoRefund     KFCPaladinVigilRefundMode = "none"
	KFCPaladinVigilSingleRefund KFCPaladinVigilRefundMode = "once-per-cast"
	KFCPaladinVigilMultiRefund  KFCPaladinVigilRefundMode = "per-critical-recipient"
)

type kfcPaladinVigilMark struct {
	aura *core.Aura
	heal *core.Spell
	rank kfcPaladinActiveRank
}

type kfcPaladinActiveState struct {
	positions map[int32]KFCPaladinFriendlyPosition
	marks     map[int]*kfcPaladinVigilMark
	refund    KFCPaladinVigilRefundMode
	infusion  *core.Aura
	favor     *core.Aura
}

func (holy *HolyPaladin) validateKFCActiveTalents() {
	if holy.Talents.InfusionOfLight < 0 || holy.Talents.InfusionOfLight > 2 {
		panic("Invalid Paladin Infusion rank")
	}
	if holy.Talents.LightsVigil && !holy.Talents.HolyShock {
		panic("Light's Vigil requires Holy Shock")
	}
	original := holy.Talents
	passives := gproto.Clone(original).(*proto.PaladinTalents)
	passives.HolyShock, passives.LightsVigil, passives.DivineFavor = false, false, false
	passives.InfusionOfLight = 0
	holy.Talents = passives
	defer func() { holy.Talents = original }()
	holy.validateKFCPassiveTalents()
}

func (holy *HolyPaladin) initializeKFCActiveParent() {
	holy.KFCHealing = &kfcPaladinActiveState{
		positions: make(map[int32]KFCPaladinFriendlyPosition),
		marks:     make(map[int]*kfcPaladinVigilMark),
	}
	for _, unit := range holy.Env.Raid.AllUnits {
		holy.KFCHealing.positions[unit.UnitIndex] = KFCPaladinFriendlyPosition{}
	}
	shock, vigil, favor := holy.Talents.HolyShock, holy.Talents.LightsVigil, holy.Talents.DivineFavor
	holy.Talents.HolyShock, holy.Talents.LightsVigil, holy.Talents.DivineFavor = false, false, false
	defer func() {
		holy.Talents.HolyShock, holy.Talents.LightsVigil, holy.Talents.DivineFavor = shock, vigil, favor
	}()
	holy.Paladin.Initialize()
}

// ConfigureKFCPaladinActiveHealing supplies complete benchmark geometry and an explicit unverified Vigil policy.
func (holy *HolyPaladin) ConfigureKFCPaladinActiveHealing(positions map[int32]KFCPaladinFriendlyPosition, mode KFCPaladinVigilRefundMode) error {
	if mode != KFCPaladinVigilNoRefund && mode != KFCPaladinVigilSingleRefund && mode != KFCPaladinVigilMultiRefund {
		return fmt.Errorf("unknown Paladin Vigil refund policy")
	}
	if holy.KFCHealing == nil || len(positions) != len(holy.Env.Raid.AllUnits) {
		return fmt.Errorf("Paladin positions must cover every raid unit")
	}
	validated := make(map[int32]KFCPaladinFriendlyPosition, len(positions))
	for _, unit := range holy.Env.Raid.AllUnits {
		position, ok := positions[unit.UnitIndex]
		if !ok || math.IsNaN(position.X) || math.IsNaN(position.Y) || math.IsInf(position.X, 0) || math.IsInf(position.Y, 0) {
			return fmt.Errorf("invalid Paladin friendly position for %d", unit.UnitIndex)
		}
		validated[unit.UnitIndex] = position
	}
	holy.KFCHealing.positions, holy.KFCHealing.refund = validated, mode
	return nil
}

func (holy *HolyPaladin) kfcFriendlyInRange(from, to *core.Unit, distance float64) bool {
	left, hasLeft := holy.KFCHealing.positions[from.UnitIndex]
	right, hasRight := holy.KFCHealing.positions[to.UnitIndex]
	return hasLeft && hasRight && math.Hypot(left.X-right.X, left.Y-right.Y) <= distance
}

func (holy *HolyPaladin) kfcLiveFriendly(target *core.Unit) bool {
	return target != nil && !holy.IsOpponent(target) && target.HasHealthBar() && target.CurrentHealth() > 0 && holy.Env.Raid.GetPlayerFromUnit(target) != nil
}

func (holy *HolyPaladin) kfcValidHealingTarget(target *core.Unit, distance float64) bool {
	return holy.CurrentHealth() > 0 && holy.kfcLiveFriendly(target) && holy.kfcFriendlyInRange(&holy.Unit, target, distance)
}

func (holy *HolyPaladin) kfcProcActiveIllumination(sim *core.Simulation, cost float64) {
	if holy.Talents.Illumination > 0 && sim.Proc(kfcPaladinIlluminationChance[holy.Talents.Illumination], "Active healing Illumination") {
		holy.AddMana(sim, cost*kfcPaladinIlluminationRefund, holy.NewManaMetrics(core.ActionID{SpellID: 20210}))
	}
}

func (holy *HolyPaladin) registerKFCActiveHealing() {
	if holy.Talents.HolyShock {
		timer := holy.NewTimer()
		for _, rank := range kfcPaladinShockRanks {
			data := rank.Data
			if data.RequiredLevel > int(holy.Level) {
				continue
			}
			holy.RegisterSpell(core.SpellConfig{
				ActionID: core.ActionID{SpellID: data.ID}, SpellCode: paladin.SpellCode_PaladinHolyShock,
				SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing,
				Flags: core.SpellFlagHelpful | core.SpellFlagAPL, Rank: data.Rank, RequiredLevel: data.RequiredLevel,
				ManaCost: core.ManaCostOptions{FlatCost: data.Mana},
				Cast: core.CastConfig{DefaultCast: core.Cast{GCD: time.Duration(data.GCDMs) * time.Millisecond},
					CD: core.Cooldown{Timer: timer, Duration: time.Duration(rank.CooldownMs) * time.Millisecond}},
				DamageMultiplier: kfcPaladinHealingLight[holy.Talents.HealingLight], ThreatMultiplier: 1, BonusCoefficient: data.Coefficient,
				BonusCritRating: 2 * float64(holy.Talents.HolyPower) * core.SpellCritRatingPerCritChance,
				ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool {
					return holy.kfcValidHealingTarget(target, rank.Range)
				},
				ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
					low, high := data.bounds(int(holy.Level))
					result := spell.CalcAndDealHealing(sim, target, sim.Roll(low, high), spell.OutcomeHealingCrit)
					if result.DidCrit() {
						holy.kfcProcActiveIllumination(sim, data.Mana)
					}
					holy.consumeKFCVigil(sim, target, spell)
				},
			})
		}
	}
	if holy.Talents.LightsVigil {
		holy.registerKFCVigil()
	}
	if holy.Talents.InfusionOfLight > 0 {
		holy.registerKFCInfusion()
	}
	if holy.Talents.DivineFavor {
		holy.registerKFCFavor()
	}
}

func (holy *HolyPaladin) registerKFCVigil() {
	timer := holy.NewTimer()
	for _, rank := range kfcPaladinVigilRanks {
		data := rank.Data
		if data.RequiredLevel > int(holy.Level) {
			continue
		}
		heal := holy.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{SpellID: rank.HealID}, SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic,
			ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
			Rank: data.Rank, RequiredLevel: data.RequiredLevel, BonusCoefficient: data.Coefficient, DamageMultiplier: 1, ThreatMultiplier: 1,
			ExtraCastCondition: func(_ *core.Simulation, _ *core.Unit) bool { return false },
		})
		marks := make(map[int32]*kfcPaladinVigilMark)
		for _, unit := range holy.Env.Raid.AllUnits {
			party := holy.Env.Raid.GetPlayerParty(unit)
			if party.Size() == 0 {
				continue
			}
			mark := &kfcPaladinVigilMark{heal: heal, rank: rank}
			mark.aura = unit.GetOrRegisterAura(core.Aura{
				Label: fmt.Sprintf("Paladin friendly Vigil-%d-%d", holy.Index, data.Rank), ActionID: core.ActionID{SpellID: rank.MarkID, Tag: holy.Index},
				Duration: time.Duration(rank.DurationMs) * time.Millisecond,
				OnExpire: func(_ *core.Aura, _ *core.Simulation) {
					if holy.KFCHealing.marks[party.Index] == mark {
						delete(holy.KFCHealing.marks, party.Index)
					}
				},
			})
			marks[unit.UnitIndex] = mark
		}
		holy.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{SpellID: data.ID}, SpellCode: paladin.SpellCode_PaladinLightsVigil,
			SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskEmpty,
			Flags: core.SpellFlagHelpful | core.SpellFlagAPL, Rank: data.Rank, RequiredLevel: data.RequiredLevel,
			ManaCost: core.ManaCostOptions{FlatCost: data.Mana},
			Cast: core.CastConfig{DefaultCast: core.Cast{GCD: time.Duration(data.GCDMs) * time.Millisecond, CastTime: time.Duration(data.CastMs) * time.Millisecond},
				CD: core.Cooldown{Timer: timer, Duration: time.Duration(rank.CooldownMs) * time.Millisecond}},
			ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool {
				return holy.KFCHealing.refund != "" && holy.kfcValidHealingTarget(target, rank.Range) && marks[target.UnitIndex] != nil
			},
			ApplyEffects: func(sim *core.Simulation, target *core.Unit, _ *core.Spell) {
				if !holy.kfcValidHealingTarget(target, rank.Range) {
					return
				}
				party := holy.Env.Raid.GetPlayerParty(target)
				if old := holy.KFCHealing.marks[party.Index]; old != nil {
					old.aura.Deactivate(sim)
				}
				mark := marks[target.UnitIndex]
				mark.aura.Activate(sim)
				holy.KFCHealing.marks[party.Index] = mark
			},
		})
	}
}

func (holy *HolyPaladin) consumeKFCVigil(sim *core.Simulation, target *core.Unit, shock *core.Spell) {
	party := holy.Env.Raid.GetPlayerParty(target)
	mark := holy.KFCHealing.marks[party.Index]
	if mark == nil || !mark.aura.IsActive() || mark.aura.Unit != target {
		return
	}
	mark.aura.Deactivate(sim)
	low, high := mark.rank.Data.bounds(int(holy.Level))
	criticals := 0
	for _, agent := range party.Players {
		recipient := &agent.GetCharacter().Unit
		if !holy.kfcLiveFriendly(recipient) || !holy.kfcFriendlyInRange(target, recipient, mark.rank.Radius) {
			continue
		}
		result := mark.heal.CalcAndDealHealing(sim, recipient, sim.Roll(low, high), mark.heal.OutcomeHealingCrit)
		if result.DidCrit() {
			criticals++
		}
	}
	if holy.KFCHealing.refund == KFCPaladinVigilSingleRefund {
		criticals = min(1, criticals)
	} else if holy.KFCHealing.refund == KFCPaladinVigilNoRefund {
		criticals = 0
	}
	for index := 0; index < criticals; index++ {
		holy.kfcProcActiveIllumination(sim, mark.rank.Data.Mana)
	}
	shock.CD.Timer.Reset()
}

func (holy *HolyPaladin) registerKFCInfusion() {
	var affected []*core.Spell
	holy.OnSpellRegistered(func(spell *core.Spell) {
		for _, rank := range kfcPaladinHealingRanks {
			if rank.ID == spell.ActionID.SpellID && rank.Coefficient == 0.714 {
				affected = append(affected, spell)
			}
		}
	})
	reduction := time.Duration(kfcPaladinInfusionReductionMs[holy.Talents.InfusionOfLight]) * time.Millisecond
	infusion := holy.RegisterAura(core.Aura{
		Label: "Paladin healing Infusion", ActionID: core.ActionID{SpellID: 437063}, Duration: time.Duration(kfcPaladinInfusionDurationMs) * time.Millisecond,
		OnGain: func(_ *core.Aura, _ *core.Simulation) {
			for _, spell := range affected {
				spell.DefaultCast.CastTime -= reduction
			}
		},
		OnExpire: func(_ *core.Aura, _ *core.Simulation) {
			for _, spell := range affected {
				spell.DefaultCast.CastTime += reduction
			}
		},
		OnCastComplete: func(aura *core.Aura, sim *core.Simulation, spell *core.Spell) {
			for _, value := range affected {
				if value == spell {
					aura.Deactivate(sim)
				}
			}
		},
	})
	holy.KFCHealing.infusion = infusion
	core.MakePermanent(holy.RegisterAura(core.Aura{
		Label: "Paladin healing Infusion trigger",
		OnHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			if !result.DidCrit() {
				return
			}
			if spell.SpellCode == paladin.SpellCode_PaladinHolyShock {
				infusion.Activate(sim)
				return
			}
			for _, rank := range kfcPaladinHealingRanks {
				if rank.ID == spell.ActionID.SpellID && rank.Coefficient == 0.429 {
					infusion.Activate(sim)
				}
			}
		},
	}))
}

func (holy *HolyPaladin) registerKFCFavor() {
	var affected []*core.Spell
	holy.OnSpellRegistered(func(spell *core.Spell) {
		for _, rank := range kfcPaladinHealingRanks {
			if rank.ID == spell.ActionID.SpellID {
				affected = append(affected, spell)
				return
			}
		}
		if spell.SpellCode == paladin.SpellCode_PaladinHolyShock {
			affected = append(affected, spell)
		}
	})
	favor := holy.RegisterAura(core.Aura{
		Label: "Paladin healing Divine Favor", ActionID: core.ActionID{SpellID: 20216}, Duration: core.NeverExpires,
		OnGain: func(_ *core.Aura, _ *core.Simulation) {
			for _, spell := range affected {
				spell.BonusCritRating += 100 * core.SpellCritRatingPerCritChance
			}
		},
		OnExpire: func(_ *core.Aura, _ *core.Simulation) {
			for _, spell := range affected {
				spell.BonusCritRating -= 100 * core.SpellCritRatingPerCritChance
			}
		},
		OnHealDealt: func(aura *core.Aura, sim *core.Simulation, spell *core.Spell, _ *core.SpellResult) {
			for _, value := range affected {
				if value == spell {
					aura.Deactivate(sim)
				}
			}
		},
	})
	holy.KFCHealing.favor = favor
	holy.RegisterSpell(core.SpellConfig{
		ActionID: core.ActionID{SpellID: 20216}, SpellSchool: core.SpellSchoolHoly,
		Flags:    core.SpellFlagHelpful | core.SpellFlagAPL | core.SpellFlagNoOnCastComplete,
		ManaCost: core.ManaCostOptions{BaseCost: kfcPaladinFavorCostFraction},
		Cast:     core.CastConfig{CD: core.Cooldown{Timer: holy.NewTimer(), Duration: time.Duration(kfcPaladinFavorCooldownMs) * time.Millisecond}},
		ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool {
			return holy.CurrentHealth() > 0 && target == &holy.Unit && !favor.IsActive()
		},
		ApplyEffects: func(sim *core.Simulation, _ *core.Unit, _ *core.Spell) { favor.Activate(sim) },
	})
}
