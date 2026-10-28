import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { SIMULATOR_SPECS } from "../packages/forever-data/src/simulator.js";
import { normalizeHealerLibrary } from "../packages/forever-data/src/healer-workspace.js";
import { paladinHealerJobForFrameConfiguration } from "../packages/forever-data/src/paladin-healer-frame.js";
import { configurationForPaladinHealerFrame } from "../packages/forever-data/src/paladin-healer-workspace.js";
import { configurationForShamanHealerBuild } from "../packages/forever-data/src/shaman-healer-workspace.js";
import { readSimulatorPresentation } from "../apps/web/src/lib/forever-simulator-presentation.js";
import { readPublishedSimulatorReviews } from "../apps/web/src/lib/forever-simulator-published-reviews.js";
import { captureTierSourceBindings } from "../apps/web/src/lib/forever-tier-source-bindings.js";
import {
  readHealerRelease,
  readHealerLibrary,
  readDruidHealerRelease,
  readDruidHealerLibrary,
} from "../apps/web/src/lib/healer-simulator.js";
import {
  configurationForHealerBuild,
  healerWorkloadForConfiguration,
  encodeHealerConfiguration,
} from "../apps/web/src/lib/healer-configuration.js";
import { encodeShamanConfiguration } from "../apps/web/src/lib/shaman-healer-configuration.js";
import { encodePaladinFrameConfiguration } from "../apps/web/src/lib/paladin-healer-frame-configuration.js";
import {
  readShamanHealerRelease,
  readShamanHealerIndex,
  readShamanHealerGroup,
} from "../apps/web/src/lib/shaman-healer-simulator.js";
import {
  readPaladinHealerFrameRelease,
  readPaladinHealerFrameLibrary,
  readPaladinHealerFrame,
} from "../apps/web/src/lib/paladin-healer-frame-simulator.js";

const { values } = parseArgs({
  options: { "artifact-root": { type: "string" }, output: { type: "string" } },
  strict: true,
});
assert(values["artifact-root"] && values.output, "Choose --artifact-root and --output");
const root = resolve(values["artifact-root"]);
const heads = [
  "active.json",
  "model-update.json",
  "presentation.json",
  "profile-model-updates.json",
  "published-reviews.json",
  "preset-safety.json",
  "qualified-combat-models.json",
  "qualified-dps-models.json",
  "qualified-warrior-tank-model.json",
  "qualified-tank-model.json",
  "qualified-paladin-tank-model.json",
];
const before = await captureTierSourceBindings(root, heads);
const combat = [];
for (const spec of SIMULATOR_SPECS) {
  if (spec.role !== "damage" && spec.role !== "tank") continue;
  const presentation = await readSimulatorPresentation(spec.page, root);
  assert(presentation?.kind === "reviewed-presets", spec.page + " has no admitted presentation");
  const builds = (await readPublishedSimulatorReviews(presentation, spec.page, root)).filter(
    (build) => !build.requiresProvisionalEnchantOptIn,
  );
  assert(builds.length, spec.page + " has no current builds");
  const file =
    spec.role === "tank" ? "kfc-qualified-tank-model.json" : "kfc-qualified-combat-model.json";
  let publicationPath: string;
  if (presentation.manifest.files[file])
    publicationPath = presentation.manifest.release + "/" + file;
  else {
    const pointer = JSON.parse(await readFile(join(root, "published-reviews.json"), "utf8")) as {
      profiles: Record<string, { path: string }>;
    };
    publicationPath = pointer.profiles[spec.page]!.path;
  }
  const [publication] = await captureTierSourceBindings(root, [publicationPath]);
  assert(publication);
  combat.push({
    profile: spec.page,
    slug: spec.slug,
    role: spec.role,
    manifest: presentation.manifest,
    builds,
    publication,
  });
}
assert.equal(combat.length, 15);
const healers: unknown[] = [];
for (const profile of ["healing-priest", "healing-druid"] as const) {
  const directory = join(root, "healing", ...(profile === "healing-priest" ? [] : [profile]));
  const manifest =
    profile === "healing-priest"
      ? await readHealerRelease(directory)
      : await readDruidHealerRelease(directory);
  assert(manifest);
  const raw =
    manifest.profile === "healing-priest"
      ? await readHealerLibrary(manifest, directory)
      : await readDruidHealerLibrary(manifest, directory);
  const library = normalizeHealerLibrary(raw);
  const builds = library.builds
    .filter((build) => build.durationSeconds === 180 && build.layout === "stacked")
    .map((build) => {
      const config = configurationForHealerBuild(library, build);
      config.policyId = profile === "healing-priest" ? "unscaled-reference" : "current-equip";
      return {
        id: build.id,
        title: build.title,
        assignment: build.assignment,
        archetype: build.archetype,
        job: {
          schema: profile === "healing-priest" ? "kfc-healing-job.v1" : "kfc-druid-healing-job.v1",
          id: "tier-" + build.id,
          requestBase64: build.requestBase64,
          workload: healerWorkloadForConfiguration(library, config),
          detail: false,
        },
        href: `/forever/simulator/${profile}?release=${manifest.release}&build=${encodeHealerConfiguration(config)}`,
        codecInput: {
          requestBase64: build.requestBase64,
          gear: config.gear,
          talentsString: build.talentsString,
          race: config.race,
          consumes: config.consumes,
          workload: healerWorkloadForConfiguration(library, config),
        },
      };
    });
  healers.push({ profile, relativeDirectory: relativeHealer(profile), manifest, builds });
}
function relativeHealer(profile: string): string {
  return "healing" + (profile === "healing-priest" ? "" : "/" + profile);
}
{
  const profile = "healing-shaman",
    directory = join(root, relativeHealer(profile));
  const manifest = await readShamanHealerRelease(directory);
  assert(manifest);
  const index = await readShamanHealerIndex(manifest, directory);
  const preferred = index.groups.find((entry) => entry.group.id === index.defaultGroupId);
  assert(preferred);
  const builds = [];
  for (const entry of index.groups.filter(
    (entry) =>
      entry.group.race === preferred.group.race &&
      entry.group.profileId === preferred.group.profileId,
  )) {
    const payload = await readShamanHealerGroup(manifest, index, entry.group.id, directory);
    const selected = payload.configurations.find(
      (entry) => entry.scenarioId === "unscaled-reference.per-five-reference",
    );
    assert(selected);
    const config = configurationForShamanHealerBuild(index, payload, manifest.release, selected.id);
    builds.push({
      id: payload.group.id,
      title: payload.group.title,
      assignment: payload.group.assignment,
      archetype: payload.group.archetype,
      job: selected.job,
      href: `/forever/simulator/${profile}?release=${manifest.release}&build=${encodeShamanConfiguration(config)}`,
    });
  }
  healers.push({ profile, relativeDirectory: relativeHealer(profile), manifest, builds });
}
{
  const profile = "healing-paladin",
    directory = join(root, relativeHealer(profile));
  const manifest = await readPaladinHealerFrameRelease(directory);
  assert(manifest?.status === "published");
  const { index } = await readPaladinHealerFrameLibrary(manifest, directory);
  const preferred = index.frames.find((entry) => entry.frame.id === index.defaultFrameId);
  assert(preferred);
  const builds = [];
  for (const entry of index.frames.filter(
    (entry) =>
      entry.frame.profileId === preferred.frame.profileId &&
      entry.frame.variant.durationSeconds === 180 &&
      entry.frame.variant.layout === "stacked",
  )) {
    const payload = await readPaladinHealerFrame(manifest, index, entry.frame.id, directory);
    const config = configurationForPaladinHealerFrame(payload, manifest.release);
    builds.push({
      id: payload.frame.id,
      title: payload.frame.archetype.replaceAll("-", " "),
      assignment: payload.frame.assignment,
      archetype: payload.frame.archetype,
      job: paladinHealerJobForFrameConfiguration(payload),
      href: `/forever/simulator/${profile}?release=${manifest.release}&build=${encodePaladinFrameConfiguration(config)}`,
    });
  }
  healers.push({ profile, relativeDirectory: relativeHealer(profile), manifest, builds });
}
const after = await captureTierSourceBindings(root, heads);
assert.deepEqual(after, before, "Selections changed while preparing tier inputs");
const bindings = await captureTierSourceBindings(root, [
  ...heads,
  ...["healing-priest", "healing-druid", "healing-shaman", "healing-paladin"].map(
    (profile) => relativeHealer(profile) + "/active.json",
  ),
  ...combat.map((entry) => entry.manifest.release + "/manifest.json"),
  ...combat.map((entry) => entry.publication.path),
]);
await writeFile(
  resolve(values.output),
  JSON.stringify(
    {
      schema: "kfc-current-tier-inputs.v1",
      preparedAt: new Date().toISOString(),
      root,
      sourceBindings: bindings,
      combat,
      healers,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx", mode: 0o600 },
);
console.log(
  JSON.stringify({
    combatProfiles: combat.length,
    combatBuilds: combat.reduce((sum, entry) => sum + entry.builds.length, 0),
    healers: healers.length,
    output: values.output,
  }),
);
