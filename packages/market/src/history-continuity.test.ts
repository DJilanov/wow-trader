import { describe, expect, it } from "vitest";
import { resolveMarketHistoryBuilds } from "./history-continuity.js";

describe("reviewed market history continuity", () => {
  const cutoff = new Date("2026-10-20T00:00:00Z");
  it("isolates builds unless there is an explicit link", () => {
    expect([...resolveMarketHistoryBuilds(3, cutoff, [])]).toEqual([[3, cutoff]]);
  });
  it("follows compatible patches and preserves the strictest reset cutoff", () => {
    const reset = new Date("2026-10-23T00:00:00Z");
    const builds = resolveMarketHistoryBuilds(3, cutoff, [
      { fromBuild: 1, toBuild: 2, notBefore: cutoff },
      { fromBuild: 2, toBuild: 3, notBefore: reset },
      { fromBuild: 1, toBuild: 4, notBefore: cutoff },
    ]);
    expect([...builds]).toEqual([
      [3, cutoff],
      [2, reset],
      [1, reset],
    ]);
  });
  it("rejects invalid or cyclic build edges", () => {
    expect(() =>
      resolveMarketHistoryBuilds(3, cutoff, [{ fromBuild: 3, toBuild: 2, notBefore: cutoff }]),
    ).toThrow(RangeError);
  });
});
