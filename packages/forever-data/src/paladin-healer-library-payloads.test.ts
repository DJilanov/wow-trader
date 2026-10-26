import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  paladinHealerCatalogPayloadSchema,
  paladinHealerGroupPayloadSchema,
  paladinHealerLibraryIndexSchema,
  parsePaladinHealerCatalogPayload,
  parsePaladinHealerGroupPayload,
} from "./paladin-healer-library-payloads.js";

const bytes = readFileSync(
  new URL("./fixtures/paladin-healer-library-payloads.v1.json.gz", import.meta.url),
);
const checksum = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");
expect(checksum(bytes)).toBe("0839bd266bd7a6ece6e9bfe485deae330f2cd324c87661933d5ffc1ad33e8e36");
const fixture = z
  .object({
    schema: z.literal("kfc-paladin-healer-library-payload-fixture.v1"),
    source: z.object({ path: z.string(), byteSha256: z.string() }),
    assets: z
      .array(
        z.object({
          ref: z.object({ file: z.string(), byteSha256: z.string(), bytes: z.number() }),
          payload: z.unknown(),
        }),
      )
      .length(20),
    originalArchive: z.object({ byteSha256: z.string() }),
    newNumericalRequests: z.literal(0),
    publicationAllowed: z.literal(false),
  })
  .parse(JSON.parse(gunzipSync(bytes).toString("utf8")));
const indexInput = fixture.assets.find((entry) => entry.ref.file === "library-index.json")?.payload;
const index = paladinHealerLibraryIndexSchema.parse(indexInput);
const groupInputs = fixture.assets.filter((entry) => entry.ref.file.startsWith("group-"));
const groups = groupInputs.map((entry) => parsePaladinHealerGroupPayload(index, entry.payload));
const catalogInput = fixture.assets.find((entry) => entry.ref.file === "catalog.json")?.payload;
const catalog = parsePaladinHealerCatalogPayload(index, catalogInput);

describe("Paladin lazy library payloads", () => {
  it("uses all twenty real payloads from the exact verified source archive", () => {
    expect(fixture.source.byteSha256).toBe(
      "7150a4a57bc3a20e38dfdf2612aa51b1629d3d15f2b5410035a6619c10fa86dc",
    );
    expect(index.archive.byteSha256).toBe(
      "dce293c29e8875d6f0e84cb5b26f54ec5b3759f9fefef02139d2d908dd0dd86f",
    );
    expect(index.archive.byteSha256).toBe(fixture.originalArchive.byteSha256);
    expect(groups).toHaveLength(18);
    expect(groups.reduce((sum, group) => sum + group.configurations.length, 0)).toBe(504);
    expect(catalog.catalog).toHaveLength(2243);
    for (const entry of fixture.assets) {
      const original = JSON.stringify(entry.payload) + "\n";
      expect(Buffer.byteLength(original)).toBe(entry.ref.bytes);
      expect(checksum(original)).toBe(entry.ref.byteSha256);
      expect(entry.ref.bytes).toBeLessThanOrEqual(8_000_000);
    }
  });

  it("validates without changing any original payload object or numerical identity", () => {
    expect(paladinHealerLibraryIndexSchema.parse(indexInput)).toBe(indexInput);
    expect(parsePaladinHealerCatalogPayload(index, catalogInput)).toBe(catalogInput);
    const uniqueWorkloads = new Set<string>();
    for (const [position, group] of groups.entries()) {
      expect(group).toBe(groupInputs[position]?.payload);
      for (const workload of group.workloads) {
        expect(checksum(JSON.stringify(workload.frame))).toBe(workload.id);
        uniqueWorkloads.add(workload.id);
      }
      for (const config of group.configurations)
        expect(
          checksum(
            JSON.stringify({
              runtimeSha256: index.header.model.runtimeSha256,
              requestBase64: config.job.requestBase64,
              workloadSha256: config.workloadId,
              detail: false,
            }),
          ),
        ).toBe(config.sourceEvidence.requestKeys[0]);
    }
    expect(uniqueWorkloads.size).toBe(330);
  });

  it("rejects duplicate group assets, unsafe paths and oversized asset references", () => {
    const duplicate = structuredClone(index);
    const first = duplicate.groups[0];
    if (!first) throw new Error("Missing actual group");
    duplicate.groups[1] = first;
    expect(paladinHealerLibraryIndexSchema.safeParse(duplicate).success).toBe(false);
    const unsafe = structuredClone(index);
    unsafe.catalog.file = "../catalog.json";
    expect(paladinHealerLibraryIndexSchema.safeParse(unsafe).success).toBe(false);
    const oversized = structuredClone(index);
    oversized.catalog.bytes = 8_000_001;
    expect(paladinHealerLibraryIndexSchema.safeParse(oversized).success).toBe(false);
  });

  it("rejects group or catalog payloads from another model or archive", () => {
    const first = groups[0];
    if (!first) throw new Error("Missing actual group");
    expect(() =>
      parsePaladinHealerGroupPayload(index, { ...first, modelIdentity: "0".repeat(64) }),
    ).toThrow();
    expect(() =>
      parsePaladinHealerGroupPayload(index, { ...first, candidateSha256: "0".repeat(64) }),
    ).toThrow();
    expect(() =>
      parsePaladinHealerCatalogPayload(index, { ...catalog, candidateSha256: "0".repeat(64) }),
    ).toThrow();
  });

  it("rejects group metadata that differs from the indexed descriptor", () => {
    const first = groups[0];
    if (!first) throw new Error("Missing actual group");
    expect(() =>
      parsePaladinHealerGroupPayload(index, {
        ...first,
        group: { ...first.group, title: "Different title" },
      }),
    ).toThrow();
    const value = structuredClone(first);
    value.group.context.raceId = 8;
    expect(paladinHealerGroupPayloadSchema.safeParse(value).success).toBe(false);
  });

  it("rejects missing workloads, duplicate scenarios and changed reference results", () => {
    const first = groups[0];
    if (!first) throw new Error("Missing actual group");
    const missing = structuredClone(first);
    missing.workloads.pop();
    expect(paladinHealerGroupPayloadSchema.safeParse(missing).success).toBe(false);
    const reference = structuredClone(first);
    const config = reference.configurations[0];
    if (!config) throw new Error("Missing actual configuration");
    config.reference.hps += 1;
    expect(paladinHealerGroupPayloadSchema.safeParse(reference).success).toBe(false);
    const duplicate = structuredClone(first);
    const original = duplicate.configurations[0];
    if (!original) throw new Error("Missing actual configuration");
    duplicate.configurations[1] = original;
    expect(paladinHealerGroupPayloadSchema.safeParse(duplicate).success).toBe(false);
  });

  it("requires every group workload to be declared by the source index", () => {
    const first = groups[0];
    const workload = first?.workloads[0];
    if (!first || !workload) throw new Error("Missing actual group workload");
    const modified = structuredClone(index);
    const position = modified.workloadOrder.indexOf(workload.id);
    expect(position).toBeGreaterThanOrEqual(0);
    modified.workloadOrder[position] = "0".repeat(64);
    expect(() => parsePaladinHealerGroupPayload(modified, first)).toThrow();
  });

  it("rejects duplicate catalog identities and source/item mismatches", () => {
    const duplicate = structuredClone(catalog);
    const first = duplicate.catalog[0];
    if (!first) throw new Error("Missing actual item");
    duplicate.catalog[1] = first;
    expect(paladinHealerCatalogPayloadSchema.safeParse(duplicate).success).toBe(false);
    const mismatch = structuredClone(catalog);
    const item = mismatch.catalog[0];
    if (!item) throw new Error("Missing actual item");
    item.source.id += 1;
    expect(paladinHealerCatalogPayloadSchema.safeParse(mismatch).success).toBe(false);
  });

  it("keeps unknown fields and publication promotion outside every payload contract", () => {
    const first = groups[0];
    if (!first) throw new Error("Missing actual group");
    expect(
      paladinHealerLibraryIndexSchema.safeParse({ ...index, publicationAllowed: true }).success,
    ).toBe(false);
    expect(
      paladinHealerGroupPayloadSchema.safeParse({ ...first, publicationAllowed: true }).success,
    ).toBe(false);
    expect(
      paladinHealerCatalogPayloadSchema.safeParse({ ...catalog, publicationAllowed: true }).success,
    ).toBe(false);
    expect(paladinHealerGroupPayloadSchema.safeParse({ ...first, unexpected: true }).success).toBe(
      false,
    );
  });
});
