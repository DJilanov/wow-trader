import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  afflictionModelEvidenceReferenceSchema,
  type AfflictionModelEvidenceReference,
} from "./forever-simulator-fresh-affliction";

const record = z.record(z.string(), z.unknown()),
  digest = z.string().regex(/^[a-f0-9]{64}$/);

export const verifiedPreservedWarlockCompatibility = Object.freeze({
  path: "artifacts/forever-simulator/optimization/reviews/preserved-warlock-compatibility-525e4051ad546cd2.json",
  sha256: "525e4051ad546cd204b651f83072793c2fc4796350301b3afdafdf5f9ad6cfbf",
  sourceRelease: "a4eabfa5c89f3813c1b74bde",
  currentSourceRelease: "e945e98f232cc81948ee9060",
});

const historicalBuilds = new Map([
  ["warlock-demonology-static", "5313308452d6281ec79cc1db93c7b1bcb0b24131eea752bf4a105f48a56c95b6"],
  ["warlock-affliction-static", "5090d4dc677a3f180bc27f7816e202c9cc1c1aef0849eb4cea871bcd0af21f40"],
]);

export interface PreservedWarlockModel {
  readonly sourceRelease: string;
  readonly databaseSha256: string;
  readonly nativeBinarySha256: string;
  readonly settingsSha256: string;
  readonly historicalReferenceDps: number;
  readonly historicalValidationIterations: 40000;
}

export interface PreservedWarlockCompatibilityOptions {
  readonly sourceRelease: string;
  readonly databaseSha256: string;
  readonly nativeBinarySha256: string;
  readonly reference: (reference: AfflictionModelEvidenceReference) => Promise<unknown>;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function same(left: unknown, right: unknown, message: string): void {
  requireMatch(isDeepStrictEqual(left, right), message);
}

/** Compatibility preserves the original model-bound results; it is not a new optimization or permission to reuse historical scores in current searches. */
export async function readPreservedWarlockCompatibility(
  rawReference: AfflictionModelEvidenceReference,
  options: PreservedWarlockCompatibilityOptions,
): Promise<ReadonlyMap<string, PreservedWarlockModel>> {
  const reference = afflictionModelEvidenceReferenceSchema.parse(rawReference);
  requireMatch(
    reference.path === verifiedPreservedWarlockCompatibility.path &&
      reference.sha256 === verifiedPreservedWarlockCompatibility.sha256 &&
      options.sourceRelease === verifiedPreservedWarlockCompatibility.currentSourceRelease,
    "Unreviewed Warlock model compatibility requires a new delivery review",
  );
  async function document(raw: unknown): Promise<Record<string, unknown>> {
    const ref = afflictionModelEvidenceReferenceSchema.parse(raw),
      value = record.parse(await options.reference(ref));
    requireMatch(hash(value) === ref.sha256, "Warlock compatibility evidence checksum changed");
    return value;
  }
  const report = await document(reference),
    descriptor = record.parse(report.descriptor),
    controls = z.array(record).length(2).parse(descriptor.controls),
    measurements = z.array(record).length(2).parse(report.controls),
    results = new Map<string, PreservedWarlockModel>();
  requireMatch(
    report.schema === "kfc-preserved-warlock-compatibility-review.v1" &&
      report.status === "passed-after-cleanup" &&
      report.newOptimizationApproval === false &&
      report.historicalScoresRelabelledAsCurrent === false &&
      report.publicationAllowed === false &&
      descriptor.sourceRelease === options.sourceRelease &&
      descriptor.browserJobs === 2 &&
      descriptor.iterationsPerJob === 10000 &&
      descriptor.nativeJobs === 0 &&
      descriptor.optimizationSearch === false,
    "Warlock preservation is not an actual bounded compatibility review",
  );
  same(report.errors, [], "Warlock preservation contains browser errors");
  for (const [index, control] of controls.entries()) {
    const id = z.string().parse(control.id),
      build = z
        .object({ id: z.string(), path: z.string(), sha256: digest })
        .strict()
        .parse(control.build),
      currentBackend = record.parse(control.currentBackend),
      historicalBackend = record.parse(control.historicalBackend),
      prepared = record.parse(control.prepared),
      measured = record.parse(measurements[index]),
      comparison = record.parse(measured.comparison),
      current = await document(measured.currentBrowser),
      currentMetric = record.parse(current.metric),
      historicalMetric = record.parse(control.historicalInspectedMetric),
      legacyParity = await document(control.historicalParity),
      legacyPrepared = record.parse(legacyParity.prepared),
      admission = record.parse(current.admission);
    requireMatch(
      build.id === id &&
        historicalBuilds.get(id) === build.sha256 &&
        measured.id === id &&
        !results.has(id) &&
        control.historicalSourceRelease === verifiedPreservedWarlockCompatibility.sourceRelease &&
        control.currentSourceRelease === options.sourceRelease &&
        currentBackend.binarySha256 === options.nativeBinarySha256 &&
        currentBackend.compiledDatabaseSha256 === options.databaseSha256 &&
        currentBackend.binarySha256 !== historicalBackend.binarySha256 &&
        legacyParity.status === "passed-after-cleanup" &&
        control.newOptimizationApproval === false &&
        control.historicalScoreRelabelledAsCurrent === false,
      "Warlock preservation changed its build or model provenance",
    );
    same(comparison.build, build, "Preserved Warlock export changed");
    same(comparison.currentBackend, currentBackend, "Preserved Warlock current backend changed");
    same(
      comparison.historicalBackend,
      historicalBackend,
      "Preserved Warlock historical backend changed",
    );
    same(prepared.bytes, legacyPrepared.bytes, "Preserved Warlock effective combat input changed");
    same(
      prepared.statsBytes,
      legacyPrepared.statsBytes,
      "Preserved Warlock item/enchant projection changed",
    );
    same(
      historicalMetric,
      record.parse(legacyParity.parity).browser,
      "Preserved Warlock historical origin changed",
    );
    same(
      comparison.currentBrowserMetric,
      currentMetric,
      "Preserved Warlock current result changed",
    );
    same(
      comparison.historicalInspectedMetric,
      historicalMetric,
      "Preserved Warlock historical metric changed",
    );
    requireMatch(
      comparison.status === "passed" &&
        comparison.newOptimizationApproval === false &&
        comparison.historicalScoreRelabelledAsCurrent === false &&
        current.id === prepared.browserRequestId &&
        currentMetric.id === current.id &&
        current.playerClass === 8 &&
        current.activePlayers === 1 &&
        current.duration === 300 &&
        current.error === "" &&
        currentMetric.iterations === 10000 &&
        admission.id === current.id &&
        admission.activePlayers === 1 &&
        admission.error === "" &&
        digest.safeParse(current.resultSha256).success,
      "Preserved Warlock current WASM was not actually admitted and completed",
    );
    same(admission.warnings, [], "Preserved Warlock current APL has warnings");
    for (const field of ["dps", "stdev"] as const) {
      const value = z.number().finite().nonnegative().parse(currentMetric[field]),
        historical = z.number().finite().nonnegative().parse(historicalMetric[field]);
      requireMatch(
        Math.abs(value - historical) < 1e-8,
        "Preserved Warlock engine behavior changed",
      );
    }
    results.set(id, {
      sourceRelease: verifiedPreservedWarlockCompatibility.sourceRelease,
      databaseSha256: digest.parse(historicalBackend.compiledDatabaseSha256),
      nativeBinarySha256: digest.parse(historicalBackend.binarySha256),
      settingsSha256: digest.parse(control.settingsSha256),
      historicalReferenceDps: z.number().finite().positive().parse(control.historicalReferenceDps),
      historicalValidationIterations: z
        .literal(40000)
        .parse(control.historicalValidationIterations),
    });
  }
  requireMatch(
    results.size === historicalBuilds.size,
    "Warlock preservation omitted a historical build",
  );
  return results;
}
