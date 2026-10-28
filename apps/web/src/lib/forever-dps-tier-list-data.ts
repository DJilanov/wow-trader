import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import console from "node:console";
import { cache } from "react";
import { z } from "zod";
import snapshotData from "./data/forever-dps-tier-list.json";
import currentSoloData from "./data/forever-dps-tier-list.current.solo.json";
import currentRaidData from "./data/forever-dps-tier-list.current.raid.json";
import raidSupport from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import { tierScenarioPolicy } from "../../../../infra/simulator/tier-scenarios.mjs";
import {
  dpsTierSnapshotSchema,
  type DpsTierScenario,
  type DpsTierSnapshot,
} from "./forever-dps-tier-list";
import { simulatorDirectory } from "./forever-simulator";
import { verifyTierSourceBindings } from "./forever-tier-source-bindings";
import { currentDpsTierPolicy } from "../../../../infra/simulator/current-tier-policy.mjs";

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const scenarioSources = { solo: currentSoloData, raid: currentRaidData };

export const readDpsTierScenarioSnapshot = cache(async function readDpsTierScenarioSnapshot(
  scenario: DpsTierScenario,
  directory: string = simulatorDirectory(),
  source: unknown = scenarioSources[scenario],
): Promise<DpsTierSnapshot | null> {
  const snapshot = await readDpsTierSnapshot(directory, source);
  if (!snapshot) return null;
  const expectedPolicy = {
    ...(snapshot.sourceBindings
      ? currentDpsTierPolicy(scenario, raidSupport, snapshotData.policy.encounter)
      : {
          ...tierScenarioPolicy(scenario, raidSupport),
          encounter: snapshotData.policy.encounter,
          playerEquipmentTalentsRaceConsumes: "retained from each published reviewed build",
        }),
  };
  if (
    snapshot.policy.scenario !== scenario ||
    hash(JSON.stringify(expectedPolicy)) !== snapshot.policySha256
  ) {
    console.warn("[simulator] DPS scenario policy is unavailable", scenario);
    return null;
  }
  return snapshot;
});
const pointerSchema = z
  .object({
    schema: z.literal("kfc-published-simulator-reviews.v1"),
    profiles: z.record(
      z.string(),
      z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
    ),
  })
  .strict();
const publicationSchema = z
  .object({
    profile: z.string(),
    presentationRelease: z.string(),
    builds: z.array(
      z
        .object({ id: z.string(), href: z.string(), requiresProvisionalEnchantOptIn: z.boolean() })
        .passthrough(),
    ),
  })
  .passthrough();

export async function readDpsTierSnapshot(
  directory: string = simulatorDirectory(),
  source: unknown = snapshotData,
): Promise<DpsTierSnapshot | null> {
  try {
    const snapshot = dpsTierSnapshotSchema.parse(source);
    // Schema parsing can reorder object keys; authenticate the producer's policy bytes.
    const rawPolicy = z.object({ policy: z.unknown() }).parse(source).policy;
    if (hash(JSON.stringify(rawPolicy)) !== snapshot.policySha256)
      throw new Error("Tier benchmark policy changed");
    if (snapshot.sourceBindings) {
      await verifyTierSourceBindings(directory, snapshot.sourceBindings);
      if (
        snapshot.entries.length !== 25 ||
        new Set(snapshot.entries.map((entry) => entry.profile)).size !== 12
      )
        throw new Error("Current DPS tier coverage is incomplete");
      const publications = snapshot.sourcePublications;
      if (!publications || Object.keys(publications).length !== 12)
        throw new Error("Current DPS publications are incomplete");
      for (const [profile, reference] of Object.entries(publications)) {
        const bound = snapshot.sourceBindings.find((entry) => entry.path === reference.path);
        if (!bound || bound.sha256 !== reference.sha256)
          throw new Error("Current DPS publication is not bound");
        const bytes = await readFile(join(directory, reference.path));
        if (hash(bytes.toString("utf8")) !== reference.sha256)
          throw new Error("Current DPS publication changed");
        const publication = z
          .object({
            profile: z.string(),
            release: z.string().optional(),
            presentationRelease: z.string().optional(),
            builds: z.array(
              z
                .object({
                  id: z.string(),
                  href: z.string(),
                  requiresProvisionalEnchantOptIn: z.boolean(),
                })
                .passthrough(),
            ),
          })
          .passthrough()
          .parse(JSON.parse(bytes.toString("utf8")));
        const entries = snapshot.entries.filter((entry) => entry.profile === profile),
          builds = publication.builds.filter((build) => !build.requiresProvisionalEnchantOptIn);
        if (publication.profile !== profile || entries.length !== builds.length)
          throw new Error("Current DPS build coverage changed");
        for (const entry of entries) {
          const build = builds.find((build) => build.id === entry.id);
          if (
            !build ||
            entry.publicationSha256 !== reference.sha256 ||
            (publication.release ?? publication.presentationRelease) !== entry.release ||
            hash(build.href) !== entry.originalHrefSha256 ||
            !snapshot.sourceBindings.some(
              (binding) => binding.path === entry.release + "/manifest.json",
            )
          )
            throw new Error("Current DPS result differs from its admitted build");
        }
      }
      return snapshot;
    }
    const pointer = pointerSchema.parse(
      JSON.parse(await readFile(join(directory, "published-reviews.json"), "utf8")),
    );
    const groups = new Map<string, DpsTierSnapshot["entries"]>();
    for (const entry of snapshot.entries)
      groups.set(entry.profile, [...(groups.get(entry.profile) ?? []), entry]);
    if (groups.size !== Object.keys(pointer.profiles).length)
      throw new Error("Tier profile coverage changed");
    for (const [profile, entries] of groups) {
      const reference = pointer.profiles[profile];
      if (
        !reference ||
        reference.path !== `published-reviews/${profile}-${reference.sha256.slice(0, 16)}.json`
      )
        throw new Error("Tier publication is unavailable");
      const raw: unknown = JSON.parse(await readFile(join(directory, reference.path), "utf8"));
      const publication = publicationSchema.parse(raw);
      if (hash(JSON.stringify(raw)) !== reference.sha256 || publication.profile !== profile)
        throw new Error("Tier publication checksum changed");
      const standard = publication.builds.filter(
        (entry): boolean => !entry.requiresProvisionalEnchantOptIn,
      );
      if (standard.length !== entries.length) throw new Error("Tier build coverage changed");
      for (const entry of entries) {
        const build = standard.find((build): boolean => build.id === entry.id);
        if (
          reference.sha256 !== entry.publicationSha256 ||
          publication.presentationRelease !== entry.release ||
          !build ||
          hash(build.href) !== entry.originalHrefSha256
        )
          throw new Error("Tier benchmark needs a new measurement");
      }
    }
    return snapshot;
  } catch (error: unknown) {
    console.warn(
      "[simulator] DPS tier list unavailable",
      error instanceof Error ? error.message : "Unknown error",
    );
    return null;
  }
}
