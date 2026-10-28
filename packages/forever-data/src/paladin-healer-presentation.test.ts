import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parsePaladinHealerFullCatalog } from "./paladin-healer-catalog.js";
import { paladinHealerPresentationSchema } from "./paladin-healer-release.js";
import {
  paladinHealerDisplayStats,
  paladinHealerFullPresentationSchema,
  parsePaladinHealerFullPresentation,
  type PaladinHealerFullPresentation,
} from "./paladin-healer-presentation.js";

const hash = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const bytes = readFileSync(
  new URL("./fixtures/paladin-healer-presentation.v2.json.gz", import.meta.url),
);
expect(hash(bytes)).toBe("8cab41433d742408cd0ded1faacf132a2fdb8df9fa272dafc5a0430fd82df125");
const body = gunzipSync(bytes);
expect(hash(body)).toBe("e32fc24ffe516791faf0a626dc13fa33adcfa6f3e4fae968d3ff4be252e3d92e");
const input: unknown = JSON.parse(body.toString("utf8"));
const catalogBody = gunzipSync(
  readFileSync(new URL("./fixtures/paladin-healer-catalog.v2.json.gz", import.meta.url)),
);
const catalog = parsePaladinHealerFullCatalog(JSON.parse(catalogBody.toString("utf8")));
const catalogSha256 = hash(catalogBody);
const presentation = parsePaladinHealerFullPresentation(catalog, input, catalogSha256);
const original = paladinHealerPresentationSchema.parse(
  JSON.parse(
    gunzipSync(
      readFileSync(new URL("./fixtures/paladin-healer-presentation.v1.json.gz", import.meta.url)),
    ).toString("utf8"),
  ),
);
function rejectMutation(mutate: (value: PaladinHealerFullPresentation) => void): void {
  const value = structuredClone(presentation);
  mutate(value);
  expect(() => parsePaladinHealerFullPresentation(catalog, value, catalogSha256)).toThrow();
}

describe("full Paladin item and talent presentation", () => {
  it("preserves the genuine presentation bytes and includes every item and acquisition profile", () => {
    expect(presentation).toBe(input);
    expect(hash(JSON.stringify(presentation) + "\n")).toBe(hash(body));
    expect(presentation.items).toHaveLength(2249);
    expect(presentation.profiles).toHaveLength(30);
    expect(presentation.professions).toEqual([
      { id: 1, name: "Alchemy" },
      { id: 2, name: "Blacksmithing" },
      { id: 3, name: "Enchanting" },
      { id: 4, name: "Engineering" },
      { id: 8, name: "Leatherworking" },
      { id: 11, name: "Tailoring" },
    ]);
    expect(presentation.sourceCatalogSha256).toBe(catalogSha256);
    expect(presentation.modelIdentity).toBe(catalog.modelIdentity);
  });

  it("keeps all 2243 old displays, enchants, talents, spell descriptions and scenarios unchanged", () => {
    const items = new Map(presentation.items.map((item) => [item.id, item]));
    for (const previous of original.items) {
      const current = items.get(previous.id);
      expect(current).toBeDefined();
      const { requiredProfession: _requiredProfession, ...display } = current!;
      expect(display).toEqual(previous);
    }
    expect(presentation.enchants).toEqual(original.enchants);
    expect(presentation.spells).toEqual(original.spells);
    expect(presentation.talents).toEqual(original.talents);
    expect(presentation.scenarios).toEqual(original.scenarios);
    expect(presentation.enchants).toHaveLength(101);
    expect(presentation.spells).toHaveLength(21);
    expect(presentation.talents.flatMap((tree) => tree.talents)).toHaveLength(50);
  });

  it("renders native stats and required professions for all 2249 catalog items", () => {
    const items = new Map(presentation.items.map((item) => [item.id, item]));
    for (const { item } of catalog.catalog) {
      expect(items.get(item.id)?.stats).toEqual(paladinHealerDisplayStats(item.stats));
      expect(items.get(item.id)?.requiredProfession).toBe(item.requiredProfession ?? null);
    }
    const armor = items.get(227803)!;
    expect(armor.requiredProfession).toBe(8);
    expect(armor.stats).toContainEqual({ label: "Stamina", value: 30 });
    expect(armor.enchantIds.length).toBeGreaterThan(1);
  });

  it("rejects another catalog/model, an incomplete catalog and invalid source digests", () => {
    expect(() => parsePaladinHealerFullPresentation(catalog, presentation, "0".repeat(64))).toThrow(
      "another catalog or model",
    );
    expect(() => parsePaladinHealerFullPresentation(catalog, presentation, "invalid")).toThrow();
    rejectMutation((value): void => {
      value.modelIdentity = "0".repeat(64);
    });
    rejectMutation((value): void => {
      value.items.pop();
    });
    rejectMutation((value): void => {
      value.items[1] = value.items[0]!;
    });
    rejectMutation((value): void => {
      value.profiles[1] = value.profiles[0]!;
    });
  });

  it("rejects changed names, icons, levels, stats, profession requirements and equipment slots", () => {
    rejectMutation((value): void => {
      value.items[0]!.name += " changed";
    });
    rejectMutation((value): void => {
      value.items[0]!.icon = "inv_misc_questionmark";
    });
    rejectMutation((value): void => {
      value.items[0]!.requiredLevel += 1;
    });
    rejectMutation((value): void => {
      value.items.find((item): boolean => item.stats.length > 0)!.stats[0]!.value += 1;
    });
    rejectMutation((value): void => {
      value.items.find((item): boolean => item.id === 227803)!.requiredProfession = 4;
    });
    rejectMutation((value): void => {
      value.items.find((item): boolean => item.id === 227803)!.slots.push(0);
    });
  });

  it("rejects missing enchant references, duplicate enchants and duplicated slot lists", () => {
    rejectMutation((value): void => {
      value.items[0]!.enchantIds.push(999999);
    });
    rejectMutation((value): void => {
      value.enchants[1] = value.enchants[0]!;
    });
    rejectMutation((value): void => {
      value.items[0]!.slots.push(value.items[0]!.slots[0]!);
    });
    rejectMutation((value): void => {
      value.items[0]!.enchantIds.push(0);
    });
  });

  it("rejects duplicate talents, cyclic or missing prerequisites and unknown spell talents", () => {
    rejectMutation((value): void => {
      value.talents[0]!.talents[1]!.field = value.talents[0]!.talents[0]!.field;
    });
    rejectMutation((value): void => {
      const talent = value.talents[0]!.talents[0]!;
      talent.prerequisite = talent.field;
    });
    rejectMutation((value): void => {
      value.talents[0]!.talents[0]!.prerequisite = "missingTalent";
    });
    rejectMutation((value): void => {
      value.spells[0]!.requiredTalentField = "missingTalent";
    });
  });

  it("rejects missing profession/race coverage, mechanics scenarios and unknown root state", () => {
    rejectMutation((value): void => {
      value.professions[1] = value.professions[0]!;
    });
    rejectMutation((value): void => {
      value.races[1]!.faction = value.races[0]!.faction;
    });
    rejectMutation((value): void => {
      value.profiles[0]!.professions.reverse();
    });
    rejectMutation((value): void => {
      value.scenarios[1] = value.scenarios[0]!;
    });
    expect(
      paladinHealerFullPresentationSchema.safeParse({ ...presentation, publicationAllowed: true })
        .success,
    ).toBe(false);
  });

  it("renders negative stat values faithfully and rejects malformed engine vectors", () => {
    expect(paladinHealerDisplayStats(Array(44).fill(0))).toEqual([]);
    const values = Array<number>(44).fill(0);
    values[0] = -2;
    values[41] = 24;
    expect(paladinHealerDisplayStats(values)).toEqual([
      { label: "Strength", value: -2 },
      { label: "Healing power", value: 24 },
    ]);
    expect(() => paladinHealerDisplayStats([])).toThrow("Invalid Paladin stat vector");
    values[1] = Number.NaN;
    expect(() => paladinHealerDisplayStats(values)).toThrow("Invalid Paladin stat vector");
    values[1] = Number.POSITIVE_INFINITY;
    expect(() => paladinHealerDisplayStats(values)).toThrow("Invalid Paladin stat vector");
  });
});
