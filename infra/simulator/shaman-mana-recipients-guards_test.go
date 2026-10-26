package restoration

import "testing"

func TestKFCShamanRecipientManaGuardCleanupDoesNotSpendTemporaryCapacity(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{14: 13937, 15: 0})
	frame.Effects.Utility.HeadmasterIntellect = "additive-reference"
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 13937, RaidIndex: -1, EarliestMS: 1000, MaximumUses: 1}}
	result := kfcShamanEquippedResult(t, request, frame)
	for _, row := range result.Metrics.Parties[0].Players[0].Resources {
		if row.Id.GetSpellId() == 18264 && row.Id.Tag == 1 {
			t.Fatal("iteration cleanup created a combat mana-capacity loss", row)
		}
	}
	kfcShamanMeasure("RECIPIENT_MANA_GUARD_CLEANUP", result.ManaRemainingMean)
}

func TestKFCShamanRecipientManaGuardActualInFightExpirySpendsCapacity(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{14: 13937, 15: 0})
	request.Encounter.Duration = 1000
	frame.Effects.Utility.HeadmasterIntellect = "additive-reference"
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 13937, RaidIndex: -1, MaximumUses: 1}}
	policy := kfcShamanRecipientManaReference(1, 1000, 1000)
	frame.RecipientMana = &policy
	result := kfcShamanEquippedResult(t, request, frame)
	loss := 0.0
	events := 0
	for _, row := range result.Metrics.Parties[0].Players[0].Resources {
		if row.Id.GetSpellId() == 18264 && row.Id.Tag == 1 {
			loss += row.ActualGain
			events += int(row.Events)
		}
	}
	if events != 1 {
		t.Fatal("actual owner expiry did not remove temporary mana capacity", events)
	}
	kfcShamanNear(t, loss, -20*1.1*1.1*15)
	kfcShamanNear(t, result.Assignment.FinalLivingRecipientManaMean, 1000)
	kfcShamanMeasure("RECIPIENT_MANA_GUARD_REAL_EXPIRY", []float64{loss, result.Assignment.FinalLivingRecipientManaMean})
}
