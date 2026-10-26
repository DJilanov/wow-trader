package restoration

import (
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

type KFCShamanUtilityPolicy struct {
	Schema                 string `json:"schema"`
	ID                     string `json:"id"`
	HealingCanCrit         bool   `json:"healingCanCrit"`
	RecombobulatorCanCrit  bool   `json:"recombobulatorCanCrit"`
	ChannelScalesWithHaste bool   `json:"channelScalesWithHaste"`
	ResourceRolls          string `json:"resourceRolls"`
	HeadmasterIntellect    string `json:"headmasterIntellect"`
	BaronTickPeriodMS      int64  `json:"baronTickPeriodMs"`
}

type kfcShamanUtilityItems struct {
	policy                              *KFCShamanUtilityPolicy
	owned                               map[int32]bool
	spells                              map[int32]*core.Spell
	charges                             map[int32]int
	mana                                map[int32]map[int32]*core.ResourceMetrics
	baron                               map[int32]*core.ResourceMetrics
	grace                               *core.Spell
	generation                          uint64
	initialized, started, deadTriggered bool
}

func (policy KFCShamanUtilityPolicy) Validate() error {
	if policy.Schema != "kfc-shaman-utility-policy.v1" || policy.ID == "" || len(policy.ID) > 100 ||
		(policy.ResourceRolls != "independent-reference" && policy.ResourceRolls != "same-percentile-reference") ||
		(policy.HeadmasterIntellect != "disabled-reference" && policy.HeadmasterIntellect != "additive-reference") ||
		(policy.BaronTickPeriodMS != 2000 && policy.BaronTickPeriodMS != 5000) {
		return fmt.Errorf("invalid Shaman utility reference")
	}
	return nil
}

func (resto *RestorationShaman) UsesKFCOwnedRecombobulators() bool { return true }

func (resto *RestorationShaman) KFCShamanUtilityPolicyEcho() *KFCShamanUtilityPolicy {
	if state := resto.kfcUtilityItems; state != nil && state.policy != nil {
		copy := *state.policy
		return &copy
	}
	return nil
}

func (resto *RestorationShaman) ConfigureKFCShamanUtilityItems(sim *core.Simulation, policy KFCShamanUtilityPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	state := resto.kfcUtilityItems
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || state == nil || len(state.owned) == 0 || state.policy != nil || state.started || resto.GCD.ReadyAt() > 0 || resto.IsCasting(sim) || resto.IsChanneling(sim) || !resto.kfcShamanItemsAlive() {
		return fmt.Errorf("utility policy requires a fresh positioned equipped Shaman")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("utility policy cannot change after events")
			}
		}
	}
	state.policy = &policy
	if circle := state.spells[11808]; circle != nil {
		circle.SelfHot().AffectedByCastSpeed = policy.ChannelScalesWithHaste
	}
	if state.initialized {
		resto.kfcShamanStartBaron(sim)
	}
	return nil
}

func (resto *RestorationShaman) kfcShamanUtilityTarget(target *core.Unit, radius float64, partyOnly bool) bool {
	if !resto.kfcValidHealingTarget(target) || !target.IsEnabled() {
		return false
	}
	if partyOnly {
		found := false
		for _, player := range resto.Party.Players {
			if &player.GetCharacter().Unit == target {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	from, to := resto.positions[resto.UnitIndex], resto.positions[target.UnitIndex]
	return math.Hypot(from.X-to.X, from.Y-to.Y) <= radius
}

func (resto *RestorationShaman) kfcShamanUtilityReady(sim *core.Simulation) bool {
	state := resto.kfcUtilityItems
	return state != nil && state.policy != nil && sim.CurrentTime >= 0 && resto.kfcShamanItemsAlive() && !resto.IsCasting(sim) && !resto.IsChanneling(sim)
}

func (resto *RestorationShaman) registerKFCShamanUtilityItems() {
	if resto.kfcUtilityItems != nil || !resto.Env.IsForever() {
		panic("invalid Shaman utility registration")
	}
	state := &kfcShamanUtilityItems{owned: map[int32]bool{}, spells: map[int32]*core.Spell{}, charges: map[int32]int{}, baron: map[int32]*core.ResourceMetrics{}, mana: map[int32]map[int32]*core.ResourceMetrics{}}
	resto.kfcUtilityItems = state
	allowed := map[int32]bool{4262: true, 8346: true, 11808: true, 13937: true, 4381: true, 13143: true, 18637: true, 6323: true, 11923: true}
	for _, item := range resto.Equipment {
		if allowed[item.ID] {
			state.owned[item.ID] = true
		}
	}
	if len(state.owned) == 0 {
		return
	}
	for id := range state.owned {
		if core.HasItemEffect(id) {
			panic("Shaman utility gained a common handler; re-admit owned dispatch")
		}
	}
	core.MakePermanent(resto.RegisterAura(core.Aura{Label: "KFC Shaman utility lifecycle", OnReset: func(_ *core.Aura, sim *core.Simulation) {
		state.generation++
		state.initialized = true
		state.started = false
		state.deadTriggered = false
		for _, id := range []int32{4381, 18637} {
			if state.spells[id] != nil {
				state.charges[id] = 10
			}
		}
		if state.policy != nil {
			resto.kfcShamanStartBaron(sim)
		}
	}}))
	resto.OnSpellRegistered(func(spell *core.Spell) {
		if spell.ActionID.Tag != 0 || kfcShamanWorkloadFamily(spell.ActionID.SpellID) == "" {
			return
		}
		previous := spell.ExtraCastCondition
		spell.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
			return state.policy != nil && (previous == nil || previous(sim, target))
		}
	})
	for _, row := range []struct {
		id        int32
		low, high float64
		cooldown  time.Duration
	}{{4262, 225, 375, 5 * time.Minute}, {8346, 300, 500, 30 * time.Minute}} {
		if !state.owned[row.id] {
			continue
		}
		id := row.id
		spell := resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{ItemID: id}, SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing,
			Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1, ThreatMultiplier: 1,
			Cast: core.CastConfig{DefaultCast: core.Cast{GCD: 1500 * time.Millisecond}, CD: core.Cooldown{Timer: resto.NewTimer(), Duration: row.cooldown}},
			ExtraCastCondition: func(sim *core.Simulation, target *core.Unit) bool {
				return resto.kfcShamanUtilityReady(sim) && resto.kfcShamanUtilityTarget(target, 40, false) && (id != 4262 || target == &resto.Unit)
			},
			ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				state.started = true
				outcome := spell.OutcomeHealing
				if state.policy.HealingCanCrit {
					outcome = spell.OutcomeHealingCrit
				}
				spell.CalcAndDealHealing(sim, target, sim.RollWithLabel(row.low, row.high, "Shaman utility direct heal"), outcome)
			},
		})
		state.spells[id] = spell
	}
	resto.registerKFCShamanRecombobulators()
	if state.owned[11808] {
		resto.registerKFCShamanCircle()
	}
	if state.owned[13937] {
		resto.registerKFCShamanHeadmaster()
	}
	if state.owned[13143] {
		resto.registerKFCShamanDragonMark()
	}
	if state.owned[6323] {
		for _, player := range resto.Party.Players {
			unit := &player.GetCharacter().Unit
			state.baron[unit.UnitIndex] = unit.NewHealthMetrics(core.ActionID{SpellID: 1292142})
		}
	}
	if state.owned[11923] {
		state.grace = resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1300891}, SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1, ThreatMultiplier: 1})
	}
}

func (resto *RestorationShaman) kfcShamanResourceRolls(sim *core.Simulation, first, second float64, label string) (float64, float64) {
	roll := sim.RollWithLabel(.75, 1.25, label+" first")
	other := roll
	if resto.kfcUtilityItems.policy.ResourceRolls == "independent-reference" {
		other = sim.RollWithLabel(.75, 1.25, label+" second")
	}
	return first * roll, second * other
}

func (resto *RestorationShaman) registerKFCShamanRecombobulators() {
	state := resto.kfcUtilityItems
	if !resto.HasProfession(proto.Profession_Engineering) {
		return
	}
	for _, row := range []struct {
		id            int32
		healing, mana float64
	}{{4381, 270, 128}, {18637, 666, 304}} {
		if !state.owned[row.id] {
			continue
		}
		id := row.id
		manaMetrics := map[int32]*core.ResourceMetrics{}
		state.mana[id] = manaMetrics
		for _, unit := range resto.kfcHealingPlayers() {
			if unit.HasManaBar() {
				manaMetrics[unit.UnitIndex] = unit.NewManaMetrics(core.ActionID{ItemID: id, Tag: 1})
			}
		}
		state.spells[id] = resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{ItemID: id}, SpellSchool: core.SpellSchoolArcane, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1, ThreatMultiplier: 1,
			Cast: core.CastConfig{CD: core.Cooldown{Timer: resto.NewTimer(), Duration: 5 * time.Minute}, SharedCD: core.Cooldown{Timer: resto.GetConjuredCD(), Duration: 2 * time.Minute}},
			ExtraCastCondition: func(sim *core.Simulation, target *core.Unit) bool {
				return resto.kfcShamanUtilityReady(sim) && resto.HasProfession(proto.Profession_Engineering) && state.charges[id] > 0 && resto.kfcShamanUtilityTarget(target, 30, false)
			},
			ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				state.started = true
				state.charges[id]--
				healing, mana := resto.kfcShamanResourceRolls(sim, row.healing, row.mana, "Shaman Recombobulator")
				outcome := spell.OutcomeHealing
				if state.policy.RecombobulatorCanCrit {
					outcome = spell.OutcomeHealingCrit
				}
				spell.CalcAndDealHealing(sim, target, healing, outcome)
				if metrics := manaMetrics[target.UnitIndex]; metrics != nil {
					target.AddMana(sim, mana, metrics)
				}
			},
		})
	}
}

func (resto *RestorationShaman) registerKFCShamanCircle() {
	state := resto.kfcUtilityItems
	manaMetrics := resto.NewManaMetrics(core.ActionID{ItemID: 11808})
	state.mana[11808] = map[int32]*core.ResourceMetrics{resto.UnitIndex: manaMetrics}
	state.spells[11808] = resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{ItemID: 11808}, SpellSchool: core.SpellSchoolFire, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskEmpty, Flags: core.SpellFlagHelpful | core.SpellFlagChanneled | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1, ThreatMultiplier: 1,
		Cast:               core.CastConfig{CD: core.Cooldown{Timer: resto.NewTimer(), Duration: 5 * time.Minute}},
		ExtraCastCondition: func(sim *core.Simulation, _ *core.Unit) bool { return resto.kfcShamanUtilityReady(sim) },
		Hot: core.DotConfig{SelfOnly: true, Aura: core.Aura{Label: "Shaman Circle of Flame channel"}, NumberOfTicks: 10, TickLength: time.Second,
			OnTick: func(sim *core.Simulation, _ *core.Unit, dot *core.Dot) {
				if !resto.kfcShamanItemsAlive() {
					dot.Cancel(sim)
					return
				}
				mana, damage := resto.kfcShamanResourceRolls(sim, 79, 79, "Shaman Circle")
				resto.AddMana(sim, mana, manaMetrics)
				dot.Spell.CalcAndDealPeriodicDamage(sim, &resto.Unit, damage, dot.Spell.OutcomeAlwaysHitNoHitCounter)
			},
		},
		ApplyEffects: func(sim *core.Simulation, _ *core.Unit, spell *core.Spell) {
			state.started = true
			spell.SelfHot().Apply(sim)
		},
	})
}

func (resto *RestorationShaman) registerKFCShamanHeadmaster() {
	state := resto.kfcUtilityItems
	auras := map[int32]*core.Aura{}
	for _, player := range resto.Party.Players {
		character := player.GetCharacter()
		amount := 0.0
		auras[character.UnitIndex] = character.RegisterAura(core.Aura{Label: fmt.Sprintf("Shaman Headmaster reference %d", resto.UnitIndex), ActionID: core.ActionID{SpellID: 18264}, Duration: 15 * time.Minute,
			OnGain: func(_ *core.Aura, sim *core.Simulation) {
				amount = 0
				if state.policy.HeadmasterIntellect == "additive-reference" {
					amount = 20
				}
				character.AddStatDynamic(sim, stats.Intellect, amount)
			},
			OnExpire: func(_ *core.Aura, sim *core.Simulation) {
				character.AddStatDynamic(sim, stats.Intellect, -amount)
				amount = 0
			},
		})
	}
	state.spells[13937] = resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{ItemID: 13937}, SpellSchool: core.SpellSchoolArcane, ProcMask: core.ProcMaskEmpty, Flags: core.SpellFlagHelpful | core.SpellFlagNoOnCastComplete,
		Cast:               core.CastConfig{CD: core.Cooldown{Timer: resto.NewTimer(), Duration: 10 * time.Minute}},
		ExtraCastCondition: func(sim *core.Simulation, _ *core.Unit) bool { return resto.kfcShamanUtilityReady(sim) },
		ApplyEffects: func(sim *core.Simulation, _ *core.Unit, _ *core.Spell) {
			state.started = true
			for _, player := range resto.Party.Players {
				target := &player.GetCharacter().Unit
				if resto.kfcShamanUtilityTarget(target, 30, true) {
					auras[target.UnitIndex].Activate(sim)
				}
			}
		},
	})
}

func (resto *RestorationShaman) kfcShamanStartBaron(sim *core.Simulation) {
	state := resto.kfcUtilityItems
	if !state.owned[6323] {
		return
	}
	generation := state.generation
	period := time.Duration(state.policy.BaronTickPeriodMS) * time.Millisecond
	core.StartPeriodicAction(sim, core.PeriodicActionOptions{Period: period, OnAction: func(sim *core.Simulation) {
		if generation != state.generation || sim.CurrentTime < 0 || !resto.kfcShamanItemsAlive() {
			return
		}
		state.started = true
		for _, player := range resto.Party.Players {
			target := &player.GetCharacter().Unit
			if resto.kfcShamanUtilityTarget(target, 30, true) {
				target.GainHealth(sim, 4*period.Seconds()/5, state.baron[target.UnitIndex])
			}
		}
	}})
}

func (resto *RestorationShaman) kfcShamanUtilityDeath(sim *core.Simulation) {
	state := resto.kfcUtilityItems
	if state == nil || state.policy == nil || state.deadTriggered || resto.CurrentHealth() > 0 {
		return
	}
	state.deadTriggered = true
	state.started = true
	if mark := state.spells[13143]; mark != nil {
		mark.SelfShield().Deactivate(sim)
	}
	if state.grace == nil {
		return
	}
	for _, player := range resto.Party.Players {
		target := &player.GetCharacter().Unit
		if resto.kfcShamanUtilityTarget(target, 40, true) {
			state.grace.CalcAndDealHealing(sim, target, sim.RollWithLabel(1081.92, 1270.08, "Shaman Hammer of Grace"), state.grace.OutcomeHealing)
		}
	}
}

func (resto *RestorationShaman) registerKFCShamanDragonMark() {
	state := resto.kfcUtilityItems
	mana := resto.NewManaMetrics(core.ActionID{SpellID: 17252})
	state.mana[13143] = map[int32]*core.ResourceMetrics{resto.UnitIndex: mana}
	var pending *core.PendingAction
	var nextTick, endsAt time.Duration
	var generation uint64
	var spell *core.Spell
	var schedule func(*core.Simulation)
	schedule = func(sim *core.Simulation) {
		pending = &core.PendingAction{NextActionAt: nextTick, Priority: core.ActionPriorityAuto, OnAction: func(sim *core.Simulation) {
			pending = nil
			if generation != state.generation || !spell.SelfShield().IsActive() {
				return
			}
			if !resto.kfcShamanItemsAlive() {
				spell.SelfShield().Deactivate(sim)
				return
			}
			nextTick += 5 * time.Second
			resto.AddMana(sim, 22, mana)
			if nextTick <= endsAt {
				schedule(sim)
			}
		}}
		sim.AddPendingAction(pending)
	}
	spell = resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 17252}, SpellSchool: core.SpellSchoolPhysical, ProcMask: core.ProcMaskEmpty, Flags: core.SpellFlagHelpful | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1, ThreatMultiplier: 1,
		Cast:               core.CastConfig{CD: core.Cooldown{Timer: resto.NewTimer(), Duration: 30 * time.Minute}},
		ExtraCastCondition: func(sim *core.Simulation, _ *core.Unit) bool { return resto.kfcShamanUtilityReady(sim) },
		Shield: core.ShieldConfig{SelfOnly: true, Aura: core.Aura{Label: "Shaman Mark of the Dragon Lord", Duration: 30 * time.Minute,
			OnGain: func(aura *core.Aura, sim *core.Simulation) {
				generation = state.generation
				endsAt = aura.ExpiresAt()
				nextTick = sim.CurrentTime + 5*time.Second
				schedule(sim)
			},
			OnExpire: func(_ *core.Aura, sim *core.Simulation) {
				if generation == state.generation && endsAt > 0 && sim.CurrentTime >= endsAt && nextTick == endsAt && resto.kfcShamanItemsAlive() {
					resto.AddMana(sim, 22, mana)
				}
				if pending != nil {
					pending.Cancel(sim)
					pending = nil
				}
				nextTick, endsAt = 0, 0
			},
		}},
		ApplyEffects: func(sim *core.Simulation, _ *core.Unit, spell *core.Spell) {
			state.started = true
			spell.SelfShield().Apply(sim, 500)
		},
	})
	state.spells[13143] = spell
}
