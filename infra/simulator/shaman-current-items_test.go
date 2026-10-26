package restoration

import (
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

// KFC_SHAMAN_CURRENT_ITEM_ROWS

func TestKFCShamanCurrentSixNativeCatalogStats(t *testing.T) {
	values := []float64{}
	for _, row := range kfcShamanCurrentItemRows {
		if row.before == row.after {
			t.Fatal("Stat correction has no declared change", row.id)
		}
		item, known := core.ItemsByID[row.id]
		if !known {
			t.Fatal("Current stat item missing", row.id)
		}
		kfcShamanNear(t, item.Stats[row.stat], row.after)
		values = append(values, float64(row.id), float64(row.stat), item.Stats[row.stat])
	}
	kfcShamanMeasure("CURRENT_CATALOG", values)
}

func TestKFCShamanCurrentSixActualWearerStats(t *testing.T) {
	request := kfcShamanRequest(500)
	request.Raid.Parties[0].Players[0].TalentsString = kfcShamanHealingStudySeeds[0]
	base := core.NewSim(request, simsignals.CreateSignals())
	base.Reset()
	defer base.Cleanup()
	empty := base.Raid.Parties[0].Players[0].(*RestorationShaman)
	values := []float64{}
	for _, row := range kfcShamanCurrentItemRows {
		input := kfcShamanRequest(500)
		player := input.Raid.Parties[0].Players[0]
		player.TalentsString = kfcShamanHealingStudySeeds[0]
		player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
		for index := range player.Equipment.Items {
			player.Equipment.Items[index] = &proto.ItemSpec{}
		}
		player.Equipment.Items[14].Id = row.id
		sim := core.NewSim(input, simsignals.CreateSignals())
		sim.Reset()
		resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
		delta := resto.GetStat(row.stat) - empty.GetStat(row.stat)
		kfcShamanNear(t, delta, row.after)
		values = append(values, float64(row.id), float64(row.stat), delta)
		sim.Cleanup()
	}
	kfcShamanMeasure("CURRENT_WEARER", values)
}
