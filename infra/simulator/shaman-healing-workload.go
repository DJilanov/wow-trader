package restoration

import (
	"fmt"
	"math"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	googleProto "google.golang.org/protobuf/proto"
)

type KFCShamanHealingTarget struct {
	RaidIndex     int32   `json:"raidIndex"`
	MaximumHealth float64 `json:"maximumHealth"`
	X             float64 `json:"x"`
	Y             float64 `json:"y"`
}

type KFCShamanHealingDamageEvent struct {
	AtMS      int64   `json:"atMs"`
	RaidIndex int32   `json:"raidIndex"`
	Amount    float64 `json:"amount"`
}

type KFCShamanHealingPriority struct {
	SpellID                   int32   `json:"spellId"`
	RaidIndex                 int32   `json:"raidIndex"`
	MinimumMissingHealth      float64 `json:"minimumMissingHealth"`
	MinimumMissingMana        float64 `json:"minimumMissingMana"`
	KeepHot                   bool    `json:"keepHot"`
	RequireHot                bool    `json:"requireHot"`
	MinimumInjuredTargets     int     `json:"minimumInjuredTargets"`
	MinimumGroupMissingHealth float64 `json:"minimumGroupMissingHealth"`
}

type KFCShamanHealingWorkload struct {
	Schema                               string                        `json:"schema"`
	Name                                 string                        `json:"name"`
	Targets                              []KFCShamanHealingTarget      `json:"targets"`
	Damage                               []KFCShamanHealingDamageEvent `json:"damage"`
	Priorities                           []KFCShamanHealingPriority    `json:"priorities"`
	DecisionIntervalMS                   int64                         `json:"decisionIntervalMs"`
	BounceRange                          float64                       `json:"bounceRange"`
	ChainRouting                         string                        `json:"chainRouting"`
	Water                                KFCShamanWaterPolicy          `json:"water"`
	Resources                            KFCShamanResourcePolicy       `json:"resources"`
	Riptide                              KFCShamanRiptidePolicy        `json:"riptide"`
	UseNaturesSwiftness                  bool                          `json:"useNaturesSwiftness"`
	NaturesSwiftnessMinimumMissingHealth float64                       `json:"naturesSwiftnessMinimumMissingHealth"`
}

type KFCShamanHealingAssignmentMetrics struct {
	Schema                           string  `json:"schema"`
	SupportHpsMean                   float64 `json:"supportHpsMean"`
	SupportHpsStdev                  float64 `json:"supportHpsStdev"`
	HealthRestoredHpsMean            float64 `json:"healthRestoredHpsMean"`
	AbsorbedHpsMean                  float64 `json:"absorbedHpsMean"`
	DamageDemandMean                 float64 `json:"damageDemandMean"`
	OverkillExcludedMean             float64 `json:"overkillExcludedMean"`
	ExternalMissingHealthSecondsMean float64 `json:"externalMissingHealthSecondsMean"`
	FinalExternalMissingHealthMean   float64 `json:"finalExternalMissingHealthMean"`
	UsefulOwnManaTideManaMean        float64 `json:"usefulOwnManaTideManaMean"`
	UsefulOtherManaTideManaMean      float64 `json:"usefulOtherManaTideManaMean"`
}

type KFCShamanHealingWorkloadResult struct {
	Schema                              string                             `json:"schema"`
	Name                                string                             `json:"name"`
	Metrics                             *proto.RaidMetrics                 `json:"metrics"`
	Assignment                          *KFCShamanHealingAssignmentMetrics `json:"assignment"`
	Iterations                          int32                              `json:"iterations"`
	SurvivalRate                        float64                            `json:"survivalRate"`
	ManaRemainingMean                   float64                            `json:"manaRemainingMean"`
	MissingHealthSecondsMean            float64                            `json:"missingHealthSecondsMean"`
	FinalMissingHealthMean              float64                            `json:"finalMissingHealthMean"`
	ManaBlockedSecondsMean              float64                            `json:"manaBlockedSecondsMean"`
	PlannedIncomingPostMitigationDamage float64                            `json:"plannedIncomingPostMitigationDamage"`
	DeliveredIncomingDamageMean         float64                            `json:"deliveredIncomingDamageMean"`
	ClassQualified                      bool                               `json:"classQualified"`
	PublicationAllowed                  bool                               `json:"publicationAllowed"`
}

func kfcFinite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

func kfcShamanWorkloadFamily(id int32) string {
	for _, rank := range kfcShamanHealingRanks {
		if rank.ID == id {
			return rank.Family
		}
	}
	for _, rank := range kfcShamanRiptideRanks {
		if rank.ID == id {
			return "riptide"
		}
	}
	for _, rank := range kfcShamanWaterRanks {
		if rank.ID == id {
			return rank.Family
		}
	}
	if id == kfcShamanShieldID {
		return "water-shield"
	}
	return ""
}

func validateKFCShamanWorkloadRequest(player *proto.Player, raid *proto.Raid) error {
	if player.Level != 60 || player.Class != proto.Class_ClassShaman || player.GetRestorationShaman() == nil || player.HealingModel != nil {
		return fmt.Errorf("Shaman workload requires one level60 Restoration Shaman and no external healing model")
	}
	if err := ValidateKFCShamanHealingStudyTalents(player.TalentsString); err != nil {
		return err
	}
	// Equipment and consumable handlers need their own source-bound admission.
	if player.Equipment != nil && !googleProto.Equal(player.Equipment, &proto.EquipmentSpec{}) {
		return fmt.Errorf("Shaman equipment is not admitted by the spell-controller component")
	}
	if player.Consumes != nil && !googleProto.Equal(player.Consumes, &proto.Consumes{}) {
		return fmt.Errorf("Shaman consumes need separate admission")
	}
	if player.Cooldowns != nil && !googleProto.Equal(player.Cooldowns, &proto.Cooldowns{}) {
		return fmt.Errorf("declare controlled actives through the Shaman workload")
	}
	if options := player.GetRestorationShaman().GetOptions(); options != nil && !googleProto.Equal(options, &proto.RestorationShaman_Options{}) {
		return fmt.Errorf("Shaman options require separately reviewed policies")
	}
	if player.Buffs != nil && (player.Buffs.Innervates != 0 || player.Buffs.PowerInfusions != 0) {
		return fmt.Errorf("external resource cooldowns need separate admission")
	}
	if len(raid.Tanks) != 0 {
		return fmt.Errorf("workload damage must use only the declared post-mitigation schedule")
	}
	for _, party := range raid.Parties {
		if party == nil {
			return fmt.Errorf("nil benchmark party")
		}
		if party.Buffs != nil && party.Buffs.ManaTideTotems != 0 {
			return fmt.Errorf("external Mana Tide needs separate admission")
		}
	}
	return nil
}

func (resto *RestorationShaman) validateKFCShamanWorkloadPriority(priority KFCShamanHealingPriority, units map[int32]*core.Unit) error {
	family := kfcShamanWorkloadFamily(priority.SpellID)
	if family == "" || resto.GetSpell(core.ActionID{SpellID: priority.SpellID}) == nil {
		return fmt.Errorf("unowned or nonraid-ineligible Shaman cast root %d", priority.SpellID)
	}
	if priority.RaidIndex < -1 || priority.RaidIndex >= 0 && units[priority.RaidIndex] == nil || !kfcFinite(priority.MinimumMissingHealth) || priority.MinimumMissingHealth < 0 || priority.MinimumMissingHealth > 1000000 || !kfcFinite(priority.MinimumMissingMana) || priority.MinimumMissingMana < 0 || priority.MinimumMissingMana > 1000000 || !kfcFinite(priority.MinimumGroupMissingHealth) || priority.MinimumGroupMissingHealth < 0 || priority.MinimumGroupMissingHealth > 3000000 || priority.MinimumInjuredTargets < 0 || priority.MinimumInjuredTargets > 3 {
		return fmt.Errorf("invalid Shaman priority target or threshold")
	}
	if priority.KeepHot && family != "riptide" || priority.RequireHot && family != "chain-heal" || (priority.MinimumInjuredTargets > 0 || priority.MinimumGroupMissingHealth > 0) && family != "chain-heal" {
		return fmt.Errorf("Shaman HoT and chain-demand policies require their owned cast roots")
	}
	if family == "mana-tide" || family == "water-shield" || family == "healing-stream" {
		if priority.RaidIndex != -1 && priority.RaidIndex != resto.Index || priority.MinimumMissingHealth != 0 {
			return fmt.Errorf("totem and shield priorities target the caster, with no health threshold")
		}
	} else if priority.MinimumMissingMana != 0 {
		return fmt.Errorf("healing priorities cannot declare a mana-resource threshold")
	}
	return nil
}

func (resto *RestorationShaman) kfcShamanHasRiptide(sim *core.Simulation, target *core.Unit) bool {
	state := resto.kfcRiptide.targets[target.UnitIndex]
	return state != nil && state.aura != nil && state.aura.IsActive() && state.expires > sim.CurrentTime
}

func (resto *RestorationShaman) kfcShamanPriorityTarget(sim *core.Simulation, priority KFCShamanHealingPriority) *core.Unit {
	family := kfcShamanWorkloadFamily(priority.SpellID)
	if family == "water-shield" || family == "mana-tide" || family == "healing-stream" {
		if resto.MaxMana()-resto.CurrentMana() < priority.MinimumMissingMana {
			return nil
		}
		if family == "water-shield" && resto.WaterShieldAura != nil && resto.WaterShieldAura.IsActive() && resto.WaterShieldAura.GetStacks() > 0 {
			return nil
		}
		if family == "healing-stream" && resto.kfcWater.current != nil && resto.kfcWater.expires > sim.CurrentTime {
			return nil
		}
		return &resto.Unit
	}
	var selected *core.Unit
	for _, unit := range resto.kfcHealingPlayers() {
		missing := max(0, unit.MaxHealth()-unit.CurrentHealth())
		if !resto.kfcValidHealingTarget(unit) || missing <= 0 || missing < priority.MinimumMissingHealth || priority.RaidIndex >= 0 && unit.Index != priority.RaidIndex {
			continue
		}
		if priority.KeepHot && resto.kfcShamanHasRiptide(sim, unit) || priority.RequireHot && !resto.kfcShamanHasRiptide(sim, unit) {
			continue
		}
		if family == "chain-heal" && (priority.MinimumInjuredTargets > 0 || priority.MinimumGroupMissingHealth > 0) {
			injured, deficit := 1, missing
			used, previous := map[int32]bool{unit.UnitIndex: true}, unit
			for hop := 1; hop < 3; hop++ {
				next := resto.kfcChainTarget(previous, used)
				if next == nil {
					break
				}
				used[next.UnitIndex], previous = true, next
				injured++
				deficit += max(0, next.MaxHealth()-next.CurrentHealth())
			}
			if injured < priority.MinimumInjuredTargets || deficit < priority.MinimumGroupMissingHealth {
				continue
			}
		}
		if selected == nil || unit.CurrentHealthPercent() < selected.CurrentHealthPercent() || unit.CurrentHealthPercent() == selected.CurrentHealthPercent() && unit.Index < selected.Index {
			selected = unit
		}
	}
	return selected
}

func (resto *RestorationShaman) registerKFCShamanWorkloadDamage() {
	for _, unit := range resto.kfcHealingPlayers() {
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
