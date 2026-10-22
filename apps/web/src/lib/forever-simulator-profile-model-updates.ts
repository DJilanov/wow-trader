import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import type { SimulatorManifest } from "@wow-trader/forever-data/simulator";
import { readSimulatorManifest } from "./forever-simulator";
import {
  frostModelEntrySchema,
  frostModelEvidenceReferenceSchema,
  readFreshFrostSimulatorBuild,
  type FrostModelEvidenceReference,
} from "./forever-simulator-fresh-frost";
import { fireModelEntrySchema, readFreshFireSimulatorBuild } from "./forever-simulator-fresh-fire";
import {
  arcaneModelEntrySchema,
  readFreshArcaneSimulatorBuild,
} from "./forever-simulator-fresh-arcane";
import {
  greaterBalanceModelEntrySchema,
  readFreshGreaterBalanceSimulatorBuild,
} from "./forever-simulator-fresh-greater-balance";
import {
  demonologyModelEntrySchema,
  readFreshDemonologySimulatorBuild,
} from "./forever-simulator-fresh-demonology";
import {
  afflictionModelEntrySchema,
  readFreshAfflictionSimulatorBuild,
} from "./forever-simulator-fresh-affliction";
import {
  raidFeralModelEntrySchema,
  readRaidFeralSimulatorBuild,
} from "./forever-simulator-raid-feral";
import {
  raidHunterModelEntrySchema,
  readRaidHunterSimulatorBuild,
} from "./forever-simulator-raid-hunter";
import {
  shadowPriestModelEntrySchema,
  readFreshShadowPriestSimulatorBuild,
} from "./forever-simulator-fresh-shadow-priest";
import {
  smitePriestModelEntrySchema,
  readFreshSmitePriestSimulatorBuild,
} from "./forever-simulator-fresh-smite-priest";
import {
  elementalShamanModelEntrySchema,
  readFreshElementalShamanSimulatorBuild,
  verifiedElementalShamanDelivery,
} from "./forever-simulator-fresh-elemental-shaman";
import {
  stormcallerModelEntrySchema,
  readFreshStormcallerSimulatorBuild,
  verifiedStormcallerDelivery,
} from "./forever-simulator-fresh-stormcaller";
import {
  enhancementShamanModelEntrySchema,
  readFreshEnhancementShamanSimulatorBuild,
  verifiedEnhancementShamanDelivery,
} from "./forever-simulator-fresh-enhancement-shaman";
import {
  retributionPaladinModelEntrySchema,
  readFreshRetributionPaladinSimulatorBuild,
  verifiedRetributionPaladinDelivery,
} from "./forever-simulator-fresh-retribution-paladin";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  releaseId = z.string().regex(/^[a-f0-9]{24}$/),
  reference = z.object({ path: z.string().min(1).max(240), sha256: digest }).strict(),
  asset = z.object({ bytes: z.number().int().nonnegative(), sha256: digest }).strict();
const profilePointerSchema = z
  .object({
    sourceRelease: releaseId,
    release: releaseId,
    proofSha256: digest,
    browserReview: reference,
  })
  .strict();
const selectionSchema = z
  .object({
    schema: z.literal("kfc-simulator-profile-model-selection.v1"),
    profiles: z
      .object({
        mage: z.unknown().optional(),
        balance_druid: z.unknown().optional(),
        warlock: z.unknown().optional(),
        feral_druid: z.unknown().optional(),
        hunter: z.unknown().optional(),
        shadow_priest: z.unknown().optional(),
        smite_priest: z.unknown().optional(),
        elemental_shaman: z.unknown().optional(),
        enhancement_shaman: z.unknown().optional(),
        retribution_paladin: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();
const proofFields = {
  sourceRelease: releaseId,
  release: releaseId,
  identity: digest,
  sourceManifestSha256: digest,
  nativeBinarySha256: digest,
  databaseSha256: digest,
  policySha256: digest,
  typecheckDiagnostics: z.literal(0),
  modelAssets: z.record(z.string(), asset),
  virtualSourceFiles: z
    .array(z.object({ path: z.string().min(1).max(240), sha256: digest }).strict())
    .min(1)
    .max(160),
  sourceFiles: z
    .array(z.object({ path: z.string().min(1).max(240), byteSha256: digest }).strict())
    .min(1)
    .max(32),
  presets: z
    .array(
      z
        .object({
          profile: z.string().regex(/^[a-z_]+$/),
          variant: z.string().regex(/^[a-z0-9_-]+$/),
          gearSha256: digest,
        })
        .strict(),
    )
    .length(28),
  notice: z.string().min(1).max(4000),
};
const mageProofSchema = z
  .object({
    ...proofFields,
    schema: z.enum([
      "kfc-simulator-profile-model-update.v1",
      "kfc-simulator-profile-model-update.v2",
      "kfc-simulator-profile-model-update.v3",
    ]),
    profile: z.literal("mage"),
    builds: z.union([
      z.tuple([frostModelEntrySchema]),
      z.tuple([frostModelEntrySchema, fireModelEntrySchema]),
      z.tuple([frostModelEntrySchema, fireModelEntrySchema, arcaneModelEntrySchema]),
    ]),
  })
  .strict()
  .refine(
    (proof: { readonly schema: string; readonly builds: readonly unknown[] }): boolean => {
      const expected =
        proof.schema === "kfc-simulator-profile-model-update.v1"
          ? 1
          : proof.schema === "kfc-simulator-profile-model-update.v2"
            ? 2
            : 3;
      return proof.builds.length === expected;
    },
    { path: ["builds"], message: "Profile version omitted or added a reviewed Mage spec" },
  );
const balanceProofSchema = z
  .object({
    ...proofFields,
    schema: z.literal("kfc-simulator-profile-model-update.balance.v1"),
    profile: z.literal("balance_druid"),
    builds: z.tuple([greaterBalanceModelEntrySchema]),
  })
  .strict();
const warlockProofSchema = z.union([
  z
    .object({
      ...proofFields,
      schema: z.literal("kfc-simulator-profile-model-update.warlock.v1"),
      profile: z.literal("warlock"),
      builds: z.tuple([demonologyModelEntrySchema]),
    })
    .strict(),
  z
    .object({
      ...proofFields,
      schema: z.literal("kfc-simulator-profile-model-update.warlock.v2"),
      profile: z.literal("warlock"),
      builds: z.tuple([demonologyModelEntrySchema, afflictionModelEntrySchema]),
    })
    .strict(),
]);
const raidFeralProofSchema = z
  .object({
    ...proofFields,
    schema: z.literal("kfc-simulator-profile-model-update.feral-raid.v1"),
    profile: z.literal("feral_druid"),
    builds: z.tuple([raidFeralModelEntrySchema]),
  })
  .strict();
const proofSchema = z.union([
  mageProofSchema,
  balanceProofSchema,
  warlockProofSchema,
  raidFeralProofSchema,
  z
    .object({
      ...proofFields,
      schema: z.literal("kfc-simulator-profile-model-update.paladin-retribution.v1"),
      profile: z.literal("retribution_paladin"),
      builds: z.tuple([retributionPaladinModelEntrySchema]),
    })
    .strict(),
  z
    .object({
      ...proofFields,
      schema: z.literal("kfc-simulator-profile-model-update.shaman-enhancement.v1"),
      profile: z.literal("enhancement_shaman"),
      builds: z.tuple([enhancementShamanModelEntrySchema]),
    })
    .strict(),
  z
    .object({
      ...proofFields,
      schema: z.literal("kfc-simulator-profile-model-update.shaman-stormcaller.v1"),
      profile: z.literal("elemental_shaman"),
      builds: z.tuple([elementalShamanModelEntrySchema, stormcallerModelEntrySchema]),
    })
    .strict(),
  z
    .object({
      ...proofFields,
      schema: z.literal("kfc-simulator-profile-model-update.shaman-elemental.v1"),
      profile: z.literal("elemental_shaman"),
      builds: z.tuple([elementalShamanModelEntrySchema]),
    })
    .strict(),
  z
    .object({
      ...proofFields,
      schema: z.literal("kfc-simulator-profile-model-update.priest-smite.v1"),
      profile: z.literal("smite_priest"),
      builds: z.tuple([smitePriestModelEntrySchema]),
    })
    .strict(),
  z
    .object({
      ...proofFields,
      schema: z.literal("kfc-simulator-profile-model-update.priest-shadow.v1"),
      profile: z.literal("shadow_priest"),
      builds: z.tuple([shadowPriestModelEntrySchema]),
    })
    .strict(),
  z
    .object({
      ...proofFields,
      schema: z.literal("kfc-simulator-profile-model-update.hunter-raid.v1"),
      profile: z.literal("hunter"),
      builds: z.tuple([
        raidHunterModelEntrySchema,
        raidHunterModelEntrySchema,
        raidHunterModelEntrySchema,
      ]),
    })
    .strict()
    .refine(
      (proof): boolean =>
        proof.builds.map((entry): string => entry.id).join(",") ===
        "hunter-beast-mastery-static,hunter-marksmanship-static,hunter-survival-static",
      {
        path: ["builds"],
        message: "Hunter publication omitted, duplicated or reordered a reviewed spec",
      },
    ),
]);
export const simulatorProfileModelBrowserChecks = Object.freeze({
  allPresets: true,
  reviewedShares: true,
  firstVisitDefault: true,
  savedCharacterPreserved: true,
  provisionalConsentOff: true,
  nativeBrowserParity: true,
  desktopMobile: true,
  itemSkillsIgnored: true,
  assetIntegrity: true,
  otherProfilesPreserved: true,
  greaterMageblood20: true,
  configAndGearSets: true,
  rotationGuide: true,
});
const browserSchema = z
  .object({
    schema: z.enum([
      "kfc-profile-model-browser.v1",
      "kfc-profile-model-browser.v2",
      "kfc-profile-model-browser.v3",
      "kfc-profile-model-browser.balance.v1",
      "kfc-profile-model-browser.warlock.v1",
      "kfc-profile-model-browser.warlock.v2",
      "kfc-profile-model-browser.feral-raid.v1",
      "kfc-profile-model-browser.hunter-raid.v1",
      "kfc-profile-model-browser.priest-shadow.v1",
      "kfc-profile-model-browser.priest-smite.v1",
      "kfc-profile-model-browser.shaman-elemental.v1",
      "kfc-profile-model-browser.shaman-stormcaller.v1",
      "kfc-profile-model-browser.shaman-enhancement.v1",
      "kfc-profile-model-browser.paladin-retribution.v1",
    ]),
    status: z.literal("passed"),
    capturedAt: z.iso.datetime(),
    profile: z.enum([
      "mage",
      "balance_druid",
      "warlock",
      "feral_druid",
      "hunter",
      "shadow_priest",
      "smite_priest",
      "elemental_shaman",
      "enhancement_shaman",
      "retribution_paladin",
    ]),
    sourceRelease: releaseId,
    release: releaseId,
    proofSha256: digest,
    checked: z
      .object({
        allPresets: z.literal(true),
        reviewedShares: z.literal(true),
        firstVisitDefault: z.literal(true),
        savedCharacterPreserved: z.literal(true),
        provisionalConsentOff: z.literal(true),
        nativeBrowserParity: z.literal(true),
        desktopMobile: z.literal(true),
        itemSkillsIgnored: z.literal(true),
        assetIntegrity: z.literal(true),
        otherProfilesPreserved: z.literal(true),
        greaterMageblood20: z.literal(true),
        configAndGearSets: z.literal(true),
        rotationGuide: z.literal(true),
      })
      .strict(),
    evidence: z.record(z.string(), z.unknown()),
    errors: z.array(z.string()).length(0),
  })
  .strict();
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function document(
  directory: string,
  path: string,
  maximumBytes: number,
): Promise<{ value: unknown; sha256: string }> {
  requireMatch(
    !path.includes("\\") &&
      !path.includes("\0") &&
      !path.split("/").includes("..") &&
      !isAbsolute(path),
    "Invalid profile-model evidence path",
  );
  const root = await realpath(directory),
    target = await realpath(resolve(root, path)),
    offset = relative(root, target);
  requireMatch(
    offset && offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset),
    "Profile-model evidence escaped storage",
  );
  const info = await stat(target);
  requireMatch(info.isFile() && info.size <= maximumBytes, "Invalid profile-model evidence size");
  const bytes = await readFile(target);
  requireMatch(bytes.length <= maximumBytes, "Profile-model evidence exceeded read limit");
  return {
    value: JSON.parse(bytes.toString("utf8")) as unknown,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
async function proofFor(
  manifest: SimulatorManifest,
  directory: string,
): Promise<z.infer<typeof proofSchema>> {
  const raw = await document(directory, manifest.release + "/kfc-reviewed-presets.json", 2_000_000);
  requireMatch(
    raw.sha256 === manifest.files["kfc-reviewed-presets.json"]?.sha256,
    "Profile-model proof checksum changed",
  );
  const proof = proofSchema.parse(raw.value);
  requireMatch(
    proof.release === manifest.release && proof.identity.slice(0, 24) === manifest.release,
    "Profile-model release changed",
  );
  return proof;
}
export async function validateSimulatorProfileModelBuilds(
  profile: string,
  manifest: SimulatorManifest,
  builds: readonly {
    readonly id: string;
    readonly href: string;
    readonly referenceDps: number;
    readonly validationIterations: number;
  }[],
  directory: string,
): Promise<boolean> {
  if (
    profile !== "mage" &&
    profile !== "balance_druid" &&
    profile !== "warlock" &&
    profile !== "hunter" &&
    profile !== "shadow_priest" &&
    profile !== "smite_priest" &&
    profile !== "elemental_shaman" &&
    profile !== "enhancement_shaman" &&
    profile !== "retribution_paladin" &&
    profile !== "feral_druid"
  )
    return false;
  const raw = await document(directory, manifest.release + "/kfc-reviewed-presets.json", 2_000_000);
  if (
    ![
      "kfc-simulator-profile-model-update.v1",
      "kfc-simulator-profile-model-update.v2",
      "kfc-simulator-profile-model-update.v3",
      "kfc-simulator-profile-model-update.balance.v1",
      "kfc-simulator-profile-model-update.warlock.v1",
      "kfc-simulator-profile-model-update.warlock.v2",
      "kfc-simulator-profile-model-update.feral-raid.v1",
      "kfc-simulator-profile-model-update.hunter-raid.v1",
      "kfc-simulator-profile-model-update.priest-shadow.v1",
      "kfc-simulator-profile-model-update.priest-smite.v1",
      "kfc-simulator-profile-model-update.shaman-elemental.v1",
      "kfc-simulator-profile-model-update.shaman-stormcaller.v1",
      "kfc-simulator-profile-model-update.shaman-enhancement.v1",
      "kfc-simulator-profile-model-update.paladin-retribution.v1",
    ].includes(z.object({ schema: z.string() }).parse(raw.value).schema)
  )
    return false;
  const proof = await proofFor(manifest, directory);
  requireMatch(proof.profile === profile, "Profile publication used another class's proof");
  requireMatch(builds.length === proof.builds.length, "Profile publication omitted/added a build");
  for (const build of builds) {
    const measured = proof.builds.find((entry) => entry.id === build.id);
    requireMatch(
      measured &&
        measured.referenceDps === build.referenceDps &&
        measured.validationIterations === build.validationIterations &&
        measured.hrefSha256 === createHash("sha256").update(build.href).digest("hex"),
      "Profile build does not match measured settings/share/DPS",
    );
  }
  return true;
}
export async function readSimulatorProfileModelUpdate(
  profile: string,
  directory: string,
): Promise<{ readonly manifest: SimulatorManifest; readonly sourceRelease: string } | null> {
  // Validate only the requested pointer so another class's unavailable update stays isolated.
  if (
    profile !== "mage" &&
    profile !== "balance_druid" &&
    profile !== "warlock" &&
    profile !== "hunter" &&
    profile !== "shadow_priest" &&
    profile !== "smite_priest" &&
    profile !== "elemental_shaman" &&
    profile !== "enhancement_shaman" &&
    profile !== "retribution_paladin" &&
    profile !== "feral_druid"
  )
    return null;
  let raw: Awaited<ReturnType<typeof document>>;
  try {
    raw = await document(directory, "profile-model-updates.json", 32_000);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const rawPointer = selectionSchema.parse(raw.value).profiles[profile];
  if (rawPointer === undefined) return null;
  const pointer = profilePointerSchema.parse(rawPointer);
  const source = await readSimulatorManifest(directory, pointer.sourceRelease),
    candidate = await readSimulatorManifest(directory, pointer.release);
  requireMatch(
    source && candidate && source.pages.includes(profile) && candidate.pages.includes(profile),
    "Missing profile-model engine/page",
  );
  const proof = await proofFor(candidate, directory),
    sourceDocument = await document(directory, pointer.sourceRelease + "/manifest.json", 8_000_000);
  requireMatch(proof.profile === profile, "Profile engine used another class's proof");
  requireMatch(
    pointer.proofSha256 === candidate.files["kfc-reviewed-presets.json"]?.sha256 &&
      proof.sourceRelease === source.release &&
      hash(sourceDocument.value) === proof.sourceManifestSha256,
    "Profile numerical provenance changed",
  );
  for (const key of [
    "revision",
    "itemCount",
    "currentItemCount",
    "provisionalItemCount",
    "excludedModeledItems",
    "pages",
    "dataProvenance",
    "mechanicsStatus",
    "itemWeaponSkillPolicy",
  ] as const)
    requireMatch(
      hash(source[key]) === hash(candidate[key]),
      "Profile presentation changed undeclared model scope: " + key,
    );
  const keys = Object.keys(source.files)
    .filter((name) => /wasm|worker|^assets\/database\//.test(name))
    .sort();
  requireMatch(
    hash(keys) === hash(Object.keys(proof.modelAssets).sort()) &&
      hash(keys) ===
        hash(
          Object.keys(candidate.files)
            .filter((name) => /wasm|worker|^assets\/database\//.test(name))
            .sort(),
        ),
    "Profile model has incomplete numerical assets",
  );
  for (const name of [
    "lib.wasm",
    "sim_worker.js",
    "assets/database/db.json",
    "assets/database/db.bin",
    "assets/database/leftover_db.json",
    "assets/database/leftover_db.bin",
  ])
    requireMatch(keys.includes(name), "Profile model missing required numerical asset");
  for (const name of keys)
    requireMatch(
      hash(source.files[name]) === hash(candidate.files[name]) &&
        hash(source.files[name]) === hash(proof.modelAssets[name]),
      "Profile presentation rebuilt numerical assets",
    );
  const policy = await document(
    directory,
    source.release + "/kfc-item-weapon-skills.json",
    1_000_000,
  );
  requireMatch(
    policy.sha256 === proof.policySha256 &&
      candidate.files["kfc-item-weapon-skills.json"]?.sha256 === policy.sha256 &&
      hash(policy.value) === hash(source.itemWeaponSkillPolicy),
    "Profile item-skill policy changed",
  );
  z.object({
    schema: z.literal("kfc-item-weapon-skills.v1"),
    mode: z.literal("ignore-item-bonuses"),
    basis: z.literal("owner-directed-model-assumption"),
  })
    .passthrough()
    .parse(policy.value);
  requireMatch(
    new Set(proof.presets.map((row) => row.profile + "/" + row.variant)).size === 28,
    "Profile starter audit missing/duplicate",
  );
  for (const entry of proof.builds) {
    const options = {
      sourceRelease: source.release,
      revision: source.revision,
      databaseSha256: proof.databaseSha256,
      reference: async (rawReference: FrostModelEvidenceReference): Promise<unknown> => {
        const ref = frostModelEvidenceReferenceSchema.parse(rawReference),
          path = ref.path.replace(/^artifacts\/forever-simulator\//, "");
        // Larger allowances apply only to these already-replayed study/model records.
        const limit =
            path ===
            "optimization/bounded-native-studies/764404e8248b94f6e9426ffa9b70e64f67f90c6606c3902858197fd2bcd4c86c/result-538b27f2a952a950.json"
              ? 24_000_000
              : path ===
                  "optimization/bounded-native-studies/13c0c0f5b6bb6ed56fab585bbef64ef1539e7d19e2a04d9abfd8632d5ba11674/result-8b3cfae2b00019a5.json"
                ? 32_000_000
                : path ===
                    "optimization/bounded-native-studies/0f24b12bcfc52c5b9f3e50592177cc56f84dceaf4c4b023a3901e2cbf00c39a5/result-52535fb7bed47421.json"
                  ? 16_000_000
                  : path ===
                        "optimization/bounded-native-studies/48e23a84fbe19e57cee64b4156f02b0743a91df8584914285c99df9076376da6/result-0ab3f5d4eaee0deb.json" ||
                      path ===
                        "optimization/bounded-native-studies/bdc3c471e76b456217155cf050d331f0fc7137ed0e4def311bb3de3716dc9d38/result-d1de1e63af9ddf0e.json"
                    ? 48_000_000
                    : path ===
                        "optimization/bounded-native-studies/aa0fdcb74c74b8d7dff34c3308cc710188600e6883a2a6bebdb0e84612484b00/result-658d7909096cef89.json"
                      ? 16_000_000
                      : path ===
                          "optimization/bounded-native-studies/8b54f815b9081267376b03f5dc815e879bb8dc7af0665ebab06f900272a619e6/result-b5ff24f59ee30e54.json"
                        ? 48_000_000
                        : path ===
                            "optimization/bounded-native-studies/1b8cd38af0234f6f815c773f0007c59a7de6b3421046077b4c6ad09e1401c27d/result-56e2f089fa20f3f3.json"
                          ? 16_000_000
                          : path ===
                              "optimization/bounded-native-studies/5d9d1732dd471c3053701b59f7ba0c165a82f2af3729893a372c440b921454a0/result-b660b911c5437803.json"
                            ? 48_000_000
                            : path ===
                                "optimization/bounded-native-studies/0633bfe09207ed3589eb2b4861a7ba47f498d170f8c8dce3a860cf78f59ded56/result-a4a5d7bbcaae2034.json"
                              ? 16_000_000
                              : path ===
                                  "optimization/bounded-native-studies/aed586fd81fa3d1586fa898d07d573d8848a9cbe982ff05ee925090aceac760d/result-049dcd0fd6f6f58b.json"
                                ? 32_000_000
                                : path ===
                                    "optimization/bounded-native-studies/d752a04ead822dc7511ca82909e24a96fe6df07fa7ecd9c0c0eeb20e5f597dba/result-1427f90944b15ba2.json"
                                  ? 16_000_000
                                  : path ===
                                        "optimization/bounded-native-studies/00186ca37797b13afb6c90a40df1a1304c8562b3a825868509c016365c84c6bd/result-89141bf23de4429e.json" ||
                                      path ===
                                        "optimization/bounded-native-studies/a4a2975e0f448713c92d3150bf745b43af152ba1056002252f0ed8ebad2776dd/result-4770f7c11586c018.json" ||
                                      path ===
                                        "optimization/bounded-native-studies/986daa45ffaa7babdeecf7db1665dca762570958794e6d3228396186167ec302/result-7f6818720cf72276.json"
                                    ? 16_000_000
                                    : 8_000_000,
          value = await document(
            directory,
            path,
            path ===
              "optimization/bounded-native-studies/f03164db1dd67865b847ce732abc3fb02a474bd7174113aef3553e2c9d106e33/result-fca81a1efc843744.json" ||
              path ===
                "optimization/bounded-native-studies/7797f69a3d931d06c9387c8706fba7ce1ef4fbff6e9cddc6fbf11169f7c68a99/result-9fd70fbdd3c4b7dc.json" ||
              path ===
                "optimization/bounded-native-studies/dfbaa4c0c63f565fcffa5344690eaa520a1b4ca18091406fe72d4c40651546e8/result-4a25fa36b1968d97.json" ||
              path ===
                "optimization/bounded-native-studies/0c6d7bc3698fab970542ff444f4b5b395097795caa48e6419b986826a2282b88/result-6b79141f70d57c34.json" ||
              path ===
                "optimization/bounded-native-studies/efec359e720673076335d8c3e1c1d0bbb43df0723489bd21c4420f1d81d5120d/result-d56c115796099683.json" ||
              (path === "optimization/paladin-free-seal-model-v1/context.json" &&
                ref.sha256 ===
                  "81e4694b374864668626f10e76ce279448cf3431388a798b34714fa61fd74ae1") ||
              (path === "optimization/paladin-pvp-model-v1/context.json" &&
                ref.sha256 === "d95ad63af68c529a843c9f3134d48fd51bb84763eec03f450485819a96b08596")
              ? 16_000_000
              : limit,
          );
        if (ref.byteSha256)
          requireMatch(ref.byteSha256 === value.sha256, "Profile source byte checksum changed");
        return value.value;
      },
    };
    const build =
      entry.id === "paladin-retribution-static"
        ? await readFreshRetributionPaladinSimulatorBuild(entry, {
            ...options,
            reviewedBuildSha256: verifiedRetributionPaladinDelivery.buildSha256,
          })
        : entry.id === "shaman-enhancement-static"
          ? await readFreshEnhancementShamanSimulatorBuild(entry, {
              ...options,
              reviewedBuildSha256: verifiedEnhancementShamanDelivery.buildSha256,
            })
          : entry.id === "shaman-stormcaller-static"
            ? await readFreshStormcallerSimulatorBuild(entry, {
                ...options,
                reviewedBuildSha256: verifiedStormcallerDelivery.buildSha256,
              })
            : entry.id === "shaman-elemental-static"
              ? await readFreshElementalShamanSimulatorBuild(entry, {
                  ...options,
                  reviewedBuildSha256: verifiedElementalShamanDelivery.buildSha256,
                })
              : entry.id === "mage-frost-static"
                ? await readFreshFrostSimulatorBuild(entry, options)
                : entry.id === "mage-fire-static"
                  ? await readFreshFireSimulatorBuild(entry, options)
                  : entry.id === "mage-arcane-static"
                    ? await readFreshArcaneSimulatorBuild(entry, options)
                    : entry.id === "warlock-demonology-static"
                      ? await readFreshDemonologySimulatorBuild(entry, options)
                      : entry.id === "warlock-affliction-static"
                        ? await readFreshAfflictionSimulatorBuild(entry, options)
                        : entry.id === "priest-shadow-static"
                          ? await readFreshShadowPriestSimulatorBuild(entry, options)
                          : entry.id === "priest-smite-static"
                            ? await readFreshSmitePriestSimulatorBuild(entry, options)
                            : entry.id === "feral-cat-static"
                              ? await readRaidFeralSimulatorBuild(entry, options)
                              : entry.profile === "hunter"
                                ? await readRaidHunterSimulatorBuild(entry, options)
                                : await readFreshGreaterBalanceSimulatorBuild(entry, options);
    const player = z.record(z.string(), z.unknown()).parse(build.settings.player);
    requireMatch(
      proof.presets.some(
        (row) =>
          row.profile === build.profile &&
          row.variant === build.variant &&
          row.gearSha256 === hash(player.equipment),
      ),
      "Profile audit changed measured gear",
    );
  }
  requireMatch(
    pointer.browserReview.path ===
      `optimization/reviews/profile-model-browser-${pointer.browserReview.sha256.slice(0, 16)}.json`,
    "Unexpected profile browser review path",
  );
  const browserDocument = await document(directory, pointer.browserReview.path, 2_000_000);
  requireMatch(
    hash(browserDocument.value) === pointer.browserReview.sha256,
    "Profile browser approval checksum changed",
  );
  const browser = browserSchema.parse(browserDocument.value);
  requireMatch(
    browser.release === candidate.release &&
      browser.profile === profile &&
      browser.sourceRelease === source.release &&
      browser.proofSha256 === pointer.proofSha256 &&
      browser.schema ===
        (proof.schema === "kfc-simulator-profile-model-update.paladin-retribution.v1"
          ? "kfc-profile-model-browser.paladin-retribution.v1"
          : proof.schema === "kfc-simulator-profile-model-update.shaman-enhancement.v1"
            ? "kfc-profile-model-browser.shaman-enhancement.v1"
            : proof.schema === "kfc-simulator-profile-model-update.shaman-stormcaller.v1"
              ? "kfc-profile-model-browser.shaman-stormcaller.v1"
              : proof.schema === "kfc-simulator-profile-model-update.shaman-elemental.v1"
                ? "kfc-profile-model-browser.shaman-elemental.v1"
                : proof.schema === "kfc-simulator-profile-model-update.priest-smite.v1"
                  ? "kfc-profile-model-browser.priest-smite.v1"
                  : proof.schema === "kfc-simulator-profile-model-update.priest-shadow.v1"
                    ? "kfc-profile-model-browser.priest-shadow.v1"
                    : proof.schema === "kfc-simulator-profile-model-update.hunter-raid.v1"
                      ? "kfc-profile-model-browser.hunter-raid.v1"
                      : proof.schema === "kfc-simulator-profile-model-update.feral-raid.v1"
                        ? "kfc-profile-model-browser.feral-raid.v1"
                        : proof.schema === "kfc-simulator-profile-model-update.warlock.v2"
                          ? "kfc-profile-model-browser.warlock.v2"
                          : proof.schema === "kfc-simulator-profile-model-update.warlock.v1"
                            ? "kfc-profile-model-browser.warlock.v1"
                            : proof.schema === "kfc-simulator-profile-model-update.balance.v1"
                              ? "kfc-profile-model-browser.balance.v1"
                              : proof.schema === "kfc-simulator-profile-model-update.v1"
                                ? "kfc-profile-model-browser.v1"
                                : proof.schema === "kfc-simulator-profile-model-update.v2"
                                  ? "kfc-profile-model-browser.v2"
                                  : "kfc-profile-model-browser.v3"),
    "Profile browser approval belongs to another build",
  );
  const evidence = z
    .object({
      parityChecks: z
        .array(
          z
            .object({
              id: z.enum([
                "mage-frost-static",
                "mage-fire-static",
                "mage-arcane-static",
                "balance-static",
                "warlock-demonology-static",
                "warlock-affliction-static",
                "feral-cat-static",
                "hunter-beast-mastery-static",
                "hunter-marksmanship-static",
                "hunter-survival-static",
                "priest-shadow-static",
                "priest-smite-static",
                "shaman-elemental-static",
                "shaman-stormcaller-static",
                "shaman-enhancement-static",
                "paladin-retribution-static",
              ]),
              iterations: z.literal(25),
              nativeDps: z.number().finite().positive(),
              browserDps: z.number().finite().positive(),
            })
            .passthrough(),
        )
        .min(1)
        .max(3),
      shares: z
        .array(
          z
            .object({
              id: z.enum([
                "mage-frost-static",
                "mage-fire-static",
                "mage-arcane-static",
                "balance-static",
                "warlock-demonology-static",
                "warlock-affliction-static",
                "feral-cat-static",
                "hunter-beast-mastery-static",
                "hunter-marksmanship-static",
                "hunter-survival-static",
                "priest-shadow-static",
                "priest-smite-static",
                "shaman-elemental-static",
                "shaman-stormcaller-static",
                "shaman-enhancement-static",
                "paladin-retribution-static",
              ]),
              viewport: z.object({ width: z.number().int().positive() }).passthrough(),
              fullMeasuredSettingsPreserved: z.literal(true),
            })
            .passthrough(),
        )
        .min(2)
        .max(8),
      otherProfiles: z
        .array(
          z
            .object({
              profile: z.string(),
              sourceRelease: z.string(),
              presentationRelease: z.string(),
              unchanged: z.literal(true),
            })
            .strict(),
        )
        .min(1)
        .max(24),
    })
    .passthrough()
    .parse(browser.evidence);
  requireMatch(
    evidence.parityChecks.length === proof.builds.length &&
      new Set(evidence.parityChecks.map((row): string => row.id)).size === proof.builds.length &&
      evidence.parityChecks.every((row) => Math.abs(row.nativeDps - row.browserDps) <= 0.011) &&
      evidence.shares.length === proof.builds.length * 2 &&
      new Set(evidence.shares.map((row): string => `${row.id}:${row.viewport.width}`)).size ===
        evidence.shares.length &&
      evidence.shares.every((row): boolean => proof.builds.some((build) => build.id === row.id)) &&
      proof.builds.every(
        (build): boolean =>
          evidence.parityChecks.some((row): boolean => row.id === build.id) &&
          [1440, 390].every((width): boolean =>
            evidence.shares.some(
              (row): boolean => row.id === build.id && row.viewport.width === width,
            ),
          ),
      ),
    "Profile browser approval omitted parity/desktop/mobile share import",
  );
  const expectedOtherProfiles =
    profile === "retribution_paladin"
      ? [
          "warrior",
          "rogue",
          "hunter",
          "feral_druid",
          "balance_druid",
          "mage",
          "warlock",
          "shadow_priest",
          "smite_priest",
          "elemental_shaman",
          "enhancement_shaman",
        ]
      : profile === "enhancement_shaman"
        ? [
            "warrior",
            "rogue",
            "hunter",
            "feral_druid",
            "balance_druid",
            "mage",
            "warlock",
            "shadow_priest",
            "smite_priest",
            "elemental_shaman",
          ]
        : profile === "elemental_shaman"
          ? [
              "warrior",
              "rogue",
              "hunter",
              "feral_druid",
              "balance_druid",
              "mage",
              "warlock",
              "shadow_priest",
              "smite_priest",
            ]
          : profile === "smite_priest"
            ? [
                "warrior",
                "rogue",
                "hunter",
                "feral_druid",
                "balance_druid",
                "mage",
                "warlock",
                "shadow_priest",
              ]
            : profile === "shadow_priest"
              ? ["warrior", "rogue", "hunter", "feral_druid", "balance_druid", "mage", "warlock"]
              : profile === "hunter"
                ? ["warrior", "rogue", "feral_druid", "balance_druid", "mage", "warlock"]
                : profile === "feral_druid"
                  ? ["warrior", "rogue", "hunter", "balance_druid", "mage", "warlock"]
                  : profile === "warlock"
                    ? ["warrior", "rogue", "hunter", "feral_druid", "mage", "balance_druid"]
                    : profile === "mage"
                      ? ["warrior", "rogue", "hunter", "balance_druid", "feral_druid"]
                      : ["warrior", "rogue", "hunter", "feral_druid", "mage"];
  requireMatch(
    expectedOtherProfiles.every((profile) =>
      evidence.otherProfiles.some((row) => row.profile === profile),
    ),
    "Profile browser approval omitted existing class regression checks",
  );
  return { manifest: candidate, sourceRelease: source.release };
}
