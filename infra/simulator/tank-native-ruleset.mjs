import assert from "node:assert/strict";

// Keep the library source pinned by previous releases intact.
export function withTankRulesetIdentity(source, ts) {
  const file = ts.createSourceFile(
    "tank-native-library.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assert.deepEqual(file.parseDiagnostics, []);
  let functions = 0,
    replacements = 0;
  const result = ts.transform(file, [
    (context) => {
      function identity(node) {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "normalized"
        ) {
          assert.equal(node.arguments.length, 1);
          const value = node.arguments[0];
          assert(ts.isObjectLiteralExpression(value));
          assert(
            !value.properties.some((property) => property.name?.getText(file) === "ruleset"),
            "Tank ruleset identity was already applied",
          );
          replacements++;
          return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [
            ts.factory.updateObjectLiteralExpression(value, [
              ...value.properties,
              ts.factory.createPropertyAssignment(
                "ruleset",
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier("settings"),
                    "settings",
                  ),
                  "ruleset",
                ),
              ),
            ]),
          ]);
        }
        return ts.visitEachChild(node, identity, context);
      }
      function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === "tankCombatIdentity") {
          functions++;
          assert.equal(node.parameters.length, 1);
          assert.equal(node.parameters[0].name.getText(file), "settings");
          return ts.visitEachChild(node, identity, context);
        }
        return ts.visitEachChild(node, visit, context);
      }
      return (node) => ts.visitNode(node, visit);
    },
  ]);
  try {
    assert.equal(functions, 1, "Expected one reviewed tank combat identity");
    assert.equal(replacements, 1, "Expected one reviewed tank identity projection");
    return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(result.transformed[0]);
  } finally {
    result.dispose();
  }
}
