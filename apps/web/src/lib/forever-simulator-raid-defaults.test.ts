import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  installSimulatorRaidDefaults,
  simulatorRaidBuffDefaults,
  simulatorRaidDefaultsModule,
  simulatorRaidDefaultsSrc,
} from "./forever-simulator-raid-defaults";

function fixture(href = "https://kfcguild.online/forever-sim/" + "a".repeat(24) + "/warrior/"): {
  runtime: Record<string, unknown>;
  storage: Storage;
  simulator: {
    raid: { buffs: Record<string, unknown> };
    party: { buffs: Record<string, unknown> };
    player: { buffs: Record<string, unknown> };
    applyDefaults(eventID: number): void;
    loadSettings(): void;
  };
  install: () => void;
} {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      values.set(key, value);
    },
  } as Storage;
  let eventID = 0;
  class Events {
    static nextEventID(): number {
      return ++eventID;
    }
  }
  class Owner {
    buffs: Record<string, unknown> = {};
    buffsChangeEmitter = new Events();
    getBuffs(): Record<string, unknown> {
      return { ...this.buffs };
    }
    setBuffs(_eventID: number, buffs: Record<string, unknown>): void {
      this.buffs = { ...buffs };
      storage.setItem(
        "character",
        JSON.stringify({
          raid: simulator.raid.buffs,
          party: simulator.party.buffs,
          player: simulator.player.buffs,
        }),
      );
    }
  }
  class Simulator {
    raid = new Owner();
    party = new Owner();
    sim = { raid: this.raid };
    player = Object.assign(new Owner(), { getParty: (): Owner => this.party });
    applyDefaults(_eventID: number): void {
      this.raid.buffs = { trueshotAura: false, arcaneBrilliance: true };
      this.party.buffs = { flametongueTotem: true, manaTideTotems: 1 };
      this.player.buffs = { blessingOfKings: false, innervates: 2 };
    }
    getSavedGearStorageKey(): string {
      return "named-gear";
    }
    getSettingsStorageKey(): string {
      return "character";
    }
    loadSettings(): void {
      const saved = storage.getItem("character");
      this.applyDefaults(Events.nextEventID());
      if (saved) {
        const parsed = JSON.parse(saved) as {
          raid: Record<string, unknown>;
          party: Record<string, unknown>;
          player?: Record<string, unknown>;
        };
        this.raid.buffs = parsed.raid;
        this.party.buffs = parsed.party;
        this.player.buffs = parsed.player ?? {};
      }
      if (new URL(href).hash) {
        this.raid.buffs = { trueshotAura: false, imported: true };
        this.player.buffs = { blessingOfKings: false, imported: true };
      }
    }
  }
  const simulator = new Simulator(),
    runtime = { arbitraryMinifiedExport: Simulator };
  return {
    simulator,
    runtime,
    storage,
    install: (): void =>
      installSimulatorRaidDefaults(runtime, storage, { href }, simulatorRaidBuffDefaults),
  };
}

describe("Shared raid-wide simulator defaults", () => {
  it("enables full improved raid buffs and individual blessings with only one weapon totem", () => {
    const f = fixture();
    f.install();
    f.simulator.loadSettings();
    expect(f.simulator.raid.buffs).toEqual({
      arcaneBrilliance: true,
      moonkinAura: true,
      leaderOfThePack: true,
      trueshotAura: true,
      battleShout: 2,
      strengthOfEarthTotem: 2,
      graceOfAirTotem: 2,
      divineSpirit: true,
      giftOfTheWild: 2,
      powerWordFortitude: 2,
      bloodPact: 1,
      manaSpringTotem: 2,
      devotionAura: 2,
      stoneskinTotem: 2,
      thorns: 2,
      retributionAura: 2,
      shadowProtection: true,
      natureResistanceTotem: true,
      fireResistanceAura: true,
      frostResistanceAura: true,
    });
    expect(f.simulator.party.buffs).toEqual({
      flametongueTotem: false,
      windfuryTotem: true,
      manaTideTotems: 1,
    });
    expect(f.simulator.player.buffs).toEqual({
      blessingOfKings: true,
      blessingOfMight: 2,
      blessingOfWisdom: 2,
      innervates: 2,
    });
    expect(Object.keys(f.simulator.raid.buffs).length).toBeGreaterThan(16);
    expect(f.simulator.raid.buffs.sanctityAura).toBeUndefined();
    expect(f.simulator.player.buffs.rallyingCryOfTheDragonslayer).toBeUndefined();
  });
  it("migrates only the current character once, preserving later opt-outs and named saves", () => {
    const f = fixture();
    f.storage.setItem(
      "character",
      JSON.stringify({
        raid: { trueshotAura: false, strengthOfEarthTotem: 1 },
        party: {},
        player: { blessingOfKings: false, innervates: 3 },
      }),
    );
    f.storage.setItem("character_kfc-raid-defaults-core-v1", "1");
    f.storage.setItem("named-gear", "original named build");
    f.install();
    f.simulator.loadSettings();
    expect(f.simulator.raid.buffs.trueshotAura).toBe(true);
    expect(f.simulator.raid.buffs.strengthOfEarthTotem).toBe(2);
    expect(f.simulator.player.buffs.blessingOfKings).toBe(true);
    expect(f.simulator.player.buffs.innervates).toBe(3);
    const saved = JSON.parse(f.storage.getItem("character")!) as {
      raid: Record<string, unknown>;
      player: Record<string, unknown>;
    };
    saved.raid.trueshotAura = false;
    saved.raid.strengthOfEarthTotem = 1;
    saved.player.blessingOfKings = false;
    f.storage.setItem("character", JSON.stringify(saved));
    f.simulator.loadSettings();
    expect(f.simulator.raid.buffs.trueshotAura).toBe(false);
    expect(f.simulator.raid.buffs.strengthOfEarthTotem).toBe(1);
    expect(f.simulator.player.buffs.blessingOfKings).toBe(false);
    expect(f.storage.getItem("named-gear")).toBe("original named build");
    f.simulator.applyDefaults(99);
    expect(f.simulator.raid.buffs.trueshotAura).toBe(true);
  });
  it.each(["#full-share", "?build=Arms#full-share"])(
    "does not modify explicit combat-setting imports: %s",
    (suffix: string) => {
      const f = fixture("https://kfcguild.online/warrior/" + suffix);
      f.install();
      f.simulator.loadSettings();
      expect(f.simulator.raid.buffs).toEqual({ trueshotAura: false, imported: true });
      expect(f.simulator.player.buffs).toEqual({ blessingOfKings: false, imported: true });
      expect(f.storage.getItem("character_kfc-raid-defaults-full-v2")).toBe("1");
    },
  );
  it.each(["?build=Arms", "?race=Human"])(
    "migrates old buffs when selecting a preset or race rather than importing settings: %s",
    (suffix: string) => {
      const f = fixture("https://kfcguild.online/warrior/" + suffix);
      f.storage.setItem("character", JSON.stringify({ raid: {}, party: {}, player: {} }));
      f.install();
      f.simulator.loadSettings();
      expect(f.simulator.raid.buffs.strengthOfEarthTotem).toBe(2);
      expect(f.simulator.player.buffs.blessingOfKings).toBe(true);
    },
  );
  it("installs idempotently and rejects missing/ambiguous runtime contracts", () => {
    const f = fixture();
    f.install();
    const method = f.simulator.applyDefaults;
    f.install();
    expect(f.simulator.applyDefaults).toBe(method);
    expect(() =>
      installSimulatorRaidDefaults(
        {},
        f.storage,
        { href: "https://example.com" },
        simulatorRaidBuffDefaults,
      ),
    ).toThrow("contract changed");
    expect(() =>
      installSimulatorRaidDefaults(
        { ...f.runtime, duplicate: Object.values(f.runtime)[0] },
        f.storage,
        { href: "https://example.com" },
        simulatorRaidBuffDefaults,
      ),
    ).toThrow("contract changed");
  });
  it("serializes a self-contained executable module instead of referencing application closures", () => {
    const f = fixture(),
      url = "/forever-sim/" + "a".repeat(24) + "/bundle/preset_utils-ABC.chunk.js";
    const source = simulatorRaidDefaultsModule(url);
    expect(source).toContain(`import * as runtime from "${url}"`);
    runInNewContext(source.replace(/^import[^\n]+\n/, ""), {
      runtime: f.runtime,
      window: { localStorage: f.storage, location: { href: "https://example.com/warrior/" } },
      URL,
      console,
    });
    f.simulator.loadSettings();
    expect(f.simulator.raid.buffs.trueshotAura).toBe(true);
    expect(() => simulatorRaidDefaultsModule("https://attacker.example/module.js")).toThrow();
  });
  it("keeps initialization usable when preferences cannot be persisted", () => {
    const f = fixture(),
      warn = vi.spyOn(console, "warn").mockImplementation((): void => {});
    try {
      installSimulatorRaidDefaults(
        f.runtime,
        {
          getItem: (): never => {
            throw new Error("storage blocked");
          },
          setItem: vi.fn(),
        },
        { href: "https://example.com/warrior/" },
        simulatorRaidBuffDefaults,
      );
      expect(() => f.simulator.loadSettings()).not.toThrow();
      expect(f.simulator.raid.buffs.trueshotAura).toBe(true);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
  it("versions the iframe URL without losing build queries or share fragments", () => {
    const src = "/tools/forever-sim/" + "a".repeat(24) + "/warrior/?build=Arms#share";
    expect(simulatorRaidDefaultsSrc(src)).toBe(
      src.replace("#share", "&raidDefaults=full-v2#share"),
    );
    expect(simulatorRaidDefaultsSrc(simulatorRaidDefaultsSrc(src))).toBe(
      simulatorRaidDefaultsSrc(src),
    );
  });
});
