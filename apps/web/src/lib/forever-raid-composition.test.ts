import { beforeAll, describe, expect, it, vi } from "vitest";
import damage from "./data/forever-dps-tier-list.current.raid.json";
import tanks from "./data/forever-tank-tier-list.current.raid.json";
import healers from "./data/forever-healer-tier-list.json";
import { readDpsTierScenarioSnapshot } from "./forever-dps-tier-list-data";
import { dpsTierSnapshotSchema } from "./forever-dps-tier-list";
import { estimateCompositionSurvival } from "./forever-raid-survival";
vi.mock("./forever-dps-tier-list-data", () => ({
  readDpsTierScenarioSnapshot: vi.fn(async () => damage),
}));
vi.mock("./forever-tank-tier-list-data", () => ({
  readTankTierSnapshot: vi.fn(async () => tanks),
}));
vi.mock("./forever-healer-tier-list-data", () => ({
  readHealerTierSnapshot: vi.fn(async () => healers),
}));
import { readCompositionCatalog, profileCapabilities } from "./forever-raid-composition-data";
import {
  analyzeComposition,
  arrangeCompositionParties,
  compositionProfiles,
  compositionMainTank,
  compositionForecast,
  createComposition,
  decodeComposition,
  encodeComposition,
  moveCompositionSeat,
  partyManaCoverage,
  replaceCompositionSeat,
  setCompositionTrashTank,
  suggestComposition,
  validateCompositionDraft,
  type CompositionCatalog,
  type CompositionDraft,
} from "./forever-raid-composition";

let catalog: CompositionCatalog;
beforeAll(async () => {
  catalog = await readCompositionCatalog();
});
const count = (draft: CompositionDraft, classSlug: string): number =>
  draft.seats.filter(
    (seat) =>
      catalog.profiles.find((profile) => profile.id === seat.profileId)?.classSlug === classSlug,
  ).length;

describe("Forever composition constraints and source adapter", () => {
  it.each([10, 20, 40] as const)("builds a complete %i-player support composition", (size) => {
    const draft = createComposition(size, catalog),
      analysis = analyzeComposition(draft, catalog);
    expect(draft.seats).toHaveLength(size);
    expect(analysis.parties).toHaveLength(size / 5);
    expect(analysis.roles).toEqual({
      tank: size === 40 ? 3 : 2,
      healer: size === 40 ? 8 : size === 20 ? 4 : 2,
      damage: size - (size === 40 ? 11 : size === 20 ? 6 : 4),
    });
    expect(analysis.issues).toEqual([]);
    expect(analysis.ready).toBe(true);
    expect(count(draft, "warrior")).toBeGreaterThanOrEqual(1);
    expect(count(draft, "rogue")).toBe(0);
    expect(analysis.coverage.find((rule) => rule.id === "sunder")?.providerSeats).toEqual([0]);
  });
  it("adapts all 25 retained DPS builds and seven tank/healer foundations without inventing damage", () => {
    expect(catalog.profiles).toHaveLength(32);
    expect(catalog.profiles.every((profile) => profile.reference)).toBe(true);
    expect(
      catalog.profiles.find((profile) => profile.id === "fury-standard")?.reference?.value,
    ).toBeCloseTo(862.67, 2);
    expect(catalog.profiles.find((profile) => profile.id === "heal-priest")?.reference?.unit).toBe(
      "useful HPS",
    );
    expect(
      catalog.profiles.find((profile) => profile.id === "tank-warrior")?.reference?.value,
    ).toBeCloseTo(337.1, 2);
    expect(catalog.evidence).toBe("historical-reference");
  });
  it("rejects removing the last Warrior, accepts a damage Warrior, and uses the tank for Sunder when available", () => {
    const draft = createComposition(10, catalog);
    expect(() => replaceCompositionSeat(draft, 0, "tank-paladin", catalog)).toThrow(/last Warrior/);
    const withFury = replaceCompositionSeat(draft, 4, "fury-standard", catalog);
    expect(
      analyzeComposition(withFury, catalog).coverage.find((rule) => rule.id === "sunder")
        ?.providerSeats,
    ).toEqual([0]);
    const noTankWarrior = replaceCompositionSeat(withFury, 0, "tank-paladin", catalog);
    expect(
      analyzeComposition(noTankWarrior, catalog).coverage.find((rule) => rule.id === "sunder")
        ?.providerSeats,
    ).toEqual([4]);
  });
  it("never double-counts the Druid crit category and does not infer a crit aura from Restoration", () => {
    let draft = createComposition(10, catalog);
    draft = replaceCompositionSeat(draft, 4, "balance-static", catalog);
    const crit = analyzeComposition(draft, catalog).coverage.filter((rule) => rule.id === "crit");
    expect(crit).toHaveLength(1);
    expect(crit[0]?.providerSeats).toEqual([1, 4]);
    expect(crit[0]?.state).toBe("assumed");
    expect(profileCapabilities("druid", "heal-druid")).not.toContain("crit");
  });
  it("assigns different Paladins to Kings and the second blessing", () => {
    const draft = createComposition(10, catalog),
      coverage = analyzeComposition(draft, catalog).coverage,
      paladins = draft.seats.flatMap((seat, index) =>
        compositionProfiles(catalog).get(seat.profileId)?.classSlug === "paladin" ? [index] : [],
      );
    expect(coverage.find((rule) => rule.id === "kings")?.providerSeats).toEqual(
      paladins.slice(0, 1),
    );
    expect(coverage.find((rule) => rule.id === "primary-blessing")?.providerSeats).toEqual(
      paladins.slice(1, 2),
    );
    const fewer = replaceCompositionSeat(draft, paladins[1]!, "fury-standard", catalog);
    expect(
      analyzeComposition(fewer, catalog).coverage.find((rule) => rule.id === "primary-blessing")
        ?.state,
    ).toBe("missing");
  });
  it("respects one curse per Warlock, including when only the armor curse is required", () => {
    const draft = createComposition(10, catalog),
      fewer = replaceCompositionSeat(draft, 8, "fury-standard", catalog);
    expect(
      analyzeComposition(fewer, catalog).coverage.find((rule) => rule.id === "armor-curse")?.state,
    ).toBe("missing");
    const armorOnly = {
      ...fewer,
      required: fewer.required.filter((rule) => rule !== "magic-curse"),
    };
    const analysis = analyzeComposition(armorOnly, catalog);
    expect(analysis.coverage.find((rule) => rule.id === "armor-curse")?.providerSeats).toEqual([7]);
    expect(analysis.coverage.find((rule) => rule.id === "magic-curse")?.providerSeats).toEqual([]);
  });
  it("shows raid-wide offensive providers separately from party water totems and ranged-only Trueshot recipients", () => {
    const draft = createComposition(10, catalog),
      analysis = analyzeComposition(draft, catalog),
      shaman = draft.seats.findIndex((seat) => seat.profileId === "heal-shaman"),
      hunter = draft.seats.findIndex((seat) => seat.profileId === "hunter-marksmanship-static");
    expect(analysis.coverage.find((rule) => rule.id === "totems")?.providerSeats).toEqual([shaman]);
    expect(analysis.parties[Math.floor(shaman / 5)]?.manaProviderSeats).toEqual([shaman]);
    expect(analysis.parties[1 - Math.floor(shaman / 5)]?.manaProviderSeats).toEqual([]);
    expect(analysis.coverage.find((rule) => rule.id === "trueshot")?.beneficiarySeats).toEqual([
      hunter,
    ]);
    const magicRecipients = analysis.coverage.find(
      (rule) => rule.id === "magic-curse",
    )!.beneficiarySeats;
    expect(magicRecipients.length).toBeGreaterThan(0);
    expect(
      magicRecipients.every(
        (index) =>
          compositionProfiles(catalog).get(draft.seats[index]!.profileId)?.role !== "healer",
      ),
    ).toBe(true);
    expect(profileCapabilities("warlock", "warlock-demonology-static")).not.toContain("blood-pact");
    expect(profileCapabilities("priest", "priest-shadow-static")).not.toContain(
      "raid-shadow-weaving",
    );
  });
  it("retains locks while moving and refuses invalid or locked move targets", () => {
    const draft = createComposition(10, catalog),
      moved = moveCompositionSeat(draft, 0, 9);
    expect(moved.seats[9]?.profileId).toBe("tank-warrior");
    expect(draft.seats[0]?.profileId).toBe("tank-warrior");
    expect(() => moveCompositionSeat(draft, -1, 0)).toThrow();
    const locked = {
      ...draft,
      seats: draft.seats.map((seat, index) => ({ ...seat, locked: index === 0 })),
    };
    expect(() => moveCompositionSeat(locked, 0, 9)).toThrow(/Unlock/);
    expect(() => replaceCompositionSeat(locked, 0, "fury-standard", catalog)).toThrow(/Unlock/);
  });
  it("shares only validated, bounded build/seat data and rejects stale or unknown profiles", () => {
    const draft = createComposition(40, catalog);
    expect(decodeComposition(encodeComposition(draft), catalog)).toEqual(draft);
    expect(() => decodeComposition("x".repeat(18001), catalog)).toThrow(/too large/);
    expect(() => validateCompositionDraft({ ...draft, revision: "old" }, catalog)).toThrow();
    expect(() =>
      validateCompositionDraft(
        {
          ...draft,
          seats: draft.seats.map((seat, index) =>
            index === 0 ? { ...seat, profileId: "unknown" } : seat,
          ),
        },
        catalog,
      ),
    ).toThrow(/no longer/);
    expect(() =>
      validateCompositionDraft({ ...draft, playerNames: ["private"] }, catalog),
    ).toThrow();
    expect(() =>
      validateCompositionDraft({ ...draft, seats: draft.seats.slice(1) }, catalog),
    ).toThrow();
  });
});

describe("composition damage, threat and boss estimates", () => {
  it.each([
    [10, 1_100_000],
    [20, 2_200_000],
    [40, 4_000_000],
  ] as const)(
    "uses the approved %i-player boss health and exact health / reference DPS calculation",
    (size, health) => {
      const draft = createComposition(size, catalog),
        result = compositionForecast(draft, catalog);
      const selected = draft.seats.map((seat) => compositionProfiles(catalog).get(seat.profileId)!);
      const expectedDps = selected.reduce(
        (sum, profile) => sum + (profile.reference?.unit === "DPS" ? profile.reference.value : 0),
        0,
      );
      expect(result.bossHealth).toBe(health);
      expect(result.raid.dps).toBeCloseTo(expectedDps, 8);
      expect(result.killSeconds).toBeCloseTo(health / expectedDps, 8);
      expect(result.groups.reduce((sum, group) => sum + (group.dps ?? 0), 0)).toBeCloseTo(
        expectedDps,
        8,
      );
      expect(result.raid.damageReferences).toBe(size - draft.healers);
    },
  );
  it("uses measured player TPS, separates pet threat, and never adds pet damage twice or substitutes HPS", () => {
    const draft = createComposition(10, catalog),
      forecast = compositionForecast(draft, catalog);
    const selected = draft.seats.map((seat) => compositionProfiles(catalog).get(seat.profileId)!);
    const ownThreat = selected.reduce(
      (sum, profile) => sum + (profile.reference?.threatPerSecond ?? 0),
      0,
    );
    const petThreat = selected.reduce(
      (sum, profile) => sum + (profile.reference?.petThreatPerSecond ?? 0),
      0,
    );
    expect(forecast.raid.tps).toBeCloseTo(ownThreat, 8);
    expect(forecast.raid.petTps).toBeCloseTo(petThreat, 8);
    expect(petThreat).toBeGreaterThan(0);
    expect(forecast.raid.threatReferences).toBe(8);
    expect(forecast.groups.reduce((sum, group) => sum + (group.tps ?? 0), 0)).toBeCloseTo(
      ownThreat,
      8,
    );
    const hunter = selected.find((profile) => profile.classSlug === "hunter")!;
    expect(hunter.reference?.value).toBeCloseTo(961.7878285861129, 8);
    expect(hunter.reference?.threatPerSecond).toBeCloseTo(829.5884309415609, 8);
    expect(hunter.reference?.petThreatPerSecond).toBeCloseTo(157.96204976251033, 8);
  });
  it("keeps selected mitigation tank TPS and damage separate from the maximum tested threat build", () => {
    const draft = createComposition(10, catalog),
      forecast = compositionForecast(draft, catalog);
    expect(forecast.raid.maxTankTps).toBeCloseTo(1241.16, 2);
    expect(forecast.raid.maxTestedTankTps).toBeCloseTo(1786.26, 2);
    const tanks = catalog.profiles.filter((profile) => profile.role === "tank");
    expect(
      tanks.every(
        (profile) => profile.maximumThreat && profile.reference?.threatPerSecond !== undefined,
      ),
    ).toBe(true);
    const changed = {
      ...catalog,
      profiles: catalog.profiles.map((profile) =>
        profile.maximumThreat
          ? { ...profile, maximumThreat: { ...profile.maximumThreat, damagePerSecond: 1_000_000 } }
          : profile,
      ),
    };
    expect(compositionForecast(draft, changed).raid.dps).toBe(forecast.raid.dps);
  });
  it("does not invent a kill time for missing or zero damage and rejects invalid health", () => {
    const draft = createComposition(10, catalog),
      missing = {
        ...catalog,
        profiles: catalog.profiles.map((profile) =>
          profile.id === "fury-standard" ? profile : { ...profile, reference: null },
        ),
      };
    expect(compositionForecast(draft, missing).killSeconds).toBeNull();
    const zero = {
      ...catalog,
      profiles: catalog.profiles.map((profile) => ({
        ...profile,
        reference: profile.reference ? { ...profile.reference, value: 0 } : null,
      })),
    };
    expect(compositionForecast(draft, zero).killSeconds).toBeNull();
    expect(() => validateCompositionDraft({ ...draft, bossHealth: -1 }, catalog)).toThrow();
    expect(() => validateCompositionDraft({ ...draft, bossHealth: 2_000.5 }, catalog)).toThrow();
    expect(() =>
      validateCompositionDraft({ ...draft, bossHealth: 1_000_000_001 }, catalog),
    ).toThrow();
  });
  it("shares customized health and preserves size-specific defaults for older drafts", () => {
    const draft = { ...createComposition(20, catalog), bossHealth: 3_000_000 };
    const restored = decodeComposition(encodeComposition(draft), catalog);
    expect(compositionForecast(restored, catalog).bossHealth).toBe(3_000_000);
    const { bossHealth: _health, ...legacy } = draft;
    expect(_health).toBe(3_000_000);
    expect(compositionForecast(validateCompositionDraft(legacy, catalog), catalog).bossHealth).toBe(
      2_200_000,
    );
  });
  it("refuses a stale threat measurement when its source request/response no longer matches", async () => {
    const changed = dpsTierSnapshotSchema.parse({
      ...damage,
      entries: damage.entries.map((entry) =>
        entry.id === "fury-standard" ? { ...entry, responseSha256: "f".repeat(64) } : entry,
      ),
    });
    vi.mocked(readDpsTierScenarioSnapshot).mockResolvedValueOnce(changed);
    const refreshed = await readCompositionCatalog();
    const fury = refreshed.profiles.find((profile) => profile.id === "fury-standard")!;
    expect(fury.reference?.unit).toBe("DPS");
    expect(fury.reference?.threatPerSecond).toBeUndefined();
    expect(
      refreshed.profiles.find((profile) => profile.id === "arms-standard")?.reference
        ?.threatPerSecond,
    ).toBeGreaterThan(0);
  });
  it.each([
    [10, 2_500],
    [20, 5_000],
    [40, 10_000],
  ] as const)(
    "uses raw boss DPS for %i players and bound tank/healer evidence",
    (size, bossDps) => {
      const draft = createComposition(size, catalog),
        estimate = estimateCompositionSurvival(draft, catalog),
        forecast = compositionForecast(draft, catalog);
      expect(estimate.bossDps).toBe(bossDps);
      expect(estimate.incomingDps).toBeLessThan(bossDps);
      expect(estimate.health).toBeGreaterThan(1_000);
      expect(estimate.tankHealingHps).toBeGreaterThan(0);
      expect(estimate.unavailableReason).toBeNull();
      expect(estimate.samples?.iterations).toBe(2048);
      expect(forecast.raid.hps).toBeGreaterThan(0);
      expect(forecast.raid.healerReferences).toBe(draft.healers);
      expect(forecast.groups.reduce((sum, group) => sum + (group.hps ?? 0), 0)).toBeCloseTo(
        forecast.raid.hps!,
        8,
      );
    },
  );
  it("handles missing tank/healer evidence and main-tank moves without inventing survival", () => {
    const draft = createComposition(10, catalog);
    const noIncoming = {
      ...catalog,
      profiles: catalog.profiles.map((profile) => {
        const copy = { ...profile };
        delete copy.incoming;
        return copy;
      }),
    };
    expect(estimateCompositionSurvival(draft, noIncoming).samples).toBeNull();
    const noHealing = {
      ...catalog,
      profiles: catalog.profiles.map((profile) => {
        const copy = { ...profile };
        delete copy.tankHealing;
        return copy;
      }),
    };
    expect(estimateCompositionSurvival(draft, noHealing).samples).toBeNull();
    const moved = moveCompositionSeat({ ...draft, mainTankSeat: 0 }, 0, 9);
    const estimate = estimateCompositionSurvival(moved, catalog);
    expect(estimate.tankSeat).not.toBe(0);
    expect(estimate.samples).not.toBeNull();
    expect(() => validateCompositionDraft({ ...draft, mainTankSeat: 15 }, catalog)).toThrow();
    expect(() =>
      validateCompositionDraft({ ...draft, tankHealingPercent: 101 }, catalog),
    ).toThrow();
  });
});

describe("selected calculated pre-raid main tank", () => {
  it("binds each chosen class to its own pre-raid DPS, TPS, incoming stats and build link", () => {
    const draft = createComposition(20, catalog);
    const warrior = draft.seats.findIndex((seat) => seat.profileId === "tank-warrior");
    const bear = draft.seats.findIndex((seat) => seat.profileId === "tank-druid");
    const warriorDraft = { ...draft, mainTankSeat: warrior },
      bearDraft = { ...draft, mainTankSeat: bear };
    const warriorTank = compositionMainTank(warriorDraft, catalog)!,
      bearTank = compositionMainTank(bearDraft, catalog)!;
    expect(warriorTank.profile.reference?.value).toBeCloseTo(337.09571947529236, 8);
    expect(warriorTank.profile.reference?.threatPerSecond).toBeCloseTo(831.0074638529211, 8);
    expect(bearTank.profile.reference?.value).toBeCloseTo(370.4376150396763, 8);
    expect(bearTank.profile.reference?.threatPerSecond).toBeCloseTo(1241.1621070460099, 8);
    expect(warriorTank.profile.maximumThreat?.threatPerSecond).toBeCloseTo(1260.7674309735867, 8);
    expect(bearTank.profile.maximumThreat?.threatPerSecond).toBeCloseTo(1786.2628632287062, 8);
    expect(warriorTank.profile.reference?.href).toBe(
      "/forever/simulator/tank-warrior?build=tank-warrior-raid-mitigation",
    );
    expect(bearTank.profile.reference?.href).toBe(
      "/forever/simulator/feral-tank-druid?build=feral-tank-druid-raid-mitigation",
    );
    expect(estimateCompositionSurvival(warriorDraft, catalog).health).not.toBe(
      estimateCompositionSurvival(bearDraft, catalog).health,
    );
    expect(estimateCompositionSurvival(warriorDraft, catalog).incomingDps).not.toBe(
      estimateCompositionSurvival(bearDraft, catalog).incomingDps,
    );
    expect(compositionForecast(warriorDraft, catalog)).toEqual(
      compositionForecast(bearDraft, catalog),
    );
  });
  it("keeps the chosen main tank attached to its calculated build when its seat moves", () => {
    const draft = createComposition(20, catalog),
      chosen = compositionMainTank(draft, catalog)!;
    const moved = moveCompositionSeat(draft, chosen.seat, 19);
    expect(moved.mainTankSeat).toBe(19);
    expect(compositionMainTank(moved, catalog)?.profile).toEqual(chosen.profile);
    expect(estimateCompositionSurvival(moved, catalog).health).toBe(
      chosen.profile.incoming?.health,
    );
  });
  it("ignores a trash-only Protection assignment for boss main-tank selection and repairs an old invalid selection", () => {
    const draft = createComposition(10, catalog),
      flex = analyzeComposition(draft, catalog).trashSwitches[0]!.seat;
    const input = { ...draft, mainTankSeat: flex },
      selected = compositionMainTank(input, catalog)!;
    expect(selected.profile.role).toBe("tank");
    expect(selected.seat).not.toBe(flex);
    expect(validateCompositionDraft(input, catalog).mainTankSeat).toBe(selected.seat);
    const noTanks = {
      ...draft,
      seats: draft.seats.map((seat) =>
        compositionProfiles(catalog).get(seat.profileId)?.role === "tank"
          ? { profileId: "fury-standard", locked: false }
          : seat,
      ),
    };
    expect(compositionMainTank(noTanks, catalog)).toBeNull();
    expect(estimateCompositionSurvival(noTanks, catalog).samples).toBeNull();
  });
});

describe("Protection trash / Retribution boss assignments", () => {
  it.each([10, 20, 40] as const)(
    "assigns one flex Paladin in the %i-player default without adding a roster slot",
    (size) => {
      const draft = createComposition(size, catalog),
        analysis = analyzeComposition(draft, catalog);
      expect(draft.seats).toHaveLength(size);
      expect(analysis.trashSwitches).toHaveLength(1);
      const assignment = analysis.trashSwitches[0]!;
      expect(draft.seats[assignment.seat]?.profileId).toBe("paladin-retribution-static");
      expect(assignment.trashProfileId).toBe("tank-paladin");
      expect(analysis.trashRoles).toEqual({
        ...analysis.roles,
        tank: analysis.roles.tank + 1,
        damage: analysis.roles.damage - 1,
      });
      expect(
        analysis.assignments.some(
          (duty) => duty.seat === assignment.seat && duty.duty.includes("switch to Retribution"),
        ),
      ).toBe(true);
      expect(analysis.ready).toBe(true);
    },
  );
  it("never changes boss damage, threat, HPS, kill time or survival when a trash assignment is changed", () => {
    const draft = createComposition(20, catalog),
      index = analyzeComposition(draft, catalog).trashSwitches[0]!.seat;
    const without = setCompositionTrashTank(draft, index, false, catalog);
    expect(compositionForecast(without, catalog)).toEqual(compositionForecast(draft, catalog));
    expect(estimateCompositionSurvival(without, catalog)).toEqual(
      estimateCompositionSurvival(draft, catalog),
    );
    expect(analyzeComposition(without, catalog).roles).toEqual(
      analyzeComposition(draft, catalog).roles,
    );
    expect(analyzeComposition(without, catalog).trashSwitches).toHaveLength(0);
    expect(
      analyzeComposition(setCompositionTrashTank(without, index, true, catalog), catalog)
        .trashSwitches,
    ).toHaveLength(1);
  });
  it.each([true, false])(
    "preserves the assigned flex seat in suggestions with keepCore=%s",
    (keepCore) => {
      const draft = createComposition(20, catalog),
        index = analyzeComposition(draft, catalog).trashSwitches[0]!.seat;
      expect(draft.seats[index]?.locked).toBe(false);
      const result = suggestComposition(draft, catalog, keepCore);
      expect(result.error).toBeNull();
      expect(result.draft.seats[index]).toEqual(draft.seats[index]);
      expect(analyzeComposition(result.draft, catalog).trashSwitches).toHaveLength(1);
    },
  );
  it("keeps the assignment with the same seat's build through manual swaps, and preserves it during party arrangement", () => {
    const draft = createComposition(20, catalog),
      index = analyzeComposition(draft, catalog).trashSwitches[0]!.seat;
    const target = draft.seats.findIndex(
      (seat, position) =>
        position !== index && compositionProfiles(catalog).get(seat.profileId)?.role === "damage",
    );
    const moved = moveCompositionSeat(draft, index, target);
    expect(moved.seats[target]).toEqual(draft.seats[index]);
    expect(analyzeComposition(moved, catalog).trashSwitches[0]?.seat).toBe(target);
    expect(arrangeCompositionParties(moved, catalog).seats[target]).toEqual(moved.seats[target]);
  });
  it("saves and shares opt-outs without silently assigning the Paladin again", () => {
    const draft = createComposition(10, catalog),
      index = analyzeComposition(draft, catalog).trashSwitches[0]!.seat;
    expect(decodeComposition(encodeComposition(draft), catalog)).toEqual(draft);
    const disabled = setCompositionTrashTank(draft, index, false, catalog);
    const loaded = decodeComposition(encodeComposition(disabled), catalog);
    expect(loaded).toEqual(disabled);
    expect(analyzeComposition(loaded, catalog).trashSwitches).toHaveLength(0);
  });
  it("upgrades older saved drafts once, using an unlocked Ret without changing any boss build", () => {
    const draft = createComposition(20, catalog),
      legacy = {
        ...draft,
        seats: draft.seats.map((seat) => {
          const copy = { ...seat };
          delete copy.trashProfileId;
          return copy;
        }),
      };
    delete legacy.trashPlanVersion;
    const firstRet = legacy.seats.findIndex(
      (seat) => seat.profileId === "paladin-retribution-static",
    );
    legacy.seats[firstRet] = { ...legacy.seats[firstRet]!, locked: true };
    const upgraded = validateCompositionDraft(legacy, catalog);
    expect(upgraded.trashPlanVersion).toBe(1);
    expect(upgraded.seats[firstRet]).toEqual(legacy.seats[firstRet]);
    expect(upgraded.seats.map((seat) => seat.profileId)).toEqual(
      legacy.seats.map((seat) => seat.profileId),
    );
    expect(analyzeComposition(upgraded, catalog).trashSwitches).toHaveLength(1);
    expect(validateCompositionDraft(upgraded, catalog)).toEqual(upgraded);
  });
  it("does not create a phantom or modify locked Paladins when a legacy draft has no available Ret", () => {
    const draft = createComposition(20, catalog),
      legacy = {
        ...draft,
        seats: draft.seats.map((seat) => {
          const copy = { ...seat, locked: true };
          delete copy.trashProfileId;
          return copy;
        }),
      };
    delete legacy.trashPlanVersion;
    const loaded = validateCompositionDraft(legacy, catalog);
    expect(loaded.seats).toEqual(legacy.seats);
    expect(analyzeComposition(loaded, catalog).trashSwitches).toHaveLength(0);
  });
  it("rejects invalid or locked assignments and clears the annotation when its Ret boss build is replaced", () => {
    const draft = createComposition(10, catalog),
      index = analyzeComposition(draft, catalog).trashSwitches[0]!.seat;
    expect(() => setCompositionTrashTank(draft, 0, true, catalog)).toThrow(/Retribution/);
    const locked = {
      ...draft,
      seats: draft.seats.map((seat, position) =>
        position === index ? { ...seat, locked: true } : seat,
      ),
    };
    expect(() => setCompositionTrashTank(locked, index, false, catalog)).toThrow(/Unlock/);
    const replaced = replaceCompositionSeat(draft, index, "fury-standard", catalog);
    expect(replaced.seats[index]?.trashProfileId).toBeUndefined();
    expect(replaced.trashPlanVersion).toBe(1);
    expect(() =>
      validateCompositionDraft(
        {
          ...draft,
          seats: draft.seats.map((seat, position) =>
            position === 0 ? { ...seat, trashProfileId: "tank-paladin" } : seat,
          ),
        },
        catalog,
      ),
    ).toThrow(/Retribution/);
  });
});

describe("party-only support arrangement", () => {
  it("improves mana coverage while preserving the lineup, locked seats and tank assignments", () => {
    const draft = createComposition(20, catalog);
    // Deliberately cluster both Shamans in a party containing the two tanks.
    const seats = [...draft.seats]
      .sort((left, right) => {
        const order = (id: string): number =>
          id === "tank-warrior" ? 0 : id === "tank-druid" ? 1 : id === "heal-shaman" ? 2 : 3;
        return order(left.profileId) - order(right.profileId);
      })
      .map((seat, index) => ({ ...seat, locked: index === 4 }));
    const clustered = { ...draft, seats };
    const arranged = arrangeCompositionParties(clustered, catalog);
    expect(partyManaCoverage(arranged, catalog)).toBeGreaterThan(
      partyManaCoverage(clustered, catalog),
    );
    expect(arranged.seats.map((seat) => seat.profileId).sort()).toEqual(
      clustered.seats.map((seat) => seat.profileId).sort(),
    );
    for (const index of [0, 1, 4]) expect(arranged.seats[index]).toEqual(clustered.seats[index]);
    expect(analyzeComposition(arranged, catalog).roles).toEqual(
      analyzeComposition(clustered, catalog).roles,
    );
    expect(arrangeCompositionParties(arranged, catalog)).toEqual(arranged);
    expect(clustered.seats[2]?.profileId).toBe("heal-shaman");
    expect(clustered.seats[3]?.profileId).toBe("heal-shaman");
  });
  it("does not rearrange a raid for global effects alone or move locked providers", () => {
    const draft = createComposition(20, catalog);
    const globalOnly = {
      ...catalog,
      profiles: catalog.profiles.map((profile) => ({
        ...profile,
        capabilities: profile.capabilities.filter(
          (capability) => !["mana-spring", "party-spirit"].includes(capability),
        ),
      })),
    };
    expect(arrangeCompositionParties(draft, globalOnly)).toEqual(draft);
    const locked = { ...draft, seats: draft.seats.map((seat) => ({ ...seat, locked: true })) };
    expect(arrangeCompositionParties(locked, catalog)).toEqual(locked);
  });
});

describe("constrained historical-reference suggestions", () => {
  it.each([10, 20, 40] as const)(
    "suggests a legal %i-player lineup without a fabricated current DPS total",
    (size) => {
      const draft = createComposition(size, catalog),
        result = suggestComposition(draft, catalog);
      expect(result.error).toBeNull();
      expect(result.draft.seats).toHaveLength(size);
      expect(analyzeComposition(result.draft, catalog).ready).toBe(true);
      expect(count(result.draft, "warrior")).toBeGreaterThanOrEqual(1);
      expect(count(result.draft, "rogue")).toBe(0);
      draft.seats.forEach((seat, index) => {
        if (compositionProfiles(catalog).get(seat.profileId)?.role !== "damage")
          expect(result.draft.seats[index]).toEqual(seat);
      });
      expect(result).not.toHaveProperty("raidDps");
      expect(result.evaluatedStates).toBeLessThan(200000);
      expect(suggestComposition(draft, catalog)).toEqual(result);
    },
  );
  it("keeps a locked Rogue and explains infeasible role/coverage requirements instead of silently changing them", () => {
    let draft = createComposition(10, catalog);
    draft = replaceCompositionSeat(draft, 4, "rogue-combat-static", catalog);
    draft = { ...draft, required: draft.required.filter((rule) => rule !== "armor-curse") };
    draft = {
      ...draft,
      seats: draft.seats.map((seat, index) => ({ ...seat, locked: index === 4 })),
    };
    const result = suggestComposition(draft, catalog);
    expect(result.error).toBeNull();
    expect(result.draft.seats[4]).toEqual(draft.seats[4]);
    const allLocked = { ...draft, seats: draft.seats.map((seat) => ({ ...seat, locked: true })) };
    expect(suggestComposition(allLocked, catalog).error).toMatch(/No lineup/);
    expect(suggestComposition({ ...draft, tanks: 1 }, catalog).error).toMatch(/exceed/);
  });
  it("can rebuild unlocked roles and refuses to use unavailable reference data", () => {
    const draft = createComposition(10, catalog),
      result = suggestComposition(draft, catalog, false);
    expect(result.error).toBeNull();
    expect(analyzeComposition(result.draft, catalog).ready).toBe(true);
    expect(suggestComposition(draft, { ...catalog, evidence: "unavailable" }).error).toMatch(
      /unavailable/,
    );
    const noHealers = {
      ...catalog,
      profiles: catalog.profiles.map((profile) =>
        profile.role === "healer" ? { ...profile, reference: null } : profile,
      ),
    };
    expect(suggestComposition(draft, noHealers, false).error).toMatch(/healer reference/);
  });
  it("does not change the input or return an unselected Warrior requirement", () => {
    const draft = createComposition(10, catalog),
      before = JSON.stringify(draft);
    const result = suggestComposition({ ...draft, required: [] }, catalog, false);
    expect(result.error).toBeNull();
    expect(count(result.draft, "warrior")).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(draft)).toBe(before);
    expect(compositionProfiles(catalog).size).toBe(32);
  });
});
