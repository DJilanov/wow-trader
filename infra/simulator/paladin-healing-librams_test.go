package holy

import (
	"context"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
)

func kfcPaladinLibramFixture(t *testing.T, id int32, talents string) (*core.Simulation, *HolyPaladin, *core.Unit) {
	t.Helper()
	request, _ := kfcPaladinWorkloadControl()
	request.SimOptions.Interactive = true
	request.Encounter.Duration = 60
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = talents
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for slot := range player.Equipment.Items {
		player.Equipment.Items[slot] = &proto.ItemSpec{}
	}
	player.Equipment.Items[16].Id = id
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	holy := sim.Raid.Parties[0].Players[0].(*HolyPaladin)
	positions := make(map[int32]KFCPaladinFriendlyPosition)
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = KFCPaladinFriendlyPosition{}
	}
	if err := holy.ConfigureKFCPaladinActiveHealing(positions, KFCPaladinVigilSingleRefund); err != nil {
		t.Fatal(err)
	}
	return sim, holy, &sim.Raid.GetFirstTargetDummy().Unit
}

func TestKFCPaladinEconomyAllRanksAndUnaffectedFamilies(t *testing.T) {
	_, holy, _ := kfcPaladinLibramFixture(t, 272436, kfcPaladinActiveTalents(map[int]int{11: 1, 13: 1, 16: 1}))
	values := []float64{}
	for _, rank := range kfcPaladinHealingRanks {
		spell := holy.GetSpell(core.ActionID{SpellID: rank.ID})
		expected := rank.Mana
		if kfcPaladinLibramLightIDs[rank.ID] {
			expected *= .95
		}
		kfcPaladinNear(t, spell.Cost.GetCurrentCost(), expected)
		values = append(values, spell.Cost.GetCurrentCost())
	}
	for _, rank := range append(kfcPaladinShockRanks, kfcPaladinVigilRanks...) {
		kfcPaladinNear(t, holy.GetSpell(core.ActionID{SpellID: rank.Data.ID}).Cost.GetCurrentCost(), rank.Data.Mana)
	}
	kfcPaladinNear(t, holy.GetSpell(core.ActionID{SpellID: 20216}).Cost.GetCurrentCost(), holy.BaseMana*.04)
	kfcPaladinActiveMeasure("LIBRAM_ECONOMY_RANKS", values)
}

func TestKFCPaladinEconomyActualCostsAndOriginalRefunds(t *testing.T) {
	values := []float64{}
	for _, rank := range kfcPaladinHealingRanks {
		if !kfcPaladinLibramLightIDs[rank.ID] {
			continue
		}
		sim, holy, target := kfcPaladinLibramFixture(t, 272436, kfcPaladinActiveTalents(map[int]int{10: 5}))
		target.RemoveHealth(sim, 9000)
		spell := holy.GetSpell(core.ActionID{SpellID: rank.ID})
		spell.BonusCritRating = 10000
		before := holy.CurrentMana()
		if !spell.Cast(sim, target) {
			t.Fatal("Discounted Holy Light failed", rank.ID)
		}
		kfcPaladinAdvance(t, sim, spell.DefaultCast.CastTime)
		kfcPaladinNear(t, holy.Metrics.ManaSpent, rank.Mana*.95)
		kfcPaladinNear(t, holy.CurrentMana()-before, -rank.Mana*.45)
		values = append(values, holy.Metrics.ManaSpent, holy.CurrentMana()-before)
	}
	kfcPaladinActiveMeasure("LIBRAM_ECONOMY_REFUNDS", values)
}

func TestKFCPaladinEconomyBenedictionAndReset(t *testing.T) {
	talents := kfcPaladinActiveTalents(map[int]int{13: 1}) + "--05"
	sim, holy, target := kfcPaladinLibramFixture(t, 272436, talents)
	for iteration := 0; iteration < 3; iteration++ {
		kfcPaladinNear(t, holy.GetSpell(core.ActionID{SpellID: 10329}).Cost.GetCurrentCost(), 551)
		shock := holy.GetSpell(core.ActionID{SpellID: 20930})
		kfcPaladinNear(t, shock.Cost.GetCurrentCost(), 292.5)
		if !shock.Cast(sim, target) {
			t.Fatal("Benediction/Economy cast failed")
		}
		kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
		sim.Cleanup()
		sim.Reset()
	}
}

func TestKFCPaladinAlacrityNonCriticalShockEveryRank(t *testing.T) {
	values := []float64{}
	for _, rank := range kfcPaladinShockRanks {
		sim, holy, target := kfcPaladinLibramFixture(t, 228175, kfcPaladinActiveTalents(map[int]int{13: 1}))
		shock := holy.GetSpell(core.ActionID{SpellID: rank.Data.ID})
		shock.BonusCritRating = -10000
		if !shock.Cast(sim, target) {
			t.Fatal("Noncritical Alacrity trigger failed", rank.Data.ID)
		}
		for _, light := range kfcPaladinHealingRanks {
			spell := holy.GetSpell(core.ActionID{SpellID: light.ID})
			expected := time.Duration(light.CastMs) * time.Millisecond
			if kfcPaladinLibramLightIDs[light.ID] {
				expected -= 200 * time.Millisecond
			}
			if spell.DefaultCast.CastTime != expected {
				t.Fatal("Alacrity rank/family mismatch", light.ID)
			}
		}
		values = append(values, float64(holy.GetSpell(core.ActionID{SpellID: 10329}).DefaultCast.CastTime.Milliseconds()))
	}
	kfcPaladinActiveMeasure("LIBRAM_ALACRITY_NONCRIT", values)
}

func TestKFCPaladinAlacrityActualCastAndOneCharge(t *testing.T) {
	sim, holy, target := kfcPaladinLibramFixture(t, 228175, kfcPaladinActiveTalents(map[int]int{13: 1}))
	shock := holy.GetSpell(core.ActionID{SpellID: 20930})
	shock.BonusCritRating = -10000
	if !shock.Cast(sim, target) {
		t.Fatal("Alacrity trigger failed")
	}
	kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
	light := holy.GetSpell(core.ActionID{SpellID: 635})
	light.BonusCritRating = -10000
	if !light.Cast(sim, target) || light.CurCast.CastTime != 2300*time.Millisecond {
		t.Fatal("Alacrity did not shorten the actual downrank cast")
	}
	kfcPaladinAdvance(t, sim, 3799*time.Millisecond)
	if light.SpellMetrics[target.UnitIndex].Casts != 0 {
		t.Fatal("Alacrity Holy Light completed early")
	}
	kfcPaladinAdvance(t, sim, 3800*time.Millisecond)
	if light.DefaultCast.CastTime != 2500*time.Millisecond || holy.GetAura("Paladin healing Holy Alacrity").IsActive() {
		t.Fatal("Alacrity did not consume its only charge")
	}
	if !light.Cast(sim, target) || light.CurCast.CastTime != 2500*time.Millisecond {
		t.Fatal("Alacrity leaked into the second Holy Light")
	}
	kfcPaladinAdvance(t, sim, 6300*time.Millisecond)
	kfcPaladinActiveMeasure("LIBRAM_ALACRITY_CASTS", []float64{2.3, light.SpellMetrics[target.UnitIndex].TotalCastTime.Seconds(), float64(light.SpellMetrics[target.UnitIndex].Casts)})
}

func TestKFCPaladinAlacrityStacksWithInfusionAndBothConsume(t *testing.T) {
	values := []float64{}
	for points := 1; points <= 2; points++ {
		sim, holy, target := kfcPaladinLibramFixture(t, 228175, kfcPaladinActiveTalents(map[int]int{9: points, 13: 1}))
		shock := holy.GetSpell(core.ActionID{SpellID: 20930})
		shock.BonusCritRating = 10000
		if !shock.Cast(sim, target) {
			t.Fatal("Critical Alacrity trigger failed")
		}
		light := holy.GetSpell(core.ActionID{SpellID: 10329})
		light.BonusCritRating = -10000
		expected := time.Duration(2300-500*points) * time.Millisecond
		if light.DefaultCast.CastTime != expected {
			t.Fatal("Infusion and Alacrity did not add", points)
		}
		kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
		if !light.Cast(sim, target) || light.CurCast.CastTime != expected {
			t.Fatal("Combined actual cast time changed")
		}
		kfcPaladinAdvance(t, sim, 1500*time.Millisecond+expected)
		if holy.KFCHealing.infusion.IsActive() || holy.GetAura("Paladin healing Holy Alacrity").IsActive() || light.DefaultCast.CastTime != 2500*time.Millisecond {
			t.Fatal("Both cast-time modifiers must consume on the same completed cast")
		}
		values = append(values, expected.Seconds())
	}
	kfcPaladinActiveMeasure("LIBRAM_ALACRITY_INFUSION", values)
}

func TestKFCPaladinAlacrityRefreshExpiryAndReset(t *testing.T) {
	sim, holy, target := kfcPaladinLibramFixture(t, 228175, kfcPaladinActiveTalents(map[int]int{13: 1, 16: 1}))
	shock := holy.GetSpell(core.ActionID{SpellID: 20930})
	shock.BonusCritRating = -10000
	if !shock.Cast(sim, target) {
		t.Fatal("Initial Alacrity trigger failed")
	}
	kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
	if !holy.GetSpell(core.ActionID{SpellID: 1311595}).Cast(sim, target) {
		t.Fatal("Vigil mark failed")
	}
	kfcPaladinAdvance(t, sim, 3*time.Second)
	shock.CD.Timer.Reset()
	if !shock.Cast(sim, target) {
		t.Fatal("Refreshed Alacrity trigger failed")
	}
	light := holy.GetSpell(core.ActionID{SpellID: 10329})
	if light.DefaultCast.CastTime != 2300*time.Millisecond {
		t.Fatal("Repeated Shock stacked the Alacrity reduction")
	}
	kfcPaladinAdvance(t, sim, 12999*time.Millisecond)
	if !holy.GetAura("Paladin healing Holy Alacrity").IsActive() {
		t.Fatal("Refreshed Alacrity expired early")
	}
	kfcPaladinAdvance(t, sim, 13*time.Second)
	if light.DefaultCast.CastTime != 2500*time.Millisecond {
		t.Fatal("Alacrity did not expire ten seconds after refresh")
	}
	shock.CD.Timer.Reset()
	if !shock.Cast(sim, target) {
		t.Fatal("Reset preparation failed")
	}
	kfcPaladinAdvance(t, sim, 14500*time.Millisecond)
	for i := 0; i < 3; i++ {
		sim.Cleanup()
		sim.Reset()
		if light.DefaultCast.CastTime != 2500*time.Millisecond || holy.GetAura("Paladin healing Holy Alacrity").IsActive() {
			t.Fatal("Alacrity leaked across iterations")
		}
	}
}

func TestKFCPaladinAlacrityUnaffectedCastsAndInFlightExpiry(t *testing.T) {
	sim, holy, target := kfcPaladinLibramFixture(t, 228175, kfcPaladinActiveTalents(map[int]int{13: 1, 16: 1}))
	flash := holy.GetSpell(core.ActionID{SpellID: 19943})
	flash.BonusCritRating = -10000
	if !flash.Cast(sim, target) {
		t.Fatal("Flash control failed")
	}
	kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
	if holy.GetAura("Paladin healing Holy Alacrity").IsActive() {
		t.Fatal("Flash triggered Alacrity")
	}
	shock := holy.GetSpell(core.ActionID{SpellID: 20930})
	shock.BonusCritRating = -10000
	if !shock.Cast(sim, target) {
		t.Fatal("Shock trigger failed")
	}
	kfcPaladinAdvance(t, sim, 3*time.Second)
	if !flash.Cast(sim, target) {
		t.Fatal("Flash with active Alacrity failed")
	}
	kfcPaladinAdvance(t, sim, 4500*time.Millisecond)
	if !holy.GetAura("Paladin healing Holy Alacrity").IsActive() {
		t.Fatal("Flash consumed Alacrity")
	}
	if !holy.GetSpell(core.ActionID{SpellID: 1311595}).Cast(sim, target) {
		t.Fatal("Vigil with active Alacrity failed")
	}
	kfcPaladinAdvance(t, sim, 6*time.Second)
	if !holy.GetAura("Paladin healing Holy Alacrity").IsActive() {
		t.Fatal("Vigil consumed Alacrity")
	}
	kfcPaladinAdvance(t, sim, 11*time.Second)
	light := holy.GetSpell(core.ActionID{SpellID: 10329})
	if !light.Cast(sim, target) || light.CurCast.CastTime != 2300*time.Millisecond {
		t.Fatal("In-flight expiry setup failed")
	}
	kfcPaladinAdvance(t, sim, 11500*time.Millisecond)
	if light.DefaultCast.CastTime != 2500*time.Millisecond || light.CurCast.CastTime != 2300*time.Millisecond {
		t.Fatal("Aura expiry changed an already-started cast")
	}
	kfcPaladinAdvance(t, sim, 13300*time.Millisecond)
	if light.SpellMetrics[target.UnitIndex].Casts != 1 {
		t.Fatal("In-flight cast did not finish at its snapshotted time")
	}
}

func TestKFCPaladinInfusionLibramAppliesExactlyOnceToHealingShock(t *testing.T) {
	values := []float64{}
	for points := 0; points <= 5; points++ {
		_, holy, _ := kfcPaladinLibramFixture(t, 279248, kfcPaladinActiveTalents(map[int]int{13: 1, 15: points}))
		for _, rank := range kfcPaladinShockRanks {
			spell := holy.GetSpell(core.ActionID{SpellID: rank.Data.ID})
			kfcPaladinNear(t, spell.BonusCritRating, float64(6+2*points)*core.SpellCritRatingPerCritChance)
		}
		for _, rank := range kfcPaladinHealingRanks {
			kfcPaladinNear(t, holy.GetSpell(core.ActionID{SpellID: rank.ID}).BonusCritRating, 0)
		}
		values = append(values, holy.GetSpell(core.ActionID{SpellID: 20930}).BonusCritRating)
	}
	kfcPaladinActiveMeasure("LIBRAM_INFUSION_CRIT", values)
}

func TestKFCPaladinInactiveLibramsDoNotAlterHealingCasts(t *testing.T) {
	values := []float64{}
	for _, id := range []int32{0, 22400, 22401, 23201, 249397, 249442, 272434, 272435, 279247} {
		sim, holy, target := kfcPaladinLibramFixture(t, id, kfcPaladinActiveTalents(map[int]int{13: 1}))
		light := holy.GetSpell(core.ActionID{SpellID: 10329})
		light.BonusCritRating = -10000
		kfcPaladinNear(t, light.Cost.GetCurrentCost(), 580)
		if light.DefaultCast.CastTime != 2500*time.Millisecond || !light.Cast(sim, target) {
			t.Fatal("Inactive libram changed Holy Light", id)
		}
		kfcPaladinAdvance(t, sim, 2500*time.Millisecond)
		amount := light.SpellMetrics[target.UnitIndex].TotalHealing
		if len(values) > 0 {
			kfcPaladinNear(t, amount, values[0])
		}
		values = append(values, amount)
		if !holy.GetSpell(core.ActionID{SpellID: 20930}).Cast(sim, target) {
			t.Fatal("Inactive libram changed healing Shock", id)
		}
		if light.DefaultCast.CastTime != 2500*time.Millisecond {
			t.Fatal("Inactive libram triggered Alacrity", id)
		}
	}
	kfcPaladinActiveMeasure("LIBRAM_INACTIVE", values)
}

func TestKFCPaladinLibramsFullTalentWorkloads(t *testing.T) {
	values := []float64{}
	for _, id := range []int32{228175, 272436, 279248} {
		request, frame := kfcPaladinWorkloadControl()
		player := request.Raid.Parties[0].Players[0]
		player.TalentsString = kfcPaladinFullTalentControlSeeds[0]
		player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
		for slot := range player.Equipment.Items {
			player.Equipment.Items[slot] = &proto.ItemSpec{}
		}
		player.Equipment.Items[16].Id = id
		frame.RequireFullTalentBuild = true
		reply := RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-libram-workload-control", true))
		result := kfcPaladinRequireReply(t, reply)
		if !result.LegalTalentBuild || result.SurvivalRate != 1 || result.RawHPS <= 0 {
			t.Fatal("Full-build libram workload failed", id)
		}
		values = append(values, result.RawHPS, result.ManaRemainingMean)
	}
	kfcPaladinActiveMeasure("LIBRAM_WORKLOAD", values)
}
