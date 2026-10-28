import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { cache } from "react";
import { z } from "zod";
import type { SimulatorManifest } from "@wow-trader/forever-data/simulator";
import { readSimulatorManifest } from "./forever-simulator";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";
import { testedWarriorRotationGuidance } from "./forever-simulator-warrior-guidance";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const releaseId = z.string().regex(/^[a-f0-9]{24}$/);
const asset = z.object({ bytes: z.number().int().nonnegative(), sha256: digest }).strict();
const metric = z
  .object({ avg: z.number().finite().positive(), stdev: z.number().finite().nonnegative() })
  .strict();
const reference = z.object({ iterations: z.literal(40000), dps: metric }).strict();
const gear = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.number().int().nonnegative(),
            enchant: z.number().int().nonnegative().optional(),
          })
          .passthrough(),
      )
      .length(17),
  })
  .passthrough();
const recordedGear = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.number().int().nonnegative().optional(),
            enchant: z.number().int().nonnegative().optional(),
          })
          .passthrough(),
      )
      .length(17),
  })
  .passthrough();
const buildId = z.enum([
  "fury-standard",
  "fury-procs",
  "arms-standard",
  "arms-procs",
  "two-hand-fury",
]);
const expectedIds = buildId.options;
const proto = z
  .object({
    player: z
      .object({
        class: z.literal(9),
        level: z.literal(60),
        foreverTier1Bonuses: z.literal(false),
        enableItemSwap: z.literal(false),
        equipment: gear,
        talentsString: z.string().regex(/^[0-5]+(?:-[0-5]*){0,2}$/),
        spec: z
          .object({ oneofKind: z.literal("warrior"), warrior: z.record(z.string(), z.unknown()) })
          .passthrough(),
        buffs: z.object({ blessingOfKings: z.literal(true) }).passthrough(),
      })
      .passthrough(),
    settings: z
      .object({
        ruleset: z.literal(1),
        iterations: z.literal(5000),
        fixedRngSeed: z.literal("81491001"),
      })
      .passthrough(),
    raidBuffs: z
      .object({
        trueshotAura: z.literal(true),
        strengthOfEarthTotem: z.literal(2),
        graceOfAirTotem: z.literal(2),
      })
      .passthrough(),
    partyBuffs: z.object({ windfuryTotem: z.literal(true) }).passthrough(),
  })
  .passthrough();
const payloadSchema = z
  .object({
    schema: z.literal("kfc-combat-native-library.v1"),
    profile: z.literal("warrior"),
    defaultBuildId: z.literal("fury-standard"),
    builds: z
      .array(
        z
          .object({
            id: buildId,
            label: z.string().min(1).max(180),
            requiresProvisionalEnchantOptIn: z.boolean(),
            warnings: z.array(z.string().min(1).max(4000)).max(20),
            proto,
            reference,
          })
          .strict(),
      )
      .length(5),
  })
  .strict();
const selectionSchema = z
  .object({
    schema: z.literal("kfc-qualified-combat-selection.v1"),
    profiles: z
      .object({
        warrior: z
          .object({ release: releaseId, proofSha256: digest, browserReviewSha256: digest })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
const proofSchema = z
  .object({
    schema: z.literal("kfc-qualified-combat-model.v1"),
    profile: z.literal("warrior"),
    release: releaseId,
    sourceRelease: releaseId,
    model: digest,
    identity: z
      .object({
        schema: z.literal("kfc-qualified-warrior-combat-delivery.v1"),
        parent: digest,
        model: digest,
        qualification: digest,
        payload: digest,
        library: digest,
        adapter: digest,
        controller: digest,
      })
      .strict(),
    qualificationSha256: digest,
    payloadSha256: digest,
    modelAssets: z.record(z.string(), asset),
    defaultBuildId: z.literal("fury-standard"),
    builds: z
      .array(
        z
          .object({
            id: buildId,
            label: z.string().min(1).max(180),
            requiresProvisionalEnchantOptIn: z.boolean(),
            reference,
            gear,
            presetSha256: digest,
            href: z.string().min(100).max(512000),
          })
          .strict(),
      )
      .length(5),
    notice: z.string().min(1).max(4000),
  })
  .strict();
const qualificationSchema = z
  .object({
    schema: z.literal("kfc-current-warrior-dps-selected-qualification.v1"),
    status: z.literal(
      "selected-warrior-dps-numerical-and-runtime-qualified; class-preset-delivery-pending",
    ),
    model: digest,
    actualSelectedNativeBrowserControls: z.literal(5),
    exactSelectedNativeBrowserStatPairs: z.literal(5),
    defaultBuildId: z.literal("fury-standard"),
    budget: z
      .object({
        classSlug: z.literal("warrior"),
        startedAt: z.iso.datetime(),
        deadlineAt: z.iso.datetime(),
        authorizationSha256: digest,
        phaseReceipts: z
          .array(
            z
              .object({
                phase: z.string().min(1),
                status: z.literal("succeeded"),
                startedAtMs: z.number().int().nonnegative(),
                finishedAtMs: z.number().int().positive(),
              })
              .passthrough(),
          )
          .min(8)
          .max(64),
      })
      .passthrough(),
    builds: z
      .array(
        z
          .object({
            id: buildId,
            profile: z.literal("warrior"),
            variant: z.enum(["fury", "arms", "two-hand-fury"]),
            displayName: z.string().min(1),
            requiresProvisionalEnchantOptIn: z.boolean(),
            acceptedTwoPercent: z.literal(true),
            selectedNativeBrowser: z.literal(true),
            exactSelectedNativeBrowserStats: z.literal(true),
            maximumConservativeTargetAuraUnion: z.number().int().positive().max(16),
            globalOptimalityProven: z.literal(false),
            serverMechanicsVerified: z.literal(false),
            liveAcquisitionVerified: z.literal(false),
            gear: recordedGear,
            reference: reference.passthrough(),
            settings: z
              .object({
                settings: z.object({ faction: z.enum(["Alliance", "Horde"]) }).passthrough(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .length(5),
  })
  .passthrough();
const width = z.union([z.literal(1440), z.literal(390)]);
const browserSchema = z
  .object({
    schema: z.literal("kfc-current-combat-menu-browser.v1"),
    status: z.literal("passed"),
    profile: z.literal("warrior"),
    release: releaseId,
    model: digest,
    proofSha256: digest,
    deadlineAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    errors: z.array(z.string()).length(0),
    checks: z
      .array(
        z.discriminatedUnion("kind", [
          z
            .object({
              kind: z.literal("menu"),
              width,
              menu: z.enum(["configurations", "gear-sets"]),
              id: buildId,
              completeCombatSettings: z.literal(true),
              synchronizedMenus: z.literal(true),
            })
            .strict(),
          z
            .object({
              kind: z.literal("preservation"),
              width,
              freshConservativeDefault: z.literal(true),
              customCharacterPreserved: z.literal(true),
              explicitImportPreserved: z.literal(true),
              provisionalConsentOff: z.literal(true),
              horizontalOverflow: z.literal(false),
            })
            .strict(),
          z
            .object({
              kind: z.literal("simulation"),
              width,
              id: buildId,
              ruleset: z.literal(1),
              iterations: z.literal(32),
              seed: z.literal(145270001),
              nativeDps: z.number().finite().positive(),
              browserDps: z.number().finite().positive(),
              requestSha256: digest,
              presetSha256: digest,
              consentExplicit: z.boolean(),
              actualPresetSelection: z.literal(true),
              completeCombatRequest: z.literal(true),
            })
            .strict(),
        ]),
      )
      .length(32),
  })
  .passthrough();

interface QualifiedCombatModelUpdate {
  readonly manifest: SimulatorManifest;
  readonly sourceRelease: string;
  readonly builds: readonly LocalSimulatorBuildReview[];
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function document(
  directory: string,
  path: string,
  maximumBytes: number,
): Promise<{ value: unknown; sha256: string }> {
  const root = await realpath(directory),
    target = await realpath(resolve(root, path)),
    offset = relative(root, target);
  requireMatch(
    Boolean(offset) && offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset),
    "Qualified combat evidence escaped storage",
  );
  const info = await stat(target);
  requireMatch(
    info.isFile() && info.size <= maximumBytes,
    "Invalid qualified combat evidence size",
  );
  const bytes = await readFile(target);
  requireMatch(bytes.length <= maximumBytes, "Qualified combat evidence exceeded read budget");
  return {
    value: JSON.parse(bytes.toString("utf8")) as unknown,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export const readQualifiedCombatSimulatorModelUpdate = cache(
  async function readQualifiedCombatSimulatorModelUpdate(
    profile: string,
    directory: string,
  ): Promise<QualifiedCombatModelUpdate | null> {
    if (profile !== "warrior") return null;
    let raw: Awaited<ReturnType<typeof document>>;
    try {
      raw = await document(directory, "qualified-combat-models.json", 32000);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
    const selected = selectionSchema.parse(raw.value).profiles.warrior;
    if (!selected) return null;
    const manifest = await readSimulatorManifest(directory, selected.release);
    requireMatch(
      manifest !== null && manifest.pages.includes(profile),
      "Missing qualified combat page",
    );
    async function assetDocument(name: string, expected: string): Promise<unknown> {
      const entry = await document(directory, `${selected?.release}/${name}`, 8_000_000);
      requireMatch(
        entry.sha256 === expected && manifest?.files[name]?.sha256 === expected,
        "Qualified combat asset checksum changed",
      );
      return entry.value;
    }
    const proof = proofSchema.parse(
        await assetDocument("kfc-qualified-combat-model.json", selected.proofSha256),
      ),
      sourceDocument = await document(directory, `${proof.sourceRelease}/manifest.json`, 8_000_000),
      source = await readSimulatorManifest(directory, proof.sourceRelease);
    requireMatch(
      source !== null && sourceDocument.sha256 === proof.identity.parent,
      "Qualified combat source changed",
    );
    requireMatch(
      proof.release === manifest.release &&
        proof.identity.model === proof.model &&
        hash(proof.identity).slice(0, 24) === proof.release,
      "Qualified combat model identity changed",
    );
    requireMatch(
      proof.identity.qualification === proof.qualificationSha256 &&
        proof.identity.payload === proof.payloadSha256 &&
        manifest.files["kfc-combat-native-library.js"]?.sha256 === proof.identity.library,
      "Qualified combat input identity changed",
    );
    const modelKeys = Object.keys(manifest.files)
      .filter((name): boolean => /wasm|worker|^assets\/database\//.test(name))
      .sort();
    requireMatch(
      hash(modelKeys) === hash(Object.keys(proof.modelAssets).sort()),
      "Qualified combat model assets are incomplete",
    );
    for (const name of [
      "lib.wasm",
      "sim_worker.js",
      "assets/database/db.bin",
      "assets/database/db.json",
      "assets/database/leftover_db.bin",
      "assets/database/leftover_db.json",
    ])
      requireMatch(modelKeys.includes(name), "Missing qualified combat asset");
    for (const name of modelKeys)
      requireMatch(
        hash(manifest.files[name]) === hash(proof.modelAssets[name]),
        "Qualified combat asset changed",
      );
    const qualified = qualificationSchema.parse(
        await assetDocument("kfc-combat-update-qualification.json", proof.qualificationSha256),
      ),
      payloadDocument = await assetDocument("kfc-combat-native-builds.json", proof.payloadSha256),
      payload = payloadSchema.parse(payloadDocument);
    const recordedPresets = z
      .array(z.record(z.string(), z.unknown()))
      .parse(z.record(z.string(), z.unknown()).parse(payloadDocument).builds);
    requireMatch(
      qualified.model === proof.model &&
        qualified.defaultBuildId === proof.defaultBuildId &&
        payload.defaultBuildId === proof.defaultBuildId,
      "Qualified combat numerical model changed",
    );
    for (const rows of [proof.builds, qualified.builds, payload.builds])
      requireMatch(
        hash(rows.map((row): string => row.id)) === hash(expectedIds),
        "Qualified combat omitted or duplicated a setup",
      );
    const startedAt = Date.parse(qualified.budget.startedAt),
      deadlineAt = Date.parse(qualified.budget.deadlineAt);
    requireMatch(deadlineAt - startedAt === 86_400_000, "Qualified combat class deadline changed");
    const phases = new Set<string>();
    for (const receipt of qualified.budget.phaseReceipts) {
      requireMatch(
        !phases.has(receipt.phase) &&
          receipt.startedAtMs >= startedAt &&
          receipt.finishedAtMs >= receipt.startedAtMs &&
          receipt.finishedAtMs <= deadlineAt,
        "Invalid qualified combat phase receipt",
      );
      phases.add(receipt.phase);
    }
    const browserDocument = await document(
        directory,
        `combat-browser-reviews/${selected.release}.json`,
        3_000_000,
      ),
      browser = browserSchema.parse(browserDocument.value);
    requireMatch(
      browserDocument.sha256 === selected.browserReviewSha256 &&
        browser.release === proof.release &&
        browser.model === proof.model &&
        browser.proofSha256 === selected.proofSha256 &&
        browser.deadlineAt === qualified.budget.deadlineAt &&
        Date.parse(browser.completedAt) >= startedAt &&
        Date.parse(browser.completedAt) <= deadlineAt,
      "Qualified combat browser approval changed",
    );
    for (const viewport of [1440, 390])
      requireMatch(
        browser.checks.filter(
          (entry): boolean => entry.kind === "preservation" && entry.width === viewport,
        ).length === 1,
        "Missing qualified combat saved-character review",
      );
    const builds: LocalSimulatorBuildReview[] = proof.builds.map(
      (row): LocalSimulatorBuildReview => {
        const numerical = qualified.builds.find((entry): boolean => entry.id === row.id),
          preset = payload.builds.find((entry): boolean => entry.id === row.id);
        requireMatch(
          numerical !== undefined && preset !== undefined,
          "Missing qualified combat preset",
        );
        const expectedProcs = row.id.endsWith("-procs"),
          url = new URL(row.href, "https://helper.invalid");
        requireMatch(
          url.origin === "https://helper.invalid" &&
            url.pathname === `/forever-sim/${manifest.release}/warrior/` &&
            url.search === "?i=gtrcmxeu" &&
            /^#[A-Za-z0-9+/]{64,}={0,2}$/.test(url.hash) &&
            row.href === url.pathname + url.search + url.hash,
          "Invalid qualified combat import",
        );
        requireMatch(
          row.requiresProvisionalEnchantOptIn === expectedProcs &&
            numerical.requiresProvisionalEnchantOptIn === expectedProcs &&
            preset.requiresProvisionalEnchantOptIn === expectedProcs,
          "Qualified combat consent policy changed",
        );
        requireMatch(
          hash(row.reference) === hash(preset.reference) &&
            row.reference.iterations === numerical.reference.iterations &&
            hash(row.reference.dps) === hash(numerical.reference.dps) &&
            row.label === preset.label &&
            row.label === numerical.displayName,
          "Qualified combat reference differs from measurement",
        );
        const recorded = recordedPresets.find((entry): boolean => entry.id === row.id);
        requireMatch(
          row.presetSha256 === hash(recorded?.proto) &&
            hash(row.gear) === hash(preset.proto.player.equipment) &&
            row.gear.items.every(
              (item, slot): boolean =>
                item.id === (numerical.gear.items[slot]?.id ?? 0) &&
                (item.enchant ?? 0) === (numerical.gear.items[slot]?.enchant ?? 0),
            ),
          "Qualified combat measured equipment or preset changed",
        );
        for (const viewport of [1440, 390]) {
          for (const menu of ["configurations", "gear-sets"])
            requireMatch(
              browser.checks.filter(
                (entry): boolean =>
                  entry.kind === "menu" &&
                  entry.width === viewport &&
                  entry.menu === menu &&
                  entry.id === row.id,
              ).length === 1,
              "Incomplete qualified combat menus",
            );
          const simulations = browser.checks.filter(
            (entry): boolean =>
              entry.kind === "simulation" && entry.width === viewport && entry.id === row.id,
          );
          requireMatch(simulations.length === 1, "Incomplete qualified combat simulations");
          const checked = simulations[0];
          requireMatch(
            checked?.kind === "simulation" &&
              checked.presetSha256 === row.presetSha256 &&
              checked.consentExplicit === expectedProcs &&
              Math.abs(checked.nativeDps - checked.browserDps) <= 0.051,
            "Qualified combat browser/native parity failed",
          );
        }
        return {
          id: row.id,
          spec: `warrior/${numerical.variant.replaceAll("-", "_")}`,
          faction: numerical.settings.settings.faction,
          scenario: expectedProcs ? "provisional-procs" : "static",
          stage: "All-slot full-raid update · practical 2% comparison",
          status: "reviewed",
          href: row.href,
          displayName: row.label,
          referenceDps: row.reference.dps.avg,
          validationIterations: 40000,
          requiresProvisionalEnchantOptIn: expectedProcs,
          warnings: preset.warnings,
          rotationGuidance: testedWarriorRotationGuidance(numerical.settings),
        };
      },
    );
    return { manifest, sourceRelease: proof.sourceRelease, builds };
  },
);
