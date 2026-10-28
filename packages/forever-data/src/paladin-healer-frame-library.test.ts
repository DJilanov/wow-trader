import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parsePaladinHealerFullCatalog } from "./paladin-healer-catalog.js";
import { parsePaladinHealerFramePayload } from "./paladin-healer-frame.js";
import {
  assertPaladinHealerFrameLibraryCoverage,
  paladinHealerFrameLibraryIndexSchema,
  parsePaladinHealerFrameLibraryIndex,
  parsePaladinHealerIndexedFrame,
  type PaladinHealerFrameLibraryIndex,
} from "./paladin-healer-frame-library.js";
import { parsePaladinHealerFullPresentation } from "./paladin-healer-presentation.js";

const hash = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
function fixture(name: string): Buffer {
  return gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)));
}
const catalogBody = fixture("paladin-healer-catalog.v2.json.gz");
const presentationBody = fixture("paladin-healer-presentation.v2.json.gz");
const catalog = parsePaladinHealerFullCatalog(JSON.parse(catalogBody.toString("utf8")));
const presentation = parsePaladinHealerFullPresentation(
  catalog,
  JSON.parse(presentationBody.toString("utf8")),
  hash(catalogBody),
);
const assets = [
  "paladin-healer-all-baseline-frames.v2.json.gz",
  "paladin-healer-frames.v2.json.gz",
].flatMap((name) =>
  z
    .object({
      assets: z.array(
        z.object({
          ref: z.object({ file: z.string(), byteSha256: z.string(), bytes: z.number() }),
          payload: z.unknown(),
        }),
      ),
    })
    .parse(JSON.parse(fixture(name).toString("utf8")))
    .assets.map((asset) => ({
      ref: asset.ref,
      payload: parsePaladinHealerFramePayload(asset.payload),
    })),
);
const sourceReviews = [
  ...new Map(
    assets.map((asset) => [
      asset.payload.source.nativeOriginReview.path,
      asset.payload.source.nativeOriginReview,
    ]),
  ).values(),
];
const raw = {
  schema: "kfc-paladin-healer-frame-library-index.v2",
  profile: "healing-paladin",
  modelIdentity: catalog.modelIdentity,
  runtimeSha256: assets[0]!.payload.runtimeSha256,
  catalog: { file: "catalog.json", byteSha256: hash(catalogBody), bytes: catalogBody.length },
  presentation: {
    file: "presentation.json",
    byteSha256: hash(presentationBody),
    bytes: presentationBody.length,
  },
  profiles: presentation.profiles.map((profile) => ({
    id: profile.id,
    context: {
      playerClass: 4,
      faction: profile.faction,
      professions: profile.professions,
      raceId: presentation.races.find(
        (race) => race.faction === (profile.faction === 1 ? "Alliance" : "Horde"),
      )!.id,
    },
  })),
  scenarios: presentation.scenarios.map((scenario) => scenario.id),
  frames: assets.map((asset) => ({
    frame: asset.payload.frame,
    asset: asset.ref,
    defaultConfigurationId: asset.payload.defaultConfigurationId,
    nativeOriginReview: asset.payload.source.nativeOriginReview,
  })),
  defaultFrameId: "direct-healing-support|group|1:4,11|stacked|180",
  sourceReviews,
  coverage: {
    requiredFrames: 900,
    requiredConfigurations: 25_200,
    preparedFrames: 110,
    preparedConfigurations: 3080,
    complete: false,
  },
  fullClassQualified: false,
  publicationAllowed: false,
};
const index = parsePaladinHealerFrameLibraryIndex(catalog, presentation, raw);
function reject(mutate: (value: PaladinHealerFrameLibraryIndex) => void): void {
  const value = structuredClone(index);
  mutate(value);
  expect(() => parsePaladinHealerFrameLibraryIndex(catalog, presentation, value)).toThrow();
}

describe("full Paladin frame library navigation", () => {
  it("indexes all 3080 authentic configurations without promoting partial coverage", () => {
    expect(index).toBe(raw);
    expect(index.profiles).toHaveLength(30);
    expect(index.frames).toHaveLength(110);
    expect(index.coverage).toEqual({
      requiredFrames: 900,
      requiredConfigurations: 25_200,
      preparedFrames: 110,
      preparedConfigurations: 3080,
      complete: false,
    });
    expect(new Set(index.frames.map((entry) => entry.frame.profileId)).size).toBe(12);
    for (const asset of assets) {
      const body = JSON.stringify(asset.payload) + "\n";
      expect(hash(body)).toBe(asset.ref.byteSha256);
      expect(Buffer.byteLength(body)).toBe(asset.ref.bytes);
      expect(parsePaladinHealerIndexedFrame(index, asset.payload.frame.id, asset.payload)).toBe(
        asset.payload,
      );
    }
  }, 60_000);

  it("rejects duplicate, unavailable, incorrectly named and undeclared frame assets", () => {
    reject((value): void => {
      value.frames[1] = structuredClone(value.frames[0]!);
    });
    reject((value): void => {
      value.frames[0]!.asset.file = "catalog.json";
    });
    reject((value): void => {
      value.frames[0]!.asset.bytes = 8_000_001;
    });
    reject((value): void => {
      value.defaultFrameId = "missing";
    });
    reject((value): void => {
      value.sourceReviews.pop();
    });
    reject((value): void => {
      value.frames[0]!.nativeOriginReview = {
        ...value.frames[0]!.nativeOriginReview,
        byteSha256: "0".repeat(64),
      };
    });
  });

  it("binds all profession profiles, races and scenarios to the real catalog and presentation", () => {
    reject((value): void => {
      value.catalog.byteSha256 = "0".repeat(64);
    });
    reject((value): void => {
      value.modelIdentity = "0".repeat(64);
    });
    reject((value): void => {
      value.profiles[0] = structuredClone(value.profiles[1]!);
    });
    reject((value): void => {
      value.profiles[0]!.context.raceId = 8;
    });
    reject((value): void => {
      value.scenarios.reverse();
    });
    reject((value): void => {
      value.frames[0]!.frame.context.raceId = 8;
    });
  });

  it("rejects another prepared frame, model, runtime, default or native-origin proof", () => {
    const payload = assets[0]!.payload;
    expect(() =>
      parsePaladinHealerIndexedFrame(
        index,
        "direct-healing-support|group|1:1,2|stacked|180",
        payload,
      ),
    ).toThrow();
    expect(() =>
      parsePaladinHealerIndexedFrame(index, assets[1]!.payload.frame.id, payload),
    ).toThrow();
    expect(() =>
      parsePaladinHealerIndexedFrame(index, payload.frame.id, {
        ...payload,
        modelIdentity: "0".repeat(64),
      }),
    ).toThrow();
    expect(() =>
      parsePaladinHealerIndexedFrame(index, payload.frame.id, {
        ...payload,
        runtimeSha256: "0".repeat(64),
      }),
    ).toThrow();
    expect(() =>
      parsePaladinHealerIndexedFrame(index, payload.frame.id, {
        ...payload,
        defaultConfigurationId: payload.configurations[0]!.id,
      }),
    ).toThrow();
    const changed = structuredClone(payload);
    changed.source.nativeOriginReview.byteSha256 = "0".repeat(64);
    expect(() => parsePaladinHealerIndexedFrame(index, payload.frame.id, changed)).toThrow();
  });

  it("does not confuse metadata member order with changed simulation evidence", () => {
    const value = structuredClone(index);
    const first = value.profiles[0]!.context;
    value.profiles[0]!.context = {
      raceId: first.raceId,
      professions: first.professions,
      faction: first.faction,
      playerClass: first.playerClass,
    };
    value.sourceReviews = value.sourceReviews.map((ref) => ({
      byteSha256: ref.byteSha256,
      path: ref.path,
    }));
    expect(parsePaladinHealerFrameLibraryIndex(catalog, presentation, value)).toBe(value);
    const original = assets[0]!.payload;
    const payload = {
      ...original,
      frame: {
        ...original.frame,
        context: {
          ...value.profiles.find((profile) => profile.id === original.frame.profileId)!.context,
        },
      },
    };
    expect(parsePaladinHealerIndexedFrame(index, payload.frame.id, payload)).toBe(payload);
  });

  it("rejects coverage and qualification claims that exceed the supplied assets", () => {
    expect(() => assertPaladinHealerFrameLibraryCoverage(index)).toThrow("110/900");
    reject((value): void => {
      value.coverage.complete = true;
    });
    reject((value): void => {
      value.coverage.preparedFrames = 900;
    });
    reject((value): void => {
      value.coverage.preparedConfigurations = 25_200;
    });
    expect(
      paladinHealerFrameLibraryIndexSchema.safeParse({ ...raw, fullClassQualified: true }).success,
    ).toBe(false);
    expect(
      paladinHealerFrameLibraryIndexSchema.safeParse({ ...raw, publicationAllowed: true }).success,
    ).toBe(false);
  });
});
