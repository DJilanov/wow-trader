//go:build with_db

package feralhearttank_test

import (
	"fmt"
	"math"
	"reflect"
	"sync"
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/druid/tank"
)

var feralheartTankRegistration sync.Once
var feralheartTankIDs = []int32{22109, 22112, 22113, 22108, 22110, 22106, 22111, 22107}
var feralheartTankSlots = []int{0, 2, 4, 5, 6, 7, 8, 9}

func feralheartTankNear(t *testing.T, got, want float64) {
	t.Helper()
	if math.IsNaN(got) || math.IsInf(got, 0) || math.Abs(got-want) > 1e-7 {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func feralheartTankFixture(t *testing.T, pieces int, kings bool, ruleset proto.Ruleset) (*core.Simulation, *tank.FeralTankDruid) {
	t.Helper()
	feralheartTankRegistration.Do(tank.RegisterFeralTankDruid)
	gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for slot := range gear.Items {
		gear.Items[slot] = &proto.ItemSpec{}
	}
	for i := 0; i < pieces; i++ {
		gear.Items[feralheartTankSlots[i]].Id = feralheartTankIDs[i]
	}
	player := &proto.Player{
		Class: proto.Class_ClassDruid, Race: proto.Race_RaceNightElf, Level: 60,
		Equipment: gear, DistanceFromTarget: 5,
		Buffs:    &proto.IndividualBuffs{BlessingOfKings: kings},
		Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
		Spec: &proto.Player_FeralTankDruid{FeralTankDruid: &proto.FeralTankDruid{
			Options: &proto.FeralTankDruid_Options{},
		}},
	}
	encounter := core.MakeSingleTargetEncounter(0)
	encounter.Duration, encounter.DurationVariation = 60, 0
	sim := core.NewSim(&proto.RaidSimRequest{
		Raid: core.SinglePlayerRaidProto(player, nil, nil, nil), Encounter: encounter,
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: ruleset},
	}, simsignals.Signals{})
	sim.Options.Interactive = true
	sim.Reset()
	sim.PrePull()
	bear, ok := sim.Raid.Parties[0].Players[0].(*tank.FeralTankDruid)
	if !ok || !bear.BearFormAura.IsActive() || bear.GetCurrentPowerBar() != core.RageBar {
		t.Fatal("Expected the actual tank factory in Bear Form with a rage bar")
	}
	return sim, bear
}

// Only the set identity changes: all current item stats remain equipped in both controls.
func feralheartTankSetIdentity(t *testing.T, id int32) func() {
	t.Helper()
	old := make(map[int32]core.Item, len(feralheartTankIDs))
	for _, itemID := range feralheartTankIDs {
		item, exists := core.ItemsByID[itemID]
		if !exists || item.SetID != 513 || item.Stats[stats.Armor] <= 0 {
			t.Fatalf("Missing current compiled Feralheart item %d", itemID)
		}
		old[itemID] = item
		item.SetID, item.SetName = id, ""
		core.ItemsByID[itemID] = item
	}
	restore := func() {
		for itemID, item := range old {
			core.ItemsByID[itemID] = item
		}
	}
	t.Cleanup(restore)
	return restore
}

func TestKFCFeralheartTankActualThresholdStats(t *testing.T) {
	for _, kings := range []bool{false, true} {
		for pieces := 0; pieces <= 8; pieces++ {
			t.Run(fmt.Sprintf("kings-%v/pieces-%d", kings, pieces), func(t *testing.T) {
				restore := feralheartTankSetIdentity(t, 0)
				_, baseline := feralheartTankFixture(t, pieces, kings, proto.Ruleset_RulesetForever)
				restore()
				_, wearer := feralheartTankFixture(t, pieces, kings, proto.Ruleset_RulesetForever)
				counts := map[int32]int{}
				for _, bonus := range wearer.GetActiveSetBonuses() {
					if bonus.Name == "Feralheart Raiment" {
						counts[bonus.NumPieces]++
					}
				}
				for _, threshold := range []int32{2, 4, 6, 8} {
					want := 0
					if pieces >= int(threshold) {
						want = 1
					}
					if counts[threshold] != want || !core.ForeverEquipmentBonusSupported(513, threshold) {
						t.Fatalf("Unexpected base threshold registration: %v", counts)
					}
				}
				if counts[3] != 0 || counts[5] != 0 {
					t.Fatal("Alternate set thresholds leaked into base 513")
				}
				for stat := stats.Stat(0); stat < stats.Len; stat++ {
					want := 0.0
					if pieces >= 2 && stat >= stats.ArcaneResistance && stat <= stats.ShadowResistance {
						want = 8
					}
					if pieces >= 6 && (stat == stats.SpellDamage || stat == stats.HealingPower) {
						want = 15
					}
					if pieces >= 6 && (stat == stats.AttackPower || stat == stats.RangedAttackPower) {
						want = 26
					}
					if pieces >= 8 && (stat == stats.Armor || stat == stats.BonusArmor) {
						want = 200
					}
					feralheartTankNear(t, wearer.GetStat(stat)-baseline.GetStat(stat), want)
				}
				if (wearer.GetAura("Base Feralheart Nature's Bounty") != nil) != (pieces >= 4) {
					t.Fatal("Wrong four-piece incoming resource threshold")
				}
			})
		}
	}
}

func feralheartTankDrain(t *testing.T, sim *core.Simulation, bear *tank.FeralTankDruid) {
	t.Helper()
	bear.SpendRage(sim, bear.CurrentRage(), bear.NewRageMetrics(core.ActionID{SpellID: 27798, Tag: 99}))
	feralheartTankNear(t, bear.CurrentRage(), 0)
}

func feralheartTankEvents(t *testing.T, sim *core.Simulation, bear *tank.FeralTankDruid, mask core.ProcMask, outcome core.HitOutcome, count int) []bool {
	t.Helper()
	aura := bear.GetAura("Base Feralheart Nature's Bounty")
	if aura == nil || !aura.IsActive() || aura.OnSpellHitTaken == nil || aura.Icd != nil {
		t.Fatal("Missing active incoming resource proc or invented internal cooldown")
	}
	spell := &core.Spell{Unit: sim.Encounter.TargetUnits[0], ProcMask: mask}
	result := &core.SpellResult{Target: &bear.Unit, Outcome: outcome, Damage: 1}
	decisions := make([]bool, count)
	for i := range decisions {
		feralheartTankDrain(t, sim, bear)
		mana, energy := bear.CurrentMana(), bear.CurrentEnergy()
		aura.OnSpellHitTaken(aura, sim, spell, result)
		feralheartTankNear(t, bear.CurrentMana(), mana)
		feralheartTankNear(t, bear.CurrentEnergy(), energy)
		decisions[i] = bear.CurrentRage() > 0
		if decisions[i] {
			feralheartTankNear(t, bear.CurrentRage(), 10)
		}
	}
	return decisions
}

func TestKFCFeralheartTankIncomingResources(t *testing.T) {
	for _, event := range []struct {
		name     string
		mask     core.ProcMask
		outcome  core.HitOutcome
		eligible bool
	}{
		{"white-melee", core.ProcMaskMeleeMHAuto, core.OutcomeHit, true},
		{"melee-special", core.ProcMaskMeleeMHSpecial, core.OutcomeCrit, true},
		{"ranged", core.ProcMaskRangedAuto, core.OutcomeHit, true},
		{"ranged-special", core.ProcMaskRangedSpecial, core.OutcomeHit, true},
		{"spell", core.ProcMaskSpellDamage, core.OutcomeHit, false},
		{"healing", core.ProcMaskSpellHealing, core.OutcomeHit, false},
		{"miss", core.ProcMaskMeleeMHAuto, core.OutcomeMiss, false},
		{"dodge", core.ProcMaskMeleeMHAuto, core.OutcomeDodge, false},
		{"parry", core.ProcMaskMeleeMHAuto, core.OutcomeParry, false},
	} {
		t.Run(event.name, func(t *testing.T) {
			sim, bear := feralheartTankFixture(t, 4, false, proto.Ruleset_RulesetForever)
			count := 0
			for _, proc := range feralheartTankEvents(t, sim, bear, event.mask, event.outcome, 10000) {
				if proc {
					count++
				}
			}
			if event.eligible && (count < 140 || count > 270) || !event.eligible && count != 0 {
				t.Fatalf("Unexpected declared 2%% proc results: %d", count)
			}
			fmt.Printf("KFC_FERALHEART_TANK_PROC %s %d\n", event.name, count)
		})
	}
}

func TestKFCFeralheartTankRejectedEventsPreserveRNG(t *testing.T) {
	referenceSim, reference := feralheartTankFixture(t, 4, false, proto.Ruleset_RulesetForever)
	sim, bear := feralheartTankFixture(t, 4, false, proto.Ruleset_RulesetForever)
	feralheartTankEvents(t, sim, bear, core.ProcMaskSpellDamage, core.OutcomeHit, 1000)
	feralheartTankEvents(t, sim, bear, core.ProcMaskMeleeMHAuto, core.OutcomeMiss, 1000)
	a := feralheartTankEvents(t, referenceSim, reference, core.ProcMaskMeleeMHAuto, core.OutcomeHit, 1000)
	b := feralheartTankEvents(t, sim, bear, core.ProcMaskMeleeMHAuto, core.OutcomeHit, 1000)
	if !reflect.DeepEqual(a, b) {
		t.Fatal("Rejected events consumed the proc random stream")
	}
}

func TestKFCFeralheartTankResetAndIsolation(t *testing.T) {
	sim, bear := feralheartTankFixture(t, 8, true, proto.Ruleset_RulesetForever)
	aura := bear.GetAura("Base Feralheart Nature's Bounty")
	if aura.OnSpellHitDealt != nil || aura.OnCastComplete != nil || aura.OnPeriodicDamageTaken != nil || aura.OnHealDealt != nil {
		t.Fatal("Incoming resource proc acquired unrelated callbacks")
	}
	armor := bear.GetStat(stats.Armor)
	sim.Cleanup()
	sim.Reset()
	sim.PrePull()
	if !bear.BearFormAura.IsActive() || bear.GetCurrentPowerBar() != core.RageBar || !aura.IsActive() || aura.Icd != nil {
		t.Fatal("Tank form or set proc failed reset")
	}
	feralheartTankNear(t, bear.GetStat(stats.Armor), armor)
	_, classic := feralheartTankFixture(t, 8, false, proto.Ruleset_RulesetClassic)
	if classic.GetAura("Base Feralheart Nature's Bounty") != nil {
		t.Fatal("Forever resource policy leaked into Classic")
	}
	restore := feralheartTankSetIdentity(t, 1667)
	defer restore()
	_, alternate := feralheartTankFixture(t, 8, false, proto.Ruleset_RulesetForever)
	if alternate.GetAura("Base Feralheart Nature's Bounty") != nil {
		t.Fatal("Alternate identity activated base 513 proc")
	}
}
