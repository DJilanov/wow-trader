import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readPreservedWarlockCompatibility } from "./forever-simulator-warlock-compatibility";
import { afflictionModelEvidenceReferenceSchema } from "./forever-simulator-fresh-affliction";

const fixture = z
  .object({
    schema: z.literal("kfc-preserved-warlock-reader-fixture.v1"),
    reference: afflictionModelEvidenceReferenceSchema,
    options: z.object({
      sourceRelease: z.string(),
      nativeBinarySha256: z.string(),
      databaseSha256: z.string(),
    }),
    documents: z.record(z.string(), z.record(z.string(), z.unknown())),
  })
  .parse(
    JSON.parse(
      gunzipSync(
        await readFile(
          fileURLToPath(new URL("./fixtures/model-warlock-compatibility.json.gz", import.meta.url)),
        ),
      ).toString("utf8"),
    ),
  );

async function read(
  documents = fixture.documents,
  options = fixture.options,
): ReturnType<typeof readPreservedWarlockCompatibility> {
  return readPreservedWarlockCompatibility(fixture.reference, {
    ...options,
    reference: async (reference): Promise<unknown> => {
      const value = documents[reference.path];
      if (!value) throw new Error("Missing compatibility fixture document");
      return value;
    },
  });
}

describe("actual preserved Warlock model compatibility", (): void => {
  it("authenticates both real current-WASM controls while preserving old model-bound 40k scores", async (): Promise<void> => {
    const builds = await read();
    expect([...builds.keys()]).toEqual(["warlock-demonology-static", "warlock-affliction-static"]);
    expect(builds.get("warlock-demonology-static")).toMatchObject({
      sourceRelease: "a4eabfa5c89f3813c1b74bde",
      historicalReferenceDps: 830.2573884583082,
      historicalValidationIterations: 40000,
    });
    expect(builds.get("warlock-affliction-static")).toMatchObject({
      sourceRelease: "a4eabfa5c89f3813c1b74bde",
      historicalReferenceDps: 747.6164254231074,
      historicalValidationIterations: 40000,
    });
  });

  it.each(["sourceRelease", "nativeBinarySha256", "databaseSha256"] as const)(
    "rejects a different current %s",
    async (field): Promise<void> => {
      await expect(
        read(fixture.documents, {
          ...fixture.options,
          [field]: "0".repeat(field === "sourceRelease" ? 24 : 64),
        }),
      ).rejects.toThrow();
    },
  );

  it("refuses changed report metadata even if it still claims success", async (): Promise<void> => {
    const documents = structuredClone(fixture.documents);
    const report = documents[fixture.reference.path];
    if (!report) throw new Error("Missing real compatibility report");
    report.newOptimizationApproval = true;
    await expect(read(documents)).rejects.toThrow(/checksum/);
  });

  it("refuses changed or missing actual browser evidence", async (): Promise<void> => {
    const documents = structuredClone(fixture.documents),
      report = z.record(z.string(), z.unknown()).parse(documents[fixture.reference.path]),
      controls = z.array(z.record(z.string(), z.unknown())).parse(report.controls),
      first = z.record(z.string(), z.unknown()).parse(controls[0]),
      reference = afflictionModelEvidenceReferenceSchema.parse(first.currentBrowser),
      browser = documents[reference.path];
    if (!browser) throw new Error("Missing real compatibility browser response");
    const metric = z.record(z.string(), z.unknown()).parse(browser.metric);
    browser.metric = { ...metric, dps: 9999 };
    await expect(read(documents)).rejects.toThrow(/checksum/);
    delete documents[reference.path];
    await expect(read(documents)).rejects.toThrow(/Missing/);
  });

  it("does not treat a historical-only model as current-engine compatibility", async (): Promise<void> => {
    await expect(
      read(fixture.documents, { ...fixture.options, sourceRelease: "a4eabfa5c89f3813c1b74bde" }),
    ).rejects.toThrow(/Unreviewed/);
  });
});
