//go:build with_db

package mage

import (
	"fmt"
	"math"
	"sync"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

var sorcererRegistration sync.Once
var sorcererIDs = []int32{22065, 22068, 22069, 22063, 22066, 22062, 22067, 22064}
var sorcererSlots = []int{0, 2, 4, 5, 6, 7, 8, 9}

func sorcererItems(t *testing.T, setID int32) {
	t.Helper()
	for i, id := range sorcererIDs {
		old, existed := core.ItemsByID[id]
		// Neutral item stats isolate runtime thresholds from the reviewed item importer.
		core.ItemsByID[id] = core.Item{ID: id, Type: []proto.ItemType{1, 3, 5, 6, 7, 8, 9, 10}[i], SetID: setID, SetName: "Sorcerer's Regalia"}
		t.Cleanup(func() {
			if existed {
				core.ItemsByID[id] = old
			} else {
				delete(core.ItemsByID, id)
			}
		})
	}
}

func sorcererSim(pieces int, ruleset proto.Ruleset, rootable, dr bool, distance float64) (*core.Simulation, *Mage) {
	sorcererRegistration.Do(RegisterMage)
	gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for i := range gear.Items {
		gear.Items[i] = &proto.ItemSpec{}
	}
	for i := 0; i < pieces; i++ {
		gear.Items[sorcererSlots[i]].Id = sorcererIDs[i]
	}
	player := &proto.Player{Class: proto.Class_ClassMage, Race: proto.Race_RaceHuman, Level: 60,
		Equipment: gear, DistanceFromTarget: distance,
		Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
		Spec:     &proto.Player_Mage{Mage: &proto.Mage{Options: &proto.Mage_Options{Armor: proto.Mage_Options_NoArmor}}}}
	encounter := core.MakeSingleTargetEncounter(0)
	encounter.Duration, encounter.DurationVariation = 180, 0
	encounter.Targets[0].CanBeRooted = rootable
	encounter.Targets[0].UseCrowdControlDiminishingReturns = dr
	run := core.NewSim(&proto.RaidSimRequest{Raid: core.SinglePlayerRaidProto(player, nil, nil, nil), Encounter: encounter,
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: ruleset}}, simsignals.Signals{})
	run.Options.Interactive = true
	run.Reset()
	run.PrePull()
	return run, run.Raid.Parties[0].Players[0].(*Mage)
}

func sorcererNear(t *testing.T, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-7 {
		t.Fatalf("got %v want %v", got, want)
	}
}

func sorcererRoot(mage *Mage) *core.Aura {
	return mage.Env.Encounter.TargetUnits[0].GetAura(fmt.Sprintf("Sorcerer Freeze-%d", mage.UnitIndex))
}

func sorcererAdvance(t *testing.T, run *core.Simulation, at time.Duration) {
	t.Helper()
	reached := false
	core.StartDelayedAction(run, core.DelayedActionOptions{DoAt: at, OnAction: func(*core.Simulation) { reached = true }})
	for !reached {
		if run.Step() {
			t.Fatal("simulation ended before marker")
		}
	}
}

func TestKfcSorcererBaseThresholds(t *testing.T) {
	sorcererItems(t, 517)
	_, baseline := sorcererSim(0, proto.Ruleset_RulesetForever, false, false, 5)
	for pieces := 0; pieces <= 8; pieces++ {
		t.Run(fmt.Sprint(pieces), func(t *testing.T) {
			_, mage := sorcererSim(pieces, proto.Ruleset_RulesetForever, false, false, 5)
			counts := map[int32]int{}
			for _, bonus := range mage.GetActiveSetBonuses() {
				if bonus.Name == "Sorcerer's Regalia" {
					counts[bonus.NumPieces]++
				}
			}
			for _, threshold := range []int32{2, 4, 6, 8} {
				want := 0
				if pieces >= int(threshold) {
					want = 1
				}
				if !core.ForeverEquipmentBonusSupported(517, threshold) || counts[threshold] != want {
					t.Fatalf("wrong threshold: pieces=%d counts=%v", pieces, counts)
				}
			}
			if counts[3] != 0 || counts[5] != 0 {
				t.Fatal("base set inherited alternate thresholds")
			}
			for _, stat := range []stats.Stat{stats.SpellPower, stats.HealingPower, stats.MP5, stats.Armor, stats.BonusArmor,
				stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
				want := 0.0
				if pieces >= 6 && stat == stats.SpellPower {
					want = 23
				}
				if pieces >= 8 && (stat == stats.Armor || stat == stats.BonusArmor) {
					want = 200
				}
				if pieces >= 2 && stat >= stats.ArcaneResistance && stat <= stats.ShadowResistance {
					want = 8
				}
				sorcererNear(t, mage.GetStat(stat)-baseline.GetStat(stat), want)
			}
			if (mage.GetAura("Sorcerer Freeze Trigger") != nil) != (pieces >= 4) {
				t.Fatal("wrong freeze threshold")
			}
			if mage.GetAura("Sudden Insight") != nil {
				t.Fatal("base set inherited alternate mana proc")
			}
		})
	}
}

func TestKfcSorcererDirectIncomingChanceAndMasks(t *testing.T) {
	sorcererItems(t, 517)
	for _, event := range []struct {
		name     string
		mask     core.ProcMask
		outcome  core.HitOutcome
		flags    core.SpellFlag
		eligible bool
	}{
		{"melee-auto", core.ProcMaskMeleeMHAuto, core.OutcomeHit, 0, true},
		{"offhand-special", core.ProcMaskMeleeOHSpecial, core.OutcomeCrit, 0, true},
		{"ranged-auto", core.ProcMaskRangedAuto, core.OutcomeHit, 0, true},
		{"ranged-special", core.ProcMaskRangedSpecial, core.OutcomeHit, 0, true},
		{"magic", core.ProcMaskSpellDamage, core.OutcomeHit, 0, true},
		{"negative-nondamage", core.ProcMaskEmpty, core.OutcomeHit, 0, true},
		{"heal", core.ProcMaskSpellHealing, core.OutcomeHit, core.SpellFlagHelpful, false},
		{"helpful-nondamage", core.ProcMaskEmpty, core.OutcomeHit, core.SpellFlagHelpful, false},
		{"miss", core.ProcMaskMeleeMHAuto, core.OutcomeMiss, 0, false},
		{"dodge", core.ProcMaskMeleeMHAuto, core.OutcomeDodge, 0, false},
		{"parry", core.ProcMaskMeleeMHAuto, core.OutcomeParry, 0, false},
	} {
		t.Run(event.name, func(t *testing.T) {
			run, mage := sorcererSim(4, proto.Ruleset_RulesetForever, true, false, 5)
			proc, root := mage.GetAura("Sorcerer Freeze Trigger"), sorcererRoot(mage)
			if proc == nil || root == nil || !proc.IsActive() || proc.Icd == nil {
				t.Fatal("missing proc/root")
			}
			beforeMana := mage.CurrentMana()
			spell := &core.Spell{Unit: mage.Env.Encounter.TargetUnits[0], ProcMask: event.mask, Flags: event.flags}
			result := &core.SpellResult{Target: &mage.Unit, Outcome: event.outcome, Damage: 1}
			procs := 0
			for i := 0; i < 10000; i++ {
				proc.Icd.Reset()
				root.Deactivate(run)
				proc.OnSpellHitTaken(proc, run, spell, result)
				if root.IsActive() {
					procs++
					if !root.Unit.IsRooted() || root.Duration != 3*time.Second {
						t.Fatal("wrong root effect")
					}
				}
			}
			if event.eligible && (procs < 140 || procs > 270) || !event.eligible && procs != 0 {
				t.Fatalf("wrong 2%% event eligibility/chance: %d", procs)
			}
			if proc.OnSpellHitDealt != nil || proc.OnCastComplete != nil || proc.OnPeriodicDamageTaken != nil {
				t.Fatal("proc listens to outgoing/periodic callbacks")
			}
			sorcererNear(t, mage.CurrentMana(), beforeMana)
		})
	}
}

func TestKfcSorcererImmunityRangeAndCasterGuards(t *testing.T) {
	sorcererItems(t, 517)
	for _, row := range []struct {
		name     string
		rootable bool
		distance float64
		friendly bool
	}{
		{"root-immune", false, 5, false}, {"outside-child-range", true, 5.001, false}, {"friendly-caster", true, 5, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			run, mage := sorcererSim(4, proto.Ruleset_RulesetForever, row.rootable, false, row.distance)
			proc, root := mage.GetAura("Sorcerer Freeze Trigger"), sorcererRoot(mage)
			caster := mage.Env.Encounter.TargetUnits[0]
			if row.friendly {
				caster = &mage.Unit
			}
			for i := 0; i < 10000; i++ {
				proc.OnSpellHitTaken(proc, run, &core.Spell{Unit: caster, ProcMask: core.ProcMaskSpellDamage}, &core.SpellResult{Target: &mage.Unit, Outcome: core.OutcomeHit})
			}
			if root.IsActive() || !proc.Icd.IsReady(run) {
				t.Fatal("ineligible caster consumed cooldown or rooted")
			}
		})
	}
}

func TestKfcSorcererCooldownExpiryAndReset(t *testing.T) {
	sorcererItems(t, 517)
	run, mage := sorcererSim(4, proto.Ruleset_RulesetForever, true, false, 5)
	proc, root := mage.GetAura("Sorcerer Freeze Trigger"), sorcererRoot(mage)
	spell := &core.Spell{Unit: mage.Env.Encounter.TargetUnits[0], ProcMask: core.ProcMaskMeleeMHAuto}
	result := &core.SpellResult{Target: &mage.Unit, Outcome: core.OutcomeHit}
	trigger := func() {
		for i := 0; i < 10000 && !root.IsActive(); i++ {
			proc.OnSpellHitTaken(proc, run, spell, result)
		}
		if !root.IsActive() {
			t.Fatal("root never procced")
		}
	}
	trigger()
	if proc.Icd.ReadyAt() != time.Minute {
		t.Fatal("wrong cooldown")
	}
	sorcererAdvance(t, run, 3*time.Second)
	if root.IsActive() || root.Unit.IsRooted() {
		t.Fatal("root did not expire cleanly")
	}
	for i := 0; i < 10000; i++ {
		proc.OnSpellHitTaken(proc, run, spell, result)
	}
	if root.IsActive() {
		t.Fatal("cooldown allowed early refresh")
	}
	sorcererAdvance(t, run, time.Minute)
	trigger()
	run.Cleanup()
	run.Reset()
	run.PrePull()
	if root.IsActive() || root.Unit.IsRooted() || !proc.IsActive() || !proc.Icd.IsReady(run) {
		t.Fatal("root/cooldown state leaked across reset")
	}
	trigger()
}

func TestKfcSorcererClientDiminishingGroup(t *testing.T) {
	sorcererItems(t, 517)
	run, mage := sorcererSim(4, proto.Ruleset_RulesetForever, true, true, 5)
	root, target := sorcererRoot(mage), mage.Env.Encounter.TargetUnits[0]
	for _, duration := range []time.Duration{3 * time.Second, 1500 * time.Millisecond, 750 * time.Millisecond} {
		if !target.ApplyCrowdControl(run, root, 3*time.Second, core.CrowdControlDRStun) || root.Duration != duration {
			t.Fatal("client group3 DR sequence changed")
		}
		root.Deactivate(run)
	}
	if target.ApplyCrowdControl(run, root, 3*time.Second, core.CrowdControlDRStun) || target.IsRooted() {
		t.Fatal("fourth group3 application was not immune")
	}
	sorcererAdvance(t, run, 15*time.Second)
	if !target.ApplyCrowdControl(run, root, 3*time.Second, core.CrowdControlDRStun) || root.Duration != 3*time.Second {
		t.Fatal("group3 DR did not reset")
	}
	root.Deactivate(run)
}

func TestKfcSorcererAlternateAndClassicIsolation(t *testing.T) {
	for _, row := range []struct {
		name    string
		setID   int32
		ruleset proto.Ruleset
	}{
		{"alternate", 1671, proto.Ruleset_RulesetForever}, {"classic", 517, proto.Ruleset_RulesetClassic},
	} {
		t.Run(row.name, func(t *testing.T) {
			sorcererItems(t, row.setID)
			_, baseline := sorcererSim(0, row.ruleset, false, false, 5)
			_, mage := sorcererSim(8, row.ruleset, false, false, 5)
			if mage.GetAura("Sorcerer Freeze Trigger") != nil || mage.GetAura("Sudden Insight") == nil {
				t.Fatal("base override replaced legacy handler")
			}
			sorcererNear(t, mage.GetStat(stats.MP5)-baseline.GetStat(stats.MP5), 8)
			sorcererNear(t, mage.GetStat(stats.SpellPower)-baseline.GetStat(stats.SpellPower), 23)
			sorcererNear(t, mage.GetStat(stats.BonusArmor)-baseline.GetStat(stats.BonusArmor), 0)
		})
	}
}
