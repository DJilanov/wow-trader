import assert from "node:assert/strict";

export function patchCombatNativeEntry(source, profile, payloadPath, modulePath, ts) {
  const specs = {
    warrior: "SpecWarrior",
  };
  assert(Object.hasOwn(specs, profile), "Unknown tank entry profile");
  for (const path of [payloadPath, modulePath])
    assert(
      /^\/forever-sim\/[a-f0-9]{24}\/[a-z0-9_./-]+$/.test(path) && !path.split("/").includes(".."),
    );
  assert(!source.includes("__kfcMountCombatLibrary"), "Combat entry already adapted");
  const file = ts.createSourceFile(
    "combat-entry.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const importedConstructors = new Set();
  for (const statement of file.statements)
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      /(?:^|\/)sim-[a-zA-Z0-9_-]+\.chunk\.js$/.test(statement.moduleSpecifier.text) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    )
      for (const imported of statement.importClause.namedBindings.elements)
        importedConstructors.add(imported.name.text);
  const constructors = [],
    events = [],
    players = [];
  const visit = (node) => {
    if (
      ts.isNewExpression(node) &&
      node.arguments?.length === 2 &&
      ts.isPropertyAccessExpression(node.arguments[0]) &&
      node.arguments[0].name.text === specs[profile] &&
      ts.isVariableDeclaration(node.parent) &&
      ts.isIdentifier(node.parent.name)
    )
      players.push(node.parent.name.text);
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      importedConstructors.has(node.expression.text) &&
      node.arguments?.length === 2 &&
      node.arguments[0].getText(file) === "document.body"
    )
      constructors.push(node);
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "nextEventID" &&
      node.arguments.length === 0
    )
      events.push(node.getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.equal(players.length, 1, "Missing or duplicate expected tank profile player");
  assert.equal(constructors.length, 1, "Combat entry construction changed");
  assert.equal(events.length, 1, "Combat entry event identity changed");
  const node = constructors[0];
  assert.equal(node.arguments.length, 2);
  assert.equal(node.arguments[0].getText(file), "document.body");
  assert.equal(
    node.arguments[1].getText(file),
    players[0],
    "Combat UI does not own the expected profile player",
  );
  const replacement = `__kfcMountCombatLibrary(()=>${node.getText(file)},()=>${events[0]},${JSON.stringify(payloadPath)})`;
  assert(
    ts.isExpressionStatement(node.parent) ||
      (ts.isBinaryExpression(node.parent) &&
        node.parent.operatorToken.kind === ts.SyntaxKind.CommaToken &&
        node.parent.right === node &&
        ts.isExpressionStatement(node.parent.parent)),
    "Combat construction must be an unused entry expression",
  );
  return (
    `import {mountCombatBuildLibrary as __kfcMountCombatLibrary} from ${JSON.stringify(modulePath)};\n` +
    source.slice(0, node.getStart(file)) +
    replacement +
    source.slice(node.end)
  );
}
