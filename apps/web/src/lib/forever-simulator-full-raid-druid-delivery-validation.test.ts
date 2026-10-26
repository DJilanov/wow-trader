import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  fullRaidDruidDeliveryValidationSchema,
  verifyFullRaidDruidDeliveryAuthority,
} from "./forever-simulator-full-raid-druid-delivery-validation";
import { fullRaidDruidBrowserReviewSchema } from "./forever-simulator-full-raid-druid-profile-schema-v4";
import { fullRaidDruidBrowserReviewSchema as historicalBrowserSchema } from "./forever-simulator-full-raid-druid-profile-schema-v3";
import { createReviewedFullRaidDruidProfileAdaptersV4 } from "./forever-simulator-full-raid-druid-profile-v4";
import {
  createDruidProfileV3Contract,
  disposeDruidProfileV3Contracts,
} from "./fixtures/druid-profile-v3-contract";

const directory =
  "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/delivery-validation-v1";
const body = readFileSync(
  resolve(import.meta.dirname, "../../../..", directory, "authorization.json"),
);
const authorization: unknown = JSON.parse(body.toString());
interface AuthorityFixture {
  metadata: z.infer<typeof fullRaidDruidDeliveryValidationSchema>;
  authorization: { value: unknown; sha256: string };
  window: { value: Record<string, unknown>; sha256: string };
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function bytesHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value, null, 2) + "\n")
    .digest("hex");
}
function authority(): AuthorityFixture {
  const reference = {
      path: directory + "/authorization.json",
      sha256: hash(authorization),
      byteSha256: createHash("sha256").update(body).digest("hex"),
    },
    preparation = {
      path: directory + "/preparations/prepared-" + "a".repeat(16) + ".json",
      sha256: "a".repeat(64),
      byteSha256: "b".repeat(64),
    },
    startMs =
      Date.parse(z.object({ recordedAt: z.iso.datetime() }).parse(authorization).recordedAt) + 1000,
    startedAt = new Date(startMs).toISOString();
  // This is a synthetic window for parser/I/O contracts, never execution evidence.
  const window = {
    schema: "kfc-druid-separate-delivery-validation-window.v1",
    authorization: reference,
    startedAt,
    deadlineAt: new Date(startMs + 7200000).toISOString(),
    maximumDurationMs: 7200000,
    originalStudyDeadlineAt: "2026-10-25T23:25:34.014Z",
    sourceRelease: "57ac00a190de1da00d51b72d",
    deliveryRelease: "ce2375bbbbc13f564a8717f3",
    firstPreparation: preparation,
    optimizationSearchAuthorized: false,
    deploymentAuthorized: false,
  };
  const metadata = fullRaidDruidDeliveryValidationSchema.parse({
    schema: "kfc-druid-separate-delivery-validation-record.v1",
    authorization: reference,
    window: {
      path: directory + "/window.json",
      sha256: hash(window),
      byteSha256: bytesHash(window),
    },
    preparation,
    originalStudyDeadlineAt: window.originalStudyDeadlineAt,
    startedAt: window.startedAt,
    deadlineAt: window.deadlineAt,
    maximumDurationMs: window.maximumDurationMs,
  });
  return {
    metadata,
    authorization: { value: authorization, sha256: reference.byteSha256 },
    window: { value: window, sha256: bytesHash(window) },
  };
}

function captureTime(value: AuthorityFixture): string {
  return new Date(Date.parse(value.metadata.startedAt) + 1000).toISOString();
}

function resealWindow(value: AuthorityFixture): void {
  value.window.sha256 = bytesHash(value.window.value);
  value.metadata.window.sha256 = hash(value.window.value);
  value.metadata.window.byteSha256 = value.window.sha256;
}

afterEach(async (): Promise<void> => {
  await disposeDruidProfileV3Contracts();
});
describe("separately authorized Druid delivery; synthetic contracts only", (): void => {
  it("accepts a truthful separate window while preserving the original deadline", (): void => {
    const value = authority();
    expect(() =>
      verifyFullRaidDruidDeliveryAuthority(
        value.metadata,
        captureTime(value),
        value.authorization,
        value.window,
      ),
    ).not.toThrow();
  });
  it.each(["authorization", "window"] as const)("rejects changed %s bytes", (field): void => {
    const value = authority();
    value[field].sha256 = "0".repeat(64);
    expect(() =>
      verifyFullRaidDruidDeliveryAuthority(
        value.metadata,
        captureTime(value),
        value.authorization,
        value.window,
      ),
    ).toThrow();
  });
  it("rejects a rehashed window extended beyond the actual two-hour authorization", (): void => {
    const value = authority(),
      end = new Date(Date.parse(value.metadata.deadlineAt) + 1).toISOString();
    value.window.value.deadlineAt = end;
    value.metadata.deadlineAt = end;
    resealWindow(value);
    expect(() =>
      verifyFullRaidDruidDeliveryAuthority(
        value.metadata,
        captureTime(value),
        value.authorization,
        value.window,
      ),
    ).toThrow(/duration/);
  });
  it("rejects rehashed authorization for optimization inside the delivery window", (): void => {
    const value = authority();
    value.window.value.optimizationSearchAuthorized = true;
    resealWindow(value);
    expect(() =>
      verifyFullRaidDruidDeliveryAuthority(
        value.metadata,
        captureTime(value),
        value.authorization,
        value.window,
      ),
    ).toThrow();
  });
  it("rejects captures at the exact deadline or before the first delivery check", (): void => {
    const value = authority();
    for (const capturedAt of [
      value.metadata.deadlineAt,
      new Date(Date.parse(value.metadata.startedAt) - 1).toISOString(),
    ])
      expect(() =>
        verifyFullRaidDruidDeliveryAuthority(
          value.metadata,
          capturedAt,
          value.authorization,
          value.window,
        ),
      ).toThrow(/outside/);
  });
  it("requires real window-backed authority rather than only a later ISO timestamp", async (): Promise<void> => {
    const value = await createDruidProfileV3Contract();
    expect(fullRaidDruidBrowserReviewSchema.safeParse(value.browser).success).toBe(false);
    const api = createReviewedFullRaidDruidProfileAdaptersV4(value.pins);
    await expect(api.readProfile("feral_druid", value.directory)).rejects.toThrow();
    expect(value.numericalEvidence).toBe(false);
  });
  it("keeps the historical reader's old deadline validation unchanged", async (): Promise<void> => {
    const value = await createDruidProfileV3Contract(),
      metadata = authority().metadata;
    const browser = {
      ...value.browser,
      release: "ce2375bbbbc13f564a8717f3",
      capturedAt: new Date(Date.parse(metadata.startedAt) + 1000).toISOString(),
      deliveryValidation: metadata,
    };
    expect(historicalBrowserSchema.safeParse(browser).success).toBe(false);
    expect(fullRaidDruidBrowserReviewSchema.safeParse(browser).success).toBe(true);
    expect(
      fullRaidDruidBrowserReviewSchema.safeParse({ ...browser, capturedAt: metadata.deadlineAt })
        .success,
    ).toBe(false);
  });
});
