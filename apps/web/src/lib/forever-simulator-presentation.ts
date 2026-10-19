import { createHash } from "node:crypto";
import console from "node:console";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import type { SimulatorManifest } from "@wow-trader/forever-data/simulator";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";
import { readSimulatorManifest, simulatorDirectory } from "./forever-simulator";
import { readSimulatorModelUpdate } from "./forever-simulator-model-updates";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const releaseId = z.string().regex(/^[a-f0-9]{24}$/);
const asset = z.object({ bytes: z.number().int().nonnegative(), sha256: digest }).strict();
const reference = z.object({ path: z.string().min(1).max(2048), sha256: digest }).strict();
const finalEvidence = z
  .object({
    baseline: reference,
    review: reference,
    accessories: z.array(reference).length(2),
    rotation: reference,
    exported: reference,
  })
  .strict();
const pointerSchema = z
  .object({
    schema: z.literal("kfc-simulator-presentation.v1"),
    sourceRelease: releaseId,
    profiles: z.record(
      z.string().regex(/^[a-z_]+$/),
      z
        .object({
          release: releaseId,
          proofSha256: digest,
          browserReview: reference,
        })
        .strict(),
    ),
  })
  .strict();
const legacyProofSchema = z
  .object({
    schema: z.literal("kfc-simulator-presentation-proof.v1"),
    release: releaseId,
    sourceRelease: releaseId,
    sourceManifestSha256: digest,
    stagingSha256: digest,
    presentationInputSha256: digest,
    profiles: z
      .array(z.string().regex(/^[a-z_]+$/))
      .min(1)
      .max(20),
    reviewedCases: z
      .array(z.string().regex(/^[a-z0-9-]+$/))
      .min(1)
      .max(40),
    reviewedExports: z
      .array(
        z
          .object({
            variant: z.string().regex(/^[a-z_]+$/),
            sha256: digest,
            evidence: finalEvidence,
          })
          .strict(),
      )
      .min(1)
      .max(40),
    modelAssets: z.record(z.string(), asset),
    sourcePins: z
      .array(z.object({ path: z.string().min(1).max(2048), sha256: digest }).strict())
      .min(1)
      .max(20_000),
    sourcePinsSha256: digest,
    virtualSourceFiles: z
      .array(z.object({ path: z.string().min(1).max(2048), sha256: digest }).strict())
      .min(1)
      .max(120),
    typecheckDiagnostics: z.literal(0),
    oldEngineUnchanged: z.literal(true),
    savedStorageUntouched: z.literal(true),
    notice: z.string().min(1).max(4000),
  })
  .strict();
const proofSchema = z.discriminatedUnion("schema", [
  legacyProofSchema,
  legacyProofSchema
    .extend({
      schema: z.literal("kfc-simulator-presentation-proof.v2"),
      firstPassBuilds: z
        .array(
          z
            .object({
              caseId: z.string().regex(/^[a-z0-9-]+$/),
              build: reference,
              share: reference,
            })
            .strict(),
        )
        .min(1)
        .max(40),
    })
    .strict(),
  legacyProofSchema
    .omit({ stagingSha256: true, reviewedExports: true })
    .extend({
      schema: z.literal("kfc-simulator-presentation-proof.v3"),
      profiles: z.tuple([z.literal("rogue")]),
      reviewedCases: z.tuple([z.literal("rogue-combat-static")]),
      classBuilds: z.tuple([
        z
          .object({
            profile: z.literal("rogue"),
            caseId: z.literal("rogue-combat-static"),
            build: reference,
            share: reference,
          })
          .strict(),
      ]),
      defaultOverrides: z
        .object({
          profile: z.literal("rogue"),
          changes: z.tuple([z.literal("race"), z.literal("partyBuffs")]),
          settingsSha256: digest,
        })
        .strict(),
    })
    .strict(),
  legacyProofSchema
    .omit({ stagingSha256: true, reviewedExports: true })
    .extend({
      schema: z.literal("kfc-simulator-presentation-proof.v4"),
      profiles: z.tuple([z.literal("rogue")]),
      reviewedCases: z.tuple([
        z.literal("rogue-combat-static"),
        z.literal("rogue-mutilate-static"),
      ]),
      classBuilds: z.tuple([
        z
          .object({
            profile: z.literal("rogue"),
            caseId: z.literal("rogue-combat-static"),
            build: reference,
            share: reference,
          })
          .strict(),
        z
          .object({
            profile: z.literal("rogue"),
            caseId: z.literal("rogue-mutilate-static"),
            build: reference,
            share: reference,
          })
          .strict(),
      ]),
      defaultOverrides: z
        .object({
          profile: z.literal("rogue"),
          caseId: z.literal("rogue-combat-static"),
          changes: z.tuple([z.literal("race"), z.literal("partyBuffs")]),
          settingsSha256: digest,
        })
        .strict(),
    })
    .strict(),
  legacyProofSchema
    .omit({ stagingSha256: true, reviewedExports: true })
    .extend({
      schema: z.literal("kfc-simulator-presentation-proof.v5"),
      profiles: z.tuple([z.literal("rogue")]),
      reviewedCases: z.tuple([
        z.literal("rogue-combat-static"),
        z.literal("rogue-mutilate-static"),
        z.literal("rogue-subtlety-static"),
      ]),
      classBuilds: z.tuple([
        z
          .object({
            profile: z.literal("rogue"),
            caseId: z.literal("rogue-combat-static"),
            build: reference,
            share: reference,
          })
          .strict(),
        z
          .object({
            profile: z.literal("rogue"),
            caseId: z.literal("rogue-mutilate-static"),
            build: reference,
            share: reference,
          })
          .strict(),
        z
          .object({
            profile: z.literal("rogue"),
            caseId: z.literal("rogue-subtlety-static"),
            build: reference,
            share: reference,
          })
          .strict(),
      ]),
      defaultOverrides: z
        .object({
          profile: z.literal("rogue"),
          caseId: z.literal("rogue-combat-static"),
          changes: z.tuple([z.literal("race"), z.literal("partyBuffs")]),
          settingsSha256: digest,
        })
        .strict(),
    })
    .strict(),
  legacyProofSchema
    .omit({ stagingSha256: true, reviewedExports: true })
    .extend({
      schema: z.literal("kfc-simulator-presentation-proof.v6"),
      profiles: z.tuple([z.literal("hunter")]),
      reviewedCases: z.tuple([z.literal("hunter-beast-mastery-static")]),
      classBuilds: z.tuple([
        z
          .object({
            profile: z.literal("hunter"),
            caseId: z.literal("hunter-beast-mastery-static"),
            build: reference,
            share: reference,
          })
          .strict(),
      ]),
      defaultOverrides: z
        .object({
          profile: z.literal("hunter"),
          changes: z.tuple([z.literal("race"), z.literal("partyBuffs")]),
          settingsSha256: digest,
        })
        .strict(),
    })
    .strict(),
]);
const legacyBrowserSchema = z
  .object({
    schema: z.literal("kfc-reviewed-presets-browser.v1"),
    status: z.literal("passed"),
    capturedAt: z.iso.datetime(),
    release: releaseId,
    sourceRelease: releaseId,
    presentationProofSha256: digest,
    checked: z
      .object({
        configurations: z.literal(true),
        gearSets: z.literal(true),
        gearAndEnchants: z.literal(true),
        talentsAndRotation: z.literal(true),
        specOptionsRaceConsumes: z.literal(true),
        firstVisitDefault: z.literal(true),
        savedCharacterPreserved: z.literal(true),
        provisionalConsentOff: z.literal(true),
        requestParity: z.literal(true),
        desktopMobile: z.literal(true),
      })
      .strict(),
    evidence: z.record(z.string(), z.unknown()),
    errors: z.array(z.string()).length(0),
  })
  .strict();
const browserSchema = z.discriminatedUnion("schema", [
  legacyBrowserSchema,
  legacyBrowserSchema
    .extend({
      schema: z.literal("kfc-reviewed-presets-browser.v2"),
      evidence: z.object({ rawRequestVerified: z.literal(true) }).passthrough(),
      firstPassBuilds: z
        .array(
          z
            .object({
              caseId: z.string().regex(/^[a-z0-9-]+$/),
              buildSha256: digest,
              shareSha256: digest,
            })
            .strict(),
        )
        .min(1)
        .max(40),
    })
    .strict(),
  legacyBrowserSchema
    .extend({
      schema: z.literal("kfc-reviewed-presets-browser.v3"),
      checked: legacyBrowserSchema.shape.checked.extend({
        defaultRaceAndProfessions: z.literal(true),
        poisonOptions: z.literal(true),
      }),
      evidence: z.object({ rawRequestVerified: z.literal(true) }).passthrough(),
      classBuilds: z.tuple([
        z
          .object({
            profile: z.literal("rogue"),
            caseId: z.literal("rogue-combat-static"),
            buildSha256: digest,
            shareSha256: digest,
          })
          .strict(),
      ]),
    })
    .strict(),
  legacyBrowserSchema
    .extend({
      schema: z.literal("kfc-reviewed-presets-browser.v4"),
      checked: legacyBrowserSchema.shape.checked.extend({
        defaultRaceAndProfessions: z.literal(true),
        poisonOptions: z.literal(true),
        allDeclaredBuilds: z.literal(true),
      }),
      evidence: z
        .object({
          rawRequestVerified: z.literal(true),
          verifiedCaseIds: z.tuple([
            z.literal("rogue-combat-static"),
            z.literal("rogue-mutilate-static"),
          ]),
        })
        .passthrough(),
      classBuilds: z.tuple([
        z
          .object({
            profile: z.literal("rogue"),
            caseId: z.literal("rogue-combat-static"),
            buildSha256: digest,
            shareSha256: digest,
          })
          .strict(),
        z
          .object({
            profile: z.literal("rogue"),
            caseId: z.literal("rogue-mutilate-static"),
            buildSha256: digest,
            shareSha256: digest,
          })
          .strict(),
      ]),
    })
    .strict(),
  legacyBrowserSchema
    .extend({
      schema: z.literal("kfc-reviewed-presets-browser.v5"),
      checked: legacyBrowserSchema.shape.checked.extend({
        defaultRaceAndProfessions: z.literal(true),
        poisonOptions: z.literal(true),
        allDeclaredBuilds: z.literal(true),
      }),
      evidence: z
        .object({
          rawRequestVerified: z.literal(true),
          verifiedCaseIds: z.tuple([
            z.literal("rogue-combat-static"),
            z.literal("rogue-mutilate-static"),
            z.literal("rogue-subtlety-static"),
          ]),
        })
        .passthrough(),
      classBuilds: z.tuple([
        z
          .object({
            profile: z.literal("rogue"),
            caseId: z.literal("rogue-combat-static"),
            buildSha256: digest,
            shareSha256: digest,
          })
          .strict(),
        z
          .object({
            profile: z.literal("rogue"),
            caseId: z.literal("rogue-mutilate-static"),
            buildSha256: digest,
            shareSha256: digest,
          })
          .strict(),
        z
          .object({
            profile: z.literal("rogue"),
            caseId: z.literal("rogue-subtlety-static"),
            buildSha256: digest,
            shareSha256: digest,
          })
          .strict(),
      ]),
    })
    .strict(),
  legacyBrowserSchema
    .extend({
      schema: z.literal("kfc-reviewed-presets-browser.v6"),
      checked: legacyBrowserSchema.shape.checked.extend({
        defaultRaceAndProfessions: z.literal(true),
        petAndAmmoOptions: z.literal(true),
        unreviewedStarterOptionsPreserved: z.literal(true),
        allDeclaredBuilds: z.literal(true),
      }),
      evidence: z
        .object({
          rawRequestVerified: z.literal(true),
          verifiedCaseIds: z.tuple([z.literal("hunter-beast-mastery-static")]),
        })
        .passthrough(),
      classBuilds: z.tuple([
        z
          .object({
            profile: z.literal("hunter"),
            caseId: z.literal("hunter-beast-mastery-static"),
            buildSha256: digest,
            shareSha256: digest,
          })
          .strict(),
      ]),
    })
    .strict(),
]);

export interface SimulatorPresentation {
  readonly manifest: SimulatorManifest;
  readonly sourceRelease: string;
  readonly kind: "base" | "reviewed-presets";
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function document(
  directory: string,
  path: string,
  maximumBytes: number,
): Promise<{ readonly value: unknown; readonly bytes: number; readonly sha256: string }> {
  const root = await realpath(directory);
  const canonical = await realpath(resolve(root, path));
  const offset = relative(root, canonical);
  if (!offset || offset === ".." || offset.startsWith("../") || isAbsolute(offset))
    throw new Error("Presentation evidence escaped simulator storage");
  const info = await stat(canonical);
  if (!info.isFile() || info.size > maximumBytes)
    throw new Error("Invalid presentation evidence size");
  const bytes = await readFile(canonical);
  if (bytes.length > maximumBytes) throw new Error("Presentation evidence exceeded read budget");
  return {
    value: JSON.parse(bytes.toString("utf8")) as unknown,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function requireMatch(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function readSimulatorPresentation(
  profile: string,
  directory: string = simulatorDirectory(),
): Promise<SimulatorPresentation | null> {
  const active = await readSimulatorManifest(directory);
  if (!active) return null;
  const fallback: SimulatorPresentation = {
    manifest: active,
    sourceRelease: active.release,
    kind: "base",
  };
  try {
    const update = await readSimulatorModelUpdate(profile, directory);
    if (update) return { ...update, kind: "reviewed-presets" };
  } catch (error: unknown) {
    console.warn(
      "[simulator] Model update approval unavailable",
      error instanceof Error ? error.message : "Unknown error",
    );
    return fallback;
  }
  let pointerDocument: Awaited<ReturnType<typeof document>>;
  try {
    pointerDocument = await document(directory, "presentation.json", 32_000);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return fallback;
    console.warn(
      "[simulator] Ignoring unavailable preset presentation",
      error instanceof Error ? error.message : "Unknown read error",
    );
    return fallback;
  }
  try {
    const pointer = pointerSchema.parse(pointerDocument.value);
    // A new numerical release naturally retires an older UI-only promotion.
    if (pointer.sourceRelease !== active.release) return fallback;
    const selected = Object.entries(pointer.profiles).find(([key]) => key === profile)?.[1];
    if (!selected) return fallback;
    await document(directory, join(selected.release, "manifest.json"), 8_000_000);
    const candidate = await readSimulatorManifest(directory, selected.release);
    requireMatch(
      candidate !== null && candidate.release !== active.release,
      "Missing distinct presentation release",
    );
    requireMatch(
      candidate.revision === active.revision && candidate.pages.includes(profile),
      "Presentation engine revision/profile changed",
    );
    for (const key of [
      "itemCount",
      "currentItemCount",
      "provisionalItemCount",
      "excludedModeledItems",
      "dataProvenance",
      "mechanicsStatus",
      "pages",
    ] as const)
      requireMatch(
        JSON.stringify(candidate[key]) === JSON.stringify(active[key]),
        "Presentation catalog scope changed",
      );
    const expected = candidate.files["kfc-reviewed-presets.json"];
    requireMatch(
      expected !== undefined && expected.sha256 === selected.proofSha256,
      "Missing presentation proof manifest link",
    );
    const proofDocument = await document(
      directory,
      join(candidate.release, "kfc-reviewed-presets.json"),
      4_000_000,
    );
    requireMatch(
      proofDocument.bytes === expected.bytes && proofDocument.sha256 === expected.sha256,
      "Presentation proof checksum changed",
    );
    const proof = proofSchema.parse(proofDocument.value);
    requireMatch(
      proof.release === candidate.release &&
        proof.sourceRelease === active.release &&
        proof.profiles.some((entry) => entry === profile),
      "Presentation proof scope changed",
    );
    requireMatch(
      hash(proof.sourcePins) === proof.sourcePinsSha256,
      "Presentation source provenance changed",
    );
    requireMatch(
      new Set(proof.virtualSourceFiles.map((file) => file.path)).size ===
        proof.virtualSourceFiles.length,
      "Duplicate virtual source path",
    );
    for (const file of proof.virtualSourceFiles) {
      if (proof.schema === "kfc-simulator-presentation-proof.v6") {
        const allowed = [
          "ui/hunter/presets.ts",
          "ui/hunter/sim.ts",
          "ui/hunter/gear_sets/forever_beast_mastery.gear.json",
          "ui/hunter/apls/beast_mastery.apl.json",
        ];
        requireMatch(
          allowed.includes(file.path) && proof.virtualSourceFiles.length === allowed.length,
          "Hunter presentation changed undeclared source",
        );
        continue;
      }
      if (
        proof.schema === "kfc-simulator-presentation-proof.v3" ||
        proof.schema === "kfc-simulator-presentation-proof.v4" ||
        proof.schema === "kfc-simulator-presentation-proof.v5"
      ) {
        const allowed = [
          "ui/rogue/presets.ts",
          "ui/rogue/sim.ts",
          "ui/rogue/gear_sets/forever_combat.gear.json",
          "ui/rogue/apls/forever_combat_reviewed.apl.json",
          ...(proof.schema === "kfc-simulator-presentation-proof.v4" ||
          proof.schema === "kfc-simulator-presentation-proof.v5"
            ? [
                "ui/rogue/gear_sets/forever_mutilate.gear.json",
                "ui/rogue/apls/forever_mutilate_first_pass.apl.json",
              ]
            : []),
          ...(proof.schema === "kfc-simulator-presentation-proof.v5"
            ? [
                "ui/rogue/gear_sets/forever_subtlety.gear.json",
                "ui/rogue/apls/forever_subtlety_first_pass.apl.json",
              ]
            : []),
        ];
        requireMatch(
          allowed.includes(file.path) && proof.virtualSourceFiles.length === allowed.length,
          "Class presentation changed undeclared source",
        );
        continue;
      }
      const match =
        /^ui\/([a-z_]+)\/(?:presets\.ts|gear_sets\/forever_[a-z0-9_]+\.gear\.json|apls\/forever_[a-z0-9_]+\.apl\.json)$/.exec(
          file.path,
        );
      requireMatch(
        match !== null && proof.profiles.includes(match[1]!),
        "Presentation changed non-preset source",
      );
    }
    const activeDocument = await document(directory, "active.json", 8_000_000);
    requireMatch(
      hash(activeDocument.value) === proof.sourceManifestSha256,
      "Active numerical manifest changed",
    );
    const modelKeys = Object.keys(active.files)
      .filter((name) => /wasm|worker|^assets\/database\//.test(name))
      .sort();
    const candidateModelKeys = Object.keys(candidate.files)
      .filter((name) => /wasm|worker|^assets\/database\//.test(name))
      .sort();
    requireMatch(
      JSON.stringify(candidateModelKeys) === JSON.stringify(modelKeys),
      "Presentation added or removed a numerical asset",
    );
    requireMatch(
      ["lib.wasm", "sim_worker.js", "assets/database/db.json"].every((name) =>
        modelKeys.includes(name),
      ),
      "Missing numerical model assets",
    );
    requireMatch(
      JSON.stringify(Object.keys(proof.modelAssets).sort()) === JSON.stringify(modelKeys),
      "Incomplete presentation model proof",
    );
    for (const name of modelKeys) {
      requireMatch(
        candidate.files[name]?.sha256 === active.files[name]?.sha256 &&
          candidate.files[name]?.bytes === active.files[name]?.bytes,
        "Presentation numerical asset changed",
      );
      requireMatch(
        proof.modelAssets[name]?.sha256 === active.files[name]?.sha256 &&
          proof.modelAssets[name]?.bytes === active.files[name]?.bytes,
        "Presentation model proof changed",
      );
    }
    const reviewPath = /^optimization\/reviews\/preset-browser-([a-f0-9]{16})\.json$/.exec(
      selected.browserReview.path,
    );
    requireMatch(
      reviewPath !== null && reviewPath[1] === selected.browserReview.sha256.slice(0, 16),
      "Invalid browser approval path",
    );
    const browserDocument = await document(directory, selected.browserReview.path, 1_000_000);
    requireMatch(
      hash(browserDocument.value) === selected.browserReview.sha256,
      "Browser approval checksum changed",
    );
    const browser = browserSchema.parse(browserDocument.value);
    if (proof.schema === "kfc-simulator-presentation-proof.v2") {
      requireMatch(
        browser.schema === "kfc-reviewed-presets-browser.v2",
        "First-pass presets need explicit browser approval",
      );
      requireMatch(
        new Set(proof.firstPassBuilds.map((entry) => entry.caseId)).size ===
          proof.firstPassBuilds.length &&
          proof.firstPassBuilds.every((entry) => proof.reviewedCases.includes(entry.caseId)),
        "First-pass presentation cases changed",
      );
      requireMatch(
        JSON.stringify(browser.firstPassBuilds) ===
          JSON.stringify(
            proof.firstPassBuilds.map((entry) => ({
              caseId: entry.caseId,
              buildSha256: entry.build.sha256,
              shareSha256: entry.share.sha256,
            })),
          ),
        "First-pass browser approval does not cover these exports",
      );
    } else if (
      proof.schema === "kfc-simulator-presentation-proof.v3" ||
      proof.schema === "kfc-simulator-presentation-proof.v4" ||
      proof.schema === "kfc-simulator-presentation-proof.v5" ||
      proof.schema === "kfc-simulator-presentation-proof.v6"
    ) {
      requireMatch(
        browser.schema ===
          (proof.schema === "kfc-simulator-presentation-proof.v6"
            ? "kfc-reviewed-presets-browser.v6"
            : proof.schema === "kfc-simulator-presentation-proof.v5"
              ? "kfc-reviewed-presets-browser.v5"
              : proof.schema === "kfc-simulator-presentation-proof.v4"
                ? "kfc-reviewed-presets-browser.v4"
                : "kfc-reviewed-presets-browser.v3"),
        "Class presets need explicit class browser approval",
      );
      requireMatch(
        JSON.stringify(browser.classBuilds) ===
          JSON.stringify(
            proof.classBuilds.map((entry) => ({
              profile: entry.profile,
              caseId: entry.caseId,
              buildSha256: entry.build.sha256,
              shareSha256: entry.share.sha256,
            })),
          ),
        "Class browser approval does not cover these exports",
      );
    } else
      requireMatch(
        browser.schema === "kfc-reviewed-presets-browser.v1",
        "Legacy presentation approval schema changed",
      );
    requireMatch(
      browser.release === candidate.release &&
        browser.sourceRelease === active.release &&
        browser.presentationProofSha256 === selected.proofSha256,
      "Browser approval scope changed",
    );
    return { manifest: candidate, sourceRelease: active.release, kind: "reviewed-presets" };
  } catch (error: unknown) {
    console.warn(
      "[simulator] Ignoring incompatible preset presentation",
      error instanceof Error ? error.message : "Unknown validation error",
    );
    return fallback;
  }
}

export function buildsForPresentation(
  builds: readonly LocalSimulatorBuildReview[],
  presentation: SimulatorPresentation,
  profile: string,
): readonly LocalSimulatorBuildReview[] {
  if (presentation.kind === "base") return builds;
  return builds.map((build) => {
    if (!build.href) return build;
    requireMatch(
      build.href.startsWith("/") && !build.href.startsWith("//"),
      "Reviewed share link does not match the compatible presentation",
    );
    const url = new URL(build.href, "https://helper.invalid");
    const sourcePath = `/forever-sim/${presentation.sourceRelease}/${profile}`;
    requireMatch(
      url.origin === "https://helper.invalid" &&
        !url.username &&
        !url.password &&
        url.pathname.replace(/\/$/, "") === sourcePath &&
        !url.search &&
        /^#[A-Za-z0-9+/]{64,}={0,2}$/.test(url.hash),
      "Reviewed share link does not match the compatible presentation",
    );
    return {
      ...build,
      href: `/forever-sim/${presentation.manifest.release}/${profile}/${url.hash}`,
    };
  });
}
