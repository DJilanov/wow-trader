import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  paladinHealerCatalogSlotItems,
  paladinHealerFullCatalogSchema,
  parsePaladinHealerFullCatalog,
  type PaladinHealerFullCatalog,
} from "./paladin-healer-catalog.js";

const hash = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const bytes = readFileSync(
  new URL("./fixtures/paladin-healer-catalog.v2.json.gz", import.meta.url),
);
expect(hash(bytes)).toBe("f2d374c7bc1ba7d94f908fbf7807c50500124ff71c730471d58287e789dc636d");
const raw = gunzipSync(bytes);
expect(hash(raw)).toBe("f897b695fed785e3c3dcade0f1079807c4b62a585f6079b9a6067d6e333da011");
const input: unknown = JSON.parse(raw.toString("utf8"));
const catalog = parsePaladinHealerFullCatalog(input);
function rejectMutation(mutate: (value: PaladinHealerFullCatalog) => void): void {
  const value = structuredClone(catalog);
  mutate(value);
  expect(paladinHealerFullCatalogSchema.safeParse(value).success).toBe(false);
}

describe("complete Paladin profession catalog", () => {
  it("preserves all genuine item/source records and thirty original acquisition profiles", () => {
    expect(catalog).toBe(input);
    expect(hash(JSON.stringify(catalog) + "\n")).toBe(hash(raw));
    expect(catalog.modelIdentity).toBe(
      "f0ff281981e5d576fe3cf8161071bd5b636cc83dc676e3954c85af7ff8a1fdb1",
    );
    expect(catalog.catalog).toHaveLength(2249);
    expect(catalog.profiles).toHaveLength(30);
    expect(catalog.wholeLoadoutValidationRequired).toBe(true);
    expect(catalog.publicationAllowed).toBe(false);
  });

  it("resolves every declared slot candidate without dropping source data or changing its order", () => {
    const used = new Set<number>();
    for (const profile of catalog.profiles)
      for (const [slot, ids] of profile.slots.entries()) {
        const entries = paladinHealerCatalogSlotItems(catalog, profile.id, slot);
        expect(entries.map((entry): number => entry.item.id)).toEqual(ids);
        for (const entry of entries) {
          expect(entry.source.id).toBe(entry.item.id);
          if (entry.item.requiredProfession)
            expect(profile.professions).toContain(entry.item.requiredProfession);
          used.add(entry.item.id);
        }
      }
    expect(used.size).toBe(2249);
  });

  it("offers the six extra crafts only to profiles with their actual required profession", () => {
    const ids = [227803, 227804, 227805, 227807, 227809, 227810];
    for (const id of ids) {
      const entry = catalog.catalog.find((entry): boolean => entry.item.id === id);
      expect(entry).toBeDefined();
      expect([2, 8]).toContain(entry?.item.requiredProfession);
      for (const profile of catalog.profiles) {
        const offered = profile.slots.some((slot): boolean => slot.includes(id));
        expect(offered).toBe(profile.professions.includes(entry!.item.requiredProfession!));
      }
    }
    const engineeringTailoring = catalog.profiles.find(
      (profile): boolean => profile.id === "1:4,11",
    )!;
    expect(engineeringTailoring.slots.flat().some((id): boolean => ids.includes(id))).toBe(false);
  });

  it("rejects missing profiles, reordered profession identities and duplicate slot entries", () => {
    rejectMutation((value): void => {
      value.profiles.pop();
    });
    rejectMutation((value): void => {
      value.profiles[1] = value.profiles[0]!;
    });
    rejectMutation((value): void => {
      value.profiles[0]!.professions.reverse();
    });
    rejectMutation((value): void => {
      value.profiles[0]!.slots[0]!.push(value.profiles[0]!.slots[0]![0]!);
    });
  });

  it("rejects missing, duplicate, mismatched and unreferenced catalog records", () => {
    rejectMutation((value): void => {
      value.catalog.pop();
    });
    rejectMutation((value): void => {
      value.catalog[1] = value.catalog[0]!;
    });
    rejectMutation((value): void => {
      value.catalog[0]!.source.id += 1;
    });
    rejectMutation((value): void => {
      const id = value.catalog[0]!.item.id;
      for (const profile of value.profiles)
        profile.slots = profile.slots.map((slot) =>
          slot.filter((candidate): boolean => candidate !== id),
        );
    });
  });

  it("rejects a profession-restricted item inserted into a profile without that profession", () => {
    rejectMutation((value): void => {
      const profile = value.profiles.find((entry): boolean => entry.id === "1:4,11")!;
      profile.slots[4]!.push(227803);
    });
  });

  it("rejects broken stats, unsupported class restrictions, over-level sources and promotion flags", () => {
    rejectMutation((value): void => {
      value.catalog[0]!.item.stats.pop();
    });
    rejectMutation((value): void => {
      value.catalog[0]!.item.classAllowlist = [5];
    });
    rejectMutation((value): void => {
      value.catalog[0]!.source.requiredLevel = 61;
    });
    for (const changed of [
      { ...catalog, publicationAllowed: true },
      { ...catalog, wholeLoadoutValidationRequired: false },
      { ...catalog, fullClassQualified: true },
      { ...catalog, schema: "kfc-paladin-healer-catalog-candidate.v1" },
    ])
      expect(paladinHealerFullCatalogSchema.safeParse(changed).success).toBe(false);
  });

  it("fails explicitly for an unknown profile, equipment slot or missing candidate", () => {
    expect(() => paladinHealerCatalogSlotItems(catalog, "missing", 0)).toThrow(
      "Unknown Paladin acquisition profile",
    );
    for (const slot of [-1, 17, 0.5, Number.NaN])
      expect(() => paladinHealerCatalogSlotItems(catalog, "1:4,11", slot)).toThrow(
        "Unknown Paladin equipment slot",
      );
    const changed = structuredClone(catalog);
    changed.catalog = [];
    expect(() => paladinHealerCatalogSlotItems(changed, "1:4,11", 0)).toThrow(
      "missing from the catalog",
    );
  });
});
