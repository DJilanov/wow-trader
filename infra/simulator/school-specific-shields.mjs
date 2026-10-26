import assert from "node:assert/strict";

function once(source, before, after) {
  assert.equal(source.split(before).length, 2, "Shield integration anchor: " + before);
  return source.replace(before, after);
}

/** Preserve legacy all-school pools while admitting explicit school masks.
 * @param {string} source @returns {string}
 */
export function renderSchoolSpecificShields(source) {
  assert(!source.includes("AbsorbSchoolMask"), "School filtering already integrated");
  let result = once(
    source,
    "type ShieldConfig struct {",
    "type ShieldConfig struct {\n\t// Zero preserves the existing all-school behavior.\n\tAbsorbSchoolMask SpellSchool\n",
  );
  result = once(
    result,
    "remainingAbsorb float64",
    "remainingAbsorb float64\n\tabsorbSchoolMask SpellSchool",
  );
  result = once(
    result,
    "func newShield(config Shield) *Shield {",
    'func newShield(config Shield) *Shield {\n\tif config.absorbSchoolMask & ^(SpellSchoolPhysical|SpellSchoolHoly|SpellSchoolFire|SpellSchoolNature|SpellSchoolFrost|SpellSchoolShadow|SpellSchoolArcane) != 0 {panic("invalid shield absorption school mask")}',
  );
  result = once(
    result,
    "shield := Shield{",
    "shield := Shield{\n\t\tabsorbSchoolMask: config.AbsorbSchoolMask,",
  );
  result = once(
    result,
    "// Represents a finite all-school absorption effect",
    "// Represents a finite absorption effect with optional school filtering",
  );
  const start = result.indexOf("func (unit *Unit) absorbDamage("),
    end = result.indexOf("type ShieldArray", start);
  assert(start > 0 && end > start);
  assert(result.slice(start, end).includes("shield := unit.activeShields[0]"));
  result =
    result.slice(0, start) +
    `func (unit *Unit) absorbDamage(sim *Simulation, incoming *Spell, result *SpellResult) {
    for index := 0; result.Damage > 0 && index < len(unit.activeShields); {
      shield := unit.activeShields[index]
      if shield.ExpiresAt() <= sim.CurrentTime {
        shield.Deactivate(sim)
        index = 0
        continue
      }
      if shield.absorbSchoolMask != 0 && !shield.absorbSchoolMask.Matches(incoming.SpellSchool) {
        index++
        continue
      }
      amount := min(result.Damage, shield.remainingAbsorb)
      shield.remainingAbsorb -= amount
      result.Damage -= amount
      result.AbsorbedDamage += amount
      shield.Spell.SpellMetrics[unit.UnitIndex].TotalAbsorbedShielding += amount
      if sim.Log != nil {
        shield.Spell.Unit.Log(sim, "%s %s absorbed %0.3f damage (%0.3f remaining).", unit.LogLabel(), shield.Spell.ActionID, amount, shield.remainingAbsorb)
      }
      if shield.remainingAbsorb <= 0 {
        shield.Deactivate(sim)
        if shield.onDepleted != nil { shield.onDepleted(sim, incoming, result) }
        // Callbacks may remove an earlier incompatible pool or apply another.
        index = 0
      } else { index++ }
    }
  }

` +
    result.slice(end);
  return result;
}
