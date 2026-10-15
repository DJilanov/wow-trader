import { describe, expect, it } from "vitest";
import { parseWowheadPage } from "./parser.js";
import type { ReferenceRecord, ReferenceTask } from "./contracts.js";

const targetId = 818;
const name = "Tigerseye";

function expectedDataset(game: ReferenceTask["game"]): string {
  const edition = game === "tbc" ? 5 : 16;
  return `WH.Gatherer.addData(3,${edition},{"818":{"name_enus":"Tigerseye","jsonequip":{"str":2,"buyprice":50,"avgbuyout":999}}});`;
}

function extract(game: ReferenceTask["game"], scripts: string): ReferenceRecord {
  const url = `https://www.wowhead.com/${game}/item=${targetId}`;
  return parseWowheadPage(
    `<link rel="canonical" href="${url}"><h1>${name}</h1><script>${scripts}</script>`,
    { game, kind: "item", id: targetId },
    {
      url,
      capturedAt: "2026-10-13T04:00:00.000Z",
      permissionRef: "test",
      itemXml: `<wowhead><item id="818"><name>Tigerseye</name><class id="7">Trade Goods</class><subclass id="0">Trade Goods</subclass><link>${url}</link><htmlTooltip><![CDATA[Tigerseye<br>Item Level 15]]></htmlTooltip></item></wowhead>`,
    },
  );
}

describe("edition-scoped Gatherer item data", (): void => {
  it("accepts Tigerseye's observed edition-4 related preload with its edition-5 primary data", (): void => {
    const preload =
      'WH.Gatherer.addData(3,4,{"999":{"name_enus":"Unrelated item","jsonequip":{}}});';
    expect(extract("tbc", preload + expectedDataset("tbc")).numericFacts).toEqual({
      str: 2,
      buyprice: 50,
      classId: 7,
      subclassId: 0,
    });
  });

  for (const game of ["tbc", "forever"] as const) {
    const foreignEdition = game === "tbc" ? 16 : 5;
    for (const position of ["before", "after"] as const) {
      it(`${game}: ignores unrelated foreign item data ${position} its own target`, (): void => {
        const foreign = `WH.Gatherer.addData(3,${foreignEdition},{"999":{"name_enus":"Unrelated item","jsonequip":{"str":999}}});`;
        const own = expectedDataset(game);
        const record = extract(game, position === "before" ? foreign + own : own + foreign);
        expect(record.numericFacts).toEqual({ str: 2, buyprice: 50, classId: 7, subclassId: 0 });
        expect(record.game).toBe(game);
        expect(record.id).toBe(targetId);
        expect(JSON.stringify(record)).not.toContain("Unrelated item");
      });

      it(`${game}: never merges another edition's same-ID facts ${position} its own target`, (): void => {
        const foreign = `WH.Gatherer.addData(3,${foreignEdition},{"818":{"name_enus":"Other edition item","jsonequip":{"str":999,"int":999}}});`;
        const own = expectedDataset(game);
        const record = extract(game, position === "before" ? foreign + own : own + foreign);
        expect(record.name).toBe(name);
        expect(record.numericFacts).toEqual({ str: 2, buyprice: 50, classId: 7, subclassId: 0 });
      });
    }

    it(`${game}: rejects target data supplied exclusively by another edition`, (): void => {
      const foreign = `WH.Gatherer.addData(3,${foreignEdition},{"818":{"name_enus":"Tigerseye","jsonequip":{"str":999}}});`;
      expect(() => extract(game, foreign)).toThrow("Gatherer edition mismatch");
      const unrelatedOwn = expectedDataset(game).replace('"818"', '"999"');
      expect(() => extract(game, unrelatedOwn + foreign)).toThrow("Gatherer edition mismatch");
    });

    it(`${game}: still rejects a wrong primary item name`, (): void => {
      expect(() =>
        extract(
          game,
          expectedDataset(game).replace('"name_enus":"Tigerseye"', '"name_enus":"Wrong name"'),
        ),
      ).toThrow("Reference item name mismatch");
    });

    it(`${game}: still rejects executable primary item data without evaluating it`, (): void => {
      const edition = game === "tbc" ? 5 : 16;
      expect(() => extract(game, `WH.Gatherer.addData(3,${edition},stealCookies());`)).toThrow(
        /Nonliteral/,
      );
    });
  }
});
