package restoration

import (
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/druid"
)

type kfcDruidAdvancedRank struct {
	ID                                                                int32
	Family                                                            string
	Rank, RequiredLevel, BaseLevel, MaxLevel                          int
	Mana, BaseManaFraction, Base, Coefficient, PointsPerLevel, Radius float64
	GCDMs, CooldownMs, DurationMs, TickMs                             int
}

// KFC_DRUID_ADVANCED_DATA

type KFCDruidFriendlyPosition struct{ X, Y float64 }
type KFCDruidHealingPolicy struct {
	WildGrowthDecay    float64
	SwiftmendSelection string
}

func (resto *RestorationDruid) ConfigureKFCDruidHealing(positions map[int32]KFCDruidFriendlyPosition, policy KFCDruidHealingPolicy) error {
	if len(positions) != len(resto.Env.Raid.AllUnits) {
		return fmt.Errorf("Druid positions must cover every friendly unit")
	}
	if (policy.WildGrowthDecay != .05 && policy.WildGrowthDecay != .1 && policy.WildGrowthDecay != .2) || (policy.SwiftmendSelection != "shortest" && policy.SwiftmendSelection != "largest") {
		return fmt.Errorf("Choose an explicit Druid healing sensitivity policy")
	}
	validated := make(map[int32]KFCDruidFriendlyPosition, len(positions))
	for _, unit := range resto.Env.Raid.AllUnits {
		position, ok := positions[unit.UnitIndex]
		if !ok || math.IsNaN(position.X) || math.IsNaN(position.Y) || math.IsInf(position.X, 0) || math.IsInf(position.Y, 0) {
			return fmt.Errorf("Invalid Druid friendly position")
		}
		validated[unit.UnitIndex] = position
	}
	resto.positions = validated
	resto.healingPolicy = policy
	return nil
}

func (resto *RestorationDruid) kfcLiveFriendly(target *core.Unit) bool {
	return target != nil && !resto.IsOpponent(target) && target.HasHealthBar() && target.CurrentHealth() > 0 && resto.Env.Raid.GetPlayerFromUnit(target) != nil
}
func (resto *RestorationDruid) kfcInRange(from, to *core.Unit, distance float64) bool {
	a, okA := resto.positions[from.UnitIndex]
	b, okB := resto.positions[to.UnitIndex]
	return okA && okB && math.Hypot(a.X-b.X, a.Y-b.Y) <= distance
}
func (resto *RestorationDruid) kfcFriendlyParty(target *core.Unit) *core.Party {
	for _, party := range resto.Env.Raid.Parties {
		for _, agent := range party.PlayersAndPets {
			if &agent.GetCharacter().Unit == target {
				return party
			}
		}
	}
	return &core.Party{}
}
func (resto *RestorationDruid) kfcHotExtension(family string) int {
	if !resto.Talents.NaturesSplendor {
		return 0
	}
	if family == "rejuvenation" {
		return kfcDruidRejuvenationExtensionMs
	}
	if family == "regrowth" {
		return kfcDruidRegrowthExtensionMs
	}
	return 0
}
func (resto *RestorationDruid) kfcDirectHealingMultiplier(family string) float64 {
	if family == "healing-touch" || family == "regrowth" || family == "tranquility" {
		return 1 + kfcDruid_giftOfNature[resto.Talents.GiftOfNature]/100
	}
	return 1
}
func (resto *RestorationDruid) kfcPeriodicHealingMultiplier(spell *core.Spell, family string) float64 {
	modifier := 0.0
	if family == "rejuvenation" || family == "regrowth" || family == "wild-growth" {
		modifier += kfcDruid_giftOfNature[resto.Talents.GiftOfNature] + kfcDruid_genesis[resto.Talents.Genesis]
	}
	if family == "rejuvenation" {
		modifier += kfcDruid_improvedRejuvenation[resto.Talents.ImprovedRejuvenation]
	}
	if family == "tranquility" {
		modifier += kfcDruid_giftOfNature[resto.Talents.GiftOfNature]
	}
	return spell.CasterHealingMultiplier() / resto.kfcDirectHealingMultiplier(family) * (1 + modifier/100)
}

func (resto *RestorationDruid) ApplyTalents() {
	resto.Druid.ApplyTalents()
	resto.OnSpellRegistered(func(spell *core.Spell) {
		family := kfcDruidFamilies[spell.ActionID.SpellID]
		if family == "" {
			return
		}
		spell.DamageMultiplier *= resto.kfcDirectHealingMultiplier(family)
		spell.PushbackReduction += kfcDruid_naturesFocus[resto.Talents.NaturesFocus] / 100
		if family == "healing-touch" {
			spell.DefaultCast.CastTime -= time.Duration(kfcDruid_naturalist[resto.Talents.Naturalist] * float64(time.Second))
			if spell.DefaultCast.CastTime < 0 {
				spell.DefaultCast.CastTime = 0
			}
		}
		if family == "healing-touch" || family == "tranquility" {
			spell.Cost.Multiplier -= int32(kfcDruid_tranquilSpirit[resto.Talents.TranquilSpirit])
		}
		if family == "regrowth" {
			spell.BonusCritRating += kfcDruid_improvedRegrowth[resto.Talents.ImprovedRegrowth] * core.SpellCritRatingPerCritChance
		}
		if (family == "rejuvenation" || family == "swiftmend" || family == "wild-growth") && resto.Talents.GiftOfTheEarthmother {
			spell.DefaultCast.GCD -= time.Duration(kfcDruid_giftOfTheEarthmother[1] * float64(time.Second))
		}
		if family == "tranquility" {
			spell.CD.Duration = time.Duration(float64(spell.CD.Duration) * (1 - kfcDruid_improvedTranquility[resto.Talents.ImprovedTranquility]/100))
			spell.ThreatMultiplier *= 1 - float64(resto.Talents.ImprovedTranquility)*.5
		}
		condition := spell.ExtraCastCondition
		spell.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
			return resto.CurrentHealth() > 0 && resto.kfcLiveFriendly(target) && (family == "tranquility" || resto.kfcInRange(&resto.Unit, target, 40)) && (condition == nil || condition(sim, target))
		}
	})
	if aura := resto.NaturesGraceHasteAura; aura != nil {
		previousGain, previousExpire := aura.OnGain, aura.OnExpire
		reductions := make(map[*core.Spell]time.Duration)
		aura.OnGain = func(aura *core.Aura, sim *core.Simulation) {
			if previousGain != nil {
				previousGain(aura, sim)
			}
			for _, spells := range resto.familySpells {
				for _, spell := range spells {
					if spell.DefaultCast.GCD > 0 {
						reduction := spell.DefaultCast.GCD / 10
						reductions[spell] = reduction
						spell.DefaultCast.GCD -= reduction
					}
				}
			}
		}
		aura.OnExpire = func(aura *core.Aura, sim *core.Simulation) {
			if previousExpire != nil {
				previousExpire(aura, sim)
			}
			for spell, reduction := range reductions {
				spell.DefaultCast.GCD += reduction
			}
			clear(reductions)
		}
		core.MakePermanent(resto.RegisterAura(core.Aura{Label: "Druid healing Nature's Grace", OnHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			if result.DidCrit() && kfcDruidFamilies[spell.ActionID.SpellID] != "" {
				aura.Activate(sim)
			}
		}}))
	}
}

func (rank kfcDruidAdvancedRank) amount(level int) float64 {
	if rank.MaxLevel > 0 {
		level = min(level, rank.MaxLevel)
	}
	return rank.Base + float64(max(0, level-max(rank.BaseLevel, rank.RequiredLevel)))*rank.PointsPerLevel
}

func (resto *RestorationDruid) kfcSwiftmendSource(sim *core.Simulation, target *core.Unit) *core.Dot {
	var selected *core.Dot
	for _, family := range []string{"rejuvenation", "regrowth"} {
		for _, spell := range resto.familySpells[family] {
			hot := spell.Hot(target)
			if !hot.IsActive() {
				continue
			}
			if selected == nil {
				selected = hot
				continue
			}
			if resto.healingPolicy.SwiftmendSelection == "largest" {
				if hot.SnapshotBaseDamage*hot.SnapshotAttackerMultiplier*float64(hot.NumberOfTicks) > selected.SnapshotBaseDamage*selected.SnapshotAttackerMultiplier*float64(selected.NumberOfTicks) {
					selected = hot
				}
			} else if hot.RemainingDuration(sim) < selected.RemainingDuration(sim) {
				selected = hot
			}
		}
	}
	return selected
}

func (resto *RestorationDruid) registerKFCAdvancedHealing() {
	resto.positions = make(map[int32]KFCDruidFriendlyPosition)
	for _, unit := range resto.Env.Raid.AllUnits {
		resto.positions[unit.UnitIndex] = KFCDruidFriendlyPosition{}
	}
	resto.healingPolicy = KFCDruidHealingPolicy{WildGrowthDecay: .1, SwiftmendSelection: "shortest"}
	tranquilityCD, wildGrowthCD := resto.NewTimer(), resto.NewTimer()
	for _, rank := range kfcDruidAdvancedRanks {
		if rank.RequiredLevel > int(resto.Level) || (rank.Family == "swiftmend" && !resto.Talents.Swiftmend) || (rank.Family == "wild-growth" && !resto.Talents.WildGrowth) {
			continue
		}
		config := core.SpellConfig{ActionID: core.ActionID{SpellID: rank.ID}, SpellSchool: core.SpellSchoolNature, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing,
			Flags: core.SpellFlagHelpful | core.SpellFlagAPL, Rank: rank.Rank, RequiredLevel: rank.RequiredLevel, ManaCost: core.ManaCostOptions{FlatCost: rank.Mana, BaseCost: rank.BaseManaFraction},
			Cast: core.CastConfig{DefaultCast: core.Cast{GCD: time.Duration(rank.GCDMs) * time.Millisecond}}, DamageMultiplier: 1, ThreatMultiplier: 1,
			ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool { return resto.kfcLiveFriendly(target) },
		}
		switch rank.Family {
		case "swiftmend":
			config.Cast.CD = core.Cooldown{Timer: resto.NewTimer(), Duration: time.Duration(rank.CooldownMs) * time.Millisecond}
			config.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
				return resto.kfcLiveFriendly(target) && resto.kfcSwiftmendSource(sim, target) != nil
			}
			config.ApplyEffects = func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				hot := resto.kfcSwiftmendSource(sim, target)
				if hot == nil {
					return
				}
				amount := hot.SnapshotBaseDamage * hot.SnapshotAttackerMultiplier * float64(hot.NumberOfTicks)
				spell.CalcAndDealHealing(sim, target, amount/spell.CasterHealingMultiplier(), spell.OutcomeHealingCrit)
			}
		case "tranquility":
			config.ExtraCastCondition = func(_ *core.Simulation, target *core.Unit) bool {
				return target == &resto.Unit && resto.kfcLiveFriendly(target)
			}
			config.Flags |= core.SpellFlagChanneled
			config.Cast.CD = core.Cooldown{Timer: tranquilityCD, Duration: time.Duration(rank.CooldownMs) * time.Millisecond}
			config.Hot = core.DotConfig{IsAOE: true, Aura: core.Aura{Label: fmt.Sprintf("Druid Tranquility %d", rank.ID)}, NumberOfTicks: int32(rank.DurationMs / rank.TickMs), TickLength: time.Duration(rank.TickMs) * time.Millisecond, AffectedByCastSpeed: true,
				OnSnapshot: func(_ *core.Simulation, target *core.Unit, dot *core.Dot, _ bool) {
					dot.SnapshotBaseDamage = rank.amount(int(resto.Level)) + rank.Coefficient*dot.Spell.HealingPower(target)
					dot.SnapshotAttackerMultiplier = resto.kfcPeriodicHealingMultiplier(dot.Spell, rank.Family)
				},
				OnTick: func(sim *core.Simulation, _ *core.Unit, dot *core.Dot) {
					if resto.CurrentHealth() <= 0 {
						dot.Deactivate(sim)
						return
					}
					for _, agent := range resto.Party.PlayersAndPets {
						target := &agent.GetCharacter().Unit
						if resto.kfcLiveFriendly(target) && resto.kfcInRange(&resto.Unit, target, rank.Radius) {
							dot.CalcAndDealPeriodicSnapshotHealing(sim, target, dot.OutcomeTick)
						}
					}
				},
			}
			config.ApplyEffects = func(sim *core.Simulation, _ *core.Unit, spell *core.Spell) { spell.AOEHot().Apply(sim) }
		case "wild-growth":
			config.Cast.CD = core.Cooldown{Timer: wildGrowthCD, Duration: time.Duration(rank.CooldownMs) * time.Millisecond}
			config.Hot = core.DotConfig{Aura: core.Aura{Label: fmt.Sprintf("Druid Wild Growth %d", rank.ID)}, NumberOfTicks: int32(rank.DurationMs / rank.TickMs), TickLength: time.Duration(rank.TickMs) * time.Millisecond,
				OnSnapshot: func(_ *core.Simulation, target *core.Unit, dot *core.Dot, _ bool) {
					dot.SnapshotBaseDamage = rank.amount(int(resto.Level)) + rank.Coefficient*dot.Spell.HealingPower(target)
					dot.SnapshotAttackerMultiplier = resto.kfcPeriodicHealingMultiplier(dot.Spell, rank.Family)
				},
				OnTick: func(sim *core.Simulation, target *core.Unit, dot *core.Dot) {
					if !resto.kfcLiveFriendly(target) || resto.CurrentHealth() <= 0 {
						dot.Deactivate(sim)
						return
					}
					weight := 1 + resto.healingPolicy.WildGrowthDecay*(3-float64(dot.TickCount-1))
					result := dot.CalcSnapshotHealing(sim, target, dot.OutcomeTick)
					result.Damage *= weight
					result.Threat = dot.Spell.ThreatFromDamage(result.Outcome, result.Damage)
					dot.Spell.DealPeriodicHealing(sim, result)
				},
			}
			config.ApplyEffects = func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				for _, agent := range resto.kfcFriendlyParty(target).PlayersAndPets {
					recipient := &agent.GetCharacter().Unit
					if !resto.kfcLiveFriendly(recipient) || !resto.kfcInRange(target, recipient, rank.Radius) {
						continue
					}
					for _, other := range resto.familySpells[rank.Family] {
						other.Hot(recipient).Deactivate(sim)
					}
					spell.Hot(recipient).Apply(sim)
				}
			}
		}
		spell := resto.RegisterSpell(druid.Humanoid, config).Spell
		resto.familySpells[rank.Family] = append(resto.familySpells[rank.Family], spell)
	}
	if resto.Talents.NaturesSwiftness {
		resto.registerKFCNatureSwiftness()
	}
}

func (resto *RestorationDruid) registerKFCNatureSwiftness() {
	spells := append(append([]*core.Spell{}, resto.familySpells["healing-touch"]...), resto.familySpells["regrowth"]...)
	aura := resto.RegisterAura(core.Aura{Label: "Druid Nature's Swiftness", ActionID: core.ActionID{SpellID: 17116}, Duration: core.NeverExpires,
		OnGain: func(_ *core.Aura, _ *core.Simulation) {
			for _, spell := range spells {
				spell.CastTimeMultiplier -= 1
			}
		},
		OnExpire: func(_ *core.Aura, _ *core.Simulation) {
			for _, spell := range spells {
				spell.CastTimeMultiplier += 1
			}
		},
		OnCastComplete: func(aura *core.Aura, sim *core.Simulation, spell *core.Spell) {
			for _, candidate := range spells {
				if spell == candidate && spell.CurCast.CastTime == 0 {
					aura.Deactivate(sim)
					break
				}
			}
		},
	})
	resto.RegisterSpell(druid.Humanoid, core.SpellConfig{ActionID: core.ActionID{SpellID: 17116}, SpellSchool: core.SpellSchoolPhysical, Flags: core.SpellFlagHelpful | core.SpellFlagAPL,
		Cast: core.CastConfig{CD: core.Cooldown{Timer: resto.NewTimer(), Duration: time.Duration(kfcDruidSwiftnessCooldownMs) * time.Millisecond}},
		ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool {
			return target == &resto.Unit && resto.CurrentHealth() > 0 && !aura.IsActive()
		},
		ApplyEffects: func(sim *core.Simulation, _ *core.Unit, _ *core.Spell) { aura.Activate(sim) },
	})
}
