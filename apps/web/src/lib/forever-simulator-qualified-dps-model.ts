import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { cache } from "react";
import { z } from "zod";
import type { SimulatorManifest } from "@wow-trader/forever-data/simulator";
import { combatNativeProfiles } from "../../../../infra/simulator/combat-native-profiles.mjs";
import { readSimulatorManifest } from "./forever-simulator";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";

const profiles = {
  mage: {
    classSlug: "mage",
    ids: ["mage-frost-static", "mage-fire-static", "mage-arcane-static"],
    stage: "All-slot Sorcerer update",
  },
  warlock: {
    classSlug: "warlock",
    ids: [
      "warlock-demonology-static",
      "warlock-affliction-static",
      "warlock-ds-ruin-static",
      "warlock-destruction-static",
    ],
    stage: "All-slot Deathmist update",
  },
  shadow_priest: {
    classSlug: "priest",
    ids: ["priest-shadow-static"],
    stage: "All-slot Virtuous update",
  },
  smite_priest: {
    classSlug: "priest",
    ids: ["priest-smite-static"],
    stage: "All-slot Virtuous update",
  },
  elemental_shaman: {
    classSlug: "shaman",
    ids: ["shaman-elemental-static", "shaman-stormcaller-static"],
    stage: "All-slot Five Thunders update",
  },
  enhancement_shaman: {
    classSlug: "shaman",
    ids: ["shaman-enhancement-static"],
    stage: "All-slot Five Thunders update",
  },
  retribution_paladin: {
    classSlug: "paladin",
    ids: ["paladin-retribution-static", "paladin-shockadin-static"],
    stage: "Soulforge pre-raid update",
  },
} as const;
const profileSchema = z.enum([
  "mage",
  "warlock",
  "shadow_priest",
  "smite_priest",
  "elemental_shaman",
  "enhancement_shaman",
  "retribution_paladin",
]);
const classSchema = z.enum(["mage", "warlock", "priest", "shaman", "paladin"]);
const digest = z.string().regex(/^[a-f0-9]{64}$/),
  releaseId = z.string().regex(/^[a-f0-9]{24}$/),
  buildId = z.string().regex(/^[a-z][a-z0-9-]{0,119}$/);
const asset = z.object({ bytes: z.number().int().nonnegative(), sha256: digest }).strict();
const metric = z
  .object({ avg: z.number().finite().positive(), stdev: z.number().finite().nonnegative() })
  .strict();
const reference = z.object({ iterations: z.literal(40000), dps: metric }).strict();
const item = z
  .object({
    id: z.number().int().nonnegative(),
    enchant: z.number().int().nonnegative().optional(),
  })
  .passthrough();
const gear = z.object({ items: z.array(item).length(17) }).passthrough();
const recordedGear = z
  .object({ items: z.array(item.partial({ id: true })).length(17) })
  .passthrough();
const guidance = z
  .object({
    talents: z.string().regex(/^\d{1,2}\/\d{1,2}\/\d{1,2}$/),
    scenario: z.string().min(1).max(4000),
    instruction: z.string().min(1).max(16000).optional(),
    prepull: z.array(z.string().min(1).max(4000)).max(30).optional(),
    priorities: z.array(z.string().min(1).max(4000)).min(1).max(80),
    caveats: z.array(z.string().min(1).max(4000)).min(1).max(30),
  })
  .strict();
export function isEncodedDpsTalents(value: unknown): value is string {
  return typeof value === "string" && /^[0-5]*(?:-[0-5]*){0,2}$/.test(value) && /[1-5]/.test(value);
}

const proto = z
  .object({
    player: z
      .object({
        class: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(7), z.literal(8)]),
        level: z.literal(60),
        foreverTier1Bonuses: z.literal(false),
        enableItemSwap: z.literal(false),
        equipment: gear,
        talentsString: z.string().refine(isEncodedDpsTalents, "Invalid encoded talent allocation"),
        spec: z.record(z.string(), z.unknown()),
        consumes: z.record(z.string(), z.unknown()),
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
    profile: profileSchema,
    defaultBuildId: buildId,
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
      .min(1)
      .max(4),
  })
  .strict();
const selectionReference = z
  .object({ release: releaseId, proofSha256: digest, browserReviewSha256: digest })
  .strict();
const selectionSchema = z
  .object({
    schema: z.literal("kfc-qualified-dps-selection.v1"),
    profiles: z.record(z.string(), z.unknown()),
  })
  .strict();
const proofSchema = z
  .object({
    schema: z.literal("kfc-qualified-combat-model.v2"),
    profile: profileSchema,
    release: releaseId,
    sourceRelease: releaseId,
    model: digest,
    identity: z
      .object({
        schema: z.literal("kfc-qualified-current-dps-delivery.v1"),
        profile: profileSchema,
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
    defaultBuildId: buildId,
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
      .min(1)
      .max(4),
    notice: z.string().min(1).max(4000),
  })
  .strict();
const qualificationSchema = z
  .object({
    schema: z.literal("kfc-current-dps-selected-qualification.v1"),
    status: z.literal("numerical-and-selected-runtime-qualified; class-preset-delivery-pending"),
    classSlug: classSchema,
    model: digest,
    all17Slots: z.literal(true),
    actualSelectedNativeBrowserControls: z.number().int().min(1).max(4),
    exactSelectedNativeBrowserStatPairs: z.number().int().min(1).max(4),
    defaultBuildIds: z.partialRecord(profileSchema, buildId),
    defaultSelectionSource: z.enum([
      "frozen-search-reference; no independent-holdout selection",
      "preserved-qualified-role-default; no independent-holdout selection",
    ]),
    budget: z
      .object({
        classSlug: classSchema,
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
          .min(3)
          .max(64),
      })
      .passthrough(),
    builds: z
      .array(
        z
          .object({
            id: buildId,
            profile: profileSchema,
            variant: z.string().min(1).max(100),
            displayName: z.string().min(1).max(180),
            requiresProvisionalEnchantOptIn: z.boolean(),
            acceptedTwoPercent: z.literal(true),
            selectedNativeBrowser: z.literal(true),
            exactSelectedNativeBrowserStats: z.literal(true),
            all17Slots: z.literal(true),
            maximumConservativeTargetAuraUnion: z.number().int().positive().max(16),
            globalOptimalityProven: z.literal(false),
            serverMechanicsVerified: z.literal(false),
            liveAcquisitionVerified: z.literal(false),
            reference,
            gear: recordedGear,
            rotationGuidance: guidance,
            settings: z
              .object({
                player: z
                  .object({
                    class: z.string(),
                    talentsString: z.string(),
                    equipment: recordedGear,
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
      .min(1)
      .max(4),
  })
  .passthrough();
const width = z.union([z.literal(1440), z.literal(390)]);
const browserSchema = z
  .object({
    schema: z.enum([
      "kfc-current-combat-menu-browser.v2",
      "kfc-current-paladin-menu-native-replay.v1",
    ]),
    status: z.literal("passed"),
    profile: profileSchema,
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
              seed: z.union([z.literal(155270001), z.literal(98127001)]),
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
      .min(8)
      .max(26),
  })
  .passthrough();

interface QualifiedDpsModelUpdate {
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
function verifyBrowserSeedEvidence(browser: z.infer<typeof browserSchema>): void {
  const simulations = browser.checks.filter((row): boolean => row.kind === "simulation");
  if (browser.schema === "kfc-current-combat-menu-browser.v2") {
    requireMatch(
      simulations.every((row): boolean => row.kind === "simulation" && row.seed === 155270001),
      "Qualified DPS browser control seed changed",
    );
    return;
  }
  requireMatch(
    browser.profile === "retribution_paladin" &&
      browser.model === "56698b4729ee198f469d77fb8545538b52451924f283ed0f3f042449a815983e",
    "Archived native controls belong to a different profile or model",
  );
  const replay = z
    .object({
      nativeJobs: z.literal(0),
      nativePoolCreated: z.literal(false),
      exactArchivedNativeRequestRequired: z.literal(true),
      classLedgerUnchanged: z.literal(true),
      nativeReplaySources: z
        .array(
          z
            .object({
              id: z.enum(["paladin-retribution-static", "paladin-shockadin-static"]),
              sourceJson: z.string().min(1).max(1_000_000),
              sourceSha256: digest,
            })
            .strict(),
        )
        .length(2),
    })
    .parse(browser);
  const approvedSources = {
    "paladin-retribution-static":
      "a78a8f20812925216067194331e737ce18c11c44a74c18536ac76fe74c8fdfd1",
    "paladin-shockadin-static": "9b2d184ac5af918d0ad9636507eff2dc330999742c17d4040c27e2fc43be8e0a",
  } as const;
  requireMatch(
    new Set(replay.nativeReplaySources.map((row): string => row.id)).size === 2,
    "Duplicate archived native control",
  );
  const controls = new Map<string, { requestSha256: string; dps: number }>();
  for (const source of replay.nativeReplaySources) {
    requireMatch(
      source.sourceSha256 === approvedSources[source.id] &&
        createHash("sha256").update(source.sourceJson).digest("hex") === source.sourceSha256,
      "Archived native control checksum changed",
    );
    const recorded = z
      .object({
        capture: z.object({ requestBase64: z.string().min(1).max(200_000) }),
        native: z.object({ dps: z.number().finite().positive() }),
      })
      .parse(JSON.parse(source.sourceJson) as unknown);
    const request = Buffer.from(recorded.capture.requestBase64, "base64");
    requireMatch(
      request.toString("base64") === recorded.capture.requestBase64,
      "Invalid archived native request encoding",
    );
    controls.set(source.id, {
      requestSha256: createHash("sha256").update(request).digest("hex"),
      dps: recorded.native.dps,
    });
  }
  for (const row of simulations) {
    if (row.kind !== "simulation") continue;
    const control = controls.get(row.id);
    requireMatch(
      row.seed === 98127001 &&
        control !== undefined &&
        row.requestSha256 === control.requestSha256 &&
        row.nativeDps === control.dps,
      "Current menu does not match its exact archived native control",
    );
  }
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
    "Qualified DPS evidence escaped storage",
  );
  const info = await stat(target);
  requireMatch(info.isFile() && info.size <= limit, "Invalid qualified DPS evidence size");
  const bytes = await readFile(target);
  requireMatch(bytes.length <= limit, "Qualified DPS evidence exceeded read budget");
  return {
    value: JSON.parse(bytes.toString("utf8")) as unknown,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
function sameIds(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    new Set(actual).size === actual.length &&
    hash([...actual].sort()) === hash([...expected].sort())
  );
}

export const readQualifiedDpsSimulatorModelUpdate = cache(
  async function readQualifiedDpsSimulatorModelUpdate(
    profile: string,
    directory: string,
  ): Promise<QualifiedDpsModelUpdate | null> {
    const profileResult = profileSchema.safeParse(profile);
    if (!profileResult.success) return null;
    const selectedProfile = profileResult.data,
      contract = profiles[selectedProfile],
      factory = combatNativeProfiles[selectedProfile];
    let pointer: Awaited<ReturnType<typeof document>>;
    try {
      pointer = await document(directory, "qualified-dps-models.json", 32000);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
    const selectedValue = selectionSchema.parse(pointer.value).profiles[selectedProfile];
    if (selectedValue === undefined) return null;
    const selected = selectionReference.parse(selectedValue);
    const selectedRelease = selected.release;
    const manifest = await readSimulatorManifest(directory, selectedRelease);
    requireMatch(
      manifest !== null && manifest.pages.includes(selectedProfile),
      "Missing qualified DPS page",
    );
    async function assetDocument(name: string, expected: string): Promise<unknown> {
      const entry = await document(directory, `${selectedRelease}/${name}`, 8_000_000);
      requireMatch(
        entry.sha256 === expected && manifest?.files[name]?.sha256 === expected,
        "Qualified DPS asset checksum changed",
      );
      return entry.value;
    }
    const rawProof = await assetDocument("kfc-qualified-combat-model.json", selected.proofSha256),
      proof = proofSchema.parse(rawProof),
      source = await readSimulatorManifest(directory, proof.sourceRelease),
      sourceDocument = await document(directory, `${proof.sourceRelease}/manifest.json`, 8_000_000);
    requireMatch(
      source !== null && sourceDocument.sha256 === proof.identity.parent,
      "Qualified DPS source changed",
    );
    requireMatch(
      proof.release === manifest.release &&
        proof.profile === selectedProfile &&
        proof.identity.profile === selectedProfile &&
        proof.identity.model === proof.model &&
        hash(z.record(z.string(), z.unknown()).parse(rawProof).identity).slice(0, 24) ===
          proof.release,
      "Qualified DPS model identity changed",
    );
    requireMatch(
      proof.identity.qualification === proof.qualificationSha256 &&
        proof.identity.payload === proof.payloadSha256 &&
        manifest.files["kfc-combat-native-library.js"]?.sha256 === proof.identity.library,
      "Qualified DPS input identity changed",
    );
    const modelKeys = Object.keys(manifest.files)
      .filter((name): boolean => /wasm|worker|^assets\/database\//.test(name))
      .sort();
    requireMatch(
      hash(modelKeys) === hash(Object.keys(proof.modelAssets).sort()),
      "Qualified DPS model assets are incomplete",
    );
    for (const name of [
      "lib.wasm",
      "sim_worker.js",
      "assets/database/db.bin",
      "assets/database/db.json",
      "assets/database/leftover_db.bin",
      "assets/database/leftover_db.json",
    ])
      requireMatch(modelKeys.includes(name), "Missing qualified DPS combat asset");
    for (const name of modelKeys)
      requireMatch(
        hash(manifest.files[name]) === hash(proof.modelAssets[name]),
        "Qualified DPS combat asset changed",
      );
    const qualified = qualificationSchema.parse(
        await assetDocument("kfc-combat-update-qualification.json", proof.qualificationSha256),
      ),
      payloadDocument = await assetDocument("kfc-combat-native-builds.json", proof.payloadSha256),
      payload = payloadSchema.parse(payloadDocument),
      recordedPresets = z
        .array(z.record(z.string(), z.unknown()))
        .parse(z.record(z.string(), z.unknown()).parse(payloadDocument).builds);
    requireMatch(
      qualified.model === proof.model &&
        qualified.classSlug === contract.classSlug &&
        qualified.budget.classSlug === contract.classSlug &&
        qualified.defaultSelectionSource ===
          (contract.classSlug === "paladin"
            ? "preserved-qualified-role-default; no independent-holdout selection"
            : "frozen-search-reference; no independent-holdout selection") &&
        payload.profile === selectedProfile &&
        qualified.defaultBuildIds[selectedProfile] === proof.defaultBuildId &&
        payload.defaultBuildId === proof.defaultBuildId &&
        payload.builds[0]?.id === proof.defaultBuildId &&
        proof.builds[0]?.id === proof.defaultBuildId,
      "Qualified DPS numerical model changed",
    );
    const classProfiles = profileSchema.options.filter(
        (key): boolean => profiles[key].classSlug === contract.classSlug,
      ),
      classIds = classProfiles.flatMap((key): string[] => [...profiles[key].ids]);
    requireMatch(
      sameIds(
        qualified.builds.map((row): string => row.id),
        classIds,
      ) &&
        sameIds(Object.keys(qualified.defaultBuildIds), classProfiles) &&
        qualified.actualSelectedNativeBrowserControls === classIds.length &&
        qualified.exactSelectedNativeBrowserStatPairs === classIds.length,
      "Qualified DPS class coverage is incomplete",
    );
    for (const row of qualified.builds)
      requireMatch(
        profiles[row.profile].classSlug === contract.classSlug &&
          (profiles[row.profile].ids as readonly string[]).includes(row.id),
        "Qualified DPS build belongs to another class or profile",
      );
    requireMatch(
      sameIds(
        proof.builds.map((row): string => row.id),
        contract.ids,
      ) &&
        sameIds(
          payload.builds.map((row): string => row.id),
          contract.ids,
        ),
      "Qualified DPS omitted or duplicated a setup",
    );
    const startedAt = Date.parse(qualified.budget.startedAt),
      deadlineAt = Date.parse(qualified.budget.deadlineAt),
      phases = new Set<string>();
    requireMatch(deadlineAt - startedAt === 86_400_000, "Qualified DPS class deadline changed");
    for (const receipt of qualified.budget.phaseReceipts) {
      requireMatch(
        !phases.has(receipt.phase) &&
          receipt.startedAtMs >= startedAt &&
          receipt.finishedAtMs >= receipt.startedAtMs &&
          receipt.finishedAtMs <= deadlineAt,
        "Invalid qualified DPS phase receipt",
      );
      phases.add(receipt.phase);
    }
    const browserDocument = await document(
        directory,
        `dps-browser-reviews/${selected.release}.json`,
        3_000_000,
      ),
      browser = browserSchema.parse(browserDocument.value);
    requireMatch(
      browserDocument.sha256 === selected.browserReviewSha256 &&
        browser.profile === selectedProfile &&
        browser.release === proof.release &&
        browser.model === proof.model &&
        browser.proofSha256 === selected.proofSha256 &&
        browser.deadlineAt === qualified.budget.deadlineAt &&
        Date.parse(browser.completedAt) >= startedAt &&
        Date.parse(browser.completedAt) <= deadlineAt &&
        browser.checks.length === 6 * contract.ids.length + 2,
      "Qualified DPS browser approval changed",
    );
    verifyBrowserSeedEvidence(browser);
    for (const viewport of [1440, 390])
      requireMatch(
        browser.checks.filter(
          (row): boolean => row.kind === "preservation" && row.width === viewport,
        ).length === 1,
        "Missing qualified DPS saved-character review",
      );
    const builds: LocalSimulatorBuildReview[] = proof.builds.map(
      (row): LocalSimulatorBuildReview => {
        const numerical = qualified.builds.find((build): boolean => build.id === row.id),
          preset = payload.builds.find((build): boolean => build.id === row.id),
          recorded = recordedPresets.find((build): boolean => build.id === row.id);
        requireMatch(
          numerical !== undefined && preset !== undefined && numerical.profile === selectedProfile,
          "Missing qualified DPS preset",
        );
        const url = new URL(row.href, "https://helper.invalid");
        requireMatch(
          url.origin === "https://helper.invalid" &&
            url.pathname === `/forever-sim/${manifest.release}/${selectedProfile}/` &&
            url.search === "?i=gtrcmxeu" &&
            /^#[A-Za-z0-9+/]{64,}={0,2}$/.test(url.hash) &&
            row.href === url.pathname + url.search + url.hash,
          "Invalid qualified DPS import",
        );
        requireMatch(
          preset.proto.player.class === factory.playerClass &&
            preset.proto.player.spec.oneofKind === factory.specKey &&
            typeof preset.proto.player.spec[factory.specKey] === "object" &&
            preset.proto.player.spec[factory.specKey] !== null &&
            numerical.settings.player.class ===
              `Class${contract.classSlug[0]?.toUpperCase()}${contract.classSlug.slice(1)}` &&
            numerical.settings.player.talentsString === preset.proto.player.talentsString,
          "Qualified DPS character factory changed",
        );
        requireMatch(
          row.requiresProvisionalEnchantOptIn === numerical.requiresProvisionalEnchantOptIn &&
            row.requiresProvisionalEnchantOptIn === preset.requiresProvisionalEnchantOptIn &&
            hash(row.reference) === hash(numerical.reference) &&
            hash(row.reference) === hash(preset.reference) &&
            row.label === numerical.displayName &&
            row.label === preset.label,
          "Qualified DPS reference differs from measurement",
        );
        requireMatch(
          row.presetSha256 === hash(recorded?.proto) &&
            hash(row.gear) === hash(preset.proto.player.equipment) &&
            hash(numerical.gear) === hash(numerical.settings.player.equipment) &&
            row.gear.items.every(
              (spec, slot): boolean =>
                spec.id === (numerical.gear.items[slot]?.id ?? 0) &&
                (spec.enchant ?? 0) === (numerical.gear.items[slot]?.enchant ?? 0),
            ),
          "Qualified DPS measured equipment or preset changed",
        );
        const allocation = numerical.settings.player.talentsString
          .split("-")
          .map((tree): number =>
            [...tree].reduce((total, rank): number => total + Number(rank), 0),
          );
        while (allocation.length < 3) allocation.push(0);
        requireMatch(
          allocation.reduce((total, count): number => total + count, 0) === 51 &&
            numerical.rotationGuidance.talents === allocation.join("/"),
          "Qualified DPS talent guidance changed",
        );
        for (const viewport of [1440, 390]) {
          for (const menu of ["configurations", "gear-sets"])
            requireMatch(
              browser.checks.filter(
                (check): boolean =>
                  check.kind === "menu" &&
                  check.width === viewport &&
                  check.menu === menu &&
                  check.id === row.id,
              ).length === 1,
              "Incomplete qualified DPS menus",
            );
          const checked = browser.checks.filter(
            (check): boolean =>
              check.kind === "simulation" && check.width === viewport && check.id === row.id,
          );
          requireMatch(checked.length === 1, "Incomplete qualified DPS browser simulations");
          const check = checked[0];
          requireMatch(
            check?.kind === "simulation" &&
              check.presetSha256 === row.presetSha256 &&
              check.consentExplicit === row.requiresProvisionalEnchantOptIn &&
              Math.abs(check.nativeDps - check.browserDps) <= 0.051,
            "Qualified DPS browser/native parity failed",
          );
        }
        const { instruction, prepull, ...details } = numerical.rotationGuidance;
        return {
          id: row.id,
          spec: `${selectedProfile}/${numerical.variant}`,
          faction: numerical.settings.settings.faction,
          scenario: row.requiresProvisionalEnchantOptIn ? "provisional-procs" : "static",
          stage: `${contract.stage} · practical 2% comparison`,
          status: "reviewed",
          href: row.href,
          displayName: row.label,
          referenceDps: row.reference.dps.avg,
          validationIterations: 40000,
          requiresProvisionalEnchantOptIn: row.requiresProvisionalEnchantOptIn,
          warnings: preset.warnings,
          rotationGuidance: {
            ...details,
            ...(instruction === undefined ? {} : { instruction }),
            ...(prepull === undefined ? {} : { prepull }),
          },
        };
      },
    );
    return { manifest, sourceRelease: proof.sourceRelease, builds };
  },
);
