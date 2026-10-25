package holy

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

type kfcPaladinRegenerationItems struct {
	owned                             map[int32]bool
	area                              string
	configured, initialized, echoArea bool
	royal                             *core.Aura
}

func (healer *HolyPaladin) registerKFCPaladinRegenerationItems() {
	state := &kfcPaladinRegenerationItems{owned: map[int32]bool{}, area: "neutral"}
	healer.regenerationItems = state
	for _, item := range healer.Equipment {
		state.owned[item.ID] = true
	}
	state.echoArea = state.owned[18472]
	if state.owned[18472] {
		if core.HasItemEffect(18472) {
			panic("Royal Seal gained a global handler; re-admit class behavior")
		}
		state.royal = healer.NewTemporaryStatsAura("Paladin Haunted Royal Seal", core.ActionID{SpellID: 1318477}, stats.Stats{stats.MP5: 9}, core.NeverExpires)
	}
	if state.owned[6323] && core.HasItemEffect(6323) {
		panic("Benevolence gained a global handler; re-admit class behavior")
	}
	baronMetrics := map[int32]*core.ResourceMetrics{}
	if state.owned[6323] {
		for _, agent := range healer.Party.PlayersAndPets {
			unit := &agent.GetCharacter().Unit
			baronMetrics[unit.UnitIndex] = unit.NewHealthMetrics(core.ActionID{SpellID: 1292142})
		}
	}
	core.MakePermanent(healer.RegisterAura(core.Aura{Label: "Paladin item regeneration schedule", OnReset: func(_ *core.Aura, sim *core.Simulation) {
		state.initialized = true
		if state.royal != nil && state.area == "haunted" {
			state.royal.Activate(sim)
		}
		if state.owned[6323] {
			core.StartPeriodicAction(sim, core.PeriodicActionOptions{Period: 5 * time.Second, OnAction: func(sim *core.Simulation) {
				if sim.CurrentTime < 0 || healer.CurrentHealth() <= 0 {
					return
				}
				for _, agent := range healer.Party.PlayersAndPets {
					unit := &agent.GetCharacter().Unit
					if healer.kfcValidHealingTarget(unit, 30) {
						unit.GainHealth(sim, 4, baronMetrics[unit.UnitIndex])
					}
				}
			}})
		}
	}}))
	if state.owned[13505] {
		aura := healer.GetAura("Unholy Aura")
		if aura == nil {
			panic("Expected inherited Runeblade regeneration hook")
		}
		metrics := healer.NewHealthMetrics(core.ActionID{SpellID: 17625})
		aura.OnReset = func(_ *core.Aura, sim *core.Simulation) {
			core.StartPeriodicAction(sim, core.PeriodicActionOptions{Period: 5 * time.Second, Priority: core.ActionPriorityAuto, OnAction: func(sim *core.Simulation) {
				if sim.CurrentTime >= 0 && healer.CurrentHealth() > 0 {
					healer.GainHealth(sim, 60, metrics)
				}
			}})
		}
	}
	if state.owned[13143] {
		healer.registerKFCPaladinDragonMark()
	}
}

func (healer *HolyPaladin) ConfigureKFCPaladinItemArea(sim *core.Simulation, area string) error {
	state := healer.regenerationItems
	if area != "neutral" && area != "haunted" && area != "wasteland" {
		return fmt.Errorf("unknown Paladin item area reference")
	}
	if sim == nil || sim.CurrentTime != 0 || state == nil || state.configured || (!state.owned[18472] && !state.owned[20512]) || healer.GCD.ReadyAt() > 0 || healer.Hardcast.Expires > 0 {
		return fmt.Errorf("item area requires a fresh owner of a context-sensitive item")
	}
	for _, spell := range healer.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("item area cannot change after casting")
			}
		}
	}
	state.area, state.configured, state.echoArea = area, true, true
	if state.initialized && state.royal != nil && area == "haunted" {
		state.royal.Activate(sim)
	}
	return nil
}

func (healer *HolyPaladin) kfcPaladinItemAreaEcho() string {
	if healer.regenerationItems == nil || !healer.regenerationItems.echoArea {
		return ""
	}
	return healer.regenerationItems.area
}

func (healer *HolyPaladin) configureKFCPaladinWorkloadItemArea(sim *core.Simulation, frame KFCPaladinHealingWorkload) error {
	if frame.ItemArea != nil && frame.OrbArea != nil && *frame.ItemArea != *frame.OrbArea {
		return fmt.Errorf("item area and legacy Orb area disagree")
	}
	area := frame.ItemArea
	if area == nil && healer.regenerationItems.owned[18472] {
		area = frame.OrbArea
	}
	if area != nil {
		if err := healer.ConfigureKFCPaladinItemArea(sim, *area); err != nil {
			return err
		}
	}
	if frame.ItemArea != nil && frame.OrbArea == nil && healer.regenerationItems.owned[20512] {
		return healer.ConfigureKFCSanctifiedOrbArea(*frame.ItemArea)
	}
	return nil
}

func (healer *HolyPaladin) registerKFCPaladinDragonMark() {
	if core.HasItemEffect(13143) {
		panic("Dragon Mark gained a global handler; re-admit class behavior")
	}
	action := core.ActionID{SpellID: 17252}
	mana := healer.NewManaMetrics(action)
	var pending *core.PendingAction
	var nextTick, endsAt time.Duration
	var spell *core.Spell
	var schedule func(*core.Simulation)
	schedule = func(sim *core.Simulation) {
		pending = &core.PendingAction{NextActionAt: nextTick, Priority: core.ActionPriorityAuto, OnAction: func(sim *core.Simulation) {
			pending = nil
			shield := spell.SelfShield()
			if !shield.IsActive() {
				return
			}
			if healer.CurrentHealth() <= 0 {
				shield.Deactivate(sim)
				return
			}
			nextTick += 5 * time.Second
			healer.AddMana(sim, 22, mana)
			if nextTick <= endsAt {
				schedule(sim)
			}
		}}
		sim.AddPendingAction(pending)
	}
	spell = healer.RegisterSpell(core.SpellConfig{ActionID: action, ProcMask: core.ProcMaskEmpty, SpellSchool: core.SpellSchoolPhysical, Flags: core.SpellFlagHelpful | core.SpellFlagNoOnCastComplete,
		DamageMultiplier: 1, ThreatMultiplier: 1, Cast: core.CastConfig{CD: core.Cooldown{Timer: healer.NewTimer(), Duration: 30 * time.Minute}},
		ExtraCastCondition: func(sim *core.Simulation, _ *core.Unit) bool {
			return healer.CurrentHealth() > 0 && !healer.IsCasting(sim) && !healer.IsChanneling(sim)
		},
		Shield: core.ShieldConfig{SelfOnly: true, Aura: core.Aura{Label: "Paladin Mark of the Dragon Lord", Duration: 30 * time.Minute,
			OnGain: func(aura *core.Aura, sim *core.Simulation) {
				endsAt = aura.ExpiresAt()
				nextTick = sim.CurrentTime + 5*time.Second
				schedule(sim)
			},
			OnExpire: func(_ *core.Aura, sim *core.Simulation) {
				// Deactivate clears ExpiresAt before the callback; retain the due boundary.
				if endsAt > 0 && sim.CurrentTime >= endsAt && nextTick == endsAt && healer.CurrentHealth() > 0 {
					healer.AddMana(sim, 22, mana)
				}
				if pending != nil {
					pending.Cancel(sim)
					pending = nil
				}
				nextTick, endsAt = 0, 0
			},
		}},
		ApplyEffects: func(sim *core.Simulation, _ *core.Unit, spell *core.Spell) { spell.SelfShield().Apply(sim, 500) },
	})
	healer.AddMajorCooldown(core.MajorCooldown{Type: core.CooldownTypeMana, Spell: spell})
}
