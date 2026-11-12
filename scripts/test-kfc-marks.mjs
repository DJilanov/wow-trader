import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const options = new Map();
for (const argument of process.argv.slice(2)) {
  const match = /^--(lua|ui-source)=(.+)$/.exec(argument);
  if (!match || options.has(match[1]))
    throw new Error(`Unknown or duplicate argument: ${argument}`);
  options.set(match[1], match[2]);
}
const root = path.resolve(import.meta.dirname, "..");
const folder = path.join(root, "apps/addon/KFCMarks");
const lua = options.get("lua") ?? process.env.LUA ?? "lua";
if (options.has("ui-source")) {
  const source = readFileSync(path.resolve(options.get("ui-source")));
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    "b6e91f1d54f269a8bd66312b368e6fd7706028d366eee0167161ace9004cae23",
    "Review and pin new Blizzard UI source before executing its dispatcher controls",
  );
}
const toc = readFileSync(path.join(folder, "KFCMarks.toc"), "utf8");
assert.match(toc, /^## Interface: 16001$/m);
assert.match(toc, /^## SavedVariables: KFC_MARKS_DB$/m);
const shipped = toc.split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
assert.deepEqual(shipped, ["Policy.lua", "Core.lua", "UI.lua", "Bindings.xml"]);
const bindings = readFileSync(path.join(folder, "Bindings.xml"), "utf8");
assert.match(bindings, /name="CLICK KFCMarksMarkButton:LeftButton"/);
assert.match(bindings, /name="KFCMARKS_TOGGLE"/);
for (const file of shipped.filter((entry) => entry.endsWith(".lua"))) {
  const source = readFileSync(path.join(folder, file), "utf8");
  assert.ok(
    !/\bSetRaidTarget\s*\(/.test(source),
    "Target assignment must remain in Blizzard's secure click handler",
  );
  execFileSync(lua, ["-e", `assert(loadfile(${JSON.stringify(path.join(folder, file))}))`], {
    cwd: root,
  });
}
for (const file of ["Policy.test.lua", "Core.test.lua", "UI.test.lua"]) {
  const args = [path.join(folder, file)];
  if (file === "Core.test.lua" && options.has("ui-source"))
    args.push(path.resolve(options.get("ui-source")));
  process.stdout.write(execFileSync(lua, args, { cwd: root, encoding: "utf8" }));
}
process.stdout.write(
  execFileSync(lua, [path.join(folder, "UI.test.lua"), "combat"], { cwd: root, encoding: "utf8" }),
);
process.stdout.write(
  "TOC, bindings, shipped Lua syntax and secure-action boundary checks passed.\n",
);
