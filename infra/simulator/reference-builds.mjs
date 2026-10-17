import { createHash } from "node:crypto";
import { talentsFromFields, decodeTalents, talentProblem } from "./talent-search.mjs";

export const referenceEngineRevision = "5af130344b6fb5150a5b3a2295f26d20adee625d";
export const referenceTargets = [
  {
    id: "7ade8650-c6b1-44a3-b72c-71ded01b080e",
    key: "fury",
    sourceSpec: "warrior",
    profile: "warrior",
    variant: "fury",
    className: "warrior",
  },
  {
    id: "ce50ecc4-769c-4493-a3de-97e7a613df42",
    key: "arms",
    sourceSpec: "arms-warrior",
    profile: "warrior",
    variant: "arms",
    className: "warrior",
  },
  {
    id: "c528b8d7-3266-4393-9f8e-3fd06d111907",
    key: "shockadin",
    sourceSpec: "shockadin-paladin",
    profile: "retribution_paladin",
    variant: "shockadin",
    className: "paladin",
  },
  {
    id: "58097a04-18fc-4fe0-b7be-883ed9667400",
    key: "survival",
    sourceSpec: "survival-hunter",
    profile: "hunter",
    variant: "survival",
    className: "hunter",
  },
];
export const referenceTreeHash = (trees) =>
  createHash("sha256").update(JSON.stringify(trees)).digest("hex");

export function importReferenceBuild(snapshot, target, trees, admittedIds, responseSha256) {
  if (
    !snapshot ||
    snapshot.id !== target.id ||
    snapshot.specSlug !== target.sourceSpec ||
    snapshot.engineSha !== referenceEngineRevision ||
    !/^[a-f0-9]{64}$/.test(responseSha256)
  )
    throw new Error("Reference snapshot identity/version mismatch");
  const sourceTrees = snapshot.detail?.forever_talents?.trees;
  if (
    !Array.isArray(sourceTrees) ||
    sourceTrees.length !== trees.length ||
    !Array.isArray(snapshot.gear) ||
    snapshot.gear.length > 17
  )
    throw new Error("Invalid reference build shape");
  const fields = {};
  for (const [index, tree] of sourceTrees.entries()) {
    if (tree.name !== trees[index].name || !Array.isArray(tree.nodes))
      throw new Error("Reference talent tree changed");
    let spent = 0;
    for (const node of tree.nodes) {
      if (
        !node ||
        typeof node.key !== "string" ||
        !Number.isInteger(node.rank) ||
        node.rank < 1 ||
        !Number.isInteger(node.max_rank)
      )
        throw new Error("Invalid reference talent node");
      // The two forks differ only in the capital H for this same game talent.
      const field =
        node.key === "twohandedWeaponSpecialization" ? "twoHandedWeaponSpecialization" : node.key;
      const local = trees[index].talents.find((talent) => talent.fieldName === field);
      if (!local || local.maxPoints !== node.max_rank || Object.hasOwn(fields, field))
        throw new Error(`Reference talent mismatch: ${field}`);
      fields[field] = node.rank;
      spent += node.rank;
    }
    if (spent !== tree.points) throw new Error("Reference tree total mismatch");
  }
  const talentsString = talentsFromFields(trees, fields);
  const sourceString = snapshot.detail.forever_talents.loadout_string;
  if (talentProblem(trees, decodeTalents(trees, sourceString)) || talentsString !== sourceString)
    throw new Error("Reference talent encoding disagrees with semantic ranks");
  const gearReference = snapshot.gear.map((item) => {
    if (
      !Number.isInteger(item.id) ||
      item.id <= 0 ||
      !Number.isInteger(item.enchant) ||
      item.enchant < 0 ||
      item.randomSuffix
    )
      throw new Error("Invalid reference equipment identity");
    return { id: item.id, originalEnchant: item.enchant };
  });
  const settings = snapshot.detail.forever_advanced?.settings;
  if (
    !settings ||
    !Number.isFinite(settings.duration) ||
    !Number.isInteger(settings.target_level) ||
    typeof settings.rotation_id !== "string"
  )
    throw new Error("Reference encounter assumptions missing");
  return {
    id: target.key,
    profile: target.profile,
    variant: target.variant,
    name: `MythicSim ${target.key} ${sourceTrees.map((tree) => tree.points).join("/")}`,
    source: `https://mythicsim.com/wow-forever/tier-list/sims/${target.id}`,
    sourceResponseSha256: responseSha256,
    sourceEngineRevision: snapshot.engineSha,
    generatedAt: snapshot.generatedAt,
    treeSha256: referenceTreeHash(trees),
    talentsString,
    fields,
    treePoints: sourceTrees.map((tree) => tree.points),
    sourceEncounter: {
      duration: settings.duration,
      variation: settings.duration_variation,
      targetLevel: settings.target_level,
      targetCount: settings.target_count,
      rotationId: settings.rotation_id,
    },
    gearReference,
    unavailableGearIds: [
      ...new Set(gearReference.filter((item) => !admittedIds.has(item.id)).map((item) => item.id)),
    ],
    gearImport: "reference-only-not-admitted",
    rotationImport: "not-ported",
    status: "talent-search-seed-not-a-recommendation",
  };
}

export function referenceTalentSeeds(archive, profile, variant, trees, expectedRevision) {
  if (
    archive.schema !== "kfc-simulator-reference-builds.v1" ||
    archive.targetRevision !== expectedRevision ||
    !Array.isArray(archive.builds)
  )
    throw new Error("Reference archive version mismatch");
  const selected = archive.builds.filter(
    (build) => build.profile === profile && build.variant === variant,
  );
  for (const build of selected) {
    if (
      build.treeSha256 !== referenceTreeHash(trees) ||
      build.status !== "talent-search-seed-not-a-recommendation" ||
      talentsFromFields(trees, build.fields) !== build.talentsString
    )
      throw new Error(`Stale or invalid reference build ${build.id}`);
  }
  return selected;
}
