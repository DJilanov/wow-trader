import { describe, expect, it } from "vitest";
import { combatNpcMetadataReferenceSchema } from "./combat-npc-metadata.js";
import fixture from "./fixtures/wowhead-dragonmaw-metadata-20261103.json" with { type: "json" };

describe("unversioned Wowhead Forever creature references", () => {
  it("preserves three independently identified level-29–30 elites without inventing a client build", () => {
    const references = combatNpcMetadataReferenceSchema.array().parse(fixture.references);
    expect(references.map((row) => row.npcId)).toEqual([271346, 271348, 271351]);
    for (const row of references) {
      expect([row.minimumLevel, row.maximumLevel, row.rank]).toEqual([29, 30, 1]);
      for (const source of [row.levelSource, row.rankSource]) {
        expect(source).toMatchObject({
          kind: "wowhead-forever-reference",
          retrieval: "primary-page-search-extract",
          extractSha256: fixture.extractSha256,
        });
        expect(source).not.toHaveProperty("build");
      }
    }
  });

  it.each([
    "http://www.wowhead.com/forever/npc=271346",
    "https://wowhead.com.example.test/forever/npc=271346",
    "https://www.wowhead.com/classic/npc=271346",
    "https://www.wowhead.com/tbc/npc=271346",
    "https://user:password@www.wowhead.com/forever/npc=271346",
    "not a URL",
  ])("rejects an invalid or different-product source %s", (sourceUrl) => {
    const reference = fixture.references[0]!;
    expect(
      combatNpcMetadataReferenceSchema.safeParse({
        ...reference,
        levelSource: { ...reference.levelSource, sourceUrl },
      }).success,
    ).toBe(false);
  });

  it.each(["missing-hash", "invalid-time", "invented-build", "html-claim", "reversed-range"])(
    "rejects incomplete or misleading provenance (%s)",
    (change) => {
      const input: Record<string, unknown> = structuredClone(fixture.references[0]!);
      const source = input["levelSource"] as Record<string, unknown>;
      if (change === "missing-hash") delete source["extractSha256"];
      if (change === "invalid-time") source["referencedAt"] = "unknown";
      if (change === "invented-build") source["build"] = 70205;
      if (change === "html-claim") source["retrieval"] = "raw-html";
      if (change === "reversed-range") input["maximumLevel"] = 28;
      expect(combatNpcMetadataReferenceSchema.safeParse(input).success).toBe(false);
    },
  );
});
