package core

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core/proto"
)

// These are real negative-aura providers from the frozen Forever engine. Shared
// stat-effect categories need not stack for their individual auras to be active.
func bossDebuffCapProbe(t *testing.T, permanent bool) (*Simulation, *Unit, []*Aura) {
	t.Helper()
	target := NewTarget(&proto.Target{Level: 63}, 0)
	env := &Environment{Ruleset: proto.Ruleset_RulesetForever, State: Constructed, Raid: &Raid{}}
	target.Env = env
	target.enabled = true
	env.AllUnits = []*Unit{&target.Unit}
	env.Encounter.Targets = []*Target{target}
	env.Encounter.TargetUnits = []*Unit{&target.Unit}
	auras := []*Aura{
		JudgementOfWisdomAura(&target.Unit),
		JudgementOfTheCrusaderAura(nil, &target.Unit, 1.15, 0),
		CurseOfElementsAura(&target.Unit),
		GiftOfArthasAura(&target.Unit),
		CrystalYieldAura(&target.Unit),
		SunderArmorAura(&target.Unit),
		CurseOfRecklessnessAura(&target.Unit),
		FaerieFireAura(&target.Unit),
		CurseOfWeaknessAura(&target.Unit, 3),
		DemoralizingRoarAura(&target.Unit),
		DemoralizingShoutAura(&target.Unit),
		HuntersMarkAura(&target.Unit, nil, 14325, 71*1.15),
		ThunderClapAura(&target.Unit, 8205, 15),
		ThunderfuryASAura(&target.Unit),
		InsectSwarmAura(&target.Unit),
		ScorpidStingAura(&target.Unit),
		VindicationAura(&target.Unit, 3),
	}
	if !env.IsForever() || target.Type != EnemyUnit || len(auras) != 17 {
		t.Fatal("invalid Forever enemy probe setup")
	}
	seen := make(map[int32]bool)
	for _, aura := range auras {
		id := aura.ActionID.SpellID
		if aura.Unit != &target.Unit || id <= 0 || seen[id] {
			t.Fatalf("probe requires distinct real enemy debuffs: %v", aura.ActionID)
		}
		seen[id] = true
		if permanent {
			MakePermanent(aura)
		}
	}
	target.StatDependencyManager.FinalizeStatDeps()
	env.State = Finalized
	sim := &Simulation{Environment: env, Duration: 5 * time.Minute,
		Options: &proto.SimOptions{Ruleset: proto.Ruleset_RulesetForever}}
	for _, aura := range auras {
		aura.init(sim)
		aura.Activate(sim)
		if aura.IsActive() && aura.MaxStacks > 0 {
			aura.SetStacks(sim, aura.MaxStacks)
		}
	}
	return sim, &target.Unit, auras
}

func bossDebuffCapActive(auras []*Aura) int {
	active := 0
	for _, aura := range auras {
		if aura.IsActive() {
			active++
		}
	}
	return active
}

func TestKfcBossDebuffCapBaselineObservation(t *testing.T) {
	for _, permanent := range []bool{false, true} {
		name := "finite"
		if permanent {
			name = "permanent"
		}
		t.Run(name, func(t *testing.T) {
			sim, target, auras := bossDebuffCapProbe(t, permanent)
			active := bossDebuffCapActive(auras)
			if active != 17 {
				t.Fatalf("baseline observation changed: got %d real negative auras, expected 17", active)
			}
			timerTracked := len(target.activeAuras)
			if (!permanent && timerTracked != 17) || (permanent && timerTracked != 0) {
				t.Fatalf("unexpected expiry tracker membership: permanent=%v tracked=%d", permanent, timerTracked)
			}
			ids := make([]int32, len(auras))
			labels := make([]string, len(auras))
			for i, aura := range auras {
				ids[i], labels[i] = aura.ActionID.SpellID, aura.Label
			}
			snapshot, err := json.Marshal(struct {
				Permanent              bool     `json:"permanent"`
				Active                 int      `json:"active"`
				TimerTracked           int      `json:"timerTracked"`
				SpellIDs               []int32  `json:"spellIds"`
				Labels                 []string `json:"labels"`
				CurrentTimeNanoseconds int64    `json:"currentTimeNanoseconds"`
				PendingActions         int      `json:"pendingActions"`
			}{permanent, active, timerTracked, ids, labels, int64(sim.CurrentTime), len(sim.pendingActions)})
			if err != nil {
				t.Fatal(err)
			}
			t.Logf("KFC_BOSS_DEBUFF_CAP_SNAPSHOT %s", snapshot)
			auras[0].Activate(sim)
			if bossDebuffCapActive(auras) != 17 {
				t.Fatal("refresh changed the number of active debuffs")
			}
			auras[0].Deactivate(sim)
			if bossDebuffCapActive(auras) != 16 {
				t.Fatal("explicit deactivation did not release one active aura")
			}
			auras[0].Activate(sim)
			if bossDebuffCapActive(auras) != 17 {
				t.Fatal("reactivation did not restore the observed seventeenth aura")
			}
			if sim.CurrentTime != 0 || len(sim.pendingActions) != 0 {
				t.Fatal("capacity probe must not advance combat or schedule simulation actions")
			}
		})
	}
}

// This intentionally fails on the preserved uncapped engine. The audit runner
// requires this exact failure alongside the passing observation, never a build error.
func TestKfcBossDebuffLimitRequirement(t *testing.T) {
	for _, permanent := range []bool{false, true} {
		name := "finite"
		if permanent {
			name = "permanent"
		}
		t.Run(name, func(t *testing.T) {
			_, _, auras := bossDebuffCapProbe(t, permanent)
			if active := bossDebuffCapActive(auras); active > 16 {
				t.Fatalf("required maximum of 16 boss debuffs is not enforced: active=%d permanent=%v", active, permanent)
			}
		})
	}
}
