import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  fullRaidDruidDeliveryValidationSchema,
  verifyFullRaidDruidDeliveryAuthorityV2,
} from "./forever-simulator-full-raid-druid-delivery-validation-v2";
import { fullRaidDruidDeliveryValidationSchema as priorSchema } from "./forever-simulator-full-raid-druid-delivery-validation";

const root = resolve(import.meta.dirname, "../../../..");
const directory =
  "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/delivery-validation-v1";

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function document(path: string): { value: unknown; sha256: string } {
  const body = readFileSync(resolve(root, path));
  return {
    value: JSON.parse(body.toString()),
    sha256: createHash("sha256").update(body).digest("hex"),
  };
}

function actualAuthority(): {
  metadata: z.infer<typeof fullRaidDruidDeliveryValidationSchema>;
  authorization: ReturnType<typeof document>;
  window: ReturnType<typeof document>;
  preparation: ReturnType<typeof document>;
} {
  const authorization = document(directory + "/authorization.json"),
    window = document(directory + "/window.json"),
    parsed = z
      .object({
        authorization: z.unknown(),
        startedAt: z.string(),
        deadlineAt: z.string(),
        firstPreparation: z.object({ path: z.string(), sha256: z.string() }).strict(),
      })
      .parse(window.value),
    preparation = document(parsed.firstPreparation.path);
  // Actual immutable transport documents test the contract, not a completed approval.
  const metadata = fullRaidDruidDeliveryValidationSchema.parse({
    schema: "kfc-druid-separate-delivery-validation-record.v1",
    authorization: parsed.authorization,
    window: {
      path: directory + "/window.json",
      sha256: hash(window.value),
      byteSha256: window.sha256,
    },
    preparation: parsed.firstPreparation,
    originalStudyDeadlineAt: "2026-10-25T23:25:34.014Z",
    startedAt: parsed.startedAt,
    deadlineAt: parsed.deadlineAt,
    maximumDurationMs: 7200000,
  });
  return { metadata, authorization, window, preparation };
}

function validate(
  value: ReturnType<typeof actualAuthority>,
  capturedAt = value.metadata.startedAt,
): void {
  verifyFullRaidDruidDeliveryAuthorityV2(
    value.metadata,
    capturedAt,
    value.authorization,
    value.window,
    value.preparation,
  );
}

describe("actual Druid supervisor preparation transport", (): void => {
  it("authenticates the real content-addressed preparation and immutable window", (): void => {
    const value = actualAuthority();
    expect(Object.keys(value.metadata.preparation).sort()).toEqual(["path", "sha256"]);
    expect(priorSchema.safeParse(value.metadata).success).toBe(false);
    expect(() => validate(value)).not.toThrow();
  });

  it("rejects changed preparation contents", (): void => {
    const value = actualAuthority();
    value.preparation.value = {
      ...z.record(z.string(), z.unknown()).parse(value.preparation.value),
      checksPassed: false,
    };
    expect(() => validate(value)).toThrow();
  });

  it("rejects another preparation hash or content-addressed path", (): void => {
    for (const field of ["path", "sha256"] as const) {
      const value = actualAuthority();
      value.metadata.preparation[field] =
        field === "path"
          ? directory + "/preparations/prepared-" + "f".repeat(16) + ".json"
          : "f".repeat(64);
      expect(() => validate(value)).toThrow(/preparation|Preparation/);
    }
  });

  it.each(["optimizationSearchAuthorized", "deploymentAuthorized"])(
    "rejects rehashed %s permission changes",
    (field: string): void => {
      const value = actualAuthority();
      value.preparation.value = {
        ...z.record(z.string(), z.unknown()).parse(value.preparation.value),
        [field]: true,
      };
      value.metadata.preparation.sha256 = hash(value.preparation.value);
      value.metadata.preparation.path =
        directory +
        "/preparations/prepared-" +
        value.metadata.preparation.sha256.slice(0, 16) +
        ".json";
      expect(() => validate(value)).toThrow();
    },
  );

  it("retains the exact two-hour capture boundary", (): void => {
    const value = actualAuthority();
    expect(() => validate(value, value.metadata.deadlineAt)).toThrow(/outside/);
    expect(() =>
      validate(value, new Date(Date.parse(value.metadata.startedAt) - 1).toISOString()),
    ).toThrow(/outside/);
  });
});
