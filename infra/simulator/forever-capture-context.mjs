import assert from "node:assert/strict";

/** Check both sides of an unmodified browser capture before using its results.
 * Decoded messages and canonical protobuf JSON are supported. Capture source
 * authentication and complete player/raid comparison remain separate gates.
 * A request rebuilt after capture cannot establish what the browser executed.
 * @param {object} capturedSettings
 * @param {object} capturedRequest
 * @returns {void}
 */
export function assertForeverBrowserCapture(capturedSettings, capturedRequest) {
  const selected = capturedSettings?.settings?.ruleset;
  assert(
    selected === 1 || selected === "RulesetForever",
    "Browser capture must explicitly select Forever in its UI settings",
  );
  const executed = capturedRequest?.simOptions?.ruleset;
  assert(
    executed === 1 || executed === "RulesetForever",
    "Browser capture request must execute the Forever ruleset",
  );
}
