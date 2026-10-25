package healing

import (
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core/proto"
)

func TestKFCPriestBlueDragonCountsReprocs(t *testing.T) {
	sim, healer, target := kfcItemFixture(t, &proto.PriestTalents{}, 19288)
	aura, spell := healer.GetAura("Aura of the Blue Dragon"), healer.LesserHeal[1]
	spell.BonusCritRating = -10000
	opportunities, procs := 500, 0
	for cast := 0; cast < opportunities; cast++ {
		before := aura.ExpiresAt()
		if !spell.Cast(sim, target) {
			t.Fatal("The seeded proc-rate control failed to cast")
		}
		kfcPriestAdvance(t, sim, sim.CurrentTime+1500*time.Millisecond)
		if aura.IsActive() && aura.ExpiresAt() != before {
			procs++
		}
	}
	if procs < 1 || procs > 25 {
		t.Fatalf("Unexpected completed-cast proc count including refreshes: %d", procs)
	}
	fmt.Printf("KFC_HEALER_BLUE_DRAGON_REPROCS %d\n", procs)
}
