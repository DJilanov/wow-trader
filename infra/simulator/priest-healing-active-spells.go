package priest

import (
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
)

type KFCFriendlyPosition struct{ X, Y float64 }
type kfcActiveHealingRank struct {
	Data, Secondary                             kfcHealingRank
	PayloadID, ExcludedTargetAura               int32
	Range, Radius                               float64
	TravelSpeed, LaunchDelay                    float64
	ExcludeCaster                               bool
	ChannelPeriodMs, ChannelDurationMs, Charges int
}

// KFC_CLIENT_ACTIVE_HEALING

// ConfigureKFCFriendlyPositions declares independent friendly coordinates for this benchmark.
func (priest *Priest) ConfigureKFCFriendlyPositions(positions map[int32]KFCFriendlyPosition) error {
	if len(positions) != len(priest.Env.Raid.AllUnits) {
		return fmt.Errorf("friendly positions must cover every raid unit")
	}
	validated := make(map[int32]KFCFriendlyPosition, len(positions))
	for _, unit := range priest.Env.Raid.AllUnits {
		position, ok := positions[unit.UnitIndex]
		if !ok || math.IsNaN(position.X) || math.IsNaN(position.Y) || math.IsInf(position.X, 0) || math.IsInf(position.Y, 0) {
			return fmt.Errorf("invalid friendly position for unit %d", unit.UnitIndex)
		}
		validated[unit.UnitIndex] = position
	}
	priest.KFCPositions = validated
	return nil
}

func (priest *Priest) kfcFriendlyInRange(from, to *core.Unit, distance float64) bool {
	left, hasLeft := priest.KFCPositions[from.UnitIndex]
	right, hasRight := priest.KFCPositions[to.UnitIndex]
	return hasLeft && hasRight && math.Hypot(left.X-right.X, left.Y-right.Y) <= distance
}

func (priest *Priest) kfcLiveFriendly(target *core.Unit) bool {
	return target != nil && !priest.IsOpponent(target) && target.HasHealthBar() && target.CurrentHealth() > 0 && priest.Env.Raid.GetPlayerFromUnit(target) != nil
}

func kfcExcludedHealingAura(target *core.Unit, id int32) bool {
	if id == 0 {
		return false
	}
	aura := target.GetAuraByID(core.ActionID{SpellID: id})
	return aura != nil && aura.IsActive()
}

func (priest *Priest) kfcActiveHealingConfig(rank kfcActiveHealingRank) core.SpellConfig {
	data := rank.Data
	return core.SpellConfig{ActionID: core.ActionID{SpellID: data.ID}, SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic,
		ProcMask: core.ProcMaskSpellHealing, Flags: SpellFlagPriest | core.SpellFlagHelpful | core.SpellFlagAPL,
		RequiredLevel: data.RequiredLevel, Rank: data.Rank, ManaCost: core.ManaCostOptions{FlatCost: data.Mana},
		Cast:             core.CastConfig{DefaultCast: core.Cast{GCD: time.Duration(data.GCDMs) * time.Millisecond, CastTime: time.Duration(data.CastMs) * time.Millisecond}},
		DamageMultiplier: 1, ThreatMultiplier: 1,
		ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool {
			return priest.CurrentHealth() > 0 && priest.kfcLiveFriendly(target) && (!rank.ExcludeCaster || target != &priest.Unit) &&
				!kfcExcludedHealingAura(target, rank.ExcludedTargetAura) && priest.kfcFriendlyInRange(&priest.Unit, target, rank.Range)
		},
	}
}

func (priest *Priest) registerKFCActiveHealing() {
	penanceCD, mendingCD := priest.NewTimer(), priest.NewTimer()
	priest.registerKFCMendingState()
	for _, rank := range kfcActiveHealingRanks {
		data := rank.Data
		if data.RequiredLevel > int(priest.Level) {
			continue
		}
		config := priest.kfcActiveHealingConfig(rank)
		switch data.Family {
		case "binding-heal":
			if !priest.Talents.BindingHeal {
				continue
			}
			config.ThreatMultiplier = .5
			config.ApplyEffects = func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				if !priest.kfcLiveFriendly(target) || priest.CurrentHealth() <= 0 {
					return
				}
				for index, recipient := range []*core.Unit{target, &priest.Unit} {
					if !priest.kfcLiveFriendly(recipient) || priest.CurrentHealth() <= 0 {
						continue
					}
					payload := data
					if index == 1 {
						payload = rank.Secondary
					}
					low, high := payload.amountBounds(int(priest.Level))
					spell.CalcAndDealHealing(sim, recipient, sim.Roll(low, high)+payload.Coefficient*spell.HealingPower(recipient), priest.kfcHealingOutcome(spell))
				}
			}
			spell := priest.RegisterSpell(config)
			if len(priest.KFCBindingHeal) <= data.Rank {
				priest.KFCBindingHeal = append(priest.KFCBindingHeal, make([]*core.Spell, data.Rank+1-len(priest.KFCBindingHeal))...)
			}
			priest.KFCBindingHeal[data.Rank] = spell
		case "penance":
			if !priest.Talents.Penance {
				continue
			}
			bolt := priest.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: rank.PayloadID}, SpellCode: SpellCode_PriestPenance,
				SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing,
				Flags:            SpellFlagPriest | core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
				BonusCoefficient: data.Coefficient, DamageMultiplier: 1, ThreatMultiplier: 1,
				ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
					if !priest.kfcLiveFriendly(target) || priest.CurrentHealth() <= 0 {
						return
					}
					low, high := data.amountBounds(int(priest.Level))
					spell.CalcAndDealHealing(sim, target, sim.Roll(low, high), priest.kfcHealingOutcome(spell))
				},
			})
			config.SpellCode = SpellCode_PriestPenance
			config.Flags |= core.SpellFlagChanneled
			config.Cast.CD = core.Cooldown{Timer: penanceCD, Duration: time.Duration(data.CooldownMs) * time.Millisecond}
			config.Hot = core.DotConfig{Aura: core.Aura{Label: fmt.Sprintf("Penance Healing %d", data.ID)}, NumberOfTicks: int32(rank.ChannelDurationMs / rank.ChannelPeriodMs), TickLength: time.Duration(rank.ChannelPeriodMs) * time.Millisecond, AffectedByCastSpeed: true,
				OnTick: func(sim *core.Simulation, target *core.Unit, _ *core.Dot) { bolt.Cast(sim, target) },
			}
			config.ApplyEffects = func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				spell.Hot(target).Apply(sim)
				bolt.Cast(sim, target)
			}
			priest.Penance = priest.RegisterSpell(config)
		case "prayer-of-healing":
			config.BonusCoefficient = data.Coefficient
			condition := config.ExtraCastCondition
			config.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
				return condition(sim, target) && priest.Env.Raid.GetPlayerParty(target).Size() > 0
			}
			config.ApplyEffects = func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				if !priest.kfcLiveFriendly(target) || priest.CurrentHealth() <= 0 {
					return
				}
				radius := rank.Radius * (1 + kfcHolyReachRadius[priest.Talents.HolyReach]/100)
				for _, agent := range priest.Env.Raid.GetPlayerParty(target).PlayersAndPets {
					recipient := &agent.GetCharacter().Unit
					if !priest.kfcLiveFriendly(recipient) || kfcExcludedHealingAura(recipient, rank.ExcludedTargetAura) || !priest.kfcFriendlyInRange(target, recipient, radius) {
						continue
					}
					low, high := data.amountBounds(int(priest.Level))
					spell.CalcAndDealHealing(sim, recipient, sim.Roll(low, high), priest.kfcHealingOutcome(spell))
				}
			}
			spell := priest.RegisterSpell(config)
			if len(priest.PrayerOfHealing) <= data.Rank {
				priest.PrayerOfHealing = append(priest.PrayerOfHealing, make([]*core.Spell, data.Rank+1-len(priest.PrayerOfHealing))...)
			}
			priest.PrayerOfHealing[data.Rank] = spell
		case "prayer-of-mending":
			if !priest.Talents.PrayerOfMending {
				continue
			}
			config.Cast.CD = core.Cooldown{Timer: mendingCD, Duration: time.Duration(data.CooldownMs) * time.Millisecond}
			config.ApplyEffects = func(sim *core.Simulation, target *core.Unit, _ *core.Spell) {
				priest.kfcClearMending(sim)
				serial := priest.KFCMendingSerial
				apply := func(sim *core.Simulation) {
					if serial != priest.KFCMendingSerial || !priest.kfcLiveFriendly(target) {
						return
					}
					priest.KFCMendingRank = &rank
					priest.KFCMendingRemaining = rank.Charges
					priest.KFCMendingTarget = target
					priest.KFCMendingAuras.Get(target).Activate(sim)
					priest.KFCMendingAuras.Get(target).SetStacks(sim, int32(rank.Charges))
				}
				delay := rank.LaunchDelay
				if rank.TravelSpeed > 0 {
					from, to := priest.KFCPositions[priest.UnitIndex], priest.KFCPositions[target.UnitIndex]
					delay += math.Hypot(from.X-to.X, from.Y-to.Y) / rank.TravelSpeed
				}
				if delay > 0 {
					sim.AddPendingAction(&core.PendingAction{NextActionAt: sim.CurrentTime + time.Duration(delay*float64(time.Second)), OnAction: apply})
				} else {
					apply(sim)
				}
			}
			priest.PrayerOfMending = priest.RegisterSpell(config)
			if len(priest.KFCMending) <= data.Rank {
				priest.KFCMending = append(priest.KFCMending, make([]*core.Spell, data.Rank+1-len(priest.KFCMending))...)
			}
			priest.KFCMending[data.Rank] = priest.PrayerOfMending
		default:
			panic("Unsupported active healing family: " + data.Family)
		}
	}
}

func (priest *Priest) kfcClearMending(sim *core.Simulation) {
	priest.KFCMendingSerial++
	target := priest.KFCMendingTarget
	priest.KFCMendingTarget = nil
	priest.KFCMendingRemaining = 0
	priest.KFCMendingRank = nil
	if target != nil {
		priest.KFCMendingAuras.Get(target).Deactivate(sim)
	}
}

func (priest *Priest) registerKFCMendingState() {
	if !priest.Talents.PrayerOfMending {
		return
	}
	priest.KFCMendingHeal = priest.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: kfcMendingAuraID, Tag: 1}, SpellSchool: core.SpellSchoolHoly,
		DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing, Flags: SpellFlagPriest | core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
		DamageMultiplier: (1 + priest.kfcHealingTalentValue("TwinDisciplines", 0)/100) * (1 + priest.kfcHealingTalentValue("SpiritualHealing", 0)/100), ThreatMultiplier: 1,
		ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
			if priest.KFCMendingRank == nil || !priest.kfcLiveFriendly(target) {
				return
			}
			data := priest.KFCMendingRank.Data
			low, high := data.amountBounds(int(priest.Level))
			spell.CalcAndDealHealing(sim, target, sim.Roll(low, high)+data.Coefficient*spell.HealingPower(target), priest.kfcHealingOutcome(spell))
		},
	})
	priest.KFCMendingAuras = priest.NewRaidAuraArray(func(target *core.Unit) *core.Aura {
		trigger := func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			if result.Damage > 0 && spell != priest.KFCMendingHeal {
				priest.kfcTriggerMending(sim, target)
			}
		}
		return target.RegisterAura(core.Aura{Label: fmt.Sprintf("Prayer of Mending %d", priest.UnitIndex), ActionID: core.ActionID{SpellID: kfcMendingAuraID}, Duration: time.Duration(kfcMendingDurationMs) * time.Millisecond, MaxStacks: kfcMendingMaxCharges,
			OnExpire: func(_ *core.Aura, _ *core.Simulation) {
				if priest.KFCMendingTarget == target {
					priest.KFCMendingTarget = nil
					priest.KFCMendingRank = nil
					priest.KFCMendingRemaining = 0
				}
			},
			OnSpellHitTaken: trigger, OnPeriodicDamageTaken: trigger, OnHealTaken: trigger,
		})
	})
	priest.RegisterResetEffect(func(_ *core.Simulation) {
		priest.KFCMendingTarget = nil
		priest.KFCMendingRank = nil
		priest.KFCMendingRemaining = 0
		priest.KFCMendingBusy = false
		priest.KFCMendingSerial++
	})
}

func (priest *Priest) kfcTriggerMending(sim *core.Simulation, target *core.Unit) {
	if priest.KFCMendingBusy || priest.KFCMendingTarget != target || priest.KFCMendingRank == nil || priest.KFCMendingRemaining <= 0 || !priest.kfcLiveFriendly(target) {
		return
	}
	priest.KFCMendingBusy = true
	defer func() { priest.KFCMendingBusy = false }()
	rank := priest.KFCMendingRank
	remaining := priest.KFCMendingRemaining - 1
	priest.KFCMendingTarget = nil
	priest.KFCMendingAuras.Get(target).Deactivate(sim)
	priest.KFCMendingRemaining = remaining
	priest.KFCMendingHeal.Cast(sim, target)
	var next *core.Unit
	if remaining > 0 {
		for _, candidate := range priest.Env.Raid.AllUnits {
			if candidate == target || !priest.kfcLiveFriendly(candidate) || !priest.kfcFriendlyInRange(target, candidate, rank.Radius) {
				continue
			}
			if next == nil || candidate.CurrentHealthPercent() < next.CurrentHealthPercent() || (candidate.CurrentHealthPercent() == next.CurrentHealthPercent() && candidate.UnitIndex < next.UnitIndex) {
				next = candidate
			}
		}
	}
	if next == nil {
		priest.KFCMendingRank = nil
		priest.KFCMendingRemaining = 0
		return
	}
	priest.KFCMendingTarget = next
	priest.KFCMendingAuras.Get(next).Activate(sim)
	priest.KFCMendingAuras.Get(next).SetStacks(sim, int32(remaining))
}
