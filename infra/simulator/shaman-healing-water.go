package restoration

import (
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/shaman"
	"google.golang.org/protobuf/reflect/protoreflect"
)

type kfcShamanWaterRank struct {
	ID, PulseID                             int32
	Family                                  string
	Rank, RequiredLevel                     int
	Mana, Amount, Coefficient, Radius       float64
	GCDMs, DurationMs, PeriodMs, CooldownMs int
}

// KFC_SHAMAN_WATER_TOTEM_VALUES

type KFCShamanWaterPolicy struct {
	FirstPulse, Recipients, HealingScaling string
}

type kfcShamanWaterController struct {
	configured  bool
	policy      KFCShamanWaterPolicy
	generation  uint64
	current     *core.Spell
	expires     time.Duration
	origin      KFCShamanFriendlyPosition
	manaMetrics map[int32]map[int32]*core.ResourceMetrics
}

func kfcShamanWaterTalentAllowed(field protoreflect.FieldDescriptor, value protoreflect.Value) bool {
	switch string(field.Name()) {
	case "totemic_focus", "restorative_totems":
		return field.Kind() == protoreflect.Int32Kind && value.Int() >= 0 && value.Int() <= 5
	case "mana_tide_totem":
		return field.Kind() == protoreflect.BoolKind
	}
	return false
}

func (resto *RestorationShaman) ConfigureKFCShamanWaterPolicy(sim *core.Simulation, policy KFCShamanWaterPolicy) error {
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || resto.kfcWater == nil || resto.kfcWater.configured || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("water policy requires a fresh positioned Shaman")
	}
	if (policy.FirstPulse != "after-period-reference" && policy.FirstPulse != "immediate-reference") || (policy.Recipients != "party-reference" && policy.Recipients != "raid-reference") || (policy.HealingScaling != "base-and-power-reference" && policy.HealingScaling != "base-only-reference") {
		return fmt.Errorf("unreviewed Shaman water-totem reference")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("water policy cannot change after casting")
			}
		}
	}
	resto.kfcWater.policy = policy
	resto.kfcWater.configured = true
	return nil
}

func (resto *RestorationShaman) resetKFCShamanWaterTotems() {
	if resto.kfcWater != nil {
		resto.kfcWater.generation++
		resto.kfcWater.current = nil
		resto.kfcWater.expires = 0
	}
}

func (resto *RestorationShaman) kfcWaterRecipient(unit *core.Unit, radius float64) bool {
	controller := resto.kfcWater
	if unit == nil || controller == nil || !controller.configured || !unit.HasHealthBar() || unit.CurrentHealth() <= 0 || resto.IsOpponent(unit) {
		return false
	}
	position, known := resto.positions[unit.UnitIndex]
	if !known || math.Hypot(position.X-controller.origin.X, position.Y-controller.origin.Y) > radius {
		return false
	}
	if controller.policy.Recipients == "party-reference" {
		for _, agent := range resto.Party.Players {
			if &agent.GetCharacter().Unit == unit {
				return true
			}
		}
		return false
	}
	return true
}

func (resto *RestorationShaman) startKFCWaterTotem(sim *core.Simulation, spell, pulse *core.Spell, rank kfcShamanWaterRank) {
	controller := resto.kfcWater
	controller.generation++
	generation := controller.generation
	controller.current = spell
	controller.origin = resto.positions[resto.UnitIndex]
	controller.expires = sim.CurrentTime + time.Duration(rank.DurationMs)*time.Millisecond
	if old := resto.ActiveTotems[shaman.WaterTotem]; old != nil {
		for _, agent := range resto.Party.Players {
			if len(old.Dots()) > 0 {
				if hot := old.Hot(&agent.GetCharacter().Unit); hot != nil {
					hot.Cancel(sim)
				}
			}
		}
	}
	resto.ActiveTotems[shaman.WaterTotem] = spell
	resto.TotemExpirations[shaman.WaterTotem] = controller.expires
	valid := func() bool {
		return controller.generation == generation && controller.current == spell && resto.ActiveTotems[shaman.WaterTotem] == spell
	}
	expire := func() {
		if valid() {
			controller.generation++
			controller.current = nil
			resto.ActiveTotems[shaman.WaterTotem] = nil
			resto.TotemExpirations[shaman.WaterTotem] = 0
		}
	}
	core.StartDelayedAction(sim, core.DelayedActionOptions{DoAt: controller.expires, Priority: core.ActionPriorityLow, OnAction: func(_ *core.Simulation) { expire() }})
	period := time.Duration(rank.PeriodMs) * time.Millisecond
	var tick func(*core.Simulation)
	tick = func(sim *core.Simulation) {
		if !valid() {
			return
		}
		if resto.CurrentHealth() <= 0 || sim.CurrentTime > controller.expires {
			expire()
			return
		}
		for _, unit := range resto.kfcHealingPlayers() {
			if !resto.kfcWaterRecipient(unit, rank.Radius) {
				continue
			}
			if rank.Family == "mana-tide" {
				if metrics := controller.manaMetrics[rank.PulseID][unit.UnitIndex]; metrics != nil {
					unit.AddMana(sim, rank.Amount, metrics)
				}
				continue
			}
			bonus := kfcShamanWaterHealingPercent[resto.Talents.RestorativeTotems] / 100
			base := rank.Amount
			if controller.policy.HealingScaling == "base-only-reference" {
				base *= 1 + bonus
			} else {
				base += rank.Coefficient * pulse.HealingPower(unit)
				base *= 1 + bonus
			}
			if controller.policy.HealingScaling == "base-only-reference" {
				base += rank.Coefficient * pulse.HealingPower(unit)
			}
			result := pulse.CalcKFCShamanPeriodicHealing(sim, unit, base, pulse.OutcomeHealing)
			pulse.DealPeriodicHealing(sim, result)
		}
		if sim.CurrentTime+period <= controller.expires {
			core.StartDelayedAction(sim, core.DelayedActionOptions{DoAt: sim.CurrentTime + period, Priority: core.ActionPriorityDOT, OnAction: tick})
		}
	}
	first := sim.CurrentTime + period
	if controller.policy.FirstPulse == "immediate-reference" {
		first = sim.CurrentTime
	}
	core.StartDelayedAction(sim, core.DelayedActionOptions{DoAt: first, Priority: core.ActionPriorityDOT, OnAction: tick})
}

func (resto *RestorationShaman) registerKFCShamanWaterTotems() {
	resto.kfcWater = &kfcShamanWaterController{manaMetrics: map[int32]map[int32]*core.ResourceMetrics{}}
	resto.HealingStreamTotem = make([]*core.Spell, 6)
	resto.ManaTideTotem = make([]*core.Spell, 5)
	tideTimer := resto.NewTimer()
	for _, rank := range kfcShamanWaterRanks {
		if rank.RequiredLevel > int(resto.Level) || (rank.Family == "mana-tide" && !resto.Talents.ManaTideTotem) {
			continue
		}
		var pulse *core.Spell
		if rank.Family == "healing-stream" {
			pulse = resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: rank.PulseID}, SpellSchool: core.SpellSchoolNature, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1, ThreatMultiplier: 1})
		} else {
			resto.kfcWater.manaMetrics[rank.PulseID] = map[int32]*core.ResourceMetrics{}
			for _, unit := range resto.kfcHealingPlayers() {
				if unit.HasManaBar() {
					metrics := unit.NewManaMetrics(core.ActionID{SpellID: rank.PulseID})
					metrics.NoThreat = true
					resto.kfcWater.manaMetrics[rank.PulseID][unit.UnitIndex] = metrics
				}
			}
		}
		cast := core.CastConfig{DefaultCast: core.Cast{GCD: time.Duration(rank.GCDMs) * time.Millisecond}, IgnoreHaste: true}
		if rank.Family == "mana-tide" {
			cast.CD = core.Cooldown{Timer: tideTimer, Duration: time.Duration(rank.CooldownMs) * time.Millisecond}
		}
		spell := resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: rank.ID}, SpellSchool: core.SpellSchoolFrost, ProcMask: core.ProcMaskEmpty, Flags: core.SpellFlagHelpful | core.SpellFlagAPL | shaman.SpellFlagTotem | shaman.SpellFlagShaman, RequiredLevel: rank.RequiredLevel, Rank: rank.Rank, ManaCost: core.ManaCostOptions{FlatCost: rank.Mana, Multiplier: 100 + int32(kfcShamanWaterCostPercent[resto.Talents.TotemicFocus])}, Cast: cast, DamageMultiplier: 1, ThreatMultiplier: 1, ExtraCastCondition: func(_ *core.Simulation, _ *core.Unit) bool {
			return resto.kfcWater.configured && resto.CurrentHealth() > 0
		}, ApplyEffects: func(sim *core.Simulation, _ *core.Unit, spell *core.Spell) {
			resto.startKFCWaterTotem(sim, spell, pulse, rank)
		}})
		resto.WaterTotems = append(resto.WaterTotems, spell)
		if rank.Family == "healing-stream" {
			resto.HealingStreamTotem[rank.Rank] = spell
		} else {
			resto.ManaTideTotem[rank.Rank] = spell
		}
	}
}
