package restoration

import (
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

type KFCDruidItemEffectsPolicy struct {
	Schema                    string   `json:"schema"`
	ID                        string   `json:"id"`
	DormantHeartProcChance    *float64 `json:"dormantHeartProcChance"`
	DormantHeartHealingEvents string   `json:"dormantHeartHealingEvents"`
}

type kfcDruidItemEffects struct {
	policy  *KFCDruidItemEffectsPolicy
	hasAny  bool
	started bool
}

func (policy KFCDruidItemEffectsPolicy) Validate() error {
	if policy.Schema != "kfc-druid-item-effects-policy.v1" || policy.ID == "" || len(policy.ID) > 100 || policy.DormantHeartProcChance == nil ||
		(policy.DormantHeartHealingEvents != "completed-casts" && policy.DormantHeartHealingEvents != "direct-heals") {
		return fmt.Errorf("invalid Druid item effects policy")
	}
	chance := *policy.DormantHeartProcChance
	if math.IsNaN(chance) || math.IsInf(chance, 0) || chance < 0 || chance > 1 {
		return fmt.Errorf("invalid Dormant Heart probability")
	}
	return nil
}

func (resto *RestorationDruid) ConfigureKFCDruidItemEffects(policy KFCDruidItemEffectsPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	if resto.itemEffects == nil || resto.itemEffects.policy != nil || resto.itemEffects.started || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("item research requires a fresh Druid")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("item research cannot change after casting")
			}
		}
	}
	chance := *policy.DormantHeartProcChance
	policy.DormantHeartProcChance = &chance
	resto.itemEffects.policy = &policy
	return nil
}

func (resto *RestorationDruid) kfcResolvedItemEffectsPolicy() KFCDruidItemEffectsPolicy {
	if resto.itemEffects.policy != nil {
		return *resto.itemEffects.policy
	}
	chance := 1.0
	return KFCDruidItemEffectsPolicy{Schema: "kfc-druid-item-effects-policy.v1", ID: "heart-client-literal", DormantHeartProcChance: &chance, DormantHeartHealingEvents: "completed-casts"}
}

func (resto *RestorationDruid) registerKFCItemResources() {
	state := &kfcDruidItemEffects{}
	resto.itemEffects = state
	owned := map[int32]bool{}
	for _, item := range resto.Equipment {
		owned[item.ID] = true
	}
	if owned[249473] {
		if core.HasItemEffect(249473) {
			panic("Dormant Heart already has a global handler; re-admit class behavior")
		}
		state.hasAny = true
		buff := resto.NewTemporaryStatsAura("Druid Eternal Power", core.ActionID{SpellID: 1249119}, stats.Stats{stats.HealingPower: 40, stats.SpellDamage: 13}, 15*time.Second)
		eligible := func(spell *core.Spell) bool {
			return resto.kfcSelfEffectsAlive() && spell.ProcMask.Matches(core.ProcMaskSpellHealing) && !spell.Flags.Matches(core.SpellFlagPassiveSpell|core.SpellFlagNoOnCastComplete)
		}
		trigger := func(sim *core.Simulation) {
			state.started = true
			chance := *resto.kfcResolvedItemEffectsPolicy().DormantHeartProcChance
			if chance > 0 && sim.Proc(chance, "Druid Eternal Power") {
				buff.Activate(sim)
			}
		}
		core.MakePermanent(resto.RegisterAura(core.Aura{Label: "Druid Dormant Heart trigger", ActionID: core.ActionID{SpellID: 1249118},
			OnCastComplete: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell) {
				if eligible(spell) && resto.kfcResolvedItemEffectsPolicy().DormantHeartHealingEvents == "completed-casts" {
					trigger(sim)
				}
			},
			OnHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
				if eligible(spell) && result.DirectDamageOrHealing && resto.kfcResolvedItemEffectsPolicy().DormantHeartHealingEvents == "direct-heals" {
					trigger(sim)
				}
			},
		}))
	}
	if !owned[18371] {
		resto.kfcRegisterSecondWind(nil)
		return
	}
	if core.HasItemEffect(18371) {
		panic("Mindtap already has a global handler; re-admit class behavior")
	}
	state.hasAny = true
	action := core.ActionID{SpellID: 1302205}
	mana := resto.NewManaMetrics(action)
	capLoss := resto.NewManaMetrics(core.ActionID{SpellID: 1302206})
	penalty := resto.NewTemporaryStatsAuraWrapped("Druid Tapped Mind", core.ActionID{SpellID: 1302206}, stats.Stats{stats.Intellect: -60}, 2*time.Minute, func(aura *core.Aura) {
		gain := aura.OnGain
		aura.OnGain = func(aura *core.Aura, sim *core.Simulation) {
			gain(aura, sim)
			if loss := resto.CurrentMana() - resto.MaxMana(); loss > 0 {
				resto.SpendMana(sim, loss, capLoss)
			}
		}
	})
	shared := core.Cooldown{Timer: resto.NewTimer(), Duration: 10 * time.Second}
	spell := resto.Character.RegisterSpell(core.SpellConfig{ActionID: action, ProcMask: core.ProcMaskEmpty,
		Flags: core.SpellFlagHelpful | core.SpellFlagNoOnCastComplete,
		Cast:  core.CastConfig{CD: core.Cooldown{Timer: resto.NewTimer(), Duration: 7 * time.Minute}, SharedCD: shared},
		ExtraCastCondition: func(sim *core.Simulation, _ *core.Unit) bool {
			return resto.kfcSelfEffectsAlive() && shared.IsReady(sim) && resto.GetStat(stats.Intellect) >= 60
		},
		ApplyEffects: func(sim *core.Simulation, _ *core.Unit, _ *core.Spell) {
			state.started = true
			penalty.Activate(sim)
			core.StartPeriodicAction(sim, core.PeriodicActionOptions{Period: time.Second, NumTicks: 10, Priority: core.ActionPriorityAuto,
				OnAction: func(sim *core.Simulation) {
					if resto.kfcSelfEffectsAlive() {
						resto.AddMana(sim, 125, mana)
					}
				},
			})
		},
	})
	resto.AddMajorCooldown(core.MajorCooldown{Type: core.CooldownTypeMana, Spell: spell})
	resto.kfcRegisterSecondWind(&shared)
}

func (resto *RestorationDruid) kfcRegisterSecondWind(shared *core.Cooldown) {
	if second := resto.GetSpell(core.ActionID{SpellID: 15604}); second != nil {
		condition := second.ExtraCastCondition
		mana := resto.NewManaMetrics(core.ActionID{SpellID: 15604})
		if shared != nil {
			second.SharedCD = *shared
		}
		second.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
			return resto.kfcSelfEffectsAlive() && (shared == nil || shared.IsReady(sim)) && (condition == nil || condition(sim, target))
		}
		second.ApplyEffects = func(sim *core.Simulation, _ *core.Unit, _ *core.Spell) {
			resto.itemEffects.started = true
			if shared != nil {
				shared.Use(sim)
			}
			core.StartPeriodicAction(sim, core.PeriodicActionOptions{Period: time.Second, NumTicks: 10, Priority: core.ActionPriorityAuto,
				OnAction: func(sim *core.Simulation) {
					if resto.kfcSelfEffectsAlive() {
						resto.AddMana(sim, 63, mana)
					}
				},
			})
		}
	}
}
