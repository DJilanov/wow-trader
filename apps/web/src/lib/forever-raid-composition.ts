import { z } from "zod";

export const COMPOSITION_REVISION = "forever-2026-10-30.v1";
export const RAID_SIZES = [10, 20, 40] as const;
export type RaidSize = (typeof RAID_SIZES)[number];
export const DEFAULT_BOSS_HEALTH: Readonly<Record<RaidSize, number>> = {
  10: 1_100_000,
  20: 2_200_000,
  40: 4_000_000,
};
export const DEFAULT_BOSS_DPS: Readonly<Record<RaidSize, number>> = {
  10: 2_500,
  20: 5_000,
  40: 10_000,
};
export interface TankIncomingModel {
  readonly health: number;
  readonly armor: number;
  readonly dtps: number;
  readonly rawDps: number;
  readonly swingSeconds: number;
  readonly outcomes: readonly {
    readonly kind: string;
    readonly probability: number;
    readonly damage: number;
  }[];
}
export type CompositionRole = "tank" | "healer" | "damage";
export type CompositionClass =
  "warrior" | "paladin" | "hunter" | "rogue" | "priest" | "shaman" | "mage" | "warlock" | "druid";
export type DamageType = "melee" | "ranged" | "caster";
export interface CompositionReference {
  readonly value: number;
  readonly unit: "DPS" | "useful HPS";
  readonly measuredAt: string;
  readonly href: string;
  readonly threatPerSecond?: number;
  readonly petThreatPerSecond?: number;
}
export interface CompositionProfile {
  readonly id: string;
  readonly name: string;
  readonly classSlug: CompositionClass;
  readonly role: CompositionRole;
  readonly damageType: DamageType;
  readonly icon: string;
  readonly capabilities: readonly string[];
  readonly reference: CompositionReference | null;
  readonly maximumThreat?: {
    readonly threatPerSecond: number;
    readonly damagePerSecond: number;
    readonly measuredAt: string;
    readonly href: string;
  };
  readonly incoming?: TankIncomingModel;
  readonly tankHealing?: {
    readonly hps: number;
    readonly href: string;
    readonly measuredAt: string;
  };
}
export interface CompositionCatalog {
  readonly revision: typeof COMPOSITION_REVISION;
  readonly profiles: readonly CompositionProfile[];
  readonly measuredAt: string | null;
  readonly evidence: "historical-reference" | "unavailable";
}
export interface CompositionMainTank {
  readonly seat: number;
  readonly profile: CompositionProfile;
}
export const COVERAGE_REQUIREMENTS = [
  {
    id: "crit",
    label: "Shared 3% crit",
    description:
      "A planned Bear, Cat or Moonkin aura. One shared category is assumed; the October 30 stacking behavior still needs verification.",
  },
  {
    id: "totems",
    label: "Strength · Grace · Windfury",
    description:
      "Assign a Shaman to the raid-wide offensive totems. Verify talent improvements, range and weapon-imbue compatibility in the actual builds.",
  },
  {
    id: "kings",
    label: "Blessing of Kings",
    description:
      "One Paladin assigned Kings. Each recipient can receive only one Blessing from each Paladin.",
  },
  {
    id: "primary-blessing",
    label: "Second Paladin blessing",
    description:
      "A second Paladin can maintain Might for melee or Wisdom for casters alongside Kings. Hybrids need a third Paladin to receive all three.",
  },
  {
    id: "fortitude",
    label: "Fortitude · Divine Spirit",
    description: "A Priest maintains the baseline health and Spirit buffs.",
  },
  {
    id: "intellect",
    label: "Arcane Brilliance",
    description: "A Mage supplies the raid's Intellect buff.",
  },
  {
    id: "magic-curse",
    label: "Magic vulnerability",
    description:
      "One Warlock assigned Curse of the Elements; only one Curse per Warlock per target.",
  },
  {
    id: "armor-curse",
    label: "Curse of Recklessness",
    description:
      "When magic vulnerability is also required, assign a second Warlock to the armor curse.",
  },
  {
    id: "trueshot",
    label: "Trueshot Aura",
    description:
      "A planned Marksmanship build supplies ranged attack power. It does not grant melee attack power.",
  },
] as const;
export type CoverageId = (typeof COVERAGE_REQUIREMENTS)[number]["id"];
export const DEFAULT_COVERAGE: readonly CoverageId[] = COVERAGE_REQUIREMENTS.map((rule) => rule.id);
const coverageIds = COVERAGE_REQUIREMENTS.map((rule) => rule.id) as [CoverageId, ...CoverageId[]];
const seatSchema = z
  .object({
    profileId: z.string().regex(/^[a-z0-9-]{1,100}$/),
    locked: z.boolean(),
    trashProfileId: z.literal("tank-paladin").optional(),
  })
  .strict()
  .superRefine((seat, context): void => {
    if (seat.trashProfileId && seat.profileId !== "paladin-retribution-static")
      context.addIssue({
        code: "custom",
        message: "Protection on trash requires a Retribution Paladin boss build.",
      });
  });
export const compositionDraftSchema = z
  .object({
    version: z.literal(1),
    revision: z.literal(COMPOSITION_REVISION),
    size: z.union([z.literal(10), z.literal(20), z.literal(40)]),
    tanks: z.number().int().min(1).max(8),
    healers: z.number().int().min(1).max(12),
    bossHealth: z.number().int().min(1_000).max(1_000_000_000).optional(),
    bossDps: z.number().int().min(0).max(1_000_000).optional(),
    mainTankSeat: z.number().int().min(0).max(39).optional(),
    tankHealingPercent: z.number().min(0).max(100).optional(),
    healingIntervalSeconds: z.number().min(0.5).max(10).optional(),
    trashPlanVersion: z.literal(1).optional(),
    required: z.array(z.enum(coverageIds)).max(COVERAGE_REQUIREMENTS.length),
    seats: z.array(seatSchema).min(10).max(40),
  })
  .strict()
  .superRefine((draft, context): void => {
    if (draft.seats.length !== draft.size || draft.tanks + draft.healers >= draft.size)
      context.addIssue({ code: "custom", message: "Raid size and role allocations disagree." });
    if (new Set(draft.required).size !== draft.required.length)
      context.addIssue({ code: "custom", message: "Duplicate support requirement." });
    if (draft.mainTankSeat !== undefined && draft.mainTankSeat >= draft.size)
      context.addIssue({ code: "custom", message: "Main tank seat is outside this raid." });
  });
export type CompositionDraft = z.infer<typeof compositionDraftSchema>;
export interface CompositionCoverage {
  readonly id: CoverageId | "warrior" | "sunder";
  readonly label: string;
  readonly state: "covered" | "planned" | "assumed" | "missing";
  readonly providerSeats: readonly number[];
  readonly beneficiarySeats: readonly number[];
  readonly description: string;
}
export interface CompositionAnalysis {
  readonly coverage: readonly CompositionCoverage[];
  readonly assignments: readonly { readonly seat: number; readonly duty: string }[];
  readonly parties: readonly {
    readonly index: number;
    readonly manaProviderSeats: readonly number[];
    readonly manaUserSeats: readonly number[];
  }[];
  readonly issues: readonly string[];
  readonly roles: Readonly<Record<CompositionRole, number>>;
  readonly trashRoles: Readonly<Record<CompositionRole, number>>;
  readonly trashSwitches: readonly {
    readonly seat: number;
    readonly bossProfileId: string;
    readonly trashProfileId: string;
  }[];
  readonly ready: boolean;
}
export interface CompositionSuggestion {
  readonly draft: CompositionDraft;
  readonly changes: readonly {
    readonly seat: number;
    readonly from: string;
    readonly to: string;
    readonly reason: string;
  }[];
  readonly error: string | null;
  readonly evaluatedStates: number;
}

export interface CompositionThroughput {
  readonly dps: number | null;
  readonly damageReferences: number;
  readonly damageSeats: number;
  readonly tps: number | null;
  readonly threatReferences: number;
  readonly petTps: number | null;
  readonly maxPlayerTps: number | null;
  readonly maxTankTps: number | null;
  readonly maxTestedTankTps: number | null;
  readonly hps: number | null;
  readonly healerReferences: number;
  readonly healerSeats: number;
}
export interface CompositionForecast {
  readonly raid: CompositionThroughput;
  readonly groups: readonly CompositionThroughput[];
  readonly bossHealth: number;
  readonly killSeconds: number | null;
}

export function compositionForecast(
  draft: CompositionDraft,
  catalog: CompositionCatalog,
): CompositionForecast {
  const profiles = compositionProfiles(catalog);
  const selected = draft.seats.map((seat) => profiles.get(seat.profileId));
  const validRate = (value: number | undefined): value is number =>
    value !== undefined && Number.isFinite(value) && value >= 0;
  const maximum = (values: readonly number[]): number | null =>
    values.length ? Math.max(...values) : null;
  const throughput = (members: typeof selected): CompositionThroughput => {
    const damage = members.flatMap((profile) =>
      profile?.role !== "healer" &&
      profile?.reference?.unit === "DPS" &&
      validRate(profile.reference.value)
        ? [profile.reference.value]
        : [],
    );
    const damageSeats = members.filter((profile) => !profile || profile.role !== "healer").length;
    const threats = members.flatMap((profile) =>
      validRate(profile?.reference?.threatPerSecond) ? [profile.reference.threatPerSecond] : [],
    );
    const pets = members.flatMap((profile) =>
      validRate(profile?.reference?.petThreatPerSecond)
        ? [profile.reference.petThreatPerSecond]
        : [],
    );
    const healing = members.flatMap((profile) =>
      profile?.role === "healer" &&
      profile.reference?.unit === "useful HPS" &&
      validRate(profile.reference.value)
        ? [profile.reference.value]
        : [],
    );
    const healerSeats = members.filter((profile) => profile?.role === "healer").length;
    return {
      dps:
        damage.length === damageSeats && damageSeats > 0
          ? damage.reduce((sum, value) => sum + value, 0)
          : null,
      damageReferences: damage.length,
      damageSeats,
      tps: threats.length ? threats.reduce((sum, value) => sum + value, 0) : null,
      threatReferences: threats.length,
      petTps: pets.length ? pets.reduce((sum, value) => sum + value, 0) : null,
      maxPlayerTps: maximum(threats),
      maxTankTps: maximum(
        members.flatMap((profile) =>
          profile?.role === "tank" && validRate(profile.reference?.threatPerSecond)
            ? [profile.reference.threatPerSecond]
            : [],
        ),
      ),
      maxTestedTankTps: maximum(
        members.flatMap((profile) =>
          profile?.role === "tank" && validRate(profile.maximumThreat?.threatPerSecond)
            ? [profile.maximumThreat.threatPerSecond]
            : [],
        ),
      ),
      hps: healing.length === healerSeats ? healing.reduce((sum, value) => sum + value, 0) : null,
      healerReferences: healing.length,
      healerSeats,
    };
  };
  const raid = throughput(selected);
  const bossHealth = draft.bossHealth ?? DEFAULT_BOSS_HEALTH[draft.size];
  return {
    raid,
    groups: Array.from({ length: draft.size / 5 }, (_, group) =>
      throughput(selected.slice(group * 5, group * 5 + 5)),
    ),
    bossHealth,
    killSeconds: raid.dps !== null && raid.dps > 0 ? bossHealth / raid.dps : null,
  };
}

export function compositionProfiles(
  catalog: CompositionCatalog,
): ReadonlyMap<string, CompositionProfile> {
  return new Map(catalog.profiles.map((profile) => [profile.id, profile]));
}
export function compositionMainTank(
  draft: CompositionDraft,
  catalog: CompositionCatalog,
): CompositionMainTank | null {
  const profiles = compositionProfiles(catalog);
  const selected =
    draft.mainTankSeat === undefined
      ? undefined
      : profiles.get(draft.seats[draft.mainTankSeat]?.profileId ?? "");
  if (selected?.role === "tank" && draft.mainTankSeat !== undefined)
    return { seat: draft.mainTankSeat, profile: selected };
  const seat = draft.seats.findIndex((member) => profiles.get(member.profileId)?.role === "tank");
  const profile = seat < 0 ? undefined : profiles.get(draft.seats[seat]!.profileId);
  return profile ? { seat, profile } : null;
}
export function validateCompositionDraft(
  input: unknown,
  catalog: CompositionCatalog,
): CompositionDraft {
  const draft = compositionDraftSchema.parse(input);
  const profiles = compositionProfiles(catalog);
  if (draft.seats.some((seat) => !profiles.has(seat.profileId)))
    throw new Error("A selected build is no longer available. Choose a current composition.");
  const initialized = initializeTrashPlan(draft);
  if (initialized.seats.some((seat) => seat.trashProfileId && !profiles.has(seat.trashProfileId)))
    throw new Error("A selected trash build is no longer available. Choose a current composition.");
  const tank = compositionMainTank(initialized, catalog);
  return tank && initialized.mainTankSeat !== tank.seat
    ? { ...initialized, mainTankSeat: tank.seat }
    : initialized;
}

function initializeTrashPlan(draft: CompositionDraft): CompositionDraft {
  // Mark the one-time default migration so a saved opt-out is never reassigned.
  if (draft.trashPlanVersion === 1) return draft;
  const existing = draft.seats.some((seat) => seat.trashProfileId);
  const index = existing
    ? -1
    : draft.seats.findIndex(
        (seat) => seat.profileId === "paladin-retribution-static" && !seat.locked,
      );
  return {
    ...draft,
    trashPlanVersion: 1,
    seats: draft.seats.map((seat, position) =>
      position === index ? { ...seat, trashProfileId: "tank-paladin" as const } : seat,
    ),
  };
}

export function setCompositionTrashTank(
  draft: CompositionDraft,
  index: number,
  enabled: boolean,
  catalog: CompositionCatalog,
): CompositionDraft {
  const seat = draft.seats[index];
  if (!seat || seat.profileId !== "paladin-retribution-static")
    throw new Error("Choose a Retribution Paladin for the Protection trash assignment.");
  if (seat.locked) throw new Error("Unlock this seat before changing its trash assignment.");
  if (enabled && !compositionProfiles(catalog).has("tank-paladin"))
    throw new Error("The Protection Paladin build is unavailable.");
  const seats = draft.seats.map((member, position) => {
    if (position !== index) return member;
    if (enabled) return { ...member, trashProfileId: "tank-paladin" as const };
    const updated = { ...member };
    delete updated.trashProfileId;
    return updated;
  });
  return { ...draft, trashPlanVersion: 1, seats };
}
export function analyzeComposition(
  draft: CompositionDraft,
  catalog: CompositionCatalog,
): CompositionAnalysis {
  const profiles = compositionProfiles(catalog);
  const members = draft.seats.map((seat) => profiles.get(seat.profileId));
  const indices = (test: (profile: CompositionProfile) => boolean): number[] =>
    members.flatMap((profile, index) => (profile && test(profile) ? [index] : []));
  const warriors = indices((profile) => profile.classSlug === "warrior");
  const tanks = warriors.filter((index) => members[index]?.role === "tank");
  const sunder = tanks[0] ?? warriors[0];
  const paladins = indices((profile) => profile.classSlug === "paladin");
  const warlocks = indices((profile) => profile.classSlug === "warlock");
  const armorFirst =
    draft.required.includes("armor-curse") && !draft.required.includes("magic-curse");
  const curseArmor = armorFirst ? warlocks.slice(0, 1) : warlocks.slice(1, 2);
  const curseMagic = armorFirst ? warlocks.slice(1, 2) : warlocks.slice(0, 1);
  const physical = indices((profile) => profile.damageType !== "caster");
  const mana = indices((profile) => !["warrior", "rogue"].includes(profile.classSlug));
  const magicDamage = indices(
    (profile) =>
      profile.role !== "healer" &&
      (profile.damageType === "caster" || ["paladin", "shaman"].includes(profile.classSlug)),
  );
  const coverage: CompositionCoverage[] = [
    {
      id: "warrior",
      label: "At least one Warrior",
      state: warriors.length ? "covered" : "missing",
      providerSeats: warriors,
      beneficiarySeats: physical,
      description: "Required in every composition. A tank or damage Warrior qualifies.",
    },
    {
      id: "sunder",
      label: "Sunder · Battle Shout",
      state: sunder === undefined ? "missing" : "planned",
      providerSeats: sunder === undefined ? [] : [sunder],
      beneficiarySeats: physical,
      description:
        "Assign this Warrior to initial stacks and refreshes. Base upkeep after stacking is about 0.5 rage/s; maintenance is not a reason to reserve a Rogue.",
    },
    ...COVERAGE_REQUIREMENTS.map((rule): CompositionCoverage => {
      const providers =
        rule.id === "kings"
          ? paladins.slice(0, 1)
          : rule.id === "primary-blessing"
            ? paladins.slice(1, 2)
            : rule.id === "magic-curse"
              ? curseMagic
              : rule.id === "armor-curse"
                ? curseArmor
                : indices((profile) => profile.capabilities.includes(rule.id));
      return {
        id: rule.id,
        label: rule.label,
        state: !providers.length ? "missing" : rule.id === "crit" ? "assumed" : "planned",
        providerSeats: providers,
        beneficiarySeats:
          rule.id === "trueshot"
            ? indices(
                (profile) => profile.classSlug === "hunter" && profile.damageType === "ranged",
              )
            : rule.id === "totems" || rule.id === "armor-curse"
              ? physical
              : rule.id === "magic-curse"
                ? magicDamage
                : rule.id === "intellect"
                  ? mana
                  : indices(() => true),
        description: rule.description,
      };
    }),
  ];
  const assignments: Array<{ seat: number; duty: string }> = [];
  if (sunder !== undefined)
    assignments.push({
      seat: sunder,
      duty: "Maintain Sunder Armor and Battle Shout; establish initial stacks before steady refreshes.",
    });
  if (paladins[0] !== undefined)
    assignments.push({
      seat: paladins[0],
      duty: "Kings for the raid; one Blessing from this Paladin per recipient.",
    });
  if (paladins[1] !== undefined)
    assignments.push({
      seat: paladins[1],
      duty: "Might for melee; Wisdom for casters, Hunters and healers.",
    });
  if (paladins[2] !== undefined)
    assignments.push({
      seat: paladins[2],
      duty: "Complete Might + Wisdom + Kings for mana-using melee, where useful.",
    });
  if (curseMagic[0] !== undefined)
    assignments.push({
      seat: curseMagic[0],
      duty: "Curse of the Elements on the priority target; replaces this Warlock's damage curse.",
    });
  if (curseArmor[0] !== undefined)
    assignments.push({
      seat: curseArmor[0],
      duty: "Curse of Recklessness on the priority target; replaces this Warlock's damage curse.",
    });
  const shaman = indices((profile) => profile.classSlug === "shaman")[0];
  if (shaman !== undefined)
    assignments.push({
      seat: shaman,
      duty: "Maintain Strength of Earth, Grace of Air and Windfury within range; verify improvements and compatible weapon imbues.",
    });
  const roles: Record<CompositionRole, number> = { tank: 0, healer: 0, damage: 0 };
  for (const profile of members) if (profile) roles[profile.role] += 1;
  const trashRoles: Record<CompositionRole, number> = { tank: 0, healer: 0, damage: 0 };
  const trashSwitches = draft.seats.flatMap((seat, index) => {
    const profile = profiles.get(seat.trashProfileId ?? seat.profileId);
    if (profile) trashRoles[profile.role] += 1;
    return seat.trashProfileId
      ? [{ seat: index, bossProfileId: seat.profileId, trashProfileId: seat.trashProfileId }]
      : [];
  });
  for (const assignment of trashSwitches)
    assignments.push({
      seat: assignment.seat,
      duty: "Protection with tank gear for trash packs; switch to Retribution for bosses. This is one player's two planned builds.",
    });
  const issues: string[] = [];
  if (members.some((profile) => !profile)) issues.push("A selected profile is unavailable.");
  if (!warriors.length) issues.push("Every raid must contain at least one Warrior.");
  if (roles.tank !== draft.tanks)
    issues.push(`Choose ${draft.tanks} tanks; currently ${roles.tank}.`);
  if (roles.healer !== draft.healers)
    issues.push(`Choose ${draft.healers} healers; currently ${roles.healer}.`);
  for (const effect of coverage)
    if (draft.required.includes(effect.id as CoverageId) && effect.state === "missing")
      issues.push(`Missing planned support: ${effect.label}.`);
  const parties = Array.from({ length: draft.size / 5 }, (_, index) => ({
    index,
    manaProviderSeats: indices((profile) => profile.classSlug === "shaman").filter(
      (seat) => Math.floor(seat / 5) === index,
    ),
    manaUserSeats: indices((profile) => !["warrior", "rogue"].includes(profile.classSlug)).filter(
      (seat) => Math.floor(seat / 5) === index,
    ),
  }));
  return {
    coverage,
    assignments,
    parties,
    issues,
    roles,
    trashRoles,
    trashSwitches,
    ready: issues.length === 0,
  };
}

export function partyManaCoverage(draft: CompositionDraft, catalog: CompositionCatalog): number {
  const profiles = compositionProfiles(catalog);
  let covered = 0;
  for (let start = 0; start < draft.size; start += 5) {
    const party = draft.seats.slice(start, start + 5).flatMap((seat) => {
      const profile = profiles.get(seat.profileId);
      return profile ? [profile] : [];
    });
    const manaUsers = party.filter(
      (profile) => !["warrior", "rogue"].includes(profile.classSlug),
    ).length;
    if (party.some((profile) => profile.capabilities.includes("mana-spring"))) covered += manaUsers;
    if (party.some((profile) => profile.capabilities.includes("party-spirit")))
      covered += manaUsers;
  }
  return covered;
}

/** Improve planned party-mana coverage without moving locks or tank assignments. */
export function arrangeCompositionParties(
  draft: CompositionDraft,
  catalog: CompositionCatalog,
): CompositionDraft {
  const profiles = compositionProfiles(catalog);
  let best = draft;
  for (let pass = 0; pass < draft.size; pass += 1) {
    let bestScore = partyManaCoverage(best, catalog),
      improved: CompositionDraft | null = null;
    for (let from = 0; from < draft.size; from += 1) {
      if (
        best.seats[from]!.locked ||
        best.seats[from]!.trashProfileId ||
        profiles.get(best.seats[from]!.profileId)?.role === "tank"
      )
        continue;
      for (let to = from + 1; to < draft.size; to += 1) {
        if (
          Math.floor(from / 5) === Math.floor(to / 5) ||
          best.seats[to]!.locked ||
          best.seats[to]!.trashProfileId ||
          profiles.get(best.seats[to]!.profileId)?.role === "tank"
        )
          continue;
        const candidate = moveCompositionSeat(best, from, to),
          score = partyManaCoverage(candidate, catalog);
        if (score > bestScore) {
          bestScore = score;
          improved = candidate;
        }
      }
    }
    if (!improved) break;
    best = improved;
  }
  return best;
}

const CORE: Readonly<Record<RaidSize, readonly string[]>> = {
  10: [
    "tank-warrior",
    "tank-druid",
    "heal-priest",
    "heal-shaman",
    "paladin-retribution-static",
    "paladin-retribution-static",
    "mage-arcane-static",
    "warlock-demonology-static",
    "warlock-demonology-static",
    "hunter-marksmanship-static",
  ],
  20: [
    "tank-warrior",
    "tank-druid",
    "heal-priest",
    "heal-paladin",
    "heal-shaman",
    "heal-shaman",
    "paladin-retribution-static",
    "hunter-marksmanship-static",
    "warlock-demonology-static",
    "warlock-demonology-static",
    "mage-arcane-static",
    "fury-standard",
    "hunter-beast-mastery-static",
    "hunter-marksmanship-static",
    "fury-standard",
    "paladin-retribution-static",
    "hunter-marksmanship-static",
    "warlock-demonology-static",
    "mage-fire-static",
    "fury-standard",
  ],
  40: [
    "tank-warrior",
    "tank-druid",
    "tank-paladin",
    "heal-priest",
    "heal-priest",
    "heal-paladin",
    "heal-paladin",
    "heal-shaman",
    "heal-shaman",
    "heal-shaman",
    "heal-druid",
    "paladin-retribution-static",
    "hunter-marksmanship-static",
    "warlock-demonology-static",
    "warlock-demonology-static",
    "mage-arcane-static",
    "fury-standard",
    "fury-standard",
    "fury-standard",
    "fury-standard",
    "hunter-marksmanship-static",
    "hunter-marksmanship-static",
    "hunter-marksmanship-static",
    "hunter-beast-mastery-static",
    "hunter-beast-mastery-static",
    "warlock-demonology-static",
    "warlock-affliction-static",
    "warlock-demonology-static",
    "mage-fire-static",
    "mage-fire-static",
    "mage-arcane-static",
    "paladin-retribution-static",
    "paladin-retribution-static",
    "paladin-retribution-static",
    "feral-cat-static",
    "priest-shadow-static",
    "shaman-enhancement-static",
    "fury-standard",
    "hunter-marksmanship-static",
    "warlock-demonology-static",
  ],
};
export function createComposition(size: RaidSize, catalog: CompositionCatalog): CompositionDraft {
  const profiles = compositionProfiles(catalog);
  const seats = CORE[size].map((id) => {
    if (!profiles.has(id)) throw new Error(`Missing composition profile ${id}`);
    return { profileId: id, locked: false };
  });
  return arrangeCompositionParties(
    validateCompositionDraft(
      {
        version: 1,
        revision: COMPOSITION_REVISION,
        size,
        tanks: size === 40 ? 3 : 2,
        healers: size === 40 ? 8 : size === 20 ? 4 : 2,
        bossHealth: DEFAULT_BOSS_HEALTH[size],
        bossDps: DEFAULT_BOSS_DPS[size],
        required: [...DEFAULT_COVERAGE],
        seats,
      },
      catalog,
    ),
    catalog,
  );
}

interface SearchState {
  readonly seats: CompositionDraft["seats"];
  readonly mask: number;
  readonly paladins: number;
  readonly warlocks: number;
  readonly damage: number;
  readonly healing: number;
}
function providerMask(profile: CompositionProfile): number {
  let mask = profile.classSlug === "warrior" ? 1 : 0;
  for (let index = 0; index < COVERAGE_REQUIREMENTS.length; index += 1)
    if (profile.capabilities.includes(COVERAGE_REQUIREMENTS[index]!.id)) mask |= 1 << (index + 1);
  return mask;
}
/** Constrained historical-reference selection; never a forecast of current raid DPS. */
export function suggestComposition(
  draft: CompositionDraft,
  catalog: CompositionCatalog,
  keepCore = true,
): CompositionSuggestion {
  const profiles = compositionProfiles(catalog);
  const failure = (error: string): CompositionSuggestion => ({
    draft,
    changes: [],
    error,
    evaluatedStates: 0,
  });
  if (catalog.evidence !== "historical-reference")
    return failure(
      "Verified reference measurements are unavailable. You can still edit the starting compositions.",
    );
  const fixed = draft.seats
    .map((seat, index) => ({ seat, index, profile: profiles.get(seat.profileId) }))
    .filter(
      ({ seat, profile }) =>
        seat.locked || Boolean(seat.trashProfileId) || (keepCore && profile?.role !== "damage"),
    );
  const count = (role: CompositionRole): number =>
    fixed.filter(({ profile }) => profile?.role === role).length;
  const needs: Record<CompositionRole, number> = {
    tank: draft.tanks - count("tank"),
    healer: draft.healers - count("healer"),
    damage: draft.size - draft.tanks - draft.healers - count("damage"),
  };
  if (Object.values(needs).some((value) => value < 0))
    return failure(
      "Locked seats, trash assignments or the retained core exceed your role allocation. Unlock a seat, remove a trash assignment or change the allocation.",
    );
  const add = (
    state: SearchState,
    profile: CompositionProfile,
    seat: CompositionDraft["seats"][number],
  ): SearchState => {
    const paladins = Math.min(2, state.paladins + Number(profile.classSlug === "paladin"));
    const warlocks = Math.min(2, state.warlocks + Number(profile.classSlug === "warlock"));
    let mask = state.mask | providerMask(profile);
    if (paladins >= 2)
      mask |= 1 << (COVERAGE_REQUIREMENTS.findIndex((rule) => rule.id === "primary-blessing") + 1);
    const armorNeeds = draft.required.includes("magic-curse") ? 2 : 1;
    if (warlocks >= armorNeeds)
      mask |= 1 << (COVERAGE_REQUIREMENTS.findIndex((rule) => rule.id === "armor-curse") + 1);
    return {
      seats: [...state.seats, seat],
      mask,
      paladins,
      warlocks,
      damage: state.damage + (profile.reference?.unit === "DPS" ? profile.reference.value : 0),
      healing:
        state.healing + (profile.reference?.unit === "useful HPS" ? profile.reference.value : 0),
    };
  };
  let initial: SearchState = {
    seats: [],
    mask: 0,
    paladins: 0,
    warlocks: 0,
    damage: 0,
    healing: 0,
  };
  for (const member of fixed)
    if (member.profile) initial = add(initial, member.profile, member.seat);
  let states = [initial],
    evaluatedStates = 0;
  for (const role of ["tank", "healer", "damage"] as const) {
    const candidates = catalog.profiles.filter(
      (profile) => profile.role === role && profile.reference !== null,
    );
    if (needs[role] && !candidates.length)
      return failure(`No verified ${role} reference is available.`);
    for (let step = 0; step < needs[role]; step += 1) {
      const next = new Map<string, SearchState>();
      for (const state of states)
        for (const candidate of candidates) {
          const proposed = add(state, candidate, { profileId: candidate.id, locked: false });
          const key = `${proposed.mask}:${proposed.paladins}:${proposed.warlocks}`;
          const old = next.get(key);
          if (
            !old ||
            proposed.damage > old.damage ||
            (proposed.damage === old.damage && proposed.healing > old.healing)
          )
            next.set(key, proposed);
          evaluatedStates += 1;
        }
      states = [...next.values()];
    }
  }
  let requiredMask = 1;
  for (let index = 0; index < COVERAGE_REQUIREMENTS.length; index += 1)
    if (draft.required.includes(COVERAGE_REQUIREMENTS[index]!.id)) requiredMask |= 1 << (index + 1);
  const best = states
    .filter((state) => (state.mask & requiredMask) === requiredMask)
    .sort((left, right) => right.damage - left.damage || right.healing - left.healing)[0];
  if (!best)
    return {
      ...failure(
        "No lineup satisfies your locked seats, trash assignments, role counts and selected support. Unlock a seat, remove a trash assignment or relax optional coverage.",
      ),
      evaluatedStates,
    };
  const fixedByIndex = new Map(fixed.map((member) => [member.index, member.seat]));
  const extras = best.seats.slice(fixed.length);
  let cursor = 0;
  const seats = draft.seats.map((_, index) => fixedByIndex.get(index) ?? extras[cursor++]!);
  const nextDraft = { ...draft, seats };
  const analysis = analyzeComposition(nextDraft, catalog);
  if (!analysis.ready) return { ...failure(analysis.issues.join(" ")), evaluatedStates };
  const changes = seats.flatMap((seat, index) =>
    seat.profileId === draft.seats[index]!.profileId
      ? []
      : [
          {
            seat: index,
            from: draft.seats[index]!.profileId,
            to: seat.profileId,
            reason:
              "Highest retained reference damage satisfying the selected support and role constraints; current-patch raid damage is not measured.",
          },
        ],
  );
  return { draft: nextDraft, changes, error: null, evaluatedStates };
}

export function replaceCompositionSeat(
  draft: CompositionDraft,
  index: number,
  profileId: string,
  catalog: CompositionCatalog,
): CompositionDraft {
  const profiles = compositionProfiles(catalog);
  if (!profiles.has(profileId) || !draft.seats[index])
    throw new Error("Choose an available build and seat.");
  if (draft.seats[index]!.locked) throw new Error("Unlock this seat before replacing its build.");
  const seats = draft.seats.map((seat, position) => {
    if (position !== index) return seat;
    const updated = { ...seat, profileId };
    if (profileId !== "paladin-retribution-static") delete updated.trashProfileId;
    return updated;
  });
  if (!seats.some((seat) => profiles.get(seat.profileId)?.classSlug === "warrior"))
    throw new Error(
      "The last Warrior cannot be removed; a tank or damage Warrior must maintain Sunder.",
    );
  return { ...draft, seats };
}
export function moveCompositionSeat(
  draft: CompositionDraft,
  from: number,
  to: number,
): CompositionDraft {
  if (!draft.seats[from] || !draft.seats[to])
    throw new Error("Choose valid source and destination seats.");
  if (draft.seats[from]!.locked || draft.seats[to]!.locked)
    throw new Error("Unlock both seats before moving them.");
  const seats = [...draft.seats];
  [seats[from], seats[to]] = [seats[to]!, seats[from]!];
  const mainTankSeat =
    draft.mainTankSeat === from ? to : draft.mainTankSeat === to ? from : draft.mainTankSeat;
  return { ...draft, seats, ...(mainTankSeat !== undefined ? { mainTankSeat } : {}) };
}
export function encodeComposition(draft: CompositionDraft): string {
  return encodeURIComponent(JSON.stringify(compositionDraftSchema.parse(draft)));
}
export function decodeComposition(value: string, catalog: CompositionCatalog): CompositionDraft {
  if (value.length > 18000) throw new Error("This composition link is too large.");
  return validateCompositionDraft(JSON.parse(decodeURIComponent(value)), catalog);
}
