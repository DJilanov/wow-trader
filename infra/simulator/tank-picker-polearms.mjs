import assert from "node:assert/strict";

// Parse the signed presentation bundle instead of depending on minified variable names.
export function patchTankPickerPolearms(source, ts) {
  if (!/\.ClassDruid\]\s*:\s*\[/.test(source) || !source.includes("weaponType"))
    return { source, matched: 0, modified: 0 };
  const file = ts.createSourceFile(
    "tank-presentation.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const edits = [];
  let matched = 0;
  const propertyName = (name) =>
    ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isComputedPropertyName(node.name) &&
      ts.isPropertyAccessExpression(node.name.expression) &&
      node.name.expression.name.text === "ClassDruid" &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      const entries = node.initializer.elements.map((element) => {
        if (!ts.isObjectLiteralExpression(element)) return null;
        const weapon = element.properties.find(
          (property) =>
            ts.isPropertyAssignment(property) && propertyName(property.name) === "weaponType",
        );
        return weapon && ts.isPropertyAccessExpression(weapon.initializer)
          ? weapon.initializer
          : null;
      });
      if (entries.length && entries.every((entry) => entry !== null)) {
        const names = entries.map((entry) => entry.name.text).sort();
        const expected = [
          "WeaponTypeDagger",
          "WeaponTypeFist",
          "WeaponTypeMace",
          "WeaponTypeOffHand",
          "WeaponTypeStaff",
        ];
        const existing = names.includes("WeaponTypePolearm");
        assert.deepEqual(
          names,
          [...expected, ...(existing ? ["WeaponTypePolearm"] : [])].sort(),
          "Druid weapon table changed; review proficiency admission",
        );
        matched++;
        if (!existing) {
          const receiver = entries[0].expression.getText(file);
          const elements = [
            ...node.initializer.elements.map((element) => element.getText(file)),
            `{weaponType:${receiver}.WeaponTypePolearm,canUseTwoHand:true}`,
          ];
          edits.push({
            start: node.initializer.getStart(file),
            end: node.initializer.end,
            text: `[${elements.join(",")}]`,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert(matched <= 1, "Ambiguous Druid weapon tables in presentation chunk");
  let next = source;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  return { source: next, matched, modified: edits.length };
}
