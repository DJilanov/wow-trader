//go:build with_db

package feral_test

import (
	"fmt"
	"math"
	"sync"
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/druid"
	"github.com/wowsims/classic/sim/druid/balance"
	"github.com/wowsims/classic/sim/druid/feral"
)

var feralheartDpsRegistration sync.Once
var feralheartDpsIDs = []int32{22109, 22112, 22113, 22108, 22110, 22106, 22111, 22107}
var feralheartDpsSlots = []int{0, 2, 4, 5, 6, 7, 8, 9}

func feralheartDpsItems(t *testing.T, setID int32) {
	t.Helper()
	for i, id := range feralheartDpsIDs {
		old, existed := core.ItemsByID[id]
		// Neutral equipped stats isolate the real set handlers from item-stat import.
		core.ItemsByID[id] = core.Item{ID: id, Type: []proto.ItemType{1, 3, 5, 6, 7, 8, 9, 10}[i], SetID: setID, SetName: "Feralheart Raiment"}
		t.Cleanup(func() {
			if existed {
				core.ItemsByID[id] = old
			} else {
				delete(core.ItemsByID, id)
			}
		})
	}
}

func feralheartDpsSim(pieces int, caster bool, ruleset proto.Ruleset) (*core.Simulation, *druid.Druid) {
	feralheartDpsRegistration.Do(func() { feral.RegisterFeralDruid(); balance.RegisterBalanceDruid() })
	gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for i := range gear.Items {
		gear.Items[i] = &proto.ItemSpec{}
	}
	for i := 0; i < pieces; i++ {
		gear.Items[feralheartDpsSlots[i]].Id = feralheartDpsIDs[i]
	}
	player := &proto.Player{Class: proto.Class_ClassDruid, Race: proto.Race_RaceNightElf, Level: 60,
		Equipment: gear, DistanceFromTarget: 5, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL}}
	if caster {
		player.Spec = &proto.Player_BalanceDruid{BalanceDruid: &proto.BalanceDruid{Options: &proto.BalanceDruid_Options{}}}
	} else {
		player.Spec = &proto.Player_FeralDruid{FeralDruid: &proto.FeralDruid{Options: &proto.FeralDruid_Options{}}}
	}
	encounter := core.MakeSingleTargetEncounter(0)
	encounter.Duration, encounter.DurationVariation = 180, 0
	run := core.NewSim(&proto.RaidSimRequest{Raid: core.SinglePlayerRaidProto(player, nil, nil, nil), Encounter: encounter,
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: ruleset}}, simsignals.Signals{})
	run.Options.Interactive = true
	run.Reset()
	run.PrePull()
	return run, run.Raid.Parties[0].Players[0].(druid.DruidAgent).GetDruid()
}

func feralheartDpsNear(t *testing.T, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-7 {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestKfcFeralheartDpsThresholds(t *testing.T) {
	feralheartDpsItems(t, 513)
	for _, caster := range []bool{false, true} {
		_, baseline := feralheartDpsSim(0, caster, proto.Ruleset_RulesetForever)
		for pieces := 0; pieces <= 8; pieces++ {
			t.Run(fmt.Sprintf("caster-%v/pieces-%d", caster, pieces), func(t *testing.T) {
				_, wearer := feralheartDpsSim(pieces, caster, proto.Ruleset_RulesetForever)
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
						t.Fatalf("wrong threshold: pieces=%d counts=%v", pieces, counts)
					}
				}
				if counts[3] != 0 || counts[5] != 0 {
					t.Fatal("base set inherited alternate thresholds")
				}
				for _, stat := range []stats.Stat{stats.SpellPower, stats.SpellDamage, stats.HealingPower, stats.AttackPower, stats.RangedAttackPower,
					stats.MP5, stats.Armor, stats.BonusArmor, stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
					want := 0.0
					if pieces >= 6 && (stat == stats.SpellDamage || stat == stats.HealingPower) {
						want = 15
					}
					if pieces >= 6 && (stat == stats.AttackPower || stat == stats.RangedAttackPower) {
						want = 26
					}
					if pieces >= 8 && (stat == stats.Armor || stat == stats.BonusArmor) {
						want = 200
					}
					if pieces >= 2 && stat >= stats.ArcaneResistance && stat <= stats.ShadowResistance {
						want = 8
					}
					feralheartDpsNear(t, wearer.GetStat(stat)-baseline.GetStat(stat), want)
				}
				if (wearer.GetAura("Base Feralheart Nature's Bounty") != nil) != (pieces >= 4) {
					t.Fatal("wrong current-resource proc threshold")
				}
			})
		}
	}
}

func feralheartDpsDrain(run *core.Simulation, wearer *druid.Druid) {
	metrics := core.ActionID{SpellID: 27798, Tag: 91}
	wearer.SpendMana(run, wearer.CurrentMana(), wearer.NewManaMetrics(metrics))
	wearer.SpendRage(run, wearer.CurrentRage(), wearer.NewRageMetrics(metrics))
	wearer.SpendEnergy(run, wearer.CurrentEnergy(), wearer.NewEnergyMetrics(metrics))
}

func TestKfcFeralheartDpsIncomingResources(t *testing.T) {
	feralheartDpsItems(t, 513)
	for _, bar := range []core.PowerBarType{core.ManaBar, core.RageBar, core.EnergyBar} {
		for _, event := range []struct {
			name     string
			mask     core.ProcMask
			outcome  core.HitOutcome
			eligible bool
		}{
			{"melee", core.ProcMaskMeleeMHAuto, core.OutcomeHit, true},
			{"melee-special", core.ProcMaskMeleeOHSpecial, core.OutcomeCrit, true},
			{"ranged", core.ProcMaskRangedAuto, core.OutcomeHit, true},
			{"ranged-special", core.ProcMaskRangedSpecial, core.OutcomeHit, true},
			{"magic", core.ProcMaskSpellDamage, core.OutcomeHit, false},
			{"healing", core.ProcMaskSpellHealing, core.OutcomeHit, false},
			{"miss", core.ProcMaskMeleeMHAuto, core.OutcomeMiss, false},
			{"dodge", core.ProcMaskMeleeMHAuto, core.OutcomeDodge, false},
		} {
			t.Run(fmt.Sprintf("bar-%d/%s", bar, event.name), func(t *testing.T) {
				run, wearer := feralheartDpsSim(4, false, proto.Ruleset_RulesetForever)
				wearer.SetCurrentPowerBar(bar)
				feralheartDpsDrain(run, wearer)
				proc := wearer.GetAura("Base Feralheart Nature's Bounty")
				if proc == nil || !proc.IsActive() || proc.OnSpellHitTaken == nil {
					t.Fatal("missing active incoming resource proc")
				}
				if proc.OnSpellHitDealt != nil || proc.OnCastComplete != nil || proc.OnPeriodicDamageTaken != nil || proc.Icd != nil {
					t.Fatal("base set inherited an unrelated callback or cooldown")
				}
				spell := &core.Spell{Unit: wearer.Env.Encounter.TargetUnits[0], ProcMask: event.mask}
				result := &core.SpellResult{Target: &wearer.Unit, Outcome: event.outcome, Damage: 1}
				procs := 0
				for i := 0; i < 10000; i++ {
					proc.OnSpellHitTaken(proc, run, spell, result)
					delta := []float64{wearer.CurrentMana(), wearer.CurrentRage(), wearer.CurrentEnergy()}
					changed := false
					for index, value := range delta {
						want := 0.0
						if value > 0 && ((bar == core.ManaBar && index == 0) || (bar == core.RageBar && index == 1) || (bar == core.EnergyBar && index == 2)) {
							want = []float64{300, 10, 40}[index]
							changed = true
						}
						feralheartDpsNear(t, value, want)
					}
					if changed {
						procs++
					}
					feralheartDpsDrain(run, wearer)
				}
				if event.eligible && (procs < 140 || procs > 270) || !event.eligible && procs != 0 {
					t.Fatalf("wrong 2%% incoming proc eligibility/chance: %d", procs)
				}
			})
		}
	}
}

func TestKfcFeralheartDpsActualFormsAndReset(t *testing.T) {
	feralheartDpsItems(t, 513)
	run, wearer := feralheartDpsSim(8, false, proto.Ruleset_RulesetForever)
	proc := wearer.GetAura("Base Feralheart Nature's Bounty")
	spell := &core.Spell{Unit: wearer.Env.Encounter.TargetUnits[0], ProcMask: core.ProcMaskMeleeMHAuto}
	result := &core.SpellResult{Target: &wearer.Unit, Outcome: core.OutcomeHit, Damage: 1}
	for _, form := range []struct {
		name string
		aura *core.Aura
		bar  core.PowerBarType
	}{
		{"caster", nil, core.ManaBar}, {"cat", wearer.CatFormAura, core.EnergyBar}, {"bear", wearer.BearFormAura, core.RageBar},
	} {
		t.Run(form.name, func(t *testing.T) {
			wearer.CancelShapeshift(run)
			if form.aura != nil {
				form.aura.Activate(run)
			}
			if wearer.GetCurrentPowerBar() != form.bar {
				t.Fatal("form did not select its actual power bar")
			}
			feralheartDpsDrain(run, wearer)
			for i := 0; i < 10000 && wearer.CurrentMana()+wearer.CurrentRage()+wearer.CurrentEnergy() == 0; i++ {
				proc.OnSpellHitTaken(proc, run, spell, result)
			}
			want := map[core.PowerBarType]float64{core.ManaBar: 300, core.RageBar: 10, core.EnergyBar: 40}[form.bar]
			feralheartDpsNear(t, wearer.CurrentMana()+wearer.CurrentRage()+wearer.CurrentEnergy(), want)
			feralheartDpsNear(t, wearer.GetStat(stats.BonusArmor), 200)
		})
	}
	run.Cleanup()
	run.Reset()
	run.PrePull()
	if !proc.IsActive() || proc.Icd != nil {
		t.Fatal("proc lifecycle leaked across reset")
	}
}

func TestKfcFeralheartDpsLegacyIsolation(t *testing.T) {
	for _, row := range []struct {
		name    string
		setID   int32
		ruleset proto.Ruleset
	}{
		{"alternate", 1667, proto.Ruleset_RulesetForever}, {"classic", 513, proto.Ruleset_RulesetClassic},
	} {
		t.Run(row.name, func(t *testing.T) {
			feralheartDpsItems(t, row.setID)
			_, bare := feralheartDpsSim(0, false, row.ruleset)
			_, wearer := feralheartDpsSim(8, false, row.ruleset)
			if wearer.GetAura("Base Feralheart Nature's Bounty") != nil {
				t.Fatal("base proc replaced the inherited handler")
			}
			feralheartDpsNear(t, wearer.GetStat(stats.MP5)-bare.GetStat(stats.MP5), 8)
			feralheartDpsNear(t, wearer.GetStat(stats.SpellDamage)-bare.GetStat(stats.SpellDamage), 23)
			feralheartDpsNear(t, wearer.GetStat(stats.AttackPower)-bare.GetStat(stats.AttackPower), 40)
			feralheartDpsNear(t, wearer.GetStat(stats.BonusArmor)-bare.GetStat(stats.BonusArmor), 0)
		})
	}
}
