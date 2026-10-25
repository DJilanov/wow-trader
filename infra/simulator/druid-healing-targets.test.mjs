import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { renderDruidHealingTargets } from "./druid-healing-targets.mjs";

test("Druid target guards preserve the parent spells and check enabled state", () => {
  const baseline = readFileSync(new URL("./druid-healing-baseline.go", import.meta.url), "utf8");
  const advanced = readFileSync(new URL("./druid-healing-advanced.go", import.meta.url), "utf8");
  const result = renderDruidHealingTargets({ baseline, advanced });
  assert(result.advanced.includes("target.HasHealthBar() && target.IsEnabled()"));
  assert(result.baseline.includes("if !resto.kfcLiveFriendly(target) { return }"));
  assert(result.baseline.includes("spell.CalcAndDealHealing"));
});

test("missing target guards cannot silently produce an unchanged model", () => {
  assert.throws(() => renderDruidHealingTargets({ baseline: "", advanced: "" }));
});
