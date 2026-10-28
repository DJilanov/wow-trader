import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { paladinHealerFrameReleaseSchema } from "./paladin-healer-frame-release.js";

const manifest = paladinHealerFrameReleaseSchema.parse(
  JSON.parse(
    gunzipSync(
      readFileSync(new URL("./fixtures/paladin-healer-frame-release.v2.json.gz", import.meta.url)),
    ).toString("utf8"),
  ),
);

describe("Paladin frame release admission", () => {
  it("retains the actual partial package as an explicit review candidate", () => {
    expect(manifest.coverage).toEqual({
      preparedFrames: 110,
      preparedConfigurations: 3080,
      complete: false,
    });
    expect(Object.keys(manifest.files)).toHaveLength(117);
    expect(Object.keys(manifest.encodings ?? {})).toHaveLength(117);
    expect(manifest.publicationAllowed).toBe(false);
  });

  it("rejects premature publication and false coverage claims", () => {
    for (const change of [
      { status: "published" },
      { publicationAllowed: true },
      { coverage: { ...manifest.coverage, complete: true } },
      { coverage: { ...manifest.coverage, preparedConfigurations: 3081 } },
      { coverage: { ...manifest.coverage, preparedFrames: 900 } },
    ])
      expect(paladinHealerFrameReleaseSchema.safeParse({ ...manifest, ...change }).success).toBe(
        false,
      );
  });

  it("rejects private files, mismatched source identities and undeclared encodings", () => {
    const identity = manifest.files["catalog.json"]!;
    for (const change of [
      { files: { ...manifest.files, "report.json": identity } },
      { files: { ...manifest.files, "../catalog.json": identity } },
      { indexSha256: "0".repeat(64) },
      { catalogSha256: "0".repeat(64) },
      { encodings: { ...manifest.encodings, "private-proof.json": { br: identity } } },
    ])
      expect(paladinHealerFrameReleaseSchema.safeParse({ ...manifest, ...change }).success).toBe(
        false,
      );
  });
});
