import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parsePaladinHealerFullCatalog } from "./paladin-healer-catalog.js";
import { parsePaladinHealerFramePayload } from "./paladin-healer-frame.js";
import {
  assertPaladinHealerCoreFrameCoverage,
  assertPaladinHealerFrameLibraryCoverage,
  parsePaladinHealerFrameLibraryIndex,
} from "./paladin-healer-frame-library.js";
import { paladinHealerFrameReleaseSchema } from "./paladin-healer-frame-release.js";
import { parsePaladinHealerFullPresentation } from "./paladin-healer-presentation.js";
import {
  configurationForPaladinHealerFrame,
  paladinHealerFullConfigurationProblem,
} from "./paladin-healer-workspace.js";

function fixture(name: string): unknown {
  return JSON.parse(
    gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url))).toString("utf8"),
  ) as unknown;
}
const manifest = paladinHealerFrameReleaseSchema.parse(
  fixture("paladin-healer-core-release.v2.json.gz"),
);
const catalog = parsePaladinHealerFullCatalog(fixture("paladin-healer-catalog.v2.json.gz"));
const presentation = parsePaladinHealerFullPresentation(
  catalog,
  fixture("paladin-healer-presentation.v2.json.gz"),
  manifest.catalogSha256,
);
const index = parsePaladinHealerFrameLibraryIndex(
  catalog,
  presentation,
  fixture("paladin-healer-core-index.v2.json.gz"),
);
const transfer = parsePaladinHealerFramePayload(
  fixture("paladin-healer-core-transfer-frame.v2.json.gz"),
);

describe("Paladin core release scope", () => {
  it("covers all 30 profession profiles and nine builds without claiming extended encounters", () => {
    expect(index.frames).toHaveLength(270);
    expect(new Set(index.frames.map((entry) => entry.frame.profileId)).size).toBe(30);
    expect(index.coverage.preparedConfigurations).toBe(7560);
    expect(() => assertPaladinHealerCoreFrameCoverage(index)).not.toThrow();
    expect(() => assertPaladinHealerFrameLibraryCoverage(index)).toThrow();
    expect(index.coverage.complete).toBe(false);
    expect(manifest.scope).toBe("core-three-minute-matrix");
  });

  it("rejects a missing core build even when the asset count stays the same", () => {
    const changed = structuredClone(index);
    const entry = changed.frames[0]!;
    entry.frame.variant.durationSeconds = 300;
    entry.frame.id = entry.frame.id.replace(/180$/, "300");
    expect(() => assertPaladinHealerCoreFrameCoverage(changed)).toThrow(/missing/);
  });

  it("retains original four-batch performance evidence in every transferred scenario", () => {
    expect(transfer.configurations).toHaveLength(28);
    for (const entry of transfer.configurations) {
      expect(entry.sourceEvidence.sourceKind).toBe("profession-transfer");
      expect(entry.sourceEvidence.professionTransferReview).toBeDefined();
      expect(entry.sourceEvidence.numericalProfessions).not.toEqual(
        transfer.frame.context.professions,
      );
      expect(entry.reference.rounds).toEqual(entry.sourceEvidence.baselineEvidence!.rounds);
      const config = configurationForPaladinHealerFrame(
        transfer,
        manifest.release,
        entry.scenarioId,
      );
      expect(
        paladinHealerFullConfigurationProblem(
          catalog,
          presentation,
          transfer,
          config,
          manifest.release,
        ),
      ).toBeNull();
    }
    const missingReview = structuredClone(transfer);
    delete missingReview.configurations[0]!.sourceEvidence.professionTransferReview;
    expect(() => parsePaladinHealerFramePayload(missingReview)).toThrow(/provenance/);
  });

  it("requires delivery admission for core publication and keeps full-matrix admission separate", () => {
    expect(
      paladinHealerFrameReleaseSchema.safeParse({ ...manifest, status: "published" }).success,
    ).toBe(false);
    const admitted = {
      ...manifest,
      status: "published",
      publicationAllowed: true,
      qualification: {
        sourceReviewSha256: "a".repeat(64),
        finalFailureHistoryAuditComplete: true,
        professionTransfersComplete: true,
        selectedBrowserControlsComplete: true,
        hostUiReviewed: true,
      },
    };
    expect(paladinHealerFrameReleaseSchema.safeParse(admitted).success).toBe(true);
    expect(
      paladinHealerFrameReleaseSchema.safeParse({ ...admitted, scope: "full-encounter-matrix" })
        .success,
    ).toBe(false);
  });
});
