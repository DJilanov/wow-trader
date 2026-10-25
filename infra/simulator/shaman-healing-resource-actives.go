package restoration

import (
	"fmt"
	"strings"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/shaman"
	"google.golang.org/protobuf/reflect/protoreflect"
)

// KFC_SHAMAN_RESOURCE_ACTIVE_VALUES

type KFCShamanResourcePolicy struct {
	ShieldCooldown, ShieldTriggers, SwiftnessCooldownStart string
}

type kfcShamanResourceActives struct {
	configured     bool
	policy         KFCShamanResourcePolicy
	shieldICD      core.Cooldown
	shieldMetrics  *core.ResourceMetrics
	swiftnessSpell *core.Spell
	swiftnessAura  *core.Aura
}

func validateKFCShamanComponentTalentEncoding(value string) {
	parts := strings.Split(value, "-")
	if len(parts) > len(kfcShamanComponentTalentMaximums) {
		panic("Too many Shaman talent trees")
	}
	for treeIndex, part := range parts {
		maximums := kfcShamanComponentTalentMaximums[treeIndex]
		if len(part) > len(maximums) {
			panic("Too many Shaman talent positions")
		}
		for index, rank := range []byte(part) {
			if rank < '0' || rank > '9' || int(rank-'0') > maximums[index] {
				panic("Invalid Shaman component talent encoding")
			}
		}
	}
}

func kfcShamanResourceTalentAllowed(field protoreflect.FieldDescriptor) bool {
	return (field.Name() == "water_shield" || field.Name() == "natures_swiftness") && field.Kind() == protoreflect.BoolKind
}

func (resto *RestorationShaman) ConfigureKFCShamanResourcePolicy(sim *core.Simulation, policy KFCShamanResourcePolicy) error {
	controller := resto.kfcActives
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || controller == nil || controller.configured || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("resource policy requires a fresh positioned Shaman")
	}
	if (policy.ShieldCooldown != "current-client-reference" && policy.ShieldCooldown != "legacy-fifteen-second-reference") || (policy.ShieldTriggers != "class-direct-critical-heals-reference" && policy.ShieldTriggers != "all-direct-critical-heals-reference" && policy.ShieldTriggers != "all-critical-heals-reference") || (policy.SwiftnessCooldownStart != "activation-reference" && policy.SwiftnessCooldownStart != "consumption-reference") {
		return fmt.Errorf("unreviewed Shaman resource reference")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("resource policy cannot change after casting")
			}
		}
	}
	controller.policy = policy
	controller.configured = true
	if resto.WaterShield != nil {
		resto.WaterShield.CD.Duration = 0
		if policy.ShieldCooldown == "legacy-fifteen-second-reference" {
			resto.WaterShield.CD.Duration = 15 * time.Second
		}
	}
	return nil
}

func (resto *RestorationShaman) kfcConsumeWaterGlobe(sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
	controller := resto.kfcActives
	if !controller.configured || resto.CurrentHealth() <= 0 || !result.DidCrit() || !controller.shieldICD.IsReady(sim) {
		return
	}
	if controller.policy.ShieldTriggers != "all-critical-heals-reference" && !result.DirectDamageOrHealing {
		return
	}
	if controller.policy.ShieldTriggers == "class-direct-critical-heals-reference" && !kfcShamanClassHealIDs[spell.ActionID.SpellID] {
		return
	}
	if resto.WaterShieldAura == nil || !resto.WaterShieldAura.IsActive() || resto.WaterShieldAura.GetStacks() == 0 {
		return
	}
	controller.shieldICD.Use(sim)
	resto.AddMana(sim, resto.MaxMana()*kfcShamanShieldManaPercent/100, controller.shieldMetrics)
	resto.WaterShieldAura.RemoveStack(sim)
}

func (resto *RestorationShaman) registerKFCShamanResourceActives() {
	controller := &kfcShamanResourceActives{shieldICD: core.Cooldown{Timer: resto.NewTimer(), Duration: time.Duration(kfcShamanShieldICDMs) * time.Millisecond}}
	resto.kfcActives = controller
	if resto.Talents.WaterShield && int(resto.Level) >= kfcShamanShieldLevel {
		controller.shieldMetrics = resto.NewManaMetrics(core.ActionID{SpellID: kfcShamanShieldProcID})
		controller.shieldMetrics.NoThreat = true
		resto.WaterShieldAura = resto.RegisterAura(core.Aura{Label: "KFC owned Water Shield", ActionID: core.ActionID{SpellID: kfcShamanShieldID}, Duration: time.Duration(kfcShamanShieldDurationMs) * time.Millisecond, MaxStacks: kfcShamanShieldCharges, OnExpire: func(aura *core.Aura, _ *core.Simulation) {
			if resto.ActiveShieldAura == aura {
				resto.ActiveShieldAura = nil
				resto.ActiveShield = nil
			}
		}, OnHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			resto.kfcConsumeWaterGlobe(sim, spell, result)
		}, OnPeriodicHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			resto.kfcConsumeWaterGlobe(sim, spell, result)
		}})
		// Core registration requires a nonzero duration for a timer. Mandatory policy setup assigns 0 or 15 seconds before casting is enabled.
		resto.WaterShield = resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: kfcShamanShieldID}, SpellCode: shaman.SpellCode_ShamanWaterShield, SpellSchool: core.SpellSchoolNature, ProcMask: core.ProcMaskEmpty, Flags: core.SpellFlagHelpful | core.SpellFlagAPL | shaman.SpellFlagShaman, RequiredLevel: kfcShamanShieldLevel, Rank: 1, Cast: core.CastConfig{DefaultCast: core.Cast{GCD: time.Duration(kfcShamanShieldGCDMs) * time.Millisecond}, CD: core.Cooldown{Timer: resto.NewTimer(), Duration: 15 * time.Second}}, ExtraCastCondition: func(_ *core.Simulation, _ *core.Unit) bool { return controller.configured && resto.CurrentHealth() > 0 }, ApplyEffects: func(sim *core.Simulation, _ *core.Unit, spell *core.Spell) {
			if resto.ActiveShieldAura != nil && resto.ActiveShieldAura != resto.WaterShieldAura {
				resto.ActiveShieldAura.Deactivate(sim)
			}
			resto.ActiveShield = spell
			resto.ActiveShieldAura = resto.WaterShieldAura
			resto.WaterShieldAura.Activate(sim)
			resto.WaterShieldAura.SetStacks(sim, kfcShamanShieldCharges)
		}})
	}
	if resto.Talents.NaturesSwiftness && int(resto.Level) >= kfcShamanSwiftnessLevel {
		eligible := map[*core.Spell]bool{}
		for _, spell := range resto.Spellbook {
			if kfcShamanSwiftnessHealIDs[spell.ActionID.SpellID] && spell.DefaultCast.CastTime > 0 {
				eligible[spell] = true
			}
		}
		controller.swiftnessAura = resto.RegisterAura(core.Aura{Label: "KFC owned Nature's Swiftness", ActionID: core.ActionID{SpellID: kfcShamanSwiftnessID}, Duration: core.NeverExpires, OnGain: func(_ *core.Aura, _ *core.Simulation) {
			for spell := range eligible {
				spell.CastTimeMultiplier -= 1
			}
		}, OnExpire: func(_ *core.Aura, _ *core.Simulation) {
			for spell := range eligible {
				spell.CastTimeMultiplier += 1
			}
		}, OnCastComplete: func(aura *core.Aura, sim *core.Simulation, spell *core.Spell) {
			if eligible[spell] {
				aura.Deactivate(sim)
				if controller.policy.SwiftnessCooldownStart == "consumption-reference" {
					controller.swiftnessSpell.CD.Use(sim)
				}
			}
		}})
		controller.swiftnessSpell = resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: kfcShamanSwiftnessID}, SpellSchool: core.SpellSchoolNature, ProcMask: core.ProcMaskEmpty, Flags: core.SpellFlagHelpful | core.SpellFlagAPL | core.SpellFlagNoOnCastComplete, RequiredLevel: kfcShamanSwiftnessLevel, Rank: 1, Cast: core.CastConfig{CD: core.Cooldown{Timer: resto.NewTimer(), Duration: time.Duration(kfcShamanSwiftnessCooldownMs) * time.Millisecond}}, ExtraCastCondition: func(_ *core.Simulation, _ *core.Unit) bool {
			return controller.configured && resto.CurrentHealth() > 0 && !controller.swiftnessAura.IsActive()
		}, ApplyEffects: func(sim *core.Simulation, _ *core.Unit, _ *core.Spell) { controller.swiftnessAura.Activate(sim) }})
	}
}
