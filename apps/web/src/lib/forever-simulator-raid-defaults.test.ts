import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  installSimulatorRaidDefaults,
  simulatorRaidDefaultsModule,
  simulatorRaidDefaultsSrc,
} from "./forever-simulator-raid-defaults";

function fixture(href = "https://kfcguild.online/forever-sim/" + "a".repeat(24) + "/warrior/"): {
  runtime: Record<string, unknown>;
  storage: Storage;
  simulator: {
    raid: { buffs: Record<string, unknown> };
    party: { buffs: Record<string, unknown> };
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
        JSON.stringify({ raid: simulator.raid.buffs, party: simulator.party.buffs }),
      );
    }
  }
  class Simulator {
    raid = new Owner();
    party = new Owner();
    sim = { raid: this.raid };
    player = { getParty: (): Owner => this.party };
    applyDefaults(_eventID: number): void {
      this.raid.buffs = { trueshotAura: false, arcaneBrilliance: true };
      this.party.buffs = { flametongueTotem: true, manaTideTotems: 1 };
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
        };
        this.raid.buffs = parsed.raid;
        this.party.buffs = parsed.party;
      }
      if (new URL(href).hash || new URL(href).searchParams.has("build"))
        this.raid.buffs = { trueshotAura: false, imported: true };
    }
  }
  const simulator = new Simulator(),
    runtime = { arbitraryMinifiedExport: Simulator };
  return {
    simulator,
    runtime,
    storage,
    install: (): void => installSimulatorRaidDefaults(runtime, storage, { href }),
  };
}

describe("Shared raid-wide simulator defaults", () => {
  it("enables all seven buffs, keeps other buffs and selects only one weapon totem", () => {
    const f = fixture();
    f.install();
    f.simulator.loadSettings();
    expect(f.simulator.raid.buffs).toEqual({
      arcaneBrilliance: true,
      moonkinAura: true,
      leaderOfThePack: true,
      trueshotAura: true,
      battleShout: 1,
      strengthOfEarthTotem: 1,
      graceOfAirTotem: 1,
    });
    expect(f.simulator.party.buffs).toEqual({
      flametongueTotem: false,
      windfuryTotem: true,
      manaTideTotems: 1,
    });
  });
  it("migrates only the current character once, preserving later opt-outs and named saves", () => {
    const f = fixture();
    f.storage.setItem(
      "character",
      JSON.stringify({ raid: { trueshotAura: false, blessingOfKings: true }, party: {} }),
    );
    f.storage.setItem("named-gear", "original named build");
    f.install();
    f.simulator.loadSettings();
    expect(f.simulator.raid.buffs.trueshotAura).toBe(true);
    expect(f.simulator.raid.buffs.blessingOfKings).toBe(true);
    const saved = JSON.parse(f.storage.getItem("character")!) as { raid: Record<string, unknown> };
    saved.raid.trueshotAura = false;
    f.storage.setItem("character", JSON.stringify(saved));
    f.simulator.loadSettings();
    expect(f.simulator.raid.buffs.trueshotAura).toBe(false);
    expect(f.storage.getItem("named-gear")).toBe("original named build");
    f.simulator.applyDefaults(99);
    expect(f.simulator.raid.buffs.trueshotAura).toBe(true);
  });
  it.each(["#full-share", "?build=Arms", "?profile=reviewed", "?race=Human"])(
    "does not modify explicit imports or their next reload: %s",
    (suffix: string) => {
      const f = fixture("https://kfcguild.online/warrior/" + suffix);
      f.install();
      f.simulator.loadSettings();
      if (suffix.startsWith("#") || suffix.startsWith("?build"))
        expect(f.simulator.raid.buffs).toEqual({ trueshotAura: false, imported: true });
      expect(f.storage.getItem("character_kfc-raid-defaults-core-v1")).toBe("1");
    },
  );
  it("installs idempotently and rejects missing/ambiguous runtime contracts", () => {
    const f = fixture();
    f.install();
    const method = f.simulator.applyDefaults;
    f.install();
    expect(f.simulator.applyDefaults).toBe(method);
    expect(() =>
      installSimulatorRaidDefaults({}, f.storage, { href: "https://example.com" }),
    ).toThrow("contract changed");
    expect(() =>
      installSimulatorRaidDefaults(
        { ...f.runtime, duplicate: Object.values(f.runtime)[0] },
        f.storage,
        { href: "https://example.com" },
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
      src.replace("#share", "&raidDefaults=core-v1#share"),
    );
    expect(simulatorRaidDefaultsSrc(simulatorRaidDefaultsSrc(src))).toBe(
      simulatorRaidDefaultsSrc(src),
    );
  });
});
