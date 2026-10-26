package restoration

import (
	"testing"

	// Match the full simulator's shared dungeon-set registration.
	_ "github.com/wowsims/classic/sim/common/item_sets"
)

func TestKFCShamanCastSetsSharedRegistryIsPresentForInheritedMana(t *testing.T) {
	for _, id := range []int32{181, 182} {
		sim, resto, _ := kfcShamanCastSetFixture(t, id, 5, "completed-class-healing-casts-reference")
		name := "Magister's Regalia"
		if id == 182 {
			name = "Vestments of the Devout"
		}
		count := 0
		for _, bonus := range resto.GetActiveSetBonuses() {
			if bonus.Name == name && bonus.NumPieces == 5 {
				count++
			}
		}
		if count != 1 || resto.GetAura("Sudden Insight") != nil || resto.kfcCastResourceSets == nil {
			t.Fatal("Shared mana definition or owned-only bypass missing", id, count)
		}
		kfcShamanMeasure("CAST_SETS_SHARED_REGISTRY", []int32{id, int32(count)})
		sim.Cleanup()
	}
}
