import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  fullRaidDruidDeliveryValidationSchema,
  verifyFullRaidDruidDeliveryAuthorityV3,
} from "./forever-simulator-full-raid-druid-delivery-validation-v3";

const directory =
  "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/delivery-validation-v2";
const authBody = readFileSync(
  resolve(import.meta.dirname, "../../../..", directory, "authorization.json"),
);
const authorization: unknown = JSON.parse(authBody.toString());
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function bytes(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value, null, 2) + "\n")
    .digest("hex");
}
function fixture(): {
  metadata: z.infer<typeof fullRaidDruidDeliveryValidationSchema>;
  authorization: { value: unknown; sha256: string };
  window: { value: Record<string, unknown>; sha256: string };
  preparation: { value: Record<string, unknown>; sha256: string };
} {
  const parsed = z.object({ recordedAt: z.string() }).parse(authorization),
    authorizationRef = {
      path: directory + "/authorization.json",
      sha256: hash(authorization),
      byteSha256: createHash("sha256").update(authBody).digest("hex"),
    },
    preparationValue = {
      schema: "kfc-druid-delivery-validation-preparation.v1",
      status: "prepared-not-started",
      authorization: authorizationRef,
      checksPassed: true,
      nativeJobs: 0,
      optimizationSearchAuthorized: false,
      deploymentAuthorized: false,
    },
    preparationRef = {
      path: directory + "/preparations/prepared-" + hash(preparationValue).slice(0, 16) + ".json",
      sha256: hash(preparationValue),
    },
    start = Date.parse(parsed.recordedAt),
    value = {
      schema: "kfc-druid-separate-delivery-validation-window.v1",
      authorization: authorizationRef,
      startedAt: new Date(start).toISOString(),
      deadlineAt: new Date(start + 3600000).toISOString(),
      maximumDurationMs: 3600000,
      originalStudyDeadlineAt: "2026-10-25T23:25:34.014Z",
      sourceRelease: "57ac00a190de1da00d51b72d",
      deliveryRelease: "ce2375bbbbc13f564a8717f3",
      firstPreparation: preparationRef,
      optimizationSearchAuthorized: false,
      deploymentAuthorized: false,
    };
  // Synthetic transport documents test parsing only; they qualify no numerical result.
  return {
    metadata: fullRaidDruidDeliveryValidationSchema.parse({
      schema: "kfc-druid-separate-delivery-validation-record.v1",
      authorization: authorizationRef,
      window: { path: directory + "/window.json", sha256: hash(value), byteSha256: bytes(value) },
      preparation: preparationRef,
      originalStudyDeadlineAt: value.originalStudyDeadlineAt,
      startedAt: value.startedAt,
      deadlineAt: value.deadlineAt,
      maximumDurationMs: value.maximumDurationMs,
    }),
    authorization: { value: authorization, sha256: authorizationRef.byteSha256 },
    window: { value, sha256: bytes(value) },
    preparation: { value: preparationValue, sha256: bytes(preparationValue) },
  };
}
function verify(value: ReturnType<typeof fixture>, capturedAt = value.metadata.startedAt): void {
  verifyFullRaidDruidDeliveryAuthorityV3(
    value.metadata,
    capturedAt,
    value.authorization,
    value.window,
    value.preparation,
  );
}
describe("new sixty-minute authority; parser contracts only", (): void => {
  it("accepts the actual user approval and separately bounded synthetic window", (): void => {
    expect(() => verify(fixture())).not.toThrow();
  });
  it("rejects captures at the cutoff or before the new start", (): void => {
    const v = fixture();
    expect(() => verify(v, v.metadata.deadlineAt)).toThrow(/outside/);
    expect(() => verify(v, new Date(Date.parse(v.metadata.startedAt) - 1).toISOString())).toThrow(
      /outside/,
    );
  });
  it("rejects a rehashed two-hour extension", (): void => {
    const v = fixture();
    v.window.value.deadlineAt = new Date(Date.parse(v.metadata.startedAt) + 7200000).toISOString();
    v.metadata.deadlineAt = String(v.window.value.deadlineAt);
    v.window.sha256 = bytes(v.window.value);
    v.metadata.window.sha256 = hash(v.window.value);
    v.metadata.window.byteSha256 = v.window.sha256;
    expect(() => verify(v)).toThrow(/duration/);
  });
  it("rejects changed approval or window bytes", (): void => {
    for (const key of ["authorization", "window"] as const) {
      const v = fixture();
      v[key].sha256 = "0".repeat(64);
      expect(() => verify(v)).toThrow();
    }
  });
  it("rejects changed predecessor references", (): void => {
    const v = fixture();
    v.authorization.value = {
      ...z.record(z.string(), z.unknown()).parse(authorization),
      previousWindow: {},
    };
    expect(() => verify(v)).toThrow();
  });
  it("rejects changed preparation content", (): void => {
    const v = fixture();
    v.preparation.value.checksPassed = false;
    expect(() => verify(v)).toThrow();
  });
  it("rejects optimization or deployment permissions even if rehashed", (): void => {
    for (const key of ["optimizationSearchAuthorized", "deploymentAuthorized"]) {
      const v = fixture();
      v.preparation.value[key] = true;
      const sha = hash(v.preparation.value);
      v.metadata.preparation = {
        path: directory + "/preparations/prepared-" + sha.slice(0, 16) + ".json",
        sha256: sha,
      };
      expect(() => verify(v)).toThrow();
    }
  });
});
