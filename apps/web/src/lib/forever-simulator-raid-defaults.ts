// Bump the version when changing this overlay: engine HTML is cached by its full URL.
export const simulatorRaidDefaultsVersion = "core-v1";

interface BuffOwner {
  getBuffs(): Record<string, unknown>;
  setBuffs(eventID: number, buffs: Record<string, unknown>): void;
}

interface DefaultSimulator {
  sim: {
    raid: BuffOwner & { buffsChangeEmitter: { constructor: unknown } };
  };
  player: { getParty(): BuffOwner | null };
  applyDefaults(eventID: number): void;
  loadSettings(): void;
  getSettingsStorageKey(): string;
}

/** Presentation-only adapter; measured builds and the frozen combat engine stay untouched. */
export function installSimulatorRaidDefaults(
  runtime: Record<string, unknown>,
  storage: Pick<Storage, "getItem" | "setItem">,
  location: Pick<Location, "href">,
): void {
  const candidates = Object.values(runtime).filter(
    (value): boolean =>
      typeof value === "function" &&
      typeof value.prototype?.applyDefaults === "function" &&
      typeof value.prototype?.loadSettings === "function" &&
      typeof value.prototype?.getSavedGearStorageKey === "function",
  );
  if (candidates.length !== 1) throw new Error("Simulator raid-default contract changed");
  const prototype = (candidates[0] as { prototype: DefaultSimulator }).prototype;
  const installed = Symbol.for("kfc-simulator-raid-defaults-core-v1");
  if (Object.prototype.hasOwnProperty.call(prototype, installed)) return;

  function enable(simulator: DefaultSimulator, eventID: number): void {
    const raid = simulator.sim.raid;
    const events = raid.buffsChangeEmitter.constructor as { nextEventID(): number };
    const party = simulator.player.getParty();
    raid.setBuffs(eventID, {
      ...raid.getBuffs(),
      moonkinAura: true,
      leaderOfThePack: true,
      trueshotAura: true,
      battleShout: 1,
      strengthOfEarthTotem: 1,
      graceOfAirTotem: 1,
    });
    if (party)
      party.setBuffs(events.nextEventID(), {
        ...party.getBuffs(),
        windfuryTotem: true,
        flametongueTotem: false,
      });
  }

  const applyDefaults = prototype.applyDefaults;
  prototype.applyDefaults = function (this: DefaultSimulator, eventID: number): void {
    applyDefaults.call(this, eventID);
    const events = this.sim.raid.buffsChangeEmitter.constructor as { nextEventID(): number };
    enable(this, events.nextEventID());
  };
  const loadSettings = prototype.loadSettings;
  prototype.loadSettings = function (this: DefaultSimulator): void {
    const url = new URL(location.href);
    const imported = Boolean(
      url.hash || ["build", "profile", "race"].some((key) => url.searchParams.has(key)),
    );
    loadSettings.call(this);
    const key = this.getSettingsStorageKey() + "_kfc-raid-defaults-core-v1";
    // Only migrate the automatically saved current character once. Never edit named saves.
    try {
      if (storage.getItem(key) !== null) return;
      if (!imported) {
        const events = this.sim.raid.buffsChangeEmitter.constructor as { nextEventID(): number };
        enable(this, events.nextEventID());
      }
      storage.setItem(key, "1");
    } catch (error: unknown) {
      console.warn("Could not persist simulator raid-default preference", error);
    }
  };
  Object.defineProperty(prototype, installed, { value: true });
}

export function simulatorRaidDefaultsSrc(src: string): string {
  const url = new URL(src, "https://simulator.invalid");
  url.searchParams.set("raidDefaults", simulatorRaidDefaultsVersion);
  return url.pathname + url.search + url.hash;
}

export function simulatorRaidDefaultsModule(moduleUrl: string): string {
  if (
    !/^\/forever-sim\/[a-f0-9]{24}\/bundle\/preset_utils-[a-zA-Z0-9_-]+\.chunk\.js$/.test(moduleUrl)
  )
    throw new Error("Invalid simulator defaults module");
  return `import * as runtime from ${JSON.stringify(moduleUrl)};\n(${installSimulatorRaidDefaults.toString()})(runtime, window.localStorage, window.location);`;
}
