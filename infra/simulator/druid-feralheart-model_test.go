package restoration

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/druid/feral"
)

func init() { feral.RegisterFeralDruid() }

func kfcFeralheartRequest(count int) *proto.RaidSimRequest {
	equipment := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for i := range equipment.Items {
		equipment.Items[i] = &proto.ItemSpec{}
	}
	slots := []int{5, 7, 8, 0, 6, 9, 2, 4}
	for i := 0; i < count; i++ {
		equipment.Items[slots[i]] = &proto.ItemSpec{Id: int32(22106 + i)}
	}
	return &proto.RaidSimRequest{Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{Name: "Equipped base Feralheart control", Level: 60, Race: proto.Race_RaceNightElf, Class: proto.Class_ClassDruid, Equipment: equipment,
		BonusStats: &proto.UnitStats{Stats: stats.Stats{stats.Mana: 10000}.ToFloatArray()}, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL}, Spec: &proto.Player_RestorationDruid{RestorationDruid: &proto.RestorationDruid{Options: &proto.RestorationDruid_Options{}}}}}}}, TargetDummies: 1},
		Encounter: &proto.Encounter{Duration: 60, Targets: []*proto.Target{{Name: "Feralheart equipped control", Level: 63}}}, SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 7911, Ruleset: proto.Ruleset_RulesetForever, IsTest: true, Interactive: true}}
}

func kfcFeralheartFixture(t *testing.T, count int) (*core.Simulation, *RestorationDruid) {
	t.Helper()
	sim := core.NewSim(kfcFeralheartRequest(count), simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*RestorationDruid)
}

func TestKFCDruidFeralheartExactThresholdStats(t *testing.T) {
	_, bare := kfcFeralheartFixture(t, 0)
	output := []float64{}
	for count := 1; count <= 8; count++ {
		_, wearer := kfcFeralheartFixture(t, count)
		var equipment stats.Stats
		for i := 0; i < count; i++ {
			item, exists := core.ItemsByID[int32(22106+i)]
			if !exists || item.SetID != 513 {
				t.Fatal("Missing exact compiled base item")
			}
			equipment = equipment.Add(item.Stats)
		}
		healing, ap, armor := 0.0, 0.0, 0.0
		if count >= 6 {
			healing = 15
			ap = 26
		}
		if count >= 8 {
			armor = 200
		}
		kfcDruidNear(t, wearer.GetStat(stats.HealingPower)-bare.GetStat(stats.HealingPower)-equipment[stats.HealingPower], healing)
		kfcDruidNear(t, wearer.GetStat(stats.SpellDamage)-bare.GetStat(stats.SpellDamage)-equipment[stats.SpellDamage], healing)
		kfcDruidNear(t, wearer.GetStat(stats.MP5)-bare.GetStat(stats.MP5)-equipment[stats.MP5], 0)
		kfcDruidNear(t, wearer.GetStat(stats.RangedAttackPower)-bare.GetStat(stats.RangedAttackPower)-equipment[stats.RangedAttackPower], ap)
		kfcDruidNear(t, wearer.GetStat(stats.BonusArmor)-bare.GetStat(stats.BonusArmor)-equipment[stats.BonusArmor], armor)
		resist := 0.0
		if count >= 2 {
			resist = 8
		}
		for _, stat := range []stats.Stat{stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
			kfcDruidNear(t, wearer.GetStat(stat)-bare.GetStat(stat)-equipment[stat], resist)
		}
		output = append(output, float64(count), healing, ap, armor)
	}
	kfcDruidAdvancedResult("FERALHEART_THRESHOLDS", output)
}

func TestKFCDruidFeralheartBaseAndAlternateCannotMix(t *testing.T) {
	_, wearer := kfcFeralheartFixture(t, 4)
	for slot, item := range wearer.Equipment {
		if item.ID == 22109 {
			item.SetID = 1667
			wearer.Equipment[slot] = item
		}
	}
	for _, bonus := range wearer.GetActiveSetBonuses() {
		if bonus.Name == "Feralheart Raiment" && bonus.NumPieces != 2 {
			t.Fatalf("Mixed identities produced %d-piece bonus", bonus.NumPieces)
		}
	}
	for _, pieces := range []int32{2, 4, 6, 8} {
		if !core.ForeverEquipmentBonusSupported(513, pieces) {
			t.Fatal("Missing base threshold")
		}
	}
	for _, pieces := range []int32{1, 3, 5, 7} {
		if core.ForeverEquipmentBonusSupported(513, pieces) {
			t.Fatal("Alternate threshold leaked into base set")
		}
	}
}

func TestKFCDruidFeralheartIncomingProcSelectsCurrentResource(t *testing.T) {
	output := []float64{}
	for _, bar := range []core.PowerBarType{core.ManaBar, core.RageBar, core.EnergyBar} {
		request := kfcFeralheartRequest(4)
		request.Raid.Parties[0].Players[0].Spec = &proto.Player_FeralDruid{FeralDruid: &proto.FeralDruid{Options: &proto.FeralDruid_Options{}}}
		sim := core.NewSim(request, simsignals.CreateSignals())
		sim.Reset()
		wearer := sim.Raid.Parties[0].Players[0].GetCharacter()
		// Feral enables all three real resource bars. Isolate the active-bar policy from shapeshift costs.
		wearer.SetCurrentPowerBar(bar)
		aura := wearer.GetAura("Base Feralheart Nature's Bounty")
		if aura == nil || aura.OnSpellHitTaken == nil {
			t.Fatal("Missing base incoming proc")
		}
		wearer.SpendMana(sim, wearer.CurrentMana()/2, wearer.NewManaMetrics(core.ActionID{SpellID: 27798, Tag: 91}))
		wearer.SpendRage(sim, wearer.CurrentRage(), wearer.NewRageMetrics(core.ActionID{SpellID: 27798, Tag: 91}))
		wearer.SpendEnergy(sim, wearer.CurrentEnergy(), wearer.NewEnergyMetrics(core.ActionID{SpellID: 27798, Tag: 91}))
		incoming := sim.Encounter.TargetUnits[0].RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 771}, SpellSchool: core.SpellSchoolPhysical, ProcMask: core.ProcMaskMeleeMHAuto, DamageMultiplier: 1})
		procs := 0
		for i := 0; i < 1000; i++ {
			before := []float64{wearer.CurrentMana(), wearer.CurrentRage(), wearer.CurrentEnergy()}
			result := incoming.NewResult(&wearer.Unit)
			result.Outcome = core.OutcomeHit
			result.Damage = 1
			aura.OnSpellHitTaken(aura, sim, incoming, result)
			incoming.DisposeResult(result)
			delta := []float64{wearer.CurrentMana() - before[0], wearer.CurrentRage() - before[1], wearer.CurrentEnergy() - before[2]}
			changed := false
			for index, value := range delta {
				expected := 0.0
				if (bar == core.ManaBar && index == 0) || (bar == core.RageBar && index == 1) || (bar == core.EnergyBar && index == 2) {
					if value > 0 {
						expected = []float64{300, 10, 40}[index]
						changed = true
					}
				}
				kfcDruidNear(t, value, expected)
			}
			if changed {
				procs++
			}
			wearer.SpendMana(sim, delta[0], wearer.NewManaMetrics(core.ActionID{SpellID: 27798, Tag: 92}))
			wearer.SpendRage(sim, delta[1], wearer.NewRageMetrics(core.ActionID{SpellID: 27798, Tag: 92}))
			wearer.SpendEnergy(sim, delta[2], wearer.NewEnergyMetrics(core.ActionID{SpellID: 27798, Tag: 92}))
		}
		if procs == 0 || procs == 1000 {
			t.Fatal("Proc chance was ignored")
		}
		output = append(output, float64(bar), float64(procs))
	}
	kfcDruidAdvancedResult("FERALHEART_RESOURCES", output)
}

func TestKFCDruidFeralheartRejectsSpellHitsMissesAndOutgoingEvents(t *testing.T) {
	sim, wearer := kfcFeralheartFixture(t, 4)
	aura := wearer.GetAura("Base Feralheart Nature's Bounty")
	wearer.SpendMana(sim, 1000, wearer.NewManaMetrics(core.ActionID{SpellID: 27798, Tag: 91}))
	before := wearer.CurrentMana()
	for _, entry := range []struct {
		mask    core.ProcMask
		outcome core.HitOutcome
	}{{core.ProcMaskSpellDamage, core.OutcomeHit}, {core.ProcMaskMeleeMHAuto, core.OutcomeMiss}} {
		spell := sim.Encounter.TargetUnits[0].RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: int32(entry.mask)}, SpellSchool: core.SpellSchoolPhysical, ProcMask: entry.mask, DamageMultiplier: 1})
		for i := 0; i < 1000; i++ {
			result := spell.NewResult(&wearer.Unit)
			result.Outcome = entry.outcome
			result.Damage = 1
			aura.OnSpellHitTaken(aura, sim, spell, result)
			spell.DisposeResult(result)
		}
	}
	kfcDruidNear(t, wearer.CurrentMana(), before)
	if aura.OnCastComplete != nil || aura.OnHealDealt != nil || aura.OnSpellHitDealt != nil {
		t.Fatal("Base proc inherited outgoing or cast triggers")
	}
}

func TestKFCDruidFeralheartWorkloadGrantsNoImplicitMana(t *testing.T) {
	sim, wearer := kfcFeralheartFixture(t, 4)
	wearer.SpendMana(sim, 1000, wearer.NewManaMetrics(core.ActionID{SpellID: 27798, Tag: 91}))
	before := wearer.CurrentMana()
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 1000)
	spell := wearer.GetSpell(core.ActionID{SpellID: 5185})
	if !spell.Cast(sim, target) {
		t.Fatal("Healing control cast was rejected")
	}
	kfcDruidAdvance(t, sim, 1500*time.Millisecond)
	kfcDruidNear(t, wearer.CurrentMana(), before-25)
	sim.Cleanup()
	sim.Reset()
	if !wearer.GetAura("Base Feralheart Nature's Bounty").IsActive() {
		t.Fatal("Incoming receiver did not reset")
	}
}
