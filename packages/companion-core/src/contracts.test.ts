import { describe, expect, it } from "vitest";

import { companionPhaseSchema, companionSnapshotSchema } from "./contracts.js";

describe("companion contracts", () => {
  it("accepts the manual reconciliation status", () => {
    expect(companionPhaseSchema.parse("checking")).toBe("checking");
    expect(
      companionSnapshotSchema.parse({
        phase: "checking",
        automaticUploads: true,
        products: [],
        pendingScanCount: 0,
        activeScanId: null,
        activeCharacterLabel: null,
        lastProcessedAt: null,
        lastProcessedScanId: null,
        message: "Checking saved scans and server status…",
        errorCode: null,
        updatedAt: "2026-09-27T12:30:00.000Z",
      }).phase,
    ).toBe("checking");
  });
});
