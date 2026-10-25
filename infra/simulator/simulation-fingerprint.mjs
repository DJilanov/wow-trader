import { createHash } from "node:crypto";

/** Pure identity calculation, independent of mutable cache-retention behavior.
 * @param {unknown} value @returns {string}
 */
export const simulationHash = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
