package core

var kfcDungeonManaSets = [...]struct {
	id   int32
	name string
}{
	{181, "Magister's Regalia"},
	{182, "Vestments of the Devout"},
	{186, "Beaststalker Armor"},
}

func kfcForeverDungeonManaBonusSupported(id, pieces int32) bool {
	if pieces != 5 {
		return false
	}
	for _, reviewed := range kfcDungeonManaSets {
		definition, exists := foreverEquipmentSets[id]
		_, thresholdExists := definition.Bonuses[pieces]
		if id == reviewed.id && exists && thresholdExists && definition.Name == reviewed.name {
			return true
		}
	}
	return false
}

func (character *Character) kfcForeverDungeonManaBonuses() []ActiveSetBonus {
	counts := make(map[int32]int32)
	for _, item := range character.Equipment {
		counts[item.SetID]++
	}
	var active []ActiveSetBonus
	for _, reviewed := range kfcDungeonManaSets {
		definition, exists := foreverEquipmentSets[reviewed.id]
		bonus, thresholdExists := definition.Bonuses[5]
		if counts[reviewed.id] < 5 || !exists || !thresholdExists ||
			definition.Name != reviewed.name || bonus.Supported {
			continue
		}
		// The generated adapter owns flat thresholds. Only this reviewed
		// five-piece handler is added; other unsupported effects stay gated.
		for _, set := range sets {
			if set.Name == reviewed.name && (set.ID == 0 || set.ID == reviewed.id) && set.Bonuses[5] != nil {
				active = append(active, ActiveSetBonus{
					Name: set.Name, NumPieces: 5, BonusEffect: set.Bonuses[5],
				})
				break
			}
		}
	}
	return active
}
