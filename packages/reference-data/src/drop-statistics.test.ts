import { describe, expect, it } from "vitest";
import { normalizeDropStatistics, parseDropStatistics } from "./drop-statistics.js";
import { parseWowheadPage } from "./parser.js";
describe("quantitative quest-drop capture", () => {
  it("preserves explicit percent, samples and stacks without treating quantities as probabilities", () => {
    expect(parseDropStatistics({ percent: 40, count: 80, outof: 100, stack: [2, 2] })).toEqual({
      percent: 40,
      drops: 80,
      attempts: 100,
      minimumQuantity: 2,
      maximumQuantity: 2,
    });
    expect(parseDropStatistics({ count: 80, outof: 100 })).toMatchObject({
      percent: 80,
      percentBasis: "sample-ratio",
      minimumQuantity: null,
    });
    expect(parseDropStatistics({ id: 1 })).toBeUndefined();
    expect(parseDropStatistics({ percent: 40 })?.minimumQuantity).toBeNull();
  });
  it("honors an explicit override rather than replacing it with a sample ratio", () => {
    expect(
      parseDropStatistics({ percentOverride: 100, percent: 40, count: 9, outof: 19 }),
    ).toMatchObject({ percent: 100, percentBasis: "reported-override" });
    expect(parseDropStatistics({ percentOverride: 0, count: 9, outof: 19 })?.percent).toBe(0);
  });
  it("decodes a reported count percentage only with the source's explicit zero-denominator sentinel", () => {
    expect(parseDropStatistics({ count: 34.5, outof: 0 })).toMatchObject({
      percent: 34.5,
      percentBasis: "reported",
      drops: null,
      attempts: null,
    });
    expect(parseDropStatistics({ count: 0, outof: 0 })?.percent).toBe(0);
    expect(parseDropStatistics({ count: 80, outof: 0, percentOverride: 25 })?.percent).toBe(25);
    expect(parseDropStatistics({ count: 80, outof: 0, percent: 40 })?.percent).toBe(40);
    for (const count of [-1, 150, "50", null])
      expect(parseDropStatistics({ count, outof: 0 })?.percent).toBeNull();
    expect(parseDropStatistics({ count: 80 })?.percent).toBeNull();
    expect(parseDropStatistics({ count: 80, outof: null })?.percent).toBeNull();
  });
  it("recovers old sample counters without changing their provenance or assuming stack size", () => {
    const original = {
      percent: null,
      drops: 9,
      attempts: 19,
      minimumQuantity: null,
      maximumQuantity: null,
    };
    const normalized = normalizeDropStatistics(original);
    expect(normalized.percent).toBeCloseTo((9 / 19) * 100);
    expect(normalized.percentBasis).toBe("sample-ratio");
    expect(normalized.minimumQuantity).toBeNull();
    expect(original.percent).toBeNull();
    expect(normalizeDropStatistics(normalized)).toEqual(normalized);
    for (const [drops, attempts] of [
      [0, 19],
      [20, 19],
      [-1, 0],
    ] as const) {
      if (drops < 0)
        expect(() => normalizeDropStatistics({ ...original, drops, attempts })).toThrow();
      else expect(normalizeDropStatistics({ ...original, drops, attempts }).percent).toBeNull();
    }
    expect(
      normalizeDropStatistics({ ...original, minimumQuantity: 2, maximumQuantity: 2 }).percent,
    ).toBeNull();
    expect(normalizeDropStatistics({ ...original, minimumQuantity: 2 }).percent).toBeNull();
    expect(
      normalizeDropStatistics({
        ...original,
        quantityDistribution: [
          { quantity: 1, percent: 50 },
          { quantity: 2, percent: 50 },
        ],
      }).percent,
    ).toBeNull();
  });
  it("preserves conditional quantity distributions and extracts fixed stacks only when explicit", () => {
    expect(parseDropStatistics({ count: 9, outof: 19, pctstack: '{"1":100}' })).toMatchObject({
      minimumQuantity: 1,
      maximumQuantity: 1,
      quantityDistribution: [{ quantity: 1, percent: 100 }],
    });
    expect(parseDropStatistics({ percent: 40, pctstack: '{"1":75,"3":25}' })).toMatchObject({
      minimumQuantity: 1,
      maximumQuantity: 3,
    });
    for (const pctstack of [
      "globalThis.compromised=true",
      '{"1":50}',
      '{"0":100}',
      '{"1":-1,"2":101}',
      "[]",
    ])
      expect(() => parseDropStatistics({ percent: 40, pctstack })).toThrow();
    expect(() =>
      parseDropStatistics({ percent: 40, stack: [1, 1], pctstack: '{"2":100}' }),
    ).toThrow(/conflict/);
    expect(() =>
      normalizeDropStatistics({
        percent: 40,
        drops: 8,
        attempts: 20,
        minimumQuantity: 1,
        maximumQuantity: 1,
        quantityDistribution: [{ quantity: 2, percent: 100 }],
      }),
    ).toThrow(/conflict/);
  });
  it.each([-1, 101, "40%", Number.NaN])("rejects an invalid explicit percent %s", (percent) => {
    expect(() => parseDropStatistics({ percent })).toThrow();
  });
  it("keeps numeric dropped-by data on a canonical item page", () => {
    const record = parseWowheadPage(
      '<link rel="canonical" href="https://www.wowhead.com/forever/item=750/meat"><h1>Meat</h1><script>new Listview({template:"npc",id:"dropped-by",data:[{id:299,name:"Young Wolf",percent:40,count:80,outof:200,stack:[1,1]}]});</script>',
      { game: "forever", kind: "item", id: 750 },
      {
        url: "https://www.wowhead.com/forever/item=750",
        capturedAt: "2026-10-20T00:00:00.000Z",
        permissionRef: "synthetic-test",
      },
    );
    expect(record.relations[0]!.dropStatistics?.percent).toBe(40);
    expect(record.relations[0]!.dropStatistics?.attempts).toBe(200);
  });
  it("extracts explicit objective item quantities, excluding rewards and foreign editions", () => {
    const record = parseWowheadPage(
      '<link rel="canonical" href="https://www.wowhead.com/forever/quest=33/wolves"><article><h1>Wolves</h1><table><tr><td><a href="/forever/item=750/meat">Meat</a> (8)</td></tr><tr><td><a href="/tbc/item=999/foreign">Foreign</a> (3)</td></tr></table><h2>Rewards</h2><table><tr><td><a href="/forever/item=123/reward">Reward</a> (1)</td></tr></table></article>',
      { game: "forever", kind: "quest", id: 33 },
      {
        url: "https://www.wowhead.com/forever/quest=33",
        capturedAt: "2026-10-20T00:00:00.000Z",
        permissionRef: "synthetic-test",
      },
    );
    expect(record.requiredItems).toEqual([{ itemId: 750, quantity: 8 }]);
  });
  it("also accepts explicit Progress-table items without including rewards", () => {
    const record = parseWowheadPage(
      '<link rel="canonical" href="https://www.wowhead.com/forever/quest=308/drink"><article><h1>Drink</h1><h2>Progress</h2><table class="icon-list"><tr><td><a href="/forever/item=2686/ale">Ale</a> (1)</td></tr></table><h2>Rewards</h2><table><tr><td><a href="/forever/item=123/reward">Reward</a> (1)</td></tr></table></article>',
      { game: "forever", kind: "quest", id: 308 },
      {
        url: "https://www.wowhead.com/forever/quest=308",
        capturedAt: "2026-10-20T00:00:00.000Z",
        permissionRef: "synthetic-test",
      },
    );
    expect(record.requiredItems).toEqual([{ itemId: 2686, quantity: 1 }]);
  });
  it("does not assign a shared row's counter to multiple different items", () => {
    const record = parseWowheadPage(
      '<link rel="canonical" href="https://www.wowhead.com/forever/quest=33/wolves"><article><h1>Wolves</h1><table><tr><td><a href="/forever/item=750/meat">Meat</a> or <a href="/forever/item=751/other">Other</a> (8)</td></tr></table></article>',
      { game: "forever", kind: "quest", id: 33 },
      {
        url: "https://www.wowhead.com/forever/quest=33",
        capturedAt: "2026-10-20T00:00:00.000Z",
        permissionRef: "synthetic-test",
      },
    );
    expect(record.requiredItems).toEqual([]);
  });
});
