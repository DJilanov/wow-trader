import { describe, expect, it } from "vitest";
import { clientValuationPackSchema } from "./client-valuation.js";

const pack = {
  schemaVersion: "client-valuation.v1",
  clientProduct: "wow_classic_beta",
  clientBuild: 70938,
  hotfixSha256: "a".repeat(64),
  definitionsRevision: "b".repeat(40),
  sourceSha256: "c".repeat(64),
  items: [[2865, 4, 2, 21, true, 0, 21, false]],
};
describe("client valuation wire contract", () => {
  it("accepts compact equipment evidence with provenance", () => {
    expect(clientValuationPackSchema.parse(pack).items[0]?.[0]).toBe(2865);
  });
  it("rejects duplicates, invalid flags, non-equipment and incomplete provenance", () => {
    for (const value of [
      { ...pack, items: [...pack.items, ...pack.items] },
      { ...pack, items: [[2865, 4, 2, 21, 1, 0, 21, false]] },
      { ...pack, items: [[2865, 7, 2, 21, true, 0, 21, false]] },
      { ...pack, sourceSha256: "unknown" },
    ])
      expect(clientValuationPackSchema.safeParse(value).success).toBe(false);
  });
});
