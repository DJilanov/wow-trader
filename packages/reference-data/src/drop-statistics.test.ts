import { describe, expect, it } from "vitest";
import { parseDropStatistics } from "./drop-statistics.js";
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
    expect(parseDropStatistics({ count: 80, outof: 100 })?.percent).toBeNull();
    expect(parseDropStatistics({ id: 1 })).toBeUndefined();
    expect(parseDropStatistics({ percent: 40 })?.minimumQuantity).toBeNull();
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
