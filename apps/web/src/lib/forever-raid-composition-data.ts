import { cache } from "react";
import { z } from "zod";
import supportRegistry from "./data/forever-raid-support.v1.json";
import damageMetricsData from "./data/forever-raid-composition-metrics.json";
import incomingData from "./data/forever-raid-tank-incoming.json";
import { readDpsTierScenarioSnapshot } from "./forever-dps-tier-list-data";
import { rankDpsTierEntries } from "./forever-dps-tier-list";
import { readTankTierSnapshot } from "./forever-tank-tier-list-data";
import { readHealerTierSnapshot } from "./forever-healer-tier-list-data";
import { dpsTierArtwork } from "./forever-dps-tier-artwork";
import {
  COMPOSITION_REVISION,
  type CompositionCatalog,
  type CompositionClass,
  type CompositionProfile,
  type CompositionReference,
  type CompositionRole,
  type DamageType,
  type TankIncomingModel,
} from "./forever-raid-composition";

const damageMetrics = z
  .object({
    schema: z.literal("kfc-forever-composition-metrics.v1"),
    scenario: z.literal("raid"),
    policySha256: z.string().regex(/^[a-f0-9]{64}$/),
    durationSeconds: z.literal(300),
    codecSha256: z.string().regex(/^[a-f0-9]{64}$/),
    entries: z.array(
      z
        .object({
          id: z.string(),
          dps: z.number().finite().positive(),
          threatPerSecond: z.number().finite().nonnegative(),
          petThreatPerSecond: z.number().finite().nonnegative(),
          requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
          responseSha256: z.string().regex(/^[a-f0-9]{64}$/),
          capturedAt: z.string().datetime(),
        })
        .strict(),
    ),
  })
  .strict()
  .parse(damageMetricsData);
const incomingModels = z
  .object({
    schema: z.literal("kfc-forever-composition-incoming.v1"),
    scenario: z.literal("raid"),
    policySha256: z.string().regex(/^[a-f0-9]{64}$/),
    entries: z
      .array(
        z
          .object({
            id: z.string(),
            release: z.string().regex(/^[a-f0-9]{24}$/),
            objective: z.literal("mitigation"),
            capturedAt: z.string().datetime(),
            manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
            proofSha256: z.string().regex(/^[a-f0-9]{64}$/),
            settingsSha256: z.string().regex(/^[a-f0-9]{64}$/),
            requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
            responseSha256: z.string().regex(/^[a-f0-9]{64}$/),
            dps: z.number().finite().nonnegative(),
            tps: z.number().finite().nonnegative(),
            dtps: z.number().finite().nonnegative(),
            health: z.number().finite().positive(),
            armor: z.number().finite().nonnegative(),
            rawDps: z.number().finite().positive(),
            swingSeconds: z.number().finite().positive(),
            outcomes: z
              .array(
                z
                  .object({
                    kind: z.string(),
                    probability: z.number().finite().min(0).max(1),
                    damage: z.number().finite().nonnegative(),
                  })
                  .strict(),
              )
              .min(1)
              .max(10),
          })
          .strict(),
      )
      .length(3),
  })
  .strict()
  .parse(incomingData);

const providers = z
  .array(
    z
      .object({
        classSlug: z.enum([
          "warrior",
          "paladin",
          "hunter",
          "rogue",
          "priest",
          "shaman",
          "mage",
          "warlock",
          "druid",
        ]),
        profiles: z.array(z.string()).optional(),
        capabilities: z.array(z.string()),
      })
      .strict(),
  )
  .parse(supportRegistry.providers);
if (supportRegistry.revision !== COMPOSITION_REVISION)
  throw new Error("Composition capability revision differs from its rules.");

export function profileCapabilities(classSlug: CompositionClass, id: string): readonly string[] {
  return [
    ...new Set(
      providers
        .filter(
          (provider) =>
            provider.classSlug === classSlug &&
            (!provider.profiles || provider.profiles.includes(id)),
        )
        .flatMap((provider) => provider.capabilities),
    ),
  ];
}

const foundation: readonly {
  id: string;
  name: string;
  classSlug: CompositionClass;
  role: CompositionRole;
  damageType: DamageType;
}[] = [
  {
    id: "tank-warrior",
    name: "Protection",
    classSlug: "warrior",
    role: "tank",
    damageType: "melee",
  },
  {
    id: "tank-druid",
    name: "Feral Bear",
    classSlug: "druid",
    role: "tank",
    damageType: "melee",
  },
  {
    id: "tank-paladin",
    name: "Protection",
    classSlug: "paladin",
    role: "tank",
    damageType: "melee",
  },
  {
    id: "heal-priest",
    name: "Holy / Discipline",
    classSlug: "priest",
    role: "healer",
    damageType: "caster",
  },
  {
    id: "heal-paladin",
    name: "Holy",
    classSlug: "paladin",
    role: "healer",
    damageType: "caster",
  },
  {
    id: "heal-shaman",
    name: "Restoration",
    classSlug: "shaman",
    role: "healer",
    damageType: "caster",
  },
  {
    id: "heal-druid",
    name: "Restoration",
    classSlug: "druid",
    role: "healer",
    damageType: "caster",
  },
];
const damageDefinitions: readonly {
  id: string;
  name: string;
  classSlug: CompositionClass;
  damageType: DamageType;
  profile: string;
}[] = [
  {
    id: "fury-standard",
    name: "Fury",
    classSlug: "warrior",
    damageType: "melee",
    profile: "warrior",
  },
  {
    id: "arms-standard",
    name: "Arms",
    classSlug: "warrior",
    damageType: "melee",
    profile: "warrior",
  },
  {
    id: "two-hand-fury",
    name: "Two-handed Fury",
    classSlug: "warrior",
    damageType: "melee",
    profile: "warrior",
  },
  {
    id: "paladin-retribution-static",
    name: "Retribution",
    classSlug: "paladin",
    damageType: "melee",
    profile: "retribution-paladin",
  },
  {
    id: "paladin-shockadin-static",
    name: "Shockadin",
    classSlug: "paladin",
    damageType: "caster",
    profile: "retribution-paladin",
  },
  {
    id: "hunter-marksmanship-static",
    name: "Marksmanship",
    classSlug: "hunter",
    damageType: "ranged",
    profile: "hunter",
  },
  {
    id: "hunter-beast-mastery-static",
    name: "Beast Mastery",
    classSlug: "hunter",
    damageType: "ranged",
    profile: "hunter",
  },
  {
    id: "hunter-survival-static",
    name: "Survival",
    classSlug: "hunter",
    damageType: "ranged",
    profile: "hunter",
  },
  {
    id: "rogue-combat-static",
    name: "Combat",
    classSlug: "rogue",
    damageType: "melee",
    profile: "rogue",
  },
  {
    id: "rogue-mutilate-static",
    name: "Mutilate",
    classSlug: "rogue",
    damageType: "melee",
    profile: "rogue",
  },
  {
    id: "rogue-subtlety-static",
    name: "Subtlety",
    classSlug: "rogue",
    damageType: "melee",
    profile: "rogue",
  },
  {
    id: "priest-shadow-static",
    name: "Shadow",
    classSlug: "priest",
    damageType: "caster",
    profile: "shadow-priest",
  },
  {
    id: "priest-smite-static",
    name: "Smite",
    classSlug: "priest",
    damageType: "caster",
    profile: "smite-priest",
  },
  {
    id: "shaman-enhancement-static",
    name: "Enhancement",
    classSlug: "shaman",
    damageType: "melee",
    profile: "enhancement-shaman",
  },
  {
    id: "shaman-elemental-static",
    name: "Elemental",
    classSlug: "shaman",
    damageType: "caster",
    profile: "elemental-shaman",
  },
  {
    id: "shaman-stormcaller-static",
    name: "Stormcaller",
    classSlug: "shaman",
    damageType: "caster",
    profile: "elemental-shaman",
  },
  {
    id: "mage-arcane-static",
    name: "Arcane",
    classSlug: "mage",
    damageType: "caster",
    profile: "mage",
  },
  {
    id: "mage-fire-static",
    name: "Fire",
    classSlug: "mage",
    damageType: "caster",
    profile: "mage",
  },
  {
    id: "mage-frost-static",
    name: "Frost",
    classSlug: "mage",
    damageType: "caster",
    profile: "mage",
  },
  {
    id: "warlock-demonology-static",
    name: "Demonology",
    classSlug: "warlock",
    damageType: "caster",
    profile: "warlock",
  },
  {
    id: "warlock-affliction-static",
    name: "Affliction",
    classSlug: "warlock",
    damageType: "caster",
    profile: "warlock",
  },
  {
    id: "warlock-destruction-static",
    name: "Destruction",
    classSlug: "warlock",
    damageType: "caster",
    profile: "warlock",
  },
  {
    id: "warlock-ds-ruin-static",
    name: "DS / Ruin",
    classSlug: "warlock",
    damageType: "caster",
    profile: "warlock",
  },
  {
    id: "balance-static",
    name: "Balance",
    classSlug: "druid",
    damageType: "caster",
    profile: "balance-druid",
  },
  {
    id: "feral-cat-static",
    name: "Feral Cat",
    classSlug: "druid",
    damageType: "melee",
    profile: "feral-druid",
  },
];
export const readCompositionCatalog = cache(
  async function readCompositionCatalog(): Promise<CompositionCatalog> {
    const [damage, tanks, healers] = await Promise.all([
      readDpsTierScenarioSnapshot("raid"),
      readTankTierSnapshot("raid"),
      readHealerTierSnapshot(),
    ]);
    const ranked = damage ? rankDpsTierEntries(damage) : [];
    const profiles: CompositionProfile[] = damageDefinitions.map((definition) => {
      const entry = ranked.find((build) => build.id === definition.id);
      const threat =
        damage?.policySha256 === damageMetrics.policySha256
          ? damageMetrics.entries.find(
              (metric) =>
                metric.id === entry?.id &&
                metric.requestSha256 === entry.requestSha256 &&
                metric.responseSha256 === entry.responseSha256 &&
                metric.dps === entry.dps &&
                metric.capturedAt === entry.capturedAt,
            )
          : undefined;
      return {
        id: definition.id,
        name: definition.name,
        classSlug: definition.classSlug,
        role: "damage",
        damageType: definition.damageType,
        icon: dpsTierArtwork(definition).specIcon,
        capabilities: profileCapabilities(definition.classSlug, definition.id),
        reference: entry
          ? {
              value: entry.dps,
              unit: "DPS",
              measuredAt: entry.capturedAt,
              href: entry.simulatorHref,
              ...(threat
                ? {
                    threatPerSecond: threat.threatPerSecond,
                    petThreatPerSecond: threat.petThreatPerSecond,
                  }
                : {}),
            }
          : null,
      };
    });
    for (const definition of foundation) {
      let reference: CompositionReference | null = null;
      let maximumThreat: CompositionProfile["maximumThreat"];
      let incoming: TankIncomingModel | undefined;
      let tankHealing: CompositionProfile["tankHealing"];
      if (definition.role === "tank") {
        const tankId =
          definition.classSlug === "warrior"
            ? "tank-warrior"
            : definition.classSlug === "druid"
              ? "feral-tank-druid"
              : "protection-paladin";
        const entry = tanks?.entries.find(
          (row) => row.id === tankId && "objective" in row && row.objective === "mitigation",
        );
        if (entry)
          reference = {
            value: entry.metrics.dps.avg,
            unit: "DPS",
            measuredAt: entry.capturedAt,
            href: `/forever/simulator/${entry.id}?build=${entry.id}-raid-mitigation`,
            threatPerSecond: entry.metrics.threat.avg,
          };
        const observed =
          tanks?.policySha256 === incomingModels.policySha256 &&
          entry &&
          "proofSha256" in entry &&
          "settingsSha256" in entry &&
          "health" in entry &&
          "armor" in entry
            ? incomingModels.entries.find(
                (model) =>
                  model.id === entry.id &&
                  model.release === entry.release &&
                  model.manifestSha256 === entry.manifestSha256 &&
                  model.proofSha256 === entry.proofSha256 &&
                  model.settingsSha256 === entry.settingsSha256 &&
                  model.capturedAt === entry.capturedAt &&
                  model.dps === entry.metrics.dps.avg &&
                  model.tps === entry.metrics.threat.avg &&
                  model.dtps === entry.metrics.dtps.avg &&
                  model.health === entry.health &&
                  model.armor === entry.armor,
              )
            : undefined;
        if (observed)
          incoming = {
            health: observed.health,
            armor: observed.armor,
            dtps: observed.dtps,
            rawDps: observed.rawDps,
            swingSeconds: observed.swingSeconds,
            outcomes: observed.outcomes,
          };
        const threatEntry = tanks?.entries.find(
          (row) => row.id === tankId && "objective" in row && row.objective === "threat",
        );
        if (threatEntry)
          maximumThreat = {
            threatPerSecond: threatEntry.metrics.threat.avg,
            damagePerSecond: threatEntry.metrics.dps.avg,
            measuredAt: threatEntry.capturedAt,
            href: `/forever/simulator/${threatEntry.id}?build=${threatEntry.id}-raid-threat`,
          };
      } else {
        const tankEntry = healers?.entries
          .filter(
            (row) => row.profile === `healing-${definition.classSlug}` && row.assignment === "tank",
          )
          .sort((left, right) => right.metrics.hps - left.metrics.hps)[0];
        if (tankEntry)
          tankHealing = {
            hps: tankEntry.metrics.hps,
            href: tankEntry.simulatorHref,
            measuredAt: tankEntry.proofs[0]!.capturedAt,
          };
        const entry = healers?.entries
          .filter(
            (row) =>
              row.profile === `healing-${definition.classSlug}` &&
              row.assignment === "group" &&
              row.metrics.survivalRate >= 0.99,
          )
          .sort((left, right) => right.metrics.hps - left.metrics.hps)[0];
        if (entry)
          reference = {
            value: entry.metrics.hps,
            unit: "useful HPS",
            measuredAt: entry.proofs[0]!.capturedAt,
            href: entry.simulatorHref,
          };
      }
      profiles.push({
        ...definition,
        icon: `/wow-assets/classes/${definition.classSlug}.jpg`,
        capabilities: profileCapabilities(definition.classSlug, definition.id),
        reference,
        ...(maximumThreat ? { maximumThreat } : {}),
        ...(incoming ? { incoming } : {}),
        ...(tankHealing ? { tankHealing } : {}),
      });
    }
    const dates = profiles.flatMap((profile) =>
      profile.reference ? [profile.reference.measuredAt] : [],
    );
    return {
      revision: COMPOSITION_REVISION,
      profiles,
      measuredAt: dates.sort().at(-1) ?? null,
      evidence: damage && tanks && healers ? "historical-reference" : "unavailable",
    };
  },
);
