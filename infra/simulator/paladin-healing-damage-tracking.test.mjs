import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderPaladinHealingDamageTracking } from "./paladin-healing-damage-tracking.mjs";

test("installs the health receiver in actor initialization before rank registration", () => {
  const source = readFileSync(new URL("./paladin-healing-baseline.go", import.meta.url), "utf8"),
    result = renderPaladinHealingDamageTracking(source);
  assert(
    result.includes(
      "holy.registerKFCPaladinDamageTracking()\n\tfor _, rank := range kfcPaladinHealingRanks",
    ),
  );
});

test("rejects missing and duplicated initialization anchors", () => {
  assert.throws(() => renderPaladinHealingDamageTracking("package holy"));
  assert.throws(() =>
    renderPaladinHealingDamageTracking(
      "\tfor _, rank := range kfcPaladinHealingRanks {\n\tfor _, rank := range kfcPaladinHealingRanks {",
    ),
  );
});
