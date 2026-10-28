import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { cache } from "react";
import { z } from "zod";
import type { SimulatorManifest } from "@wow-trader/forever-data/simulator";
import { readSimulatorManifest } from "./forever-simulator";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";
import { readPaladinTankRotationGuidance } from "./forever-simulator-paladin-tank-guidance";

const profiles = {
  feral_tank_druid: {
    selection: "qualified-tank-model.json",
    prefix: "feral-tank-druid",
    playerClass: 1,
    className: "ClassDruid",
    spec: "feralTankDruid",
    identitySchema: "kfc-qualified-bear-delivery.v1",
    qualificationSchema: "kfc-feralheart-tank-update-qualification.v1",
    stage: "All-slot Feralheart update",
  },
  protection_paladin: {
    selection: "qualified-paladin-tank-model.json",
    prefix: "protection-paladin",
    playerClass: 4,
    className: "ClassPaladin",
    spec: "protectionPaladin",
    identitySchema: "kfc-qualified-paladin-tank-delivery.v1",
    qualificationSchema: "kfc-soulforge-tank-update-qualification.v1",
    stage: "All-slot Soulforge update",
  },
} as const;
const profileSchema = z.enum(["feral_tank_druid", "protection_paladin"]);
const defaultBuildId = z.enum([
  "feral-tank-druid-raid-mitigation",
  "protection-paladin-raid-mitigation",
]);

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
const build = z
  .object({
    id: z
      .string()
      .regex(/^(feral-tank-druid|protection-paladin)-(raid|solo)-(mitigation|threat)(-procs)?$/),
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
    profile: profileSchema,
    release,
    proofSha256: digest,
    browserReviewSha256: digest,
  })
  .strict();
const proofSchema = z
  .object({
    schema: z.literal("kfc-qualified-tank-model.v1"),
    profile: profileSchema,
    release,
    sourceRelease: release,
    model: digest,
    identity: z
      .object({
        schema: z.enum([
          "kfc-qualified-bear-delivery.v1",
          "kfc-qualified-paladin-tank-delivery.v1",
        ]),
        parent: digest,
        model: digest,
        qualification: digest,
        payload: digest,
        library: digest,
        controller: digest,
      })
      .strict(),
    qualificationSha256: digest,
    payloadSha256: digest,
    modelAssets: z.record(z.string(), asset),
    defaultBuildId,
    builds: z.array(build.extend({ href: z.string().min(100).max(200_000) })).length(6),
    notice: z.string().min(1).max(4000),
  })
  .strict();
const qualificationSchema = z
  .object({
    schema: z.enum([
      "kfc-feralheart-tank-update-qualification.v1",
      "kfc-soulforge-tank-update-qualification.v1",
    ]),
    status: z.literal("numerical-and-selected-runtime-qualified; website-delivery-pending"),
    model: digest,
    defaultBuildId,
    all17Slots: z.literal(true),
    actualSelectedNativeBrowserControls: z.literal(6),
    actualSelectedNativeBrowserStatComparisons: z.literal(6),
    builds: z
      .array(
        build
          .extend({
            acceptedTwoPercent: z.literal(true),
            globalOptimalityProven: z.literal(false),
            serverMechanicsVerified: z.literal(false),
            liveAcquisitionVerified: z.literal(false),
            settings: z
              .object({
                player: z
                  .object({
                    class: z.enum(["ClassDruid", "ClassPaladin"]),
                    equipment: gear,
                    talentsString: z.string(),
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
    profile: profileSchema,
    defaultBuildId,
    builds: z
      .array(
        build
          .omit({ gear: true })
          .extend({
            label: z.string().min(1),
            warnings: z.array(z.string()).max(20),
            proto: z
              .object({
                player: z
                  .object({
                    class: z.union([z.literal(1), z.literal(4)]),
                    level: z.literal(60),
                    foreverTier1Bonuses: z.literal(false),
                    equipment: gear,
                    talentsString: z.string(),
                    spec: z
                      .object({ oneofKind: z.enum(["feralTankDruid", "protectionPaladin"]) })
                      .passthrough(),
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
              nativeDps: z.number().positive(),
              browserDps: z.number().positive(),
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
            })
            .strict(),
        ]),
      )
      .length(14),
  })
  .passthrough();

interface QualifiedTankModelUpdate {
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
export const readQualifiedTankSimulatorModelUpdate = cache(
  async function readQualifiedTankSimulatorModelUpdate(
    profile: string,
    directory: string,
  ): Promise<QualifiedTankModelUpdate | null> {
    if (profile !== "feral_tank_druid" && profile !== "protection_paladin") return null;
    const contract = profiles[profile];
    let raw: Awaited<ReturnType<typeof document>>;
    try {
      raw = await document(directory, contract.selection, 32000);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
    const selected = selectionSchema.parse(raw.value),
      manifest = await readSimulatorManifest(directory, selected.release);
    requireMatch(
      selected.profile === profile && manifest !== null && manifest.pages.includes(profile),
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
      source !== null && hash(sourceDocument.value) === proof.identity.parent,
      "Qualified tank source changed",
    );
    requireMatch(
      proof.release === manifest.release &&
        proof.profile === profile &&
        proof.identity.schema === contract.identitySchema &&
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
        qualified.schema === contract.qualificationSchema &&
        payload.profile === profile &&
        proof.defaultBuildId === `${contract.prefix}-raid-mitigation` &&
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
    ].map((id): string => `${contract.prefix}-${id}`);
    requireMatch(
      hash(proof.builds.map((row): string => row.id)) === hash(expectedIds) &&
        hash(payload.builds.map((row): string => row.id)) === hash(expectedIds) &&
        hash(qualified.builds.map((row): string => row.id)) === hash(expectedIds),
      "Qualified tank omitted or duplicated a setup",
    );
    for (const row of proof.builds) {
      const url = new URL(row.href, "https://helper.invalid");
      requireMatch(
        url.origin === "https://helper.invalid" &&
          url.pathname === `/forever-sim/${manifest.release}/${profile}/` &&
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
          `${contract.prefix}-${row.scenario}-${row.objective}${row.requiresProvisionalEnchantOptIn ? "-procs" : ""}`,
        "Qualified tank setup scope changed",
      );
      for (const key of [
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
        preset.proto.player.class === contract.playerClass &&
          preset.proto.player.spec.oneofKind === contract.spec &&
          typeof preset.proto.player.spec[contract.spec] === "object" &&
          preset.proto.player.spec[contract.spec] !== null &&
          numerical.settings.player.class === contract.className &&
          preset.proto.player.talentsString === numerical.settings.player.talentsString,
        "Qualified tank character factory changed",
      );
      requireMatch(
        hash(row.gear) === hash(numerical.gear) &&
          hash(row.gear) === hash(numerical.settings.player.equipment),
        "Qualified tank measured equipment changed",
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
        `tank-browser-reviews/${selected.release}.json`,
        3_000_000,
      ),
      browser = browserSchema.parse(browserDocument.value);
    requireMatch(
      browserDocument.sha256 === selected.browserReviewSha256 &&
        browser.release === selected.release &&
        browser.model === proof.model &&
        browser.proofSha256 === selected.proofSha256,
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
            Math.abs(checked.nativeDps - checked.browserDps) <= 0.051,
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
        const talents = numerical.settings.player.talentsString
          .split("-")
          .map((tree): number => [...tree].reduce((total, rank): number => total + Number(rank), 0))
          .join("/");
        const rotationGuidance: LocalSimulatorBuildReview["rotationGuidance"] =
          profile === "protection_paladin"
            ? readPaladinTankRotationGuidance(numerical.settings, row.scenario)
            : hash(numerical.settings.player.rotation) ===
                "30c9b2a6374446e9be639462677c00ade05d47c6231a66fd83adf20ebd69104f"
              ? {
                  talents,
                  scenario:
                    row.scenario === "raid"
                      ? "Five-minute, single-target physical raid encounter with the recorded full raid buffs."
                      : "One-minute, three-target dungeon encounter with the recorded self-buff setup.",
                  instruction:
                    "This describes the priority list used for these measurements. Mitigation minimizes physical damage taken; threat maximizes threat per second. Neither setup is a damage-only ranking.",
                  priorities: [
                    "Use Frenzied Regeneration below 30% health, then Barkskin and the enabled automatic cooldowns when available.",
                    "Refresh Demoralizing Roar with at most 4 seconds left when the fight has at least 5 seconds remaining; refresh Faerie Fire within 3 seconds when at least 4 seconds remain.",
                    "Use Mangle when available. Against two or more targets, use Swipe with at least 15 rage.",
                    "Build Lacerate to five stacks and refresh within 4.5 seconds. Queue Maul with at least 25 rage, then use Lacerate as the remaining filler.",
                  ],
                  caveats: [
                    "Fixed talents and priority list; this gear update did not perform a deep rotation search.",
                    proof.notice,
                  ],
                }
              : undefined;
        return {
          id: row.id,
          spec: `${profile}/${row.scenario}_${row.objective}${row.requiresProvisionalEnchantOptIn ? "_procs" : ""}`,
          faction: numerical.settings.settings.faction,
          scenario: row.requiresProvisionalEnchantOptIn ? "provisional-procs" : "static",
          stage: `${contract.stage} · practical 2% comparison`,
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
