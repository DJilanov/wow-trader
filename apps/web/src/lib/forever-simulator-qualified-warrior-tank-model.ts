import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { cache } from "react";
import { z } from "zod";
import type { SimulatorManifest } from "@wow-trader/forever-data/simulator";
import { readSimulatorManifest } from "./forever-simulator";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";
import { testedWarriorTankGuidance } from "./forever-simulator-warrior-tank-guidance";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const release = z.string().regex(/^[a-f0-9]{24}$/);
const asset = z.object({ bytes: z.number().int().nonnegative(), sha256: digest }).strict();
const metric = z
  .object({ avg: z.number().finite().positive(), stdev: z.number().finite().nonnegative() })
  .strict();
const reference = z
  .object({
    iterations: z.literal(40000),
    health: z.number().finite().positive(),
    armor: z.number().finite().positive(),
    metrics: z.object({ dps: metric, threat: metric, dtps: metric }).strict(),
  })
  .strict();
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
const recordedGear = gear.extend({
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
});
const build = z
  .object({
    label: z.string().min(1),
    id: z.string().regex(/^tank-warrior-(raid|solo)-(mitigation|threat)(-procs)?$/),
    scenario: z.enum(["raid", "solo"]),
    objective: z.enum(["mitigation", "threat"]),
    requiresProvisionalEnchantOptIn: z.boolean(),
    reference,
    gear,
  })
  .strict();
const selectionSchema = z
  .object({
    schema: z.literal("kfc-qualified-tank-selection.v1"),
    profile: z.literal("tank_warrior"),
    release,
    proofSha256: digest,
    browserReviewSha256: digest,
  })
  .strict();
const proofSchema = z
  .object({
    schema: z.literal("kfc-qualified-tank-model.v1"),
    profile: z.literal("tank_warrior"),
    release,
    sourceRelease: release,
    model: digest,
    identity: z
      .object({
        schema: z.literal("kfc-qualified-warrior-tank-delivery.v1"),
        parent: digest,
        model: digest,
        qualification: digest,
        payload: digest,
        library: digest,
        adapter: digest,
        rulesetAdapter: digest,
        derivedLibrary: digest,
        controller: digest,
      })
      .strict(),
    qualificationSha256: digest,
    payloadSha256: digest,
    modelAssets: z.record(z.string(), asset),
    defaultBuildId: z.literal("tank-warrior-raid-mitigation"),
    builds: z
      .array(build.extend({ href: z.string().min(100).max(200_000), presetSha256: digest }))
      .length(6),
    notice: z.string().min(1).max(4000),
  })
  .strict();
const qualificationSchema = z
  .object({
    schema: z.literal("kfc-current-warrior-tank-selected-qualification.v1"),
    status: z.literal(
      "selected-warrior-tanks-numerical-and-runtime-qualified; class-preset-delivery-pending",
    ),
    model: digest,
    defaultBuildId: z.literal("tank-warrior-raid-mitigation"),
    all17Slots: z.literal(true),
    actualSelectedNativeBrowserControls: z.literal(6),
    exactSelectedNativeBrowserStatPairs: z.literal(6),
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
          .length(3),
      })
      .passthrough(),
    builds: z
      .array(
        build
          .extend({
            gear: recordedGear,
            acceptedTwoPercent: z.literal(true),
            selectedNativeBrowser: z.literal(true),
            exactSelectedNativeBrowserStats: z.literal(true),
            maximumConservativeTargetAuraUnion: z.number().int().positive().max(16),
            fixedTalents: z.literal("8/5/38"),
            globalOptimalityProven: z.literal(false),
            serverMechanicsVerified: z.literal(false),
            liveAcquisitionVerified: z.literal(false),
            settings: z
              .object({
                player: z
                  .object({
                    equipment: recordedGear,
                    talentsString: z.literal("35-05-251333120330021351"),
                    rotation: z.record(z.string(), z.unknown()),
                  })
                  .passthrough(),
                settings: z
                  .object({
                    ruleset: z.literal("RulesetForever"),
                    faction: z.enum(["Alliance", "Horde"]),
                  })
                  .passthrough(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .length(6),
  })
  .passthrough();
const payloadSchema = z
  .object({
    schema: z.literal("kfc-tank-native-library.v1"),
    profile: z.literal("tank_warrior"),
    defaultBuildId: z.literal("tank-warrior-raid-mitigation"),
    builds: z
      .array(
        build
          .omit({ gear: true })
          .extend({
            warnings: z.array(z.string()).max(20),
            proto: z
              .object({
                player: z
                  .object({
                    class: z.literal(9),
                    level: z.literal(60),
                    foreverTier1Bonuses: z.literal(false),
                    enableItemSwap: z.literal(false),
                    talentsString: z.literal("35-05-251333120330021351"),
                    spec: z
                      .object({
                        oneofKind: z.literal("tankWarrior"),
                        tankWarrior: z.record(z.string(), z.unknown()),
                      })
                      .passthrough(),
                    equipment: gear,
                  })
                  .passthrough(),
                settings: z
                  .object({
                    ruleset: z.literal(1),
                    iterations: z.literal(5000),
                    fixedRngSeed: z.literal("81491001"),
                  })
                  .passthrough(),
              })
              .passthrough(),
          })
          .strict(),
      )
      .length(6),
  })
  .strict();
const browserSchema = z
  .object({
    schema: z.literal("kfc-qualified-tank-browser.v1"),
    status: z.literal("passed"),
    release,
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
              kind: z.literal("preset"),
              id: z.string(),
              width: z.union([z.literal(1440), z.literal(390)]),
              ruleset: z.literal(1),
              iterations: z.literal(32),
              seed: z.literal(147270001),
              nativeDps: z.number().positive(),
              browserDps: z.number().positive(),
              nativeThreat: z.number().positive(),
              browserThreat: z.number().positive(),
              nativeDtps: z.number().nonnegative(),
              browserDtps: z.number().nonnegative(),
              actualPresetSelection: z.literal(true),
              completeCombatRequest: z.literal(true),
              requestSha256: digest,
              presetSha256: digest,
              consentExplicit: z.boolean(),
            })
            .strict(),
          z
            .object({
              kind: z.literal("preservation"),
              width: z.union([z.literal(1440), z.literal(390)]),
              freshDefault: z.literal(true),
              customCharacterPreserved: z.literal(true),
              explicitImportPreserved: z.literal(true),
              provisionalConsentOff: z.literal(true),
              horizontalOverflow: z.literal(false),
            })
            .strict(),
        ]),
      )
      .length(14),
  })
  .passthrough();

interface QualifiedWarriorTankModelUpdate {
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
  limit: number,
): Promise<{ value: unknown; sha256: string }> {
  const root = await realpath(directory),
    target = await realpath(resolve(root, path)),
    offset = relative(root, target);
  requireMatch(
    Boolean(offset) && offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset),
    "Qualified tank evidence escaped storage",
  );
  const info = await stat(target);
  requireMatch(info.isFile() && info.size <= limit, "Invalid qualified tank evidence size");
  const bytes = await readFile(target);
  requireMatch(bytes.length <= limit, "Qualified tank evidence exceeded read budget");
  return {
    value: JSON.parse(bytes.toString("utf8")) as unknown,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

// A derived model has its own evidence; the older common-model tier board stays separate.
export const readQualifiedWarriorTankSimulatorModelUpdate = cache(
  async function readQualifiedWarriorTankSimulatorModelUpdate(
    profile: string,
    directory: string,
  ): Promise<QualifiedWarriorTankModelUpdate | null> {
    if (profile !== "tank_warrior") return null;
    let raw: Awaited<ReturnType<typeof document>>;
    try {
      raw = await document(directory, "qualified-warrior-tank-model.json", 32000);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
    const selected = selectionSchema.parse(raw.value),
      manifest = await readSimulatorManifest(directory, selected.release);
    requireMatch(
      manifest !== null && manifest.pages.includes(profile),
      "Missing qualified tank page",
    );
    async function assetDocument(name: string, expected: string): Promise<unknown> {
      const entry = await document(directory, `${selected.release}/${name}`, 8_000_000);
      requireMatch(
        entry.sha256 === expected && manifest?.files[name]?.sha256 === expected,
        "Qualified tank asset checksum changed",
      );
      return entry.value;
    }
    const rawProof = await assetDocument("kfc-qualified-tank-model.json", selected.proofSha256),
      proof = proofSchema.parse(rawProof);
    const source = await readSimulatorManifest(directory, proof.sourceRelease);
    const sourceDocument = await document(
      directory,
      `${proof.sourceRelease}/manifest.json`,
      8_000_000,
    );
    requireMatch(
      source !== null && sourceDocument.sha256 === proof.identity.parent,
      "Qualified tank source changed",
    );
    requireMatch(
      proof.release === manifest.release &&
        proof.profile === profile &&
        proof.identity.model === proof.model &&
        hash(z.record(z.string(), z.unknown()).parse(rawProof).identity).slice(0, 24) ===
          proof.release,
      "Qualified tank model identity changed",
    );
    requireMatch(
      proof.identity.qualification === proof.qualificationSha256 &&
        proof.identity.payload === proof.payloadSha256 &&
        manifest.files["kfc-tank-native-library.js"]?.sha256 === proof.identity.library,
      "Qualified tank input identity changed",
    );
    const modelKeys = Object.keys(manifest.files)
      .filter((name): boolean => /wasm|worker|^assets\/database\//.test(name))
      .sort();
    requireMatch(
      hash(modelKeys) === hash(Object.keys(proof.modelAssets).sort()),
      "Qualified tank model assets are incomplete",
    );
    for (const name of [
      "lib.wasm",
      "sim_worker.js",
      "assets/database/db.bin",
      "assets/database/db.json",
      "assets/database/leftover_db.bin",
      "assets/database/leftover_db.json",
    ])
      requireMatch(modelKeys.includes(name), "Missing qualified tank combat asset");
    for (const name of modelKeys)
      requireMatch(
        hash(manifest.files[name]) === hash(proof.modelAssets[name]),
        "Qualified tank combat asset changed",
      );
    const qualified = qualificationSchema.parse(
      await assetDocument("kfc-tank-update-qualification.json", proof.qualificationSha256),
    );
    const rawPayload = await assetDocument("kfc-tank-native-builds.json", proof.payloadSha256);
    const payload = payloadSchema.parse(rawPayload);
    const recordedPresets = z
      .array(z.record(z.string(), z.unknown()))
      .parse(z.record(z.string(), z.unknown()).parse(rawPayload).builds);
    requireMatch(
      qualified.model === proof.model &&
        qualified.defaultBuildId === proof.defaultBuildId &&
        payload.defaultBuildId === proof.defaultBuildId,
      "Qualified tank numerical model changed",
    );
    const expectedIds = [
      "raid-mitigation",
      "raid-threat",
      "solo-mitigation",
      "solo-threat",
      "raid-threat-procs",
      "solo-threat-procs",
    ].map((id): string => `tank-warrior-${id}`);
    requireMatch(
      hash(proof.builds.map((row): string => row.id)) === hash(expectedIds) &&
        hash(payload.builds.map((row): string => row.id)) === hash(expectedIds) &&
        hash(qualified.builds.map((row): string => row.id)) === hash(expectedIds),
      "Qualified tank omitted or duplicated a setup",
    );
    const startedAt = Date.parse(qualified.budget.startedAt),
      deadlineAt = Date.parse(qualified.budget.deadlineAt);
    requireMatch(deadlineAt - startedAt === 86_400_000, "Qualified tank class deadline changed");
    const phases = new Set<string>();
    for (const receipt of qualified.budget.phaseReceipts) {
      requireMatch(
        !phases.has(receipt.phase) &&
          receipt.startedAtMs >= startedAt &&
          receipt.finishedAtMs >= receipt.startedAtMs &&
          receipt.finishedAtMs <= deadlineAt,
        "Invalid qualified tank phase receipt",
      );
      phases.add(receipt.phase);
    }
    requireMatch(
      [
        "warrior-current-tank-controls-v1",
        "warrior-tank-geared-feedback-v1",
        "warrior-tank-selected-controls-v1",
      ].every((phase): boolean => phases.has(phase)),
      "Qualified tank phases are incomplete",
    );
    for (const row of proof.builds) {
      const url = new URL(row.href, "https://helper.invalid");
      requireMatch(
        url.origin === "https://helper.invalid" &&
          url.pathname === `/forever-sim/${manifest.release}/tank_warrior/` &&
          url.search === "?i=gtrcmxeu" &&
          /^#[A-Za-z0-9+/]{64,}={0,2}$/.test(url.hash) &&
          row.href === url.pathname + url.search + url.hash,
        "Invalid qualified tank import",
      );
      const numerical = qualified.builds.find((entry): boolean => entry.id === row.id),
        preset = payload.builds.find((entry): boolean => entry.id === row.id);
      requireMatch(
        numerical !== undefined && preset !== undefined,
        "Missing qualified tank preset",
      );
      requireMatch(
        row.id ===
          `tank-warrior-${row.scenario}-${row.objective}${row.requiresProvisionalEnchantOptIn ? "-procs" : ""}`,
        "Qualified tank setup scope changed",
      );
      for (const key of [
        "label",
        "scenario",
        "objective",
        "requiresProvisionalEnchantOptIn",
        "reference",
      ] as const)
        requireMatch(
          hash(row[key]) === hash(numerical[key]) && hash(row[key]) === hash(preset[key]),
          "Qualified tank reference differs from measurement",
        );
      requireMatch(
        hash(numerical.gear) === hash(numerical.settings.player.equipment) &&
          row.gear.items.every(
            (item, slot): boolean =>
              item.id === (numerical.gear.items[slot]?.id ?? 0) &&
              (item.enchant ?? 0) === (numerical.gear.items[slot]?.enchant ?? 0),
          ),
        "Qualified tank measured equipment changed",
      );
      requireMatch(
        row.presetSha256 ===
          hash(recordedPresets.find((entry): boolean => entry.id === row.id)?.proto),
        "Qualified tank preset identity changed",
      );
      requireMatch(
        preset.proto.player.equipment.items.every(
          (item, slot): boolean =>
            item.id === row.gear.items[slot]?.id &&
            (item.enchant ?? 0) === (row.gear.items[slot]?.enchant ?? 0),
        ),
        "Qualified tank preset equipment changed",
      );
    }
    const browserDocument = await document(
        directory,
        `warrior-tank-browser-reviews/${selected.release}.json`,
        3_000_000,
      ),
      browser = browserSchema.parse(browserDocument.value);
    requireMatch(
      browserDocument.sha256 === selected.browserReviewSha256 &&
        browser.release === selected.release &&
        browser.model === proof.model &&
        browser.proofSha256 === selected.proofSha256 &&
        browser.deadlineAt === qualified.budget.deadlineAt &&
        Date.parse(browser.completedAt) >= startedAt &&
        Date.parse(browser.completedAt) <= deadlineAt,
      "Qualified tank browser approval changed",
    );
    for (const width of [1440, 390]) {
      requireMatch(
        browser.checks.filter(
          (entry): boolean => entry.kind === "preservation" && entry.width === width,
        ).length === 1,
        "Missing qualified tank saved-character review",
      );
      for (const row of proof.builds) {
        const checks = browser.checks.filter(
          (entry): boolean =>
            entry.kind === "preset" && entry.width === width && entry.id === row.id,
        );
        requireMatch(checks.length === 1, "Incomplete qualified tank browser presets");
        const checked = checks[0];
        requireMatch(
          checked?.kind === "preset" &&
            checked.presetSha256 ===
              hash(recordedPresets.find((entry): boolean => entry.id === row.id)?.proto) &&
            checked.consentExplicit === row.requiresProvisionalEnchantOptIn &&
            Math.abs(checked.nativeDps - checked.browserDps) <= 0.051 &&
            Math.abs(checked.nativeThreat - checked.browserThreat) <= 0.051 &&
            Math.abs(checked.nativeDtps - checked.browserDtps) <= 0.051,
          "Qualified tank browser/native parity failed",
        );
      }
    }
    const builds: LocalSimulatorBuildReview[] = proof.builds.map(
      (row): LocalSimulatorBuildReview => {
        const numerical = qualified.builds.find((entry): boolean => entry.id === row.id);
        const preset = payload.builds.find((entry): boolean => entry.id === row.id);
        requireMatch(
          numerical !== undefined && preset !== undefined,
          "Missing qualified tank library setup",
        );
        const rotationGuidance = testedWarriorTankGuidance(numerical.settings, row.scenario);
        return {
          id: row.id,
          spec: `tank_warrior/${row.scenario}_${row.objective}${row.requiresProvisionalEnchantOptIn ? "_procs" : ""}`,
          faction: numerical.settings.settings.faction,
          scenario: row.requiresProvisionalEnchantOptIn ? "provisional-procs" : "static",
          stage: "All-slot Heroism update · practical 2% comparison",
          status: "reviewed",
          href: row.href,
          displayName: preset.label,
          referenceDps: row.reference.metrics.dps.avg,
          validationIterations: 40000,
          requiresProvisionalEnchantOptIn: row.requiresProvisionalEnchantOptIn,
          warnings: preset.warnings,
          ...(rotationGuidance ? { rotationGuidance } : {}),
        };
      },
    );
    return { manifest, sourceRelease: proof.sourceRelease, builds };
  },
);
