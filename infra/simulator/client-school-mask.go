package core

import "fmt"

// SpellSchoolFromClientMask converts a DB2 SchoolMask to the engine's distinct flags.
func SpellSchoolFromClientMask(mask int32) (SpellSchool, error) {
	if mask < 0 || mask & ^int32(127) != 0 {
		return SpellSchoolNone, fmt.Errorf("invalid client school mask %d", mask)
	}
	var school SpellSchool
	for _, row := range []struct {
		client int32
		engine SpellSchool
	}{
		{1, SpellSchoolPhysical}, {2, SpellSchoolHoly}, {4, SpellSchoolFire},
		{8, SpellSchoolNature}, {16, SpellSchoolFrost}, {32, SpellSchoolShadow}, {64, SpellSchoolArcane},
	} {
		if mask&row.client != 0 {
			school |= row.engine
		}
	}
	return school, nil
}
